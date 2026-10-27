import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  extractExecutionSoundsFromChunk,
  startWatchingLogFile,
  type ClipboardBridge
} from '@/main/logWatcher';
import { extractCk3EventsFromChunk } from '@/main/textSanitizer';
import type { Ck3EventMessage, ExecutionSoundEvent } from '@/shared/types';

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
const createMockClipboardBridge = (initialUserText: string = '사용자 원본 텍스트') => {
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
 * 비디버그 모드(-debug_mode 미사용 / 일반·철인 모드) TTS 및 STOP·처형 사운드 100% 작동 검증 테스트
 * - 엔진 역공학 근거:
 *   1) NLog::NDetail::ShouldSkipLog (0x107168254): -debug_mode가 꺼져 있으면 ELogLevel::Error(4)만 통과하고 Debug/Info/Warning은 스킵됨.
 *   2) CEventWindowData::CopyStringToClipboard (0x1014d9dc0): InDebugMode 검사 없이 클립보드에 즉시 복사됨.
 *   3) CloseGameView(CString) (0x10059b210): InDebugMode 검사 없이 존재하지 않는 뷰 이름에 대해 ELogLevel::Error로
 *      "unknown game view '...'"를 error.log 및 debug.log에 즉시 Flush 기록하며 창 닫기 등 부작용이 전혀 없음.
 *   4) error_log 스크립트 이펙트: ELogLevel::Error로 기록되므로 비디버그 모드에서도 처형 효과음 태그가 100% 출력됨.
 */
describe('비디버그 모드(-debug_mode 미사용) TTS·STOP·처형 사운드 전 채널 작동 검증', () => {
  const modDir = path.resolve(process.cwd(), 'ck3-mod');

  it('1. [CloseGameView 브릿지 파싱] 비디버그 모드에서 CloseGameView가 출력하는 [E] unknown game view 로그에서 큰따옴표 포함 대사 및 특수 창 메타데이터가 무손실 추출되어야 한다', () => {
    const nonDebugErrorLogChunk = [
      `[14:20:01][E][interface_data_hooks.cpp:613]: unknown game view '##CK3_TTS## 보헤미아 성전: 승리!|||"신께서 우리의 승리를 허락하셨소." 적군이 무릎을 꿇었습니다.|||TYPE:WAR_RESULTS##CK3_TTS_END##'`,
      `[14:20:05][E][interface_data_hooks.cpp:613]: unknown game view '##CK3_TTS## 다섯 번째 노움의 전설|||고대부터 전해 내려오는 "황금 왕관"의 전설이 마침내 완성되었습니다.|||GENDER:F##CK3_TTS_END##'`
    ].join('\n');

    const events = extractCk3EventsFromChunk(nonDebugErrorLogChunk);
    assert.strictEqual(events.length, 2, '2건의 비디버그 모드 이벤트가 모두 추출되어야 합니다.');

    assert.strictEqual(events[0]?.title, '보헤미아 성전: 승리!');
    assert.strictEqual(
      events[0]?.content,
      '"신께서 우리의 승리를 허락하셨소."적군이 무릎을 꿇었습니다.'
    );
    assert.strictEqual(events[0]?.eventType, 'war_results');

    assert.strictEqual(events[1]?.title, '다섯 번째 노움의 전설');
    assert.strictEqual(
      events[1]?.content,
      '고대부터 전해 내려오는 "황금 왕관"의 전설이 마침내 완성되었습니다.'
    );
    assert.strictEqual(events[1]?.speakerGender, 'female');
  });

  it('2. [비디버그 모드 실시간 감시] debug.log가 전혀 갱신되지 않는 상태에서도 클립보드(일반 이벤트/STOP)와 error.log(CloseGameView 특수 창/STOP/처형 효과음)가 지연 없이 작동해야 한다', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ck3-nondebug-watch-'));
    const debugLogPath = path.join(tmpDir, 'debug.log');
    const errorLogPath = path.join(tmpDir, 'error.log');
    fs.writeFileSync(debugLogPath, '', 'utf8');
    fs.writeFileSync(errorLogPath, '', 'utf8');

    const mockClip = createMockClipboardBridge('기존 클립보드 데이터');
    const receivedEvents: Ck3EventMessage[] = [];
    const receivedSounds: ExecutionSoundEvent[] = [];
    let stopCount = 0;

    const watcher = startWatchingLogFile(
      debugLogPath,
      (ev) => receivedEvents.push(ev),
      undefined,
      () => {
        stopCount++;
      },
      (sound) => receivedSounds.push(sound),
      mockClip.bridge,
      30
    );

    try {
      await wait(80);

      // (A) 일반 이벤트 창: CopyStringToClipboard를 통해 클립보드로만 전달 (debug.log 미갱신)
      mockClip.setClipboard(
        '##CK3_TTS## 자객의 습격|||"네 목숨은 여기까지다." 자객이 단검을 휘둘렀습니다.|||GENDER:M##CK3_TTS_END##'
      );
      await wait(100);

      assert.strictEqual(receivedEvents.length, 1, '클립보드 단독 채널로 일반 이벤트가 수신되어야 합니다.');
      assert.strictEqual(receivedEvents[0]?.title, '자객의 습격');
      assert.strictEqual(
        receivedEvents[0]?.content,
        '"네 목숨은 여기까지다."자객이 단검을 휘둘렀습니다.'
      );
      assert.strictEqual(
        mockClip.getClipboard(),
        '기존 클립보드 데이터',
        '이벤트 소비 즉시 사용자의 기존 클립보드가 복구되어야 합니다.'
      );

      // (B) 일반 이벤트 선택지 클릭: CopyStringToClipboard('##CK3_TTS_STOP##')로 중단 신호 수신
      mockClip.setClipboard('##CK3_TTS_STOP##');
      await wait(100);
      assert.strictEqual(stopCount, 1, '클립보드 STOP 신호로 onStop이 호출되어야 합니다.');
      assert.strictEqual(
        mockClip.getClipboard(),
        '기존 클립보드 데이터',
        'STOP 페이로드 소비 후에도 사용자의 클립보드가 복구되어야 합니다.'
      );

      // (C) EventWindowData가 없는 특수 창(튜토리얼/승계/전쟁 결과): CloseGameView를 통해 error.log에 기록
      fs.appendFileSync(
        errorLogPath,
        `[14:25:00][E][interface_data_hooks.cpp:613]: unknown game view '##CK3_TTS## 승계|||선왕이 서거하고 새로운 후계자가 즉위했습니다.##CK3_TTS_END##'\n`,
        'utf8'
      );
      await wait(320);

      assert.strictEqual(
        receivedEvents.length,
        2,
        'Unknown effect 파편이 아닌 완결형 CloseGameView error.log 이벤트는 즉시 방출되어야 합니다.'
      );
      assert.strictEqual(receivedEvents[1]?.title, '승계');

      // (D) 특수 창 닫기 버튼: CloseGameView('##CK3_TTS_STOP##')를 통해 error.log에 기록
      fs.appendFileSync(
        errorLogPath,
        `[14:25:02][E][interface_data_hooks.cpp:613]: unknown game view '##CK3_TTS_STOP##'\n`,
        'utf8'
      );
      await wait(320);
      assert.strictEqual(stopCount, 2, 'error.log의 CloseGameView STOP 신호로 onStop이 호출되어야 합니다.');

      // (E) 비디버그 모드 처형 효과음: error_log 이펙트를 통해 error.log에 기록
      fs.appendFileSync(
        errorLogPath,
        `[14:25:04][E][jomini_effect_impl.cpp:450]: ##CK3_EXECUTION## burned|||GENDER:F##\n`,
        'utf8'
      );
      await wait(320);
      assert.strictEqual(receivedSounds.length, 1, 'error.log를 통해 처형 효과음이 감지되어야 합니다.');
      assert.strictEqual(receivedSounds[0]?.type, 'burning');
      assert.strictEqual(receivedSounds[0]?.gender, 'female');
    } finally {
      await watcher.stop();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('3. [GUI 및 스크립트 전수 검증] 모든 특수 창, 닫기/선택지 버튼, 처형 스크립트에 비디버그 모드 브릿지(CloseGameView / CopyStringToClipboard / error_log)가 누락 없이 이식되어 있어야 한다', () => {
    // 1) 처형 스크립트 이펙트 검증 (디버그 전용 info_log는 제거되고 비디버그 error_log만 14개 존재)
    const prisonEffects = fs.readFileSync(
      path.join(modDir, 'common/scripted_effects/zz_tts_companion_prison_effects.txt'),
      'utf8'
    );
    const infoExecMatches = prisonEffects.match(/info_log\s*=\s*"##CK3_EXECUTION##[^"]+"/g) ?? [];
    const errorExecMatches = prisonEffects.match(/error_log\s*=\s*"##CK3_EXECUTION##[^"]+"/g) ?? [];
    assert.strictEqual(infoExecMatches.length, 14, '[E] 100,000건 쿼터 차단에 대비해 info_log 처형 훅도 14개 모두 병행 유지되어야 합니다.');
    assert.strictEqual(
      errorExecMatches.length,
      14,
      '비디버그 error_log 처형 효과음 훅이 14개 모두 존재해야 합니다.'
    );
    assert.strictEqual(
      extractExecutionSoundsFromChunk(errorExecMatches.join('\n')).length,
      14,
      '모든 error_log 처형 태그가 정상 파싱되어야 합니다.'
    );

    // 2) EventWindowData가 없는 특수 창들의 CloseGameView TTS 훅 검증
    const nonEventWindowFiles = [
      'gui/window_war_results.gui',
      'gui/window_succession_event.gui',
      'gui/window_legend_chronicle.gui',
      'gui/window_tutorial.gui',
      'gui/interaction_notification_window.gui',
      'gui/interaction_call_ally_notification_window.gui',
      'gui/shared/cooltip.gui'
    ];
    for (const rel of nonEventWindowFiles) {
      const content = fs.readFileSync(path.join(modDir, rel), 'utf8');
      assert.ok(
        content.includes("CloseGameView(Concatenate('##CK3_TTS"),
        `${rel} 파일에 비디버그 모드용 CloseGameView TTS 훅이 포함되어야 합니다.`
      );
    }

    // 3) 모든 STOP 방출 GUI 파일에 CloseGameView('##CK3_TTS_STOP##')가 존재하는지 검증
    const stopFiles = [
      'gui/shared/event_windows.gui',
      'gui/event_windows/letter_event.gui',
      'gui/event_windows/anonymous_letter_event.gui',
      'gui/window_royal_court.gui',
      'gui/window_activity.gui',
      'gui/window_activity_locale.gui',
      'gui/window_war_results.gui',
      'gui/window_succession_event.gui',
      'gui/window_legend_chronicle.gui',
      'gui/window_tutorial.gui',
      'gui/interaction_notification_window.gui',
      'gui/interaction_call_ally_notification_window.gui'
    ];
    for (const rel of stopFiles) {
      const content = fs.readFileSync(path.join(modDir, rel), 'utf8');
      assert.ok(
        content.includes("CloseGameView('##CK3_TTS_STOP##')"),
        `${rel} 파일에 비디버그 모드용 CloseGameView('##CK3_TTS_STOP##') 훅이 포함되어야 합니다.`
      );
    }
  });
});
