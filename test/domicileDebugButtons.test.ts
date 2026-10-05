import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 장원/캠프(window_domicile.gui) 디버그 버튼 숨김 무결성 검증
 */
test('장원/캠프 창(window_domicile.gui) 디버그 버튼 숨김 무결성 검증', async (t) => {
  const filePath = path.resolve(process.cwd(), 'ck3-mod/gui/window_domicile.gui');
  assert.ok(fs.existsSync(filePath), 'window_domicile.gui 파일이 ck3-mod에 존재해야 합니다.');

  const content = fs.readFileSync(filePath, 'utf-8');

  await t.test('1. [중괄호 쌍 무결성] 열린 중괄호와 닫힌 중괄호의 개수가 정확히 일치해야 함', () => {
    let openCount = 0;
    let closeCount = 0;
    for (const char of content) {
      if (char === '{') openCount++;
      if (char === '}') closeCount++;
    }
    assert.equal(openCount, closeCount, `중괄호 열림(${openCount})과 닫힘(${closeCount}) 개수가 일치해야 합니다.`);
  });

  await t.test('2. [디버그 버튼 숨김] debug_interactions 위젯이 visible = no로 설정되어 있어야 함', () => {
    const match = content.match(/name\s*=\s*"debug_interactions"[\s\S]*?visible\s*=\s*no/);
    assert.ok(
      match,
      '장원/캠프 화면 하단 우측의 debug_interactions 위젯이 visible = no로 숨김 처리되어 있어야 합니다.'
    );
    assert.ok(
      !content.includes('name = "debug_interactions"\n\t\tvisible = "[InDebugMode]"'),
      'InDebugMode 바인딩이 제거되어 -debug_mode 상태에서도 노출되지 않아야 합니다.'
    );
  });
});
