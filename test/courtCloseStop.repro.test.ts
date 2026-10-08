import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { shouldPlayEvent, type DeduplicationState } from '../src/shared/eventDeduplicator';
import type { Ck3EventMessage } from '../src/shared/types';

/**
 * 궁전(알현실) 닫기 시 TTS 정지 및 isForceReplay 디바운스 결함 재현 테스트
 */
test('궁전 닫기 TTS 정지 신호 및 수동 낭독(isForceReplay) 중복 방어 무결성 검증', async (t) => {
  const royalCourtGuiPath = path.resolve(process.cwd(), 'ck3-mod/gui/window_royal_court.gui');
  const courtGuiPath = path.resolve(process.cwd(), 'ck3-mod/gui/window_court_events.gui');

  await t.test('1. [window_royal_court.gui] 최상위 _hide 상태에 C++ 콘솔 락을 유발하는 ##CK3_TTS_STOP##이 없어야 함 (콘솔 잠금 방어)', () => {
    const royalContent = fs.readFileSync(royalCourtGuiPath, 'utf-8');
    // 최상위 state = { name = _hide ... } 블록 추출
    const hideMatch = royalContent.match(/state\s*=\s*\{\s*name\s*=\s*_hide[\s\S]*?\n\t\}/);
    assert.ok(hideMatch, 'window_royal_court.gui에 최상위 _hide 상태 블록이 존재해야 합니다.');
    assert.ok(
      !hideMatch[0].includes('##CK3_TTS_STOP##'),
      '알현실 _hide 애니메이션에 C++ 콘솔 락을 유발하는 ##CK3_TTS_STOP##이 없어야 합니다.'
    );
  });

  await t.test('2. [window_court_events.gui] _hide 상태에 C++ 콘솔 락을 유발하는 ##CK3_TTS_STOP##이 없어야 함 (콘솔 잠금 방어)', () => {
    const courtContent = fs.readFileSync(courtGuiPath, 'utf-8');
    const hideMatch = courtContent.match(/state\s*=\s*\{\s*name\s*=\s*_hide[\s\S]*?\n\t\t\}/);
    assert.ok(hideMatch, 'window_court_events.gui에 _hide 상태 블록이 존재해야 합니다.');
    assert.ok(
      !hideMatch[0].includes('##CK3_TTS_STOP##'),
      '궁정 이벤트 창 _hide 애니메이션에 C++ 콘솔 락을 유발하는 ##CK3_TTS_STOP##이 없어야 합니다.'
    );
  });

  await t.test('3. [eventDeduplicator] isForceReplay 이벤트라도 1초 이내 동일 텍스트 재유입 시 중복 발화가 차단되어야 함 (콘솔 3중 에코 방어)', () => {
    const now = 1000000;
    const baseState: DeduplicationState = {
      isPlaying: true,
      currentEvent: {
        id: 'evt-1',
        title: '궁정 주최: 개회',
        content: '나는 왕좌에 앉아 경비병들에게 전당의 문을 열라는 손짓을 보냈다.',
        rawText: '나는 왕좌에 앉아 경비병들에게 전당의 문을 열라는 손짓을 보냈다.',
        isForceReplay: true,
        timestamp: now
      },
      lastAutoSpokenText: '나는 왕좌에 앉아 경비병들에게 전당의 문을 열라는 손짓을 보냈다.',
      lastAutoSpokenTime: now,
      lastStoppedText: '',
      lastStoppedTime: 0
    };

    const duplicateForceEvent: Ck3EventMessage = {
      id: 'evt-2',
      title: '궁정 주최: 개회',
      content: '나는 왕좌에 앉아 경비병들에게 전당의 문을 열라는 손짓을 보냈다.',
      rawText: '나는 왕좌에 앉아 경비병들에게 전당의 문을 열라는 손짓을 보냈다.',
      isForceReplay: true,
      timestamp: now + 500 // 500ms 뒤 콘솔 에코로 재유입
    };

    const shouldPlay = shouldPlayEvent(duplicateForceEvent, baseState, now + 500);
    assert.strictEqual(
      shouldPlay,
      false,
      '동일한 강제 재낭독 이벤트가 1초 이내에 연속으로 들어오면 콘솔 에코이므로 차단되어야 합니다.'
    );
  });

  await t.test('4. [알현실 닫힘 지연 플러시 방어] 알현실을 닫은 직후(Stop 발생) 지연 플러시된 동일 이벤트가 들어와도 15초간 완전 차단되어야 함', () => {
    const stopTime = 2000000;
    const closedCourtState: DeduplicationState = {
      isPlaying: false,
      currentEvent: null,
      lastAutoSpokenText: '나는 왕좌에 앉아 경비병들에게 전당의 문을 열라는 손짓을 보냈다.',
      lastAutoSpokenTime: stopTime - 31000, // 31초 전 낭독됨
      lastStoppedText: '나는 왕좌에 앉아 경비병들에게 전당의 문을 열라는 손짓을 보냈다.',
      lastStoppedTime: stopTime // 방금 알현실 닫음 (STOP)
    };

    const delayedFlushedEvent: Ck3EventMessage = {
      id: 'evt-flush',
      title: '궁정 주최: 개회',
      content: '나는 왕좌에 앉아 경비병들에게 전당의 문을 열라는 손짓을 보냈다.',
      rawText: '나는 왕좌에 앉아 경비병들에게 전당의 문을 열라는 손짓을 보냈다.',
      isForceReplay: true, // 수동 낭독 플래그
      timestamp: stopTime + 400 // 닫힌 지 0.4초 뒤 C++ 로그 플러시 유입
    };

    const shouldPlay = shouldPlayEvent(delayedFlushedEvent, closedCourtState, stopTime + 400);
    assert.strictEqual(
      shouldPlay,
      false,
      '알현실이 닫힌 뒤 뒤늦게 플러시된 직전 이벤트는 수동 플래그 여부와 무관하게 15초간 완전히 차단되어야 합니다.'
    );
  });
});
