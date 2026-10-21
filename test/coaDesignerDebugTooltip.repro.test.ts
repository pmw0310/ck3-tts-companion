import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * 문장 디자이너(coa_designer.gui) 디버그 코드명 툴팁 은닉화 검증 테스트
 */
test('문장 디자이너(coa_designer.gui) 디버그 코드명 툴팁 은닉화 무결성 검증', async (t) => {
  const coaDesignerGuiPath = path.resolve(process.cwd(), 'ck3-mod/gui/shared/coa_designer.gui');

  await t.test('1. ck3-mod/gui/shared/coa_designer.gui 파일이 존재해야 한다', () => {
    assert.ok(fs.existsSync(coaDesignerGuiPath), 'coa_designer.gui 파일이 존재해야 합니다.');
  });

  const content = fs.readFileSync(coaDesignerGuiPath, 'utf-8');

  await t.test('2. 중괄호 열림과 닫힘 개수가 완벽히 일치해야 한다 (Jomini GUI 구문 무결성)', () => {
    const openBraces = (content.match(/\{/g) || []).length;
    const closeBraces = (content.match(/\}/g) || []).length;

    assert.ok(openBraces > 0, '중괄호가 존재해야 합니다.');
    assert.strictEqual(
      openBraces,
      closeBraces,
      `중괄호 쌍이 일치하지 않습니다. (열림: ${openBraces}, 닫힘: ${closeBraces})`
    );
  });

  await t.test('3. coa_designer.gui 내에 InDebugMode 조건문이 없어야 한다', () => {
    const inDebugModeMatches = content.match(/\[InDebugMode\]/g);
    assert.strictEqual(
      inDebugModeMatches,
      null,
      '디버그 모드 툴팁 노출을 막기 위해 [InDebugMode]가 남아있지 않아야 합니다.'
    );
  });

  await t.test('4. 문양(Emblem) 및 패턴(Pattern) 툴팁이 tooltip_visible = no 로 설정되어야 한다', () => {
    const hiddenOccurrences = (content.match(/tooltip_visible\s*=\s*no/g) || []).length;
    assert.strictEqual(
      hiddenOccurrences,
      4,
      `4개의 디버그 툴팁(패턴, 레이아웃, 문양, 색상)이 모두 tooltip_visible = no 로 설정되어야 합니다. (실제: ${hiddenOccurrences})`
    );
  });
});

