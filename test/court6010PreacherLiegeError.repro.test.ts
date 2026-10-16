import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sanitizeCk3Text } from '@/main/textSanitizer';

/**
 * court.6010.c.tt preacher_liege.GeTitledFirstName 바닐라 오타 및 스코프 결함 재현 테스트
 */
describe('court.6010.c.tt preacher_liege.GeTitledFirstName 오타 및 ERROR:[...] 정제 무결성 검증 (debug-harness)', () => {
  const modRoot = path.join(process.cwd(), 'ck3-mod');
  const locPaths = [
    path.join(modRoot, 'localization', 'korean', 'replace', 'debug_cleanup_l_korean.yml'),
    path.join(modRoot, 'localization', 'replace', 'korean', 'debug_cleanup_l_korean.yml'),
    path.join(modRoot, 'localization', 'english', 'replace', 'debug_cleanup_l_english.yml'),
    path.join(modRoot, 'localization', 'replace', 'english', 'debug_cleanup_l_english.yml')
  ];

  it('1. 모든 debug_cleanup 로컬라이제이션 파일에 court.6010.c.tt 안전 오버라이드 키가 등록되어 있어야 한다', () => {
    for (const filePath of locPaths) {
      assert.ok(fs.existsSync(filePath), `파일이 존재해야 함: ${filePath}`);
      const content = fs.readFileSync(filePath, 'utf-8');
      assert.ok(
        content.includes('court.6010.c.tt:0'),
        `${path.basename(filePath)}에 court.6010.c.tt 오버라이드가 등록되어 있어야 합니다.`
      );
    }
  });

  it('2. 오버라이드된 키에 GeTitledFirstName 오타가 수정되고 preacher_liege 스코프 안전 가드가 적용되어 있어야 한다', () => {
    const koreanContent = fs.readFileSync(locPaths[0]!, 'utf-8');
    assert.ok(
      koreanContent.includes("SCOPE.sC('preacher_liege').IsValid"),
      "한국어 오버라이드에 SCOPE.sC('preacher_liege').IsValid 안전 가드가 포함되어야 합니다."
    );
    assert.ok(
      koreanContent.includes("SCOPE.sC('preacher_liege').GetTitledFirstName"),
      "한국어 오버라이드에 오타가 수정된 SCOPE.sC('preacher_liege').GetTitledFirstName이 포함되어야 합니다."
    );
    assert.ok(
      !koreanContent.includes('GeTitledFirstName'),
      '바닐라의 오타 함수명 GeTitledFirstName이 남아있지 않아야 합니다.'
    );

    const englishContent = fs.readFileSync(locPaths[2]!, 'utf-8');
    assert.ok(
      englishContent.includes("SCOPE.sC('preacher_liege').IsValid"),
      "영어 오버라이드에 SCOPE.sC('preacher_liege').IsValid 안전 가드가 포함되어야 합니다."
    );
    assert.ok(
      englishContent.includes("SCOPE.sC('preacher_liege').GetTitledFirstName"),
      "영어 오버라이드에 오타가 수정된 SCOPE.sC('preacher_liege').GetTitledFirstName이 포함되어야 합니다."
    );
  });

  it('3. sanitizeCk3Text는 실전 인게임 ERROR:[preacher_liege.GeTitledFirstName] 유출 시 관형격 조사 왜곡 없이 정제해야 한다', () => {
    const rawErrorTextMale = '그의 주군인 ERROR:[preacher_liege.GeTitledFirstName](이)가 불쾌해할 것이다.';
    const rawErrorTextFemale = '그녀의 주군인 ERROR:[preacher_liege.GeTitledFirstName](이)가 불쾌해할 것이다.';

    const sanitizedMale = sanitizeCk3Text(rawErrorTextMale);
    const sanitizedFemale = sanitizeCk3Text(rawErrorTextFemale);

    assert.ok(!sanitizedMale.includes('ERROR'), 'ERROR 단어가 정제되어야 합니다.');
    assert.ok(!sanitizedMale.includes('preacher_liege'), '스코프명이 제거되어야 합니다.');
    assert.ok(!sanitizedMale.includes('GeTitledFirstName'), '오타 함수명이 제거되어야 합니다.');
    assert.strictEqual(sanitizedMale, '그의 주군이 불쾌해할 것이다.');
    assert.strictEqual(sanitizedFemale, '그녀의 주군이 불쾌해할 것이다.');
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

