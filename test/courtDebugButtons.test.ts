import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * 로열 코트(Royal Court) 상단 디버그 버튼 숨김 처리 검증 테스트
 */
test('로열 코트(window_royal_court.gui) 디버그 버튼 숨김 무결성 검증', async (t) => {
  const royalCourtGuiPath = path.resolve(process.cwd(), 'ck3-mod/gui/window_royal_court.gui');

  await t.test('1. window_royal_court.gui 파일이 존재해야 한다', () => {
    assert.ok(fs.existsSync(royalCourtGuiPath), 'window_royal_court.gui 파일이 존재해야 합니다.');
  });

  const content = fs.readFileSync(royalCourtGuiPath, 'utf-8');

  await t.test('2. 중괄호 열림과 닫힘 개수가 완벽히 일치해야 한다 (Jomini GUI 구문 무결성)', () => {
    const openBraces = (content.match(/\{/g) || []).length;
    const closeBraces = (content.match(/\}/g) || []).length;

    assert.ok(openBraces > 0, '중괄호가 존재해야 합니다.');
    assert.strictEqual(openBraces, closeBraces, `중괄호 쌍이 일치하지 않습니다. (열림: ${openBraces}, 닫힘: ${closeBraces})`);
  });

  await t.test('3. debug_buttons 컨테이너의 visible 속성이 no로 설정되어 화면에 노출되지 않아야 한다', () => {
    // debug_buttons 주변 블록 정규식 검사
    const hasHiddenDebugButtons = /name\s*=\s*"debug_buttons"[\s\S]*?visible\s*=\s*no/.test(content);
    assert.ok(hasHiddenDebugButtons, 'debug_buttons 컨테이너에 visible = no 속성이 지정되어야 합니다.');
  });

  await t.test('4. court_scene_editor_window 및 artifact_test_helper_window가 visible = no로 설정되어야 한다', () => {
    const hasHiddenSceneEditor = /court_scene_editor_window\s*=\s*\{[\s\S]*?visible\s*=\s*no/.test(content);
    const hasHiddenArtifactHelper = /artifact_test_helper_window\s*=\s*\{[\s\S]*?visible\s*=\s*no/.test(content);

    assert.ok(hasHiddenSceneEditor, 'court_scene_editor_window에 visible = no 속성이 지정되어야 합니다.');
    assert.ok(hasHiddenArtifactHelper, 'artifact_test_helper_window에 visible = no 속성이 지정되어야 합니다.');
  });
});
