import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sanitizeCk3Text } from '@/main/textSanitizer';

/**
 * holy_order.2050 clerical_helper 스코프 결함 및 ERROR:[...] 정제 무결성 재현 테스트
 */
describe('holy_order.2050 clerical_helper 스코프 결함 및 ERROR:[...] 정제 무결성 검증 (debug-harness)', () => {
  const modRoot = path.join(process.cwd(), 'ck3-mod');
  const locPaths = [
    path.join(modRoot, 'localization', 'korean', 'replace', 'debug_cleanup_l_korean.yml'),
    path.join(modRoot, 'localization', 'replace', 'korean', 'debug_cleanup_l_korean.yml'),
    path.join(modRoot, 'localization', 'english', 'replace', 'debug_cleanup_l_english.yml'),
    path.join(modRoot, 'localization', 'replace', 'english', 'debug_cleanup_l_english.yml')
  ];

  it('1. 모든 debug_cleanup 로컬라이제이션 파일에 holy_order.2050.desc 안전 오버라이드 키가 등록되어 있어야 한다', () => {
    for (const filePath of locPaths) {
      assert.ok(fs.existsSync(filePath), `파일이 존재해야 함: ${filePath}`);
      const content = fs.readFileSync(filePath, 'utf-8');
      assert.ok(
        content.includes('holy_order.2050.desc:0'),
        `${path.basename(filePath)}에 holy_order.2050.desc 오버라이드가 등록되어 있어야 합니다.`
      );
    }
  });

  it('2. 오버라이드된 키에 clerical_helper 스코프 검사 및 Select_CString 안전 폴백이 적용되어 있어야 한다', () => {
    const koreanContent = fs.readFileSync(locPaths[0]!, 'utf-8');
    assert.ok(
      koreanContent.includes("SCOPE.sC('clerical_helper').IsValid"),
      '한국어 오버라이드에 SCOPE.sC(\'clerical_helper\').IsValid 안전 가드가 포함되어야 합니다.'
    );
    assert.ok(
      !koreanContent.includes(' [clerical_helper.GetNamePossessive]'),
      '바닐라의 취약한 비스코프 직접 인자 clerical_helper.GetNamePossessive가 안전 가드로 대체되어야 합니다.'
    );

    const englishContent = fs.readFileSync(locPaths[2]!, 'utf-8');
    assert.ok(
      englishContent.includes("SCOPE.sC('clerical_helper').IsValid"),
      '영어 오버라이드에 SCOPE.sC(\'clerical_helper\').IsValid 안전 가드가 포함되어야 합니다.'
    );
  });

  it('3. sanitizeCk3Text는 실전 인게임 ERROR:[clerical_helper.GetNamePossessive] 유출 시 안전하게 정제해야 한다', () => {
    const rawErrorText =
      '"김 궁예계 은수회(은)는 사막의 은둔자가 그러했듯... 아직 고통받고 있는가?" ERROR:[clerical_helper.GetNamePossessive] 열렬한 서신은 모두 이런 식으로 시작되었다.\n\n"수도원장 사다모치(이)가 몸에 황금을 두르고 있는가?" 옹진에서 개혁가들의 설교를 들어보면 이런 식으로 끝난다. "새로운 길! 새로운 규율!"';

    const sanitized = sanitizeCk3Text(rawErrorText);

    // ERROR 문자열이나 대괄호 스크립트 코드가 일절 남아있지 않아야 함
    assert.ok(!sanitized.includes('ERROR'), 'ERROR 단어가 정제되어야 합니다.');
    assert.ok(!sanitized.includes('clerical_helper'), '스코프명이 제거되어야 합니다.');
    assert.ok(!sanitized.includes('GetNamePossessive'), '함수명이 제거되어야 합니다.');

    // 문장이 자연스럽게 이어져야 함
    assert.ok(sanitized.includes('열렬한 서신은 모두 이런 식으로 시작되었다'));
    assert.ok(sanitized.includes('사막의 은둔자가 그러했듯'));
  });

  it('4. 모든 로컬라이제이션 파일은 UTF-8 with BOM 인코딩을 준수해야 한다', () => {
    for (const filePath of locPaths) {
      const buf = fs.readFileSync(filePath);
      assert.strictEqual(buf[0], 0xef, `${path.basename(filePath)}: BOM 첫째 바이트(0xEF) 일치`);
      assert.strictEqual(buf[1], 0xbb, `${path.basename(filePath)}: BOM 둘째 바이트(0xBB) 일치`);
      assert.strictEqual(buf[2], 0xbf, `${path.basename(filePath)}: BOM 셋째 바이트(0xBF) 일치`);
    }
  });
});
