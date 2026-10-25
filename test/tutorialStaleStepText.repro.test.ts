import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 튜토리얼 창(window_tutorial.gui) 수동 다이렉트 발화 및 다음/이전 버튼 자동 재생 배제 검증
 * - 수동 전용 정책: "다음", "이전", "skip", "read_later" 등 스텝 전환 버튼은 일체 자동 TTS를 유발하지 않음.
 * - 다이렉트 발화 정책: 스피커 버튼, F 단축키, 반복(repeat) 버튼은 불필요한 변수 지연(delay) 없이 onclick에서 다이렉트로 CloseGameView를 호출함.
 */

const TUTORIAL_GUI = path.resolve(__dirname, '../ck3-mod/gui/window_tutorial.gui');
const content = fs.readFileSync(TUTORIAL_GUI, 'utf-8');

describe('튜토리얼 창 수동 발화 무결성 및 자동 재생 배제 검증', () => {
  it('다음/이전/skip/read_later 등 전환 버튼은 자동 재생을 유발하지 않아야 한다', () => {
    const autoSetCount = (content.match(/GetVariableSystem\.Set\('tutorial_tts_pending_auto', 'yes'\)/g) ?? []).length;
    assert.strictEqual(autoSetCount, 0, '전환 버튼은 자동 재생을 유발하지 않아야 함');
    assert.strictEqual(content.includes('name = "tts_tutorial_step_detector"'), false, '스텝 자동 감지기가 없어야 함');
    assert.strictEqual(content.includes('name = "tts_tutorial_deferred_auto_tracker"'), false, '자동 낭독 트래커가 없어야 함');
  });

  it('스피커 버튼, F 단축키, 반복 버튼은 onclick에서 직접 CloseGameView(##CK3_TTS_FORCE##)를 호출해야 한다', () => {
    // 1. 스피커 버튼 다이렉트 onclick 확인
    const speakIndex = content.indexOf('name = "tts_speak_button"');
    assert.ok(speakIndex !== -1, 'tts_speak_button이 존재해야 합니다.');
    const speakBlock = content.slice(speakIndex, speakIndex + 400);
    assert.match(
      speakBlock,
      /onclick\s*=\s*"\[CloseGameView\(Concatenate\('##CK3_TTS_FORCE## ', Concatenate\(Tutorial\.GetStepName, Concatenate\('\|\|\|', Concatenate\(Tutorial\.GetStepText, '##CK3_TTS_END##'\)\)\)\)\)\]"/,
      'tts_speak_button에 다이렉트 CloseGameView가 바인딩되어야 합니다.'
    );

    // 2. F 단축키 다이렉트 onclick 확인
    const shortcutIndex = content.indexOf('name = "tts_replay_shortcut_tutorial"');
    assert.ok(shortcutIndex !== -1, 'tts_replay_shortcut_tutorial이 존재해야 합니다.');
    const shortcutBlock = content.slice(shortcutIndex, shortcutIndex + 400);
    assert.match(
      shortcutBlock,
      /onclick\s*=\s*"\[CloseGameView\(Concatenate\('##CK3_TTS_FORCE## ', Concatenate\(Tutorial\.GetStepName, Concatenate\('\|\|\|', Concatenate\(Tutorial\.GetStepText, '##CK3_TTS_END##'\)\)\)\)\)\]"/,
      'tts_replay_shortcut_tutorial에 다이렉트 CloseGameView가 바인딩되어야 합니다.'
    );

    // 3. repeat 버튼 다이렉트 onclick 확인
    const repeatIndex = content.indexOf("Tutorial.HasTransition('repeat')");
    assert.ok(repeatIndex !== -1, 'repeat 버튼이 존재해야 합니다.');
    const repeatBlock = content.slice(repeatIndex, repeatIndex + 400);
    assert.match(
      repeatBlock,
      /onclick\s*=\s*"\[CloseGameView\(Concatenate\('##CK3_TTS_FORCE## ', Concatenate\(Tutorial\.GetStepName, Concatenate\('\|\|\|', Concatenate\(Tutorial\.GetStepText, '##CK3_TTS_END##'\)\)\)\)\)\]"/,
      'repeat 버튼에 다이렉트 CloseGameView가 바인딩되어야 합니다.'
    );
  });

  it('불안정한 지연 평가용 임시 변수 플래그(tutorial_tts_pending_force)가 배제되어야 한다', () => {
    const forcePendingCount = (content.match(/tutorial_tts_pending_force/g) ?? []).length;
    assert.strictEqual(
      forcePendingCount,
      0,
      'tutorial_tts_pending_force 변수는 지연 트래커 제거에 따라 사용되지 않아야 합니다.'
    );
  });
});
