import test from 'node:test';
import assert from 'node:assert/strict';
import { extractCk3EventsFromChunk } from '@/main/textSanitizer';
import { shouldPlayEvent, type DeduplicationState } from '@/shared/eventDeduplicator';
import type { Ck3EventMessage } from '@/shared/types';

/**
 * 🏛️ 전쟁 결과 및 연속 전쟁 시 TTS 컴패니언 엔진 침묵(고착) 결함 재현 테스트
 */
test('전쟁 결과 및 연속 전쟁 시 TTS 컴패니언 엔진 침묵 결함 재현', async (t) => {
  const warEventChunk = `[13:55:00][D][console.cpp:1164]: Running console command: effect debug_log = "##CK3_TTS##  I 승전  !: 농노 봉기|||추잡한 야를 해스테인에게, 자칼들이 묻히지도 못한 그대의 유해를 두고 다투기를 바라오. 내가 패배했다는 것을 인정하오. 그대의 요구를 따를 수밖에 없겠구려.|||TYPE:WAR_RESULTS##CK3_TTS_END##"`;
  const stopTagChunk = `[13:55:01][D][console.cpp:1164]: Running console command: effect debug_log = "##CK3_TTS_STOP##"`;

  await t.test('1. [결함 1 재현] 전쟁 결과 이벤트와 STOP 태그가 동일 청크에 유입 시 이벤트 유실 결함', () => {
    // 플레이어가 전쟁 결과창을 빠르게 닫거나 chokidar 폴링 주기(200ms) 내에 이벤트와 STOP이 함께 수신된 경우
    const combinedChunk = `${warEventChunk}\n${stopTagChunk}`;

    const stopTagHash = '##CK3_TTS_STOP##';
    const stopIndex = combinedChunk.lastIndexOf(stopTagHash);
    assert.ok(stopIndex !== -1, 'STOP 태그가 감지되어야 합니다.');

    // 기존의 취약한 로직: stopIndex 뒤의 문자열만 슬라이스
    const vulnerableTextAfterStop = combinedChunk.slice(stopIndex + stopTagHash.length);
    const vulnerableEvents = extractCk3EventsFromChunk(vulnerableTextAfterStop);

    // [버그 증명]: 기존 취약한 로직에서는 STOP 태그 앞의 승전 이벤트가 통째로 버려져 이벤트 개수가 0개임!
    assert.equal(
      vulnerableEvents.length,
      0,
      '기존 취약한 로직에서는 STOP 앞의 전쟁 결과 이벤트가 완전히 유실되어 0개가 됩니다.'
    );

    // [안전한 요구사항]: 청크 전체에서 이벤트를 먼저 파싱하면 승전 이벤트가 정상 검출되어야 함!
    const safeEvents = extractCk3EventsFromChunk(combinedChunk);
    assert.equal(safeEvents.length, 1, '안전한 로직에서는 전쟁 결과 이벤트가 1개 정상 검출되어야 합니다.');
    assert.ok(safeEvents[0]!.title.includes('승전'), '승전 타이틀이 포함되어야 합니다.');
    assert.ok(safeEvents[0]!.title.includes('농노 봉기'), '농노 봉기 타이틀이 포함되어야 합니다.');
    assert.equal(safeEvents[0]!.eventType, 'war_results', 'GUI 메타 토큰(TYPE:WAR_RESULTS)으로 전쟁 결과 유형이 판정되어야 합니다.');
    assert.ok(!safeEvents[0]!.content.includes('TYPE:'), '메타 토큰이 본문에 남아서는 안 됩니다.');
  });

  await t.test('2. [결함 2 재현] 동일 반란군(농노 봉기)을 60초 이내에 연속 진압 시 2번째 전쟁 결과 침묵 결함', () => {
    const baseTime = 1000000;
    const warEvent1: Ck3EventMessage = {
      id: 'war-1',
      title: '승전 !: 농노 봉기',
      content: '추잡한 야를 해스테인에게, 내가 패배했다는 것을 인정하오.',
      rawText: '',
      timestamp: baseTime,
      speakerGender: 'narrator',
      eventType: 'war_results'
    };

    // 1차 전쟁 발생 후 상태 기록
    const state: DeduplicationState = {
      isPlaying: false,
      currentEvent: warEvent1,
      lastAutoSpokenText: warEvent1.content,
      lastAutoSpokenTime: baseTime,
      lastStoppedText: '',
      lastStoppedTime: 0
    };

    // 25초 뒤 동일한 반란군 유형의 2차 전쟁 결과 유입 (본문 동일)
    const warEvent2: Ck3EventMessage = {
      id: 'war-2',
      title: '승전 !: 농노 봉기',
      content: '추잡한 야를 해스테인에게, 내가 패배했다는 것을 인정하오.',
      rawText: '',
      timestamp: baseTime + 25000,
      speakerGender: 'narrator',
      eventType: 'war_results'
    };

    // [패치 후 검증]: 개선된 deduplicator는 전쟁 결과에 5초 쿨다운을 적용하므로 25초 뒤의 2차 전쟁 결과가 정상 승인(true)됨!
    const isPlayedAfterFix = shouldPlayEvent(warEvent2, state, baseTime + 25000);
    assert.equal(
      isPlayedAfterFix,
      true,
      '개선된 로직에서는 5초 쿨다운이 적용되어 25초 뒤의 2차 전쟁 승전 결과가 정상 재생(true)되어야 합니다.'
    );

    // [하드코딩 제거 검증]: 제목에 '전쟁'이 들어간 일반 이벤트(유형 토큰 없음)는 기본 60초 쿨다운을 유지해야 함
    const declarationEvent: Ck3EventMessage = {
      ...warEvent2,
      id: 'declaration',
      title: '전쟁 선포',
      eventType: 'default'
    };
    assert.equal(
      shouldPlayEvent(declarationEvent, state, baseTime + 25000),
      false,
      '유형 토큰이 없는 일반 이벤트는 제목과 무관하게 60초 중복 차단이 유지되어야 합니다.'
    );
  });

  await t.test('3. [결함 3 재현] 대용량 로그 스트림에서 태그가 분할 청크(Split Chunk)로 유입 시 유실 결함', () => {
    // 200ms 폴링 주기 또는 OS 버퍼 경계로 인해 태그가 쪼개져서 유입된 상황
    const splitChunk1 = `[13:55:00][D][console.cpp:1164]: Running console command: effect debug_log = "##CK3_TTS##  I 승전  !: 농노 봉기|||추잡한 야를 해스테인에게, `;
    const splitChunk2 = `자칼들이 묻히지도 못한 그대의 유해를 두고 다투기를 바라오. 내가 패배했다는 것을 인정하오.##CK3_TTS_END##"`;

    // 기존 로직: 각 청크를 독립적으로 파싱
    const chunk1Events = extractCk3EventsFromChunk(splitChunk1);
    const chunk2Events = extractCk3EventsFromChunk(splitChunk2);

    // [버그 증명]: 닫는 태그 없는 chunk1과 여는 태그 없는 chunk2 모두 파싱 실패하여 이벤트 영구 유실!
    assert.equal(chunk1Events.length, 0, 'chunk1은 닫는 태그가 없어 유실됩니다.');
    assert.equal(chunk2Events.length, 0, 'chunk2는 여는 태그가 없어 유실됩니다.');

    // [안전한 요구사항]: 분할 버퍼를 결합(Pending Buffer)하여 파싱하면 온전하게 복원되어야 함!
    const combined = splitChunk1 + splitChunk2;
    const recoveredEvents = extractCk3EventsFromChunk(combined);
    assert.equal(recoveredEvents.length, 1, '결합된 청크에서는 1개의 온전한 승전 이벤트가 복원되어야 합니다.');
  });
});
