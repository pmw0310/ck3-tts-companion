import test from 'node:test';
import assert from 'node:assert/strict';
import type { Ck3EventMessage } from '@/shared/types';
import { shouldPlayEvent, type DeduplicationState } from '@/shared/eventDeduplicator';
import { extractCk3EventsFromChunk } from '@/main/textSanitizer';

/**
 * 캐릭터 클릭 시 동일 TTS 재발화 결함 재현 및 검증 테스트
 */
test('이벤트 낭독 중 캐릭터 클릭 시 동일 TTS 중복 발화 방어 검증', async (t) => {
  const sampleEvent: Ck3EventMessage = {
    id: 'evt-1',
    timestamp: 10000,
    title: '새로운 기독교 교파',
    content: '새롭게 창설된 교파의 중심에서 대주교 터실리오가 캔터베리를 관리한다.',
    rawText: '...'
  };

  await t.test('1. [결함 재현 및 검증] 낭독 시작 8초 후(5초 초과) 캐릭터 클릭으로 동일 이벤트 재진입 시 중복 재생 차단', () => {
    // 낭독 시작 시각: t = 10000ms
    const state: DeduplicationState = {
      isPlaying: true,
      currentEvent: sampleEvent,
      lastAutoSpokenText: sampleEvent.content,
      lastAutoSpokenTime: 10000,
      lastStoppedText: '',
      lastStoppedTime: 0
    };

    // 8초 후 (t = 18000ms, 기존 5초 쿨다운 만료 시점) 동일 이벤트 재수신
    const currentTime = 18000;
    const shouldPlay = shouldPlayEvent(sampleEvent, state, currentTime);

    // 기대 결과: 현재 재생 중이고 동일한 내용이므로 반드시 차단(false)되어야 함!
    assert.equal(shouldPlay, false, '재생 중인 동일 이벤트는 5초가 지났어도 재낭독되지 않고 차단되어야 합니다.');
  });

  await t.test('2. [결함 재현 및 검증] 낭독 종료 후 창이 유지된 상태에서 20초 후 동일 이벤트 재진입 시 차단', () => {
    // 낭독 종료 상태 (isPlaying: false), 마지막 낭독 시각 t = 10000ms
    const state: DeduplicationState = {
      isPlaying: false,
      currentEvent: sampleEvent,
      lastAutoSpokenText: sampleEvent.content,
      lastAutoSpokenTime: 10000,
      lastStoppedText: '',
      lastStoppedTime: 0
    };

    // 20초 후 (t = 30000ms, 60초 이내) 동일 이벤트 재수신
    const currentTime = 30000;
    const shouldPlay = shouldPlayEvent(sampleEvent, state, currentTime);

    // 기대 결과: 동일 내용의 창이 유지되는 동안에는 자동 재낭독 차단(false)
    assert.equal(shouldPlay, false, '직전 자동 낭독 내용과 동일한 이벤트는 60초 쿨다운 동안 자동 재낭독이 차단되어야 합니다.');
  });

  await t.test('3. [정상 동작 검증] 새로운 다른 이벤트 발생 시 정상 재생 허용', () => {
    const newEvent: Ck3EventMessage = {
      id: 'evt-2',
      timestamp: 35000,
      title: '전쟁에 소집',
      content: '그대를 독립 전쟁에 소집하노니 나를 도와 동맹 협정을 준수해주시오!',
      rawText: '...'
    };

    const state: DeduplicationState = {
      isPlaying: false,
      currentEvent: sampleEvent,
      lastAutoSpokenText: sampleEvent.content,
      lastAutoSpokenTime: 10000,
      lastStoppedText: '',
      lastStoppedTime: 0
    };

    const shouldPlay = shouldPlayEvent(newEvent, state, 35000);
    assert.equal(shouldPlay, true, '새로운 다른 이벤트는 정상적으로 재생이 허용되어야 합니다.');
  });

  await t.test('4. [정상 동작 검증] 창 닫기(Stop) 직후 5초 이내 동일 이벤트 재진입 차단', () => {
    const state: DeduplicationState = {
      isPlaying: false,
      currentEvent: null,
      lastAutoSpokenText: '',
      lastAutoSpokenTime: 0,
      lastStoppedText: sampleEvent.content,
      lastStoppedTime: 50000
    };

    // 2초 후 (t = 52000ms) 방금 닫힌 동일 이벤트 수신
    const shouldPlay = shouldPlayEvent(sampleEvent, state, 52000);
    assert.equal(shouldPlay, false, '방금 닫힌 이벤트는 5초간 완전히 차단되어야 합니다.');
  });

  await t.test('5. [수동 재낭독 검증] 스피커 버튼 클릭 또는 F 단축키로 인한 강제 재낭독(isForceReplay: true)은 쿨다운 우회 허용', () => {
    const forceReplayEvent: Ck3EventMessage = {
      ...sampleEvent,
      isForceReplay: true
    };

    // 낭독 직후 (t = 12000ms, 쿨다운 내부) 사용자 명시적 스피커 버튼 클릭
    const state: DeduplicationState = {
      isPlaying: true,
      currentEvent: sampleEvent,
      lastAutoSpokenText: sampleEvent.content,
      lastAutoSpokenTime: 10000,
      lastStoppedText: '',
      lastStoppedTime: 0
    };

    const shouldPlay = shouldPlayEvent(forceReplayEvent, state, 12000);
    assert.equal(shouldPlay, true, '사용자 수동 요청(isForceReplay: true)은 쿨다운 및 재생 중 여부와 무관하게 즉시 허용되어야 합니다.');
  });

  await t.test('6. [승계 및 사망 이벤트 파싱 검증] 승계 창 텍스트의 [CK3_TTS] 추출 및 한글 조사((은)는, (으)로) 자동 보정', () => {
    const rawChunk =
      '[CK3_TTS] 당신은 사망했습니다.|||노르웨이의 왕 해럴더 IV세(은)는 63세의 나이에 주님의 품 속에서 안식을 찾았습니다. 생전에는 혹독한 지배자(으)로 불렸습니다. 발을 헛디뎌서 사망한 그는 특출난 전략가로 알려졌으며 현장 조사와 군대 훈련으로 많은 시간을 보냈습니다. 왕 망누스 권좌에 오름. 수많은 기술에 통달한 그는 신하들의 존경을 한 몸에 받을 것이 분명합니다.[CK3_TTS_END]';

    const events = extractCk3EventsFromChunk(rawChunk);
    assert.equal(events.length, 1, '정확히 1개의 승계 이벤트가 추출되어야 합니다.');
    assert.equal(events[0]?.title, '당신은 사망했습니다.', '타이틀이 올바르게 추출되어야 합니다.');
    assert.ok(
      events[0]?.content.includes('해럴더 IV세는'),
      '해럴더 IV세(은)는 조사가 "해럴더 IV세는"으로 보정되어야 합니다.'
    );
    assert.ok(
      events[0]?.content.includes('지배자로'),
      '혹독한 지배자(으)로 조사가 "지배자로"로 보정되어야 합니다.'
    );
  });
});
