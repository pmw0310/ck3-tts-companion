import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 일반 캐릭터 이벤트(character_event.gui)의 DLC 표시(source_icon) 아래 TTS 버튼 레이아웃 검증
 */
test('캐릭터 이벤트 창(character_event.gui) DLC 배너 하단 TTS 버튼 배치 검증', async (t) => {
  const characterGuiPath = path.resolve(
    process.cwd(),
    'ck3-mod/gui/event_windows/character_event.gui'
  );
  assert.ok(fs.existsSync(characterGuiPath), 'character_event.gui 파일이 존재해야 합니다.');

  const content = fs.readFileSync(characterGuiPath, 'utf-8');

  await t.test('1. [Z-Index 및 레이아웃] TTS 버튼이 DLC source_icon보다 뒤에 최상위 레이어로 선언되어야 함', () => {
    const sourceIconIndex = content.indexOf('name = "source_icon"');
    assert.ok(sourceIconIndex !== -1, 'source_icon 위젯이 존재해야 합니다.');

    const ttsButtonIndex = content.indexOf('name = "tts_speak_button"');
    assert.ok(ttsButtonIndex !== -1, 'tts_speak_button 위젯이 존재해야 합니다.');

    assert.ok(
      ttsButtonIndex > sourceIconIndex,
      'TTS 버튼이 source_icon보다 나중에 선언되어 DLC 아트워크에 가려지지 않아야 합니다.'
    );
  });

  await t.test('2. [위치 검증] DLC 배너(높이 64px, y=20) 바로 아래(position = { -40 95 })에 배치되어야 함', () => {
    assert.match(
      content,
      /button_round\s*=\s*\{[\s\S]*?name\s*=\s*"tts_speak_button"[\s\S]*?parentanchor\s*=\s*top\|right[\s\S]*?position\s*=\s*\{\s*-40\s+95\s*\}/,
      'TTS 버튼이 DLC 배너 아래인 position = { -40 95 }에 배치되어야 합니다.'
    );
  });

  await t.test('3. [헤더 클린] theme_header 내부에는 중복 버튼이 없어야 함', () => {
    const themeHeaderIndex = content.indexOf('name = "theme_header"');
    assert.ok(themeHeaderIndex !== -1);
    const headerBlock = content.slice(themeHeaderIndex, themeHeaderIndex + 1500);

    assert.ok(
      !headerBlock.includes('tts_speak_button'),
      'theme_header 내부에는 가려지는 중복 버튼이 없어야 합니다.'
    );
  });
});
