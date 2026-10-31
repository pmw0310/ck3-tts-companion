import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startWatchingLogFile, type ClipboardBridge } from '@/main/logWatcher';
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
 * 이벤트 창 닫기 및 선택지 클릭 시 TTS가 중지되지 않는 결함 재현 테스트 (debug-harness)
 * - 원인 1 (tts_on_top_tracker 0.25초 무한 루프 클립보드 STOP 덮어쓰기):
 *   tts_on_top_tracker 내 state가 trigger_when = "[EventWindow.IsOnTop]"으로 선언되어,
 *   창이 최상단에 떠 있는 동안(및 닫힘 페이드아웃 중) 매 0.25초마다 무한 반복 실행되며
 *   선택지 클릭 시 복사한 ##CK3_TTS_STOP## 클립보드 신호를 ##CK3_TTS## 이벤트 텍스트로 덮어씀.
 * - 원인 2 (onclick 실행 순서 역전 및 ClearErrorLog / 클립보드 STOP 브릿지 누락):
 *   button_eventoption 및 button_event_letter에서 onclick = "[EventOption.Select]"가
 *   CopyStringToClipboard('##CK3_TTS_STOP##')보다 먼저 실행되어 EventWindowData 컨텍스트가 해제된 뒤 복사가 실패하고,
 *   CloseGameView('##CK3_TTS_STOP##') 앞에 [ClearErrorLog]가 누락되어 error.log 10만 줄 쿼터 소진 시 STOP 로그가 드랍됨.
 *   또한 단축키 선택 버튼(button_event_shortcut)에 STOP 훅이 누락됨.
 * - 원인 3 (logWatcher 교차 채널 800ms STOP 차단 및 지연 타이머 미취소):
 *   emitStopSignal에서 lastEventEmitChannel !== channel && now - lastEventEmitTime < 800 조건으로 인해
 *   클립보드로 이벤트 수신 직후 error.log로 STOP 수신 시 중지 신호가 무시되고,
 *   pendingBuffers / deferredEmitTimers가 취소되지 않아 닫힌 이벤트가 뒤늦게 재방출됨.
 * - 원인 4 (renderer onStopSpeech 300ms 차단 및 중복 이벤트 lastEventDetectedTime 갱신):
 *   renderer/main.ts의 onStopSpeech에서 Date.now() - lastEventDetectedTime < 300 가드가
 *   빠른 선택지 클릭 및 중복 이벤트 수신 직후의 정상 STOP 신호를 차단함.
 */
describe('이벤트 창 닫기 및 선택지 클릭 시 TTS 즉시 중지 검증 (stopOnCloseAndSelect)', () => {
  const guiRootDir = path.resolve(process.cwd(), 'ck3-mod/gui');

  it('1. [GUI tts_on_top_tracker 비루프 전이 검증] 6개 이벤트 창 GUI의 tts_on_top_tracker는 trigger_when 무한 루프 없이 visible = "[Not(EventWindow.IsOnTop)]"의 _hide 전이로 단 1회만 동작해야 한다', () => {
    const trackerFiles = [
      'event_windows/character_event.gui',
      'event_windows/big_event_window.gui',
      'event_windows/duel_event.gui',
      'event_windows/scheme_preparations_event.gui',
      'event_windows/letter_event.gui',
      'event_windows/anonymous_letter_event.gui'
    ];

    for (const relPath of trackerFiles) {
      const fullPath = path.join(guiRootDir, relPath);
      const content = fs.readFileSync(fullPath, 'utf-8');

      const trackerMatch = content.match(
        /widget\s*=\s*\{\s*name\s*=\s*"tts_on_top_tracker"[\s\S]*?\n\t*\}/
      );
      assert.ok(trackerMatch, `[${relPath}] tts_on_top_tracker 위젯이 존재해야 합니다.`);
      const trackerBlock = trackerMatch[0];

      assert.ok(
        !/trigger_when\s*=\s*"\[EventWindow\.IsOnTop\]"/.test(trackerBlock),
        `[${relPath}] tts_on_top_tracker 내부에 매 프레임/0.25초마다 무한 재실행되는 trigger_when = "[EventWindow.IsOnTop]"이 존재하면 안 됩니다.`
      );
      assert.match(
        trackerBlock,
        /visible_at_creation\s*=\s*no/,
        `[${relPath}] 최초 최상단 생성 시 불필요한 _hide 발화를 막기 위해 visible_at_creation = no가 선언되어야 합니다.`
      );
      assert.match(
        trackerBlock,
        /visible\s*=\s*"\[Not\(EventWindow\.IsOnTop\)\]"/,
        `[${relPath}] 배경 상태(Not(IsOnTop))에서 최상단(IsOnTop)으로 승격될 때만 _hide가 1회 실행되도록 visible = "[Not(EventWindow.IsOnTop)]"이 선언되어야 합니다.`
      );
      assert.match(
        trackerBlock,
        /state\s*=\s*\{\s*name\s*=\s*_hide\s+duration\s*=\s*0\.25\s+on_finish\s*=\s*"\[EventWindowData\.CopyStringToClipboard/,
        `[${relPath}] _hide 상태에서 duration = 0.25 이후 on_finish로 CopyStringToClipboard가 호출되어야 STOP 신호를 덮어쓰지 않습니다.`
      );
    }
  });

  it('2. [GUI 선택지 및 닫기 버튼 순서/쿼터 방어 검증] 선택지 클릭 시 EventOption.Select 실행 전에 모든 STOP 클립보드 복사(CopyBuildVersionInfoToClipboard 포함) 및 ClearErrorLog가 먼저 실행되어야 하며, 단축키 및 닫기 버튼 모두 클립보드+에러로그 이중 STOP 브릿지를 갖추어야 한다', () => {
    const optionFiles = [
      'shared/event_windows.gui',
      'event_windows/letter_event.gui',
      'event_windows/anonymous_letter_event.gui',
      'event_windows/scheme_preparations_event.gui'
    ];

    for (const relPath of optionFiles) {
      const fullPath = path.join(guiRootDir, relPath);
      const content = fs.readFileSync(fullPath, 'utf-8');

      // EventOption.Select가 포함된 모든 버튼 블록 검사
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (lines[i]?.includes('onclick = "[EventOption.Select]"')) {
          const windowSlice = lines.slice(Math.max(0, i - 6), i + 4).join('\n');
          const selectIdx = windowSlice.indexOf('onclick = "[EventOption.Select]"');
          const clipStopIdx = windowSlice.indexOf("CopyStringToClipboard('##CK3_TTS_STOP##')");
          const buildClipIdx = windowSlice.lastIndexOf('onclick = "[CopyBuildVersionInfoToClipboard]"');
          const clearLogIdx = windowSlice.indexOf('onclick = "[ClearErrorLog]"');
          const lastClearLogIdx = windowSlice.lastIndexOf('onclick = "[ClearErrorLog]"');
          const closeViewStopIdx = windowSlice.indexOf("CloseGameView('##CK3_TTS_STOP##')");

          assert.ok(
            clipStopIdx !== -1 && clipStopIdx < selectIdx,
            `[${relPath}:${i + 1}] CopyStringToClipboard('##CK3_TTS_STOP##')는 반드시 EventOption.Select 이전에 실행되어야 합니다.`
          );
          assert.ok(
            buildClipIdx === -1 || buildClipIdx < selectIdx,
            `[${relPath}:${i + 1}] CopyBuildVersionInfoToClipboard는 반드시 EventOption.Select 이전에만 실행되어야 승격된 하위 창의 클립보드를 덮어쓰지 않습니다.`
          );
          assert.ok(
            clearLogIdx !== -1 &&
              clearLogIdx < closeViewStopIdx &&
              lastClearLogIdx < closeViewStopIdx &&
              closeViewStopIdx < selectIdx,
            `[${relPath}:${i + 1}] [ClearErrorLog]는 반드시 CloseGameView('##CK3_TTS_STOP##') 이전에만 실행되어야 하며, 그 이후에 다시 호출되어 error.log의 STOP 기록을 지우면 안 됩니다.`
          );
        }
      }
    }

    // 모든 STOP 발생 GUI 파일에서 CloseGameView('##CK3_TTS_STOP##') 직전에 [ClearErrorLog]가 있는지 확인
    const allStopGuiFiles = [
      'shared/event_windows.gui',
      'event_windows/letter_event.gui',
      'event_windows/anonymous_letter_event.gui',
      'window_royal_court.gui',
      'window_activity.gui',
      'window_activity_locale.gui',
      'window_war_results.gui',
      'window_succession_event.gui',
      'window_legend_chronicle.gui',
      'window_tutorial.gui',
      'interaction_notification_window.gui',
      'interaction_call_ally_notification_window.gui'
    ];

    for (const relPath of allStopGuiFiles) {
      const fullPath = path.join(guiRootDir, relPath);
      const content = fs.readFileSync(fullPath, 'utf-8');
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (lines[i]?.includes("CloseGameView('##CK3_TTS_STOP##')")) {
          const prevLines = lines.slice(Math.max(0, i - 4), i + 1).join('\n');
          assert.match(
            prevLines,
            /onclick\s*=\s*"\[ClearErrorLog\]"/,
            `[${relPath}:${i + 1}] CloseGameView('##CK3_TTS_STOP##') 실행 전 반드시 onclick = "[ClearErrorLog]"가 선행되어야 error.log 10만 줄 쿼터 소진 시에도 STOP이 동작합니다.`
          );
        }
      }
    }
  });

  it('3. [logWatcher 즉시 STOP 및 지연 파편 취소] 이벤트 방출 직후(800ms 이내) 다른 채널(error.log)로 STOP이 도착하거나 error.log 지연 파편이 대기 중일 때 STOP은 즉시 실행되고 지연 파편은 폐기되어야 한다', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ck3-stop-close-'));
    const debugLogPath = path.join(tmpDir, 'debug.log');
    const errorLogPath = path.join(tmpDir, 'error.log');
    fs.writeFileSync(debugLogPath, '', 'utf8');
    fs.writeFileSync(errorLogPath, '', 'utf8');

    const mockClip = createMockClipboardBridge('원본 텍스트');
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

      // 1) 클립보드로 이벤트가 먼저 도착하여 즉시 방출됨 (이 시점에 error.log에도 불완전 파편이 기록되어 220ms 지연 타이머가 돌기 시작함)
      mockClip.setClipboard(
        '##CK3_TTS## 즉시 닫을 사건|||사용자가 보자마자 100ms 만에 선택지를 눌러 닫는 사건입니다.|||GENDER:M##CK3_TTS_END##'
      );
      fs.appendFileSync(
        errorLogPath,
        "[15:00:00][E][jomini_script_system.cpp:284]: Script system error!\n  Error: CloseGameView('##CK3_TTS## 즉시 닫을 사건|||사용자가 보자마자 100ms 만에 선택지를 눌러 닫는 사건입니다.')\n",
        'utf8'
      );

      await wait(80);
      assert.strictEqual(receivedEvents.length, 1, '초기 이벤트가 1회 방출되어야 합니다.');

      // 2) 사용자가 80ms 만에 선택지를 클릭하여 error.log(ClearErrorLog 후 STOP 기록)로 STOP 신호 발생
      fs.writeFileSync(
        errorLogPath,
        "[15:00:00][E][jomini_script_system.cpp:284]: Script system error!\n  Error: Object of type '##CK3_TTS_STOP##' does not exist\n",
        'utf8'
      );

      await wait(260);
      assert.strictEqual(
        stopCount,
        1,
        '클립보드 이벤트 방출 후 800ms 이내라도 error.log를 통해 들어온 사용자 STOP 신호가 무시되면 안 됩니다.'
      );
      assert.strictEqual(
        receivedEvents.length,
        1,
        'STOP 신호 발생 시 대기 중이던 지연 파편(deferredEmitTimers)은 즉시 취소되어 닫힌 이벤트가 재방출되면 안 됩니다.'
      );
    } finally {
      await watcher.stop();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('4. [renderer onStopSpeech 무차단 검증] renderer/main.ts의 onStopSpeech는 300ms 시간차 가드 없이 stopAudio()를 즉시 호출해야 하며, 중복 이벤트는 lastEventDetectedTime을 갱신하지 않아야 한다', () => {
    const rendererMainPath = path.resolve(process.cwd(), 'src/renderer/main.ts');
    const content = fs.readFileSync(rendererMainPath, 'utf-8');

    const onStopMatch = content.match(
      /window\.electronAPI\.onStopSpeech\(\(\)\s*=>\s*\{[\s\S]*?\}\);/
    );
    assert.ok(onStopMatch, 'renderer/main.ts에 onStopSpeech 핸들러가 존재해야 합니다.');
    assert.ok(
      !/lastEventDetectedTime\s*<\s*300/.test(onStopMatch[0]),
      'onStopSpeech 내부에서 Date.now() - lastEventDetectedTime < 300 조건으로 STOP 신호를 무시하면 안 됩니다.'
    );

    const handleNewEventMatch = content.match(
      /const shouldPlay = shouldPlayEvent\([\s\S]{0,650}/
    );
    assert.ok(handleNewEventMatch, 'handleNewEvent 내에 shouldPlayEvent 호출이 존재해야 합니다.');
    const guardIdx = handleNewEventMatch[0].indexOf('if (!shouldPlay)');
    const updateTimeIdx = handleNewEventMatch[0].indexOf('lastEventDetectedTime = now;');
    assert.ok(
      guardIdx !== -1 && updateTimeIdx > guardIdx,
      'lastEventDetectedTime = now 갱신은 반드시 if (!shouldPlay) 가드 통과 이후에 수행되어야 중복 이벤트가 타당성 시간을 오염시키지 않습니다.'
    );
  });
});
