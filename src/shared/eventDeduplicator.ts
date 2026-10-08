import type { Ck3EventMessage } from '@/shared/types';

/** 일반 이벤트의 동일 본문 재낭독 차단 시간 (ms) */
const DEFAULT_DUPLICATE_COOLDOWN_MS = 60000;
/** 전쟁 결과 이벤트의 동일 본문 재낭독 차단 시간 (ms, 콘솔 3중 에코 방어용 최소값) */
const WAR_RESULT_DUPLICATE_COOLDOWN_MS = 5000;

/**
 * 이벤트 중복 방어를 위한 상태 인터페이스
 */
export type DeduplicationState = {
  readonly isPlaying: boolean;
  readonly currentEvent: Ck3EventMessage | null;
  readonly lastAutoSpokenText: string;
  readonly lastAutoSpokenTime: number;
  readonly lastStoppedText: string;
  readonly lastStoppedTime: number;
};

/**
 * 기존 취약한 로직 (5초 쿨다운만 존재하여 결함 재현용)
 * @param event - 수신된 CK3 이벤트
 * @param state - 현재 중복 검증 상태
 * @param now - 현재 시각 (ms)
 * @returns 낭독 실행 여부
 */
export const shouldPlayEventVulnerable = (
  event: Ck3EventMessage,
  state: DeduplicationState,
  now: number = Date.now()
): boolean => {
  // 1. 창 닫기(Stop)가 발생한 직후 5초 이내에 방금 닫힌 동일 이벤트가 다시 들어오면 완전 차단
  if (event.content === state.lastStoppedText && now - state.lastStoppedTime < 5000) {
    return false;
  }

  // 2. 직전에 자동 낭독한 이벤트와 완전히 같고 5초 이내면 무시 (취약점: 5초 초과 시 통과해버림)
  if (event.content === state.lastAutoSpokenText && now - state.lastAutoSpokenTime < 5000) {
    return false;
  }

  return true;
};

/**
 * 수정된 안전한 이벤트 중복 방어 로직 (다층 방어)
 * @param event - 수신된 CK3 이벤트
 * @param state - 현재 중복 검증 상태
 * @param now - 현재 시각 (ms)
 * @returns 낭독 실행 여부
 */
export const shouldPlayEvent = (
  event: Ck3EventMessage,
  state: DeduplicationState,
  now: number = Date.now()
): boolean => {
  // 0. 사용자가 인게임 스피커 버튼 또는 F 단축키로 명시적 재낭독을 요청한 경우
  // - 방금 닫힌 창(Stop)의 동일 이벤트가 지연 플러시되어 유입된 경우 15초간 완전 차단
  // - C++ 엔진 콘솔의 3중 에코(console.cpp/jomini_effect)나 분할 청크로 인해 1초 이내 동일 텍스트 재유입 시 차단
  if (event.isForceReplay) {
    if (event.content === state.lastStoppedText && now - state.lastStoppedTime < 15000) {
      return false;
    }
    if (event.content === state.lastAutoSpokenText && now - state.lastAutoSpokenTime < 1000) {
      return false;
    }
    if (state.isPlaying && state.currentEvent && state.currentEvent.content === event.content && now - state.lastAutoSpokenTime < 1000) {
      return false;
    }
    return true;
  }

  // 1. 방금 닫힌 창(Stop)의 동일 이벤트 재진입 방어 (5초)
  if (event.content === state.lastStoppedText && now - state.lastStoppedTime < 5000) {
    return false;
  }

  // 2. [핵심 방어 1] 현재 이미 오디오가 재생 중(isPlaying)이고 동일한 이벤트인 경우 무조건 차단!
  // 캐릭터 창을 열거나 닫아도 이미 낭독 중인 사건은 끊기거나 처음부터 다시 재생되지 않음
  if (state.isPlaying && state.currentEvent && state.currentEvent.content === event.content) {
    return false;
  }

  // 전쟁 결과는 영지/반란군 명칭이 동일하여 본문이 같더라도 별개의 전쟁 종결 사건일 수 있으므로
  // 60초 대신 콘솔 3중 에코 방어용 최소 쿨다운(5초)을 적용합니다.
  // (유형은 제목 문자열이 아닌 GUI 메타 토큰 |||TYPE:WAR_RESULTS 로부터 파서가 판정)
  const isWarResultEvent = event.eventType === 'war_results';
  const duplicateCooldownMs = isWarResultEvent ? WAR_RESULT_DUPLICATE_COOLDOWN_MS : DEFAULT_DUPLICATE_COOLDOWN_MS;

  // 3. [핵심 방어 2] 직전에 자동 낭독한 내용과 완전히 동일한 경우 쿨다운(일반 60초, 전쟁 결과 5초) 적용
  // 창을 닫지 않고 캐릭터 창을 열어보거나 다른 UI를 둘러보는 동안 동일 이벤트 재발화 차단
  if (event.content === state.lastAutoSpokenText && now - state.lastAutoSpokenTime < duplicateCooldownMs) {
    return false;
  }

  // 4. [핵심 방어 3] 현재 화면에 표시된 이벤트와 동일하고 다른 사건으로 바뀌지 않은 경우 쿨다운 적용
  if (state.currentEvent && state.currentEvent.content === event.content && now - state.lastAutoSpokenTime < duplicateCooldownMs) {
    return false;
  }

  return true;
};
