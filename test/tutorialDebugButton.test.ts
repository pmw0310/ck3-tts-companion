import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 튜토리얼/반응형 조언 창(window_tutorial.gui) 디버그 버튼 숨김 무결성 검증
 */
test('튜토리얼 창(window_tutorial.gui) 디버그 버튼 숨김 무결성 검증', async (t) => {
  const filePath = path.resolve(process.cwd(), 'ck3-mod/gui/window_tutorial.gui');
  assert.ok(fs.existsSync(filePath), 'window_tutorial.gui 파일이 ck3-mod에 존재해야 합니다.');

  const content = fs.readFileSync(filePath, 'utf-8');

  await t.test('1. [중괄호 쌍 무결성] 열린 중괄호와 닫힌 중괄호의 개수가 정확히 일치해야 함', () => {
    let openCount = 0;
    let closeCount = 0;
    for (const char of content) {
      if (char === '{') openCount++;
      if (char === '}') closeCount++;
    }
    assert.equal(
      openCount,
      closeCount,
      `중괄호 열림(${openCount})과 닫힘(${closeCount}) 개수가 일치해야 합니다.`
    );
  });

  await t.test('2. [디버그 버튼 숨김] tutorial.debugwindow 버튼이 visible = no로 설정되어 있어야 함', () => {
    const match = content.match(
      /button_standard\s*=\s*\{[\s\S]*?visible\s*=\s*no[\s\S]*?tutorial\.debugwindow/
    );
    assert.ok(
      match,
      '튜토리얼 제목 옆의 디버그 버튼이 visible = no로 숨김 처리되어 있어야 합니다.'
    );
    assert.ok(
      !content.includes('visible = "[InDebugMode]"\n\t\t\t\t\t\traw_text = "Debug"'),
      'InDebugMode 바인딩이 제거되어 -debug_mode 상태에서도 노출되지 않아야 합니다.'
    );
  });

  await t.test('3. [TTS 자동 낭독 및 정지 연동] _show 및 _hide에 TTS 콘솔 명령이 구현되어 있어야 함', () => {
    assert.ok(
      content.includes('Tutorial.GetStepName') && content.includes('Tutorial.GetStepText'),
      '튜토리얼 제목과 본문 데이터 바인딩이 존재해야 합니다.'
    );
    assert.ok(
      content.includes('##CK3_TTS##') && content.includes('##CK3_TTS_STOP##'),
      '_show 자동 낭독 및 _hide 중단 훅이 구현되어 있어야 합니다.'
    );
  });

  await t.test('4. [황금 스피커 버튼 및 F 단축키] 수동 재낭독 버튼 및 F 단축키가 올바르게 바인딩되어 있어야 함', () => {
    assert.ok(
      content.includes('tts_speak_button') && content.includes('play_sound.dds'),
      '황금 스피커 버튼(tts_speak_button)이 존재해야 합니다.'
    );
    assert.ok(
      content.includes('tts_replay_shortcut_tutorial') && content.includes('army_split_half'),
      'F 단축키(army_split_half) 바인딩이 구현되어 있어야 합니다.'
    );
    assert.ok(
      content.includes('##CK3_TTS_FORCE##'),
      '수동 낭독 명령(##CK3_TTS_FORCE##)이 올바르게 적용되어 있어야 합니다.'
    );
  });
});

