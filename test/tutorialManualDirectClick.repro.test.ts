import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 튜토리얼 창(window_tutorial.gui) 음성 듣기 버튼 클릭 시 침묵 결함 재현 테스트
 * 
 * 결함 원인:
 * 1. 튜토리얼 창 상단 헤더의 tts_speak_button 및 F 단축키가 CloseGameView를 직접 호출하지 않고
 *    불안정한 GetVariableSystem.Set('tutorial_tts_pending_force', 'yes') 플래그를 세움.
 * 2. C++ CTutorialWindow의 위치 애니메이션(center 등)과 경합하거나 자식 위젯의 trigger_when 타이머가
 *    정상 틱되지 않아 CloseGameView가 아예 호출되지 않고 영구 침묵함.
 * 3. 왕실 궁정(window_court_events.gui), 유물 툴팁(cooltip.gui), 전쟁 결과(window_war_results.gui)와 동일하게
 *    사용자 인터랙션(버튼 클릭, F 단축키)은 지연 변수를 거치지 않고 onclick에서 직접 CloseGameView를 호출해야
 *    0ms 즉시 발화가 100% 보장됨.
 */
describe('튜토리얼 창 음성 듣기 버튼/F단축키 다이렉트 발화(onclick) 무결성 검증', () => {
  const tutorialGuiPath = path.resolve(process.cwd(), 'ck3-mod/gui/window_tutorial.gui');
  const content = fs.readFileSync(tutorialGuiPath, 'utf-8');

  it('1. tts_speak_button은 변수 지연 평가 없이 onclick에서 직접 CloseGameView로 ##CK3_TTS_FORCE##를 호출해야 한다', () => {
    const speakIndex = content.indexOf('name = "tts_speak_button"');
    assert.ok(speakIndex !== -1, 'tts_speak_button이 존재해야 합니다.');
    const speakBlock = content.slice(speakIndex, speakIndex + 400);

    // GetVariableSystem.Set 플래그를 세우는 불안정한 구조인지 검사 (현재 실패해야 함)
    const hasDirectCloseGameView =
      speakBlock.includes('onclick = "[CloseGameView') &&
      speakBlock.includes('##CK3_TTS_FORCE##') &&
      speakBlock.includes('Tutorial.GetStepText');

    assert.ok(
      hasDirectCloseGameView,
      'tts_speak_button의 onclick에 CloseGameView(Concatenate(\'##CK3_TTS_FORCE## \', ...))가 직접 바인딩되어 있어야 합니다.'
    );
  });

  it('2. F 단축키(tts_replay_shortcut_tutorial) 역시 onclick에서 직접 CloseGameView로 ##CK3_TTS_FORCE##를 호출해야 한다', () => {
    const shortcutIndex = content.indexOf('name = "tts_replay_shortcut_tutorial"');
    assert.ok(shortcutIndex !== -1, 'tts_replay_shortcut_tutorial이 존재해야 합니다.');
    const shortcutBlock = content.slice(shortcutIndex, shortcutIndex + 400);

    const hasDirectCloseGameView =
      shortcutBlock.includes('onclick = "[CloseGameView') &&
      shortcutBlock.includes('##CK3_TTS_FORCE##') &&
      shortcutBlock.includes('Tutorial.GetStepText');

    assert.ok(
      hasDirectCloseGameView,
      'tts_replay_shortcut_tutorial의 onclick에 CloseGameView(Concatenate(\'##CK3_TTS_FORCE## \', ...))가 직접 바인딩되어 있어야 합니다.'
    );
  });

  it('3. 불필요하고 불안정한 지연 force 트래커(tts_tutorial_deferred_force_tracker)는 제거되어야 한다', () => {
    assert.strictEqual(
      content.includes('name = "tts_tutorial_deferred_force_tracker"'),
      false,
      '다이렉트 onclick 바인딩 전환에 따라 불안정한 비동기 트래커(tts_tutorial_deferred_force_tracker)는 제거되어야 합니다.'
    );
  });
});

