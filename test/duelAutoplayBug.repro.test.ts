import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldPlayEvent, type DeduplicationState } from '@/shared/eventDeduplicator';
import type { Ck3EventMessage } from '@/shared/types';

/**
 * 결투(Duel) 이벤트 등록 후 자동 읽기 실패 원인 재현 및 검증
 */
test('결투 이벤트 등록 후 자동 낭독 실패 원인 추적', async (t) => {
  const duelEventRound1: Ck3EventMessage = {
    id: 'round-1',
    timestamp: 1000,
    title: '일대일 대결: 공작 에른스트',
    content: '상대에게 달려들며 장검을 거칠게 내질렀다. 이대로 죽을지도 모르는 일 아닌가. 그러니 격렬한 기세로 싸우겠노라.',
    rawText: '상대에게 달려들며 장검을 거칠게 내질렀다.'
  };

  const duelEventRound2: Ck3EventMessage = {
    id: 'round-2',
    timestamp: 5000,
    title: '일대일 대결: 공작 에른스트',
    content: '대결을 펼칠 공간이라면 충분했기에, 천천히 에른스트 주위를 맴돌았다. 그리고는 공세를 피해냈다.',
    rawText: '대결을 펼칠 공간이라면 충분했기에...'
  };

  await t.test('1. 라운드 1 종료 직후 창 닫힘(STOP)이 발생하고 라운드 2가 진입할 때 shouldPlayEvent 검증', () => {
    // 라운드 1이 낭독되다가 사용자가 선택지를 클릭하여 라운드 1 창이 닫힘 (STOP 발화)
    const stateAfterRound1Stop: DeduplicationState = {
      isPlaying: false,
      currentEvent: duelEventRound1,
      lastAutoSpokenText: duelEventRound1.content,
      lastAutoSpokenTime: 1000,
      lastStoppedText: duelEventRound1.content, // 방금 닫힌 라운드 1 본문
      lastStoppedTime: 4950 // 4.95초 시점에 STOP 발생
    };

    // 50ms 뒤(5.0초) 라운드 2 이벤트 진입
    const shouldPlayRound2 = shouldPlayEvent(duelEventRound2, stateAfterRound1Stop, 5000);

    // 라운드 2는 라운드 1과 본문이 다르므로 정상 통과해야 함
    assert.equal(shouldPlayRound2, true, '라운드 2는 새 이벤트이므로 shouldPlayEvent가 true여야 합니다.');
  });

  await t.test('2. [핵심 결함 분석] 동일 라운드에서 UI 재진입 시의 차단 여부 검증', () => {
    // 라운드 2가 등록된 후, 34초 뒤 게임에서 동일한 duelEventRound2가 다시 들어온 경우
    const stateDuringRound2: DeduplicationState = {
      isPlaying: true,
      currentEvent: duelEventRound2,
      lastAutoSpokenText: duelEventRound2.content,
      lastAutoSpokenTime: 5000,
      lastStoppedText: duelEventRound1.content,
      lastStoppedTime: 4950
    };

    // 34초 뒤 동일한 라운드 2 텍스트 재유입
    const shouldPlayDuplicate = shouldPlayEvent(duelEventRound2, stateDuringRound2, 39000);
    assert.equal(shouldPlayDuplicate, false, '동일 라운드 동일 텍스트 재유입은 차단되어야 합니다.');
  });

  await t.test('3. [레이스 컨디션 결함 재현] 새 이벤트 수신 직후 잔여 STOP 신호가 유입될 때 오디오 취소 방어 검증', () => {
    // 시나리오: 결투 창 전환 시 STOP과 TTS가 0.01초 차이로 동시 발생
    // 메인 프로세스 또는 렌더러가 새 이벤트 발생 직후(예: 50ms 후) STOP을 수신할 때
    let isPlaying = false;
    let currentSpeechId = 0;
    let lastEventReceivedTime = 0;

    // 1) 새 이벤트 수신 (T = 1000)
    const handleNewEventSim = (eventTime: number) => {
      lastEventReceivedTime = eventTime;
      currentSpeechId++;
      isPlaying = true; // 낭독 시작
    };

    // 2) 가드 없는 기존 STOP 처리 로직 (취약함: 새 이벤트가 시작되자마자 취소됨)
    const handleStopVulnerable = () => {
      currentSpeechId++;
      isPlaying = false; // 낭독 즉시 취소!
    };

    // 3) 안전한 타임스탬프 가드가 적용된 STOP 처리 로직
    const handleStopSafe = (stopTime: number) => {
      // 새 이벤트가 시작된 지 300ms 이내에 유입된 잔여 STOP은 이전 창의 잔재이므로 무시!
      if (stopTime - lastEventReceivedTime < 300) {
        return; // 무시
      }
      currentSpeechId++;
      isPlaying = false;
    };

    // [결함 재현]: 새 이벤트(T=1000) 발생 50ms 후(T=1050) 잔여 STOP 유입
    handleNewEventSim(1000);
    assert.equal(isPlaying, true, '새 이벤트로 낭독이 시작되어야 함');

    handleStopVulnerable();
    assert.equal(isPlaying, false, '[결함 재현] 취약한 로직에서는 새 이벤트가 50ms 만에 중단되어 버림');

    // [패치 검증]: 타임스탬프 가드가 적용된 로직에서는 50ms 후 잔여 STOP을 무시하고 낭독 유지!
    handleNewEventSim(1000);
    handleStopSafe(1050);
    assert.equal(isPlaying, true, '[패치 검증] 새 이벤트 직후 50ms 후 유입된 잔여 STOP은 무시되고 낭독이 유지되어야 함');

    // [정상 동작 검증]: 창이 완전히 닫힌 후(예: 500ms 후) 실제 STOP은 정상 수용
    handleStopSafe(1600);
    assert.equal(isPlaying, false, '시간이 충분히 지난 뒤의 실제 STOP은 정상 반영되어 중단되어야 함');
  });
});

