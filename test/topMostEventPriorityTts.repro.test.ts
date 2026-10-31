import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startWatchingLogFile, type ClipboardBridge } from '@/main/logWatcher';
import { extractCk3EventsFromChunk } from '@/main/textSanitizer';
import type { Ck3EventMessage } from '@/shared/types';

/**
 * 지정된 밀리초만큼 비동기 대기합니다.
 * @param ms - 대기 시간 (밀리초)
 * @returns 대기 완료 Promise
 */
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 테스트용 인메모리 클립보드 브릿지를 생성합니다.
 * @param initialUserText - 초기 사용자 클립보드 텍스트
 * @returns 클립보드 브릿지 및 상태 제어 헬퍼
 */
const createMockClipboardBridge = (initialUserText: string = '사용자 원본 클립보드') => {
  let currentClipboardText = initialUserText;
  const bridge: ClipboardBridge<string> = {
    readText: () => currentClipboardText,
    readSignature: () => `text/plain:${currentClipboardText}`,
    takeSnapshot: () => currentClipboardText,
    restoreSnapshot: (snapshot: string | null) => {
      currentClipboardText = snapshot ?? '';
    }
  };
  return {
    bridge,
    setClipboard: (text: string) => {
      currentClipboardText = text;
    },
    getClipboard: () => currentClipboardText
  };
};

/**
 * 다중 이벤트 창 중첩 시 최하단(배경) 이벤트가 최상단 이벤트보다 먼저 낭독되는 결함 재현 테스트 (debug-harness)
 * - 원인 1 (GUI show 무조건 발화 및 Z-Order 역전):
 *   event_windows/*.gui 7종의 show(_show) state가 [EventWindow.IsOnTop] 검사 없이 무조건 ##CK3_TTS## 를 클립보드에 복사하여,
 *   동일 틱 다중 팝업(상단->하단 순 UI 순회) 또는 오클릭 방지 후면 큐잉(하단 추가) 시 최하단 창(Not(EventWindow.IsOnTop))이
 *   최상단 창(EventWindow.IsOnTop)의 클립보드를 덮어쓰거나 재생 중인 최상단 TTS를 즉시 끊어버림.
 * - 원인 2 (상단 창 닫힘 후 하단 창 승격 시 미발화):
 *   최상단 창을 닫아 하단 창이 새로운 최상단(EventWindow.IsOnTop = true)으로 승격될 때 이를 감지하는 상태 머신(tts_on_top_tracker)과
 *   logWatcher의 배경 이벤트 대기열 승격 로직이 없어 순서가 역전되거나 누락됨.
 * - 원인 3 (수동 단축키 F의 배경 창 동시 반응):
 *   tts_speak_button에 enabled = "[EventWindow.IsOnTop]" 가드가 없어 중첩 상태에서 F키 입력 시 최하단 창까지 반응함.
 */
describe('다중 이벤트 중첩 시 최상단(IsOnTop) 이벤트 우선 TTS 낭독 및 순차 승격 검증', () => {
  const guiDir = path.resolve(process.cwd(), 'ck3-mod/gui/event_windows');

  it('1. [GUI IsOnTop 가드 및 승격 트래커] 모든 event_windows GUI 파일은 show에서 tts_initial_check를 트리거하여 최상단 창만 클립보드(##CK3_TTS##)에 복사하고 배경 창은 error.log(##CK3_TTS_BG##)로 분리하며 tts_promotion_watcher 및 버튼 IsOnTop 가드를 갖추어야 한다', () => {
    const showFiles = [
      'character_event.gui',
      'big_event_window.gui',
      'duel_event.gui',
      'scheme_preparations_event.gui',
      'visit_settlement_window.gui',
      'letter_event.gui',
      'anonymous_letter_event.gui'
    ];

    for (const fileName of showFiles) {
      const filePath = path.join(guiDir, fileName);
      const content = fs.readFileSync(filePath, 'utf-8');

      // 1) show(_show) 내부에서 배경 창이 최상단 창의 클립보드를 덮어쓰지 않도록 tts_initial_check를 트리거해야 함
      assert.match(
        content,
        /PdxGuiWidget\.AccessChild\('tts_on_top_tracker'\)\.TriggerAnimation\('tts_initial_check'\)/,
        `[${fileName}] show(_show) state는 tts_on_top_tracker의 tts_initial_check를 트리거해야 합니다.`
      );
    }

    // visit_settlement_window.gui는 big_event_window를 상속하므로 직접 선언된 6개 파일에서 tts_on_top_tracker 및 tts_speak_button 검증
    const trackerAndButtonFiles = [
      'character_event.gui',
      'big_event_window.gui',
      'duel_event.gui',
      'scheme_preparations_event.gui',
      'letter_event.gui',
      'anonymous_letter_event.gui'
    ];

    for (const fileName of trackerAndButtonFiles) {
      const filePath = path.join(guiDir, fileName);
      const content = fs.readFileSync(filePath, 'utf-8');

      // 2) tts_on_top_tracker 내부에서 0.15초 Z-Order 안정화 후 최상단(tts_speak_fg -> 클립보드)과 배경(tts_queue_bg -> CloseGameView)을 분기해야 함
      assert.match(
        content,
        /name\s*=\s*"tts_on_top_tracker"[\s\S]*?name\s*=\s*tts_initial_check[\s\S]*?duration\s*=\s*0\.15[\s\S]*?Select_CString\(\s*EventWindow\.IsOnTop,\s*'tts_speak_fg',\s*'tts_queue_bg'\s*\)/,
        `[${fileName}] tts_on_top_tracker는 0.15초 후 IsOnTop 여부에 따라 tts_speak_fg와 tts_queue_bg를 분기해야 합니다.`
      );
      assert.match(
        content,
        /name\s*=\s*tts_queue_bg[\s\S]*?CloseGameView\(Concatenate\(Select_CString\(\s*EventWindow\.IsOnTop,\s*'##CK3_TTS##\s*',\s*'##CK3_TTS_BG##\s*'\s*\)/,
        `[${fileName}] 배경 창(tts_queue_bg)은 OS 클립보드를 덮어쓰지 않고 CloseGameView로 ##CK3_TTS_BG##를 기록해야 합니다.`
      );

      // 3) 최상단 승격 감지 위젯(tts_promotion_watcher) 존재 및 0.25초 지연(on_finish) 확인
      assert.match(
        content,
        /name\s*=\s*"tts_promotion_watcher"[\s\S]*?visible_at_creation\s*=\s*no[\s\S]*?visible\s*=\s*"\[Not\(EventWindow\.IsOnTop\)\]"[\s\S]*?name\s*=\s*_hide\s+duration\s*=\s*0\.25\s+on_finish\s*=\s*"\[EventWindowData\.CopyStringToClipboard/,
        `[${fileName}] 최상단 승격 자동 낭독 위젯(tts_promotion_watcher)이 duration = 0.25 및 on_finish로 정의되어 있어야 합니다.`
      );

      // 4) 모든 tts_speak_button 블록에 enabled = "[EventWindow.IsOnTop]" 가드가 포함되어야 함
      const buttonMatches =
        content.match(/button_round\s*=\s*\{\s*name\s*=\s*"tts_speak_button"[\s\S]*?\n\t*\}/g) ?? [];
      assert.ok(buttonMatches.length > 0, `[${fileName}] tts_speak_button이 존재해야 합니다.`);
      for (const block of buttonMatches) {
        assert.match(
          block,
          /enabled\s*=\s*"\[EventWindow\.IsOnTop\]"/,
          `[${fileName}] tts_speak_button에 enabled = "[EventWindow.IsOnTop]" 가드가 있어야 합니다.`
        );
      }
    }
  });

  it('2. [파서 태그 분기] extractCk3EventsFromChunk는 ##CK3_TTS_BG## 페이로드를 isBackgroundEvent: true로 식별해야 한다', () => {
    const chunk = [
      '##CK3_TTS_BG## 최하단 사건|||배경에 깔린 사건의 본문입니다.|||GENDER:M##CK3_TTS_END##',
      '##CK3_TTS## 최상단 사건|||화면에 보이는 최상단 사건의 본문입니다.|||GENDER:F##CK3_TTS_END##'
    ].join('\n');

    const extracted = extractCk3EventsFromChunk(chunk);
    assert.strictEqual(extracted.length, 2, '2건의 이벤트가 추출되어야 합니다.');
    assert.strictEqual(extracted[0]?.title, '최하단 사건');
    assert.strictEqual(
      extracted[0]?.isBackgroundEvent,
      true,
      '##CK3_TTS_BG## 태그 이벤트는 isBackgroundEvent가 true여야 합니다.'
    );
    assert.strictEqual(extracted[1]?.title, '최상단 사건');
    assert.strictEqual(
      Boolean(extracted[1]?.isBackgroundEvent),
      false,
      '##CK3_TTS## 태그 이벤트는 isBackgroundEvent가 false여야 합니다.'
    );
  });

  it('3. [실시간 중첩 우선순위 및 순차 승격] 다중 이벤트 발생 시 최하단(BG) 이벤트가 먼저 도착하거나 뒤따라 도착하더라도 최상단 이벤트가 먼저 낭독되고, 최상단 창을 닫으면(STOP) 대기 중이던 하위 이벤트가 순차 낭독되어야 한다', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ck3-topmost-priority-'));
    const debugLogPath = path.join(tmpDir, 'debug.log');
    fs.writeFileSync(debugLogPath, '', 'utf8');

    const mockClip = createMockClipboardBridge('원래 클립보드 텍스트');
    const receivedEvents: Ck3EventMessage[] = [];
    let stopCount = 0;

    const watcher = startWatchingLogFile(
      debugLogPath,
      (ev) => receivedEvents.push(ev),
      undefined,
      () => {
        stopCount++;
      },
      undefined,
      mockClip.bridge,
      25
    );

    try {
      await wait(60);

      // (A) 동일 틱에 2개 이벤트 팝업 시: 최하단 창(BG)이 show를 마지막에 덮어써 먼저 감지되더라도 즉시 방출되지 않고 대기해야 함
      mockClip.setClipboard(
        '##CK3_TTS_BG## 최하단 대기 사건|||뒤에 깔려 있는 두 번째 사건 본문입니다.|||GENDER:M##CK3_TTS_END##'
      );
      await wait(80);
      assert.strictEqual(
        receivedEvents.length,
        0,
        '최하단 배경(BG) 이벤트는 최상단 이벤트를 제치고 먼저 방출되면 안 됩니다.'
      );
      assert.strictEqual(
        mockClip.getClipboard(),
        '원래 클립보드 텍스트',
        '배경 이벤트 소비 후에도 사용자 클립보드가 즉시 복구되어야 합니다.'
      );

      // (B) 직후 최상단 창(IsOnTop)의 이벤트가 도착하면 최상단 이벤트가 가장 먼저 방출되어야 함
      mockClip.setClipboard(
        '##CK3_TTS## 최상단 우선 사건|||가장 위에 떠서 플레이어가 보고 있는 첫 번째 사건 본문입니다.|||GENDER:F##CK3_TTS_END##'
      );
      await wait(80);
      assert.strictEqual(receivedEvents.length, 1, '최상단 이벤트가 먼저 방출되어야 합니다.');
      assert.strictEqual(receivedEvents[0]?.title, '최상단 우선 사건');

      // (C) 최상단 이벤트가 열려 있는 동안 새로운 세 번째 이벤트가 후면(최하단 BG)에 추가 큐잉되더라도 현재 최상단 낭독을 끊지 않아야 함
      mockClip.setClipboard(
        '##CK3_TTS_BG## 세 번째 후면 사건|||가장 밑바닥에 새로 추가된 세 번째 사건 본문입니다.|||GENDER:M##CK3_TTS_END##'
      );
      await wait(80);
      assert.strictEqual(
        receivedEvents.length,
        1,
        '후면에 추가된 배경(BG) 이벤트가 현재 재생 중인 최상단 이벤트를 덮어쓰면 안 됩니다.'
      );

      // (D) 플레이어가 최상단 사건의 선택지를 클릭하여 창을 닫음 (STOP 발생) -> 대기 중이던 다음 사건("최하단 대기 사건")이 승격되어 방출되어야 함
      mockClip.setClipboard('##CK3_TTS_STOP##');
      await wait(450);
      assert.strictEqual(stopCount, 1, '최상단 창 닫기 시 onStop이 호출되어야 합니다.');
      assert.strictEqual(
        receivedEvents.length,
        2,
        '최상단 창이 닫힌 후 대기열에 있던 다음 이벤트("최하단 대기 사건")가 자동 승격 방출되어야 합니다.'
      );
      assert.strictEqual(receivedEvents[1]?.title, '최하단 대기 사건');

      // (E) 두 번째 사건마저 닫으면(STOP) 마지막 세 번째 사건("세 번째 후면 사건")이 순차 승격되어 방출되어야 함
      mockClip.setClipboard('##CK3_TTS_STOP##');
      await wait(450);
      assert.strictEqual(stopCount, 2, '두 번째 창 닫기 시 onStop이 호출되어야 합니다.');
      assert.strictEqual(
        receivedEvents.length,
        3,
        '마지막 대기 중이던 "세 번째 후면 사건"이 순차 승격 방출되어야 합니다.'
      );
      assert.strictEqual(receivedEvents[2]?.title, '세 번째 후면 사건');
    } finally {
      await watcher.stop();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('4. [동시 팝업 무음 방어 및 승격 후 error.log 지연 STOP 차단] 클립보드 STOP과 함께 error.log에 기록된 STOP이 승격 이벤트 방출 후 초상화 에러로 mtimeMs가 갱신되더라도 승격 TTS를 끊지 않아야 하며, 단독 BG 이벤트 유입 시 400ms 후 자동 승격되어야 한다', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ck3-simul-nosilence-'));
    const debugLogPath = path.join(tmpDir, 'debug.log');
    const errorLogPath = path.join(tmpDir, 'error.log');
    fs.writeFileSync(debugLogPath, '', 'utf8');
    fs.writeFileSync(errorLogPath, '', 'utf8');

    const mockClip = createMockClipboardBridge('사용자 클립보드');
    const receivedEvents: Ck3EventMessage[] = [];
    let stopCount = 0;

    const watcher = startWatchingLogFile(
      debugLogPath,
      (ev) => receivedEvents.push(ev),
      undefined,
      () => {
        stopCount++;
      },
      undefined,
      mockClip.bridge,
      25
    );

    try {
      await wait(60);

      // 1) 동시 팝업 시: 최상단 창은 클립보드(##CK3_TTS##), 배경 창은 error.log(##CK3_TTS_BG##)로 분리 유입
      mockClip.setClipboard(
        '##CK3_TTS## 동시 최상단 사건|||동시에 뜬 최상단 사건 본문입니다.|||GENDER:M##CK3_TTS_END##'
      );
      fs.writeFileSync(
        errorLogPath,
        "[12:03:34][E][interface_data_hooks.cpp:613]: unknown game view '##CK3_TTS_BG## 동시 배경 사건|||동시에 뒤에 깔린 두 번째 사건 본문입니다.|||GENDER:F##CK3_TTS_END##'\r\n",
        'utf8'
      );
      await wait(250);
      assert.strictEqual(receivedEvents.length, 1);
      assert.strictEqual(receivedEvents[0]?.title, '동시 최상단 사건');

      // 2) 최상단 창 선택지 클릭: 클립보드와 error.log(ClearErrorLog 후 기록)에 동시에 STOP 기록
      fs.writeFileSync(
        errorLogPath,
        "[12:03:35][E][interface_data_hooks.cpp:613]: unknown game view '##CK3_TTS_STOP##'\r\n",
        'utf8'
      );
      mockClip.setClipboard('##CK3_TTS_STOP##');
      await wait(60);
      assert.strictEqual(stopCount, 1, '첫 번째 창 닫기 STOP이 1회 호출되어야 합니다.');

      // 3) 0.25s 후 하위 창이 최상단으로 승격되어 클립보드로 발화됨
      await wait(200);
      mockClip.setClipboard(
        '##CK3_TTS## 동시 배경 사건|||동시에 뒤에 깔린 두 번째 사건 본문입니다.|||GENDER:F##CK3_TTS_END##'
      );
      await wait(60);
      assert.strictEqual(receivedEvents.length, 2, '승격된 두 번째 사건이 정상 방출되어야 합니다.');
      assert.strictEqual(receivedEvents[1]?.title, '동시 배경 사건');

      // 4) 직후 승격된 창의 초상화 렌더링 스크립트 경고가 error.log에 추가되어 mtimeMs가 갱신되더라도
      //    앞서 소비된 error.log 선두의 ##CK3_TTS_STOP## 때문에 stopCount가 2로 증가하면 안 됨
      fs.appendFileSync(
        errorLogPath,
        '[12:03:35][E][pdx_assert.cpp:632]: Assertion failed in common/modifiers/zz_ptr_positive_definition_finish.txt\r\n',
        'utf8'
      );
      await wait(350);
      assert.strictEqual(
        stopCount,
        1,
        '이미 클립보드에서 소비한 이전 창의 error.log STOP이 뒤늦게 재발화되어 승격된 두 번째 사건 TTS를 끊으면 안 됩니다.'
      );

      // 5) 두 번째 사건도 정상적으로 닫은 뒤, 만약 전경 이벤트 없이 단독 ##CK3_TTS_BG##만 도착하더라도 400ms 후 자동 승격되어 무음을 방지해야 함
      mockClip.setClipboard('##CK3_TTS_STOP##');
      await wait(80);
      assert.strictEqual(stopCount, 2);

      mockClip.setClipboard(
        '##CK3_TTS_BG## 단독 고립 배경 사건|||전경 페이로드가 유실되었을 때 침묵하지 않고 자동 복구되어야 하는 본문입니다.|||GENDER:M##CK3_TTS_END##'
      );
      await wait(520);
      assert.strictEqual(
        receivedEvents.length,
        3,
        '활성 전경 이벤트가 없을 때 유입된 단독 BG 이벤트는 400ms 후 자동 승격되어 무음 현상을 방지해야 합니다.'
      );
      assert.strictEqual(receivedEvents[2]?.title, '단독 고립 배경 사건');
    } finally {
      await watcher.stop();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

