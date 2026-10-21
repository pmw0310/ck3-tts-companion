import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { extractCk3EventsFromChunk } from '@/main/textSanitizer';

/**
 * 독일 궁정(big_event_window.gui) 등 대형/일반 이벤트 창 자동 읽기 먹통 결함 재현 테스트
 * - 원인 1 (GUI State Machine 경합): 동일 위젯(window)에 show(trigger_on_create = yes), tts_clipboard_auto_play(trigger_on_create = yes),
 *   tts_console_fallback(trigger_on_create = yes)을 next 체이닝 없이 병렬 선언하여, Jomini 단일 상태 머신에서
 *   뒤따르는 state가 앞선 tts_clipboard_auto_play(delay = 0.1)를 t=0에 즉시 덮어써 클립보드 원문 복사가 증발함.
 * - 원인 2 (짝수 큰따옴표 종료 태그 삼킴 및 error.log 스티칭 루프 종료 미플러시):
 *   본문이 큰따옴표로 시작하고 큰따옴표로 끝나는 짝수 인용구("이 선물은..." ... "...방패가 되어야 합니다.")일 때
 *   마지막 큰따옴표가 |||GENDER:M##CK3_TTS_END##"를 인용 문자열로 묶어 삼키고,
 *   recoverEventsFromErrorLog가 선행 debug.log 헤더(##CK3_TTS## 독일 궁정|||)를 무시하고 루프 종료 시 토큰을 플러시하지 않아 이벤트가 완전 소실됨.
 */
describe('대형 이벤트 창(big_event_window 등) 자동 TTS 상태 머신 체이닝 및 짝수 따옴표 복원 검증', () => {
  const guiDir = path.resolve(process.cwd(), 'ck3-mod/gui/event_windows');

  it('1. event_windows GUI 파일들에서 CopyStringToClipboard가 C++ CEventWindow가 호출하는 show(_show) state의 on_start에 직접 배치되고 디버그 콘솔 폴백(tts_console_fallback)이 없어야 한다', () => {
    const targetFiles = [
      'big_event_window.gui',
      'character_event.gui',
      'duel_event.gui',
      'scheme_preparations_event.gui',
      'visit_settlement_window.gui',
      'letter_event.gui',
      'anonymous_letter_event.gui'
    ];

    for (const fileName of targetFiles) {
      const filePath = path.join(guiDir, fileName);
      const content = fs.readFileSync(filePath, 'utf-8');

      // 1) show 또는 _show state 내부에 CopyStringToClipboard가 직접 존재해야 함
      assert.match(
        content,
        /state\s*=\s*\{\s*name\s*=\s*_?show[\s\S]*?EventWindowData\.CopyStringToClipboard/,
        `[${fileName}] show(_show) state 내부에 CopyStringToClipboard가 직접 선언되어야 합니다.`
      );

      // 2) 디버그 모드 전용 tts_console_fallback 및 ExecuteConsoleCommand가 완전히 제거되어야 함
      assert.strictEqual(
        content.includes('tts_console_fallback'),
        false,
        `[${fileName}] tts_console_fallback state가 제거되어야 합니다.`
      );
      assert.strictEqual(
        content.includes('effect info_log'),
        false,
        `[${fileName}] 디버그 전용 effect info_log 콘솔 명령어가 제거되어야 합니다.`
      );
    }
  });

  it('2. "독일 궁정" 이벤트처럼 짝수 큰따옴표로 인해 ##CK3_TTS_END##가 삼켜진 debug.log + error.log 교차 스티칭 청크에서도 제목과 본문이 복원되어야 한다', () => {
    const stitchedChunk = [
      '[I][jomini_effect_impl.cpp:450]: ##CK3_TTS## 독일 궁정|||',
      '[E][pdx_persistent_reader.cpp:229]: Error: "Unknown effect: 이, near line: 1" in file: "effect console command" near line: 1',
      '[E][pdx_persistent_reader.cpp:229]: Error: "Unknown effect: 당신께서, near line: 1" in file: "effect console command" near line: 1',
      '[E][pdx_persistent_reader.cpp:229]: Error: "Unknown effect: 상징합니다., near line: 1" in file: "effect console command" near line: 1',
      '[E][pdx_persistent_reader.cpp:229]: Error: "Unknown effect: 당신께서는, near line: 3" in file: "effect console command" near line: 3',
      '[E][pdx_persistent_reader.cpp:229]: Error: "Unknown effect: 이름뿐인, near line: 3" in file: "effect console command" near line: 3',
      '[E][pdx_persistent_reader.cpp:229]: Error: "Unknown effect: 진정한, near line: 3" in file: "effect console command" near line: 3',
      '[E][pdx_persistent_reader.cpp:229]: Error: "Unknown effect: 위대한, near line: 3" in file: "effect console command" near line: 3',
      '[E][pdx_persistent_reader.cpp:229]: Error: "Unknown effect: 열어, near line: 3" in file: "effect console command" near line: 3',
      '[E][pdx_persistent_reader.cpp:229]: Error: "Unknown effect: 모든, near line: 3" in file: "effect console command" near line: 3',
      '[E][pdx_persistent_reader.cpp:229]: Error: "Unknown effect: 한자리에, near line: 3" in file: "effect console command" near line: 3',
      '[E][pdx_persistent_reader.cpp:229]: Error: "Unknown effect: 합니다!, near line: 3" in file: "effect console command" near line: 3',
      '[E][pdx_persistent_reader.cpp:229]: Error: "Unknown effect: 자리에서, near line: 3" in file: "effect console command" near line: 3',
      '[E][pdx_persistent_reader.cpp:229]: Error: "Unknown effect: 충성을, near line: 3" in file: "effect console command" near line: 3',
      '[E][pdx_persistent_reader.cpp:229]: Error: "Unknown effect: 독일의, near line: 3" in file: "effect console command" near line: 3',
      '[E][pdx_persistent_reader.cpp:229]: Error: "Unknown effect: 방패가, near line: 3" in file: "effect console command" near line: 3',
      '[E][pdx_persistent_reader.cpp:229]: Error: "Unknown effect: 합니다., near line: 3" in file: "effect console command" near line: 3'
    ].join('\n');

    const events = extractCk3EventsFromChunk(stitchedChunk);
    assert.strictEqual(events.length, 1, '짝수 따옴표로 END 태그가 삼켜진 스티칭 청크에서도 이벤트 1건이 복원되어야 합니다.');
    assert.strictEqual(events[0]?.title, '독일 궁정', '선행 debug.log 라인의 이벤트 제목("독일 궁정")이 보존되어야 합니다.');
    assert.ok(events[0]?.content.includes('상징합니다'), '본문 내용이 정상 복원되어야 합니다.');
  });
});

