import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sanitizeCk3Text } from '@/main/textSanitizer';

/**
 * hostile_scheme_discovery.1001 targeted_courtier 미정의 스코프 에러 및 ERROR:[...] 정제 무결성 검증
 */
describe('hostile_scheme_discovery.1001 targeted_courtier 스코프 결함 및 ERROR:[...] 정제 무결성 검증 (debug-harness)', () => {
  const modRoot = path.join(process.cwd(), 'ck3-mod');
  const koreanLocPaths = [
    path.join(modRoot, 'localization', 'korean', 'replace', 'debug_cleanup_l_korean.yml'),
    path.join(modRoot, 'localization', 'replace', 'korean', 'debug_cleanup_l_korean.yml')
  ];
  const englishLocPaths = [
    path.join(modRoot, 'localization', 'english', 'replace', 'debug_cleanup_l_english.yml'),
    path.join(modRoot, 'localization', 'replace', 'english', 'debug_cleanup_l_english.yml')
  ];
  const allLocPaths = [...koreanLocPaths, ...englishLocPaths];

  const targetKeys = [
    'hostile_scheme_discovery.1001.desc_other_target',
    'hostile_scheme_discovery.1001.close_relation_other_target',
    'hostile_scheme_discovery.1001.desc_no_spymaster_other_target',
    'hostile_scheme_discovery.1001.close_relation_no_spymaster_other_target'
  ];

  it('1. 모든 한국어 및 영어 debug_cleanup 로컬라이제이션 파일에 hostile_scheme_discovery.1001 관련 4개 키가 등록되어 있어야 한다', () => {
    for (const filePath of allLocPaths) {
      assert.ok(fs.existsSync(filePath), `파일이 존재해야 함: ${filePath}`);
      const content = fs.readFileSync(filePath, 'utf-8');
      for (const key of targetKeys) {
        assert.ok(
          content.includes(`${key}:0`),
          `${path.basename(filePath)}에 ${key} 오버라이드가 등록되어 있어야 합니다.`
        );
      }
    }
  });

  it('2. 오버라이드된 키에 SCOPE.sC(\'targeted_courtier\').IsValid 안전 가드 및 Select_CString/AddTextIf가 적용되어 있어야 한다', () => {
    for (const filePath of koreanLocPaths) {
      const content = fs.readFileSync(filePath, 'utf-8');
      assert.ok(
        content.includes("SCOPE.sC('targeted_courtier').IsValid"),
        `${path.basename(filePath)}에 SCOPE.sC('targeted_courtier').IsValid 안전 가드가 포함되어야 합니다.`
      );
      assert.ok(
        content.includes("SCOPE.sC('targeted_courtier').GetTitledFirstName"),
        `${path.basename(filePath)}에 SCOPE.sC('targeted_courtier').GetTitledFirstName이 포함되어야 합니다.`
      );
      assert.ok(
        content.includes('궁정 신하'),
        `${path.basename(filePath)}에 폴백 명사 '궁정 신하'가 포함되어야 합니다.`
      );
    }

    for (const filePath of englishLocPaths) {
      const content = fs.readFileSync(filePath, 'utf-8');
      assert.ok(
        content.includes("SCOPE.sC('targeted_courtier').IsValid"),
        `${path.basename(filePath)}에 SCOPE.sC('targeted_courtier').IsValid 안전 가드가 포함되어야 합니다.`
      );
      assert.ok(
        content.includes('courtier'),
        `${path.basename(filePath)}에 폴백 명사 'courtier'가 포함되어야 합니다.`
      );
    }
  });

  it('3. sanitizeCk3Text는 사용자가 제보한 실전 인게임 ERROR:[targeted_courtier.GetTitledFirstName] 결함을 자연스러운 문장으로 정제해야 한다', () => {
    const rawUserText =
      '첩보장(이)가 무언가를 알아냈다면서 찾아왔다. 그리고는 지인인 속교구 주교 티보(이)가 나의 인 ERROR:[targeted_courtier.GetTitledFirstName](을)를 겨냥하여 모략을 꾸미는 중이라고 했다!';

    const sanitized = sanitizeCk3Text(rawUserText);

    assert.ok(!sanitized.includes('ERROR'), 'ERROR 문자열이 완전히 제거되어야 합니다.');
    assert.ok(!sanitized.includes('targeted_courtier'), '스코프명이 제거되어야 합니다.');
    assert.ok(!sanitized.includes('GetTitledFirstName'), '함수명이 제거되어야 합니다.');
    assert.ok(!sanitized.includes('나의 인'), '비문인 "나의 인"이 방치되지 않아야 합니다.');
    assert.strictEqual(
      sanitized,
      '첩보장이 무언가를 알아냈다면서 찾아왔다. 그리고는 지인인 속교구 주교 티보가 나의 궁정 신하를 겨냥하여 모략을 꾸미는 중이라고 했다!'
    );
  });

  it('4. 모든 로컬라이제이션 파일은 UTF-8 with BOM 인코딩을 준수해야 한다', () => {
    for (const filePath of allLocPaths) {
      const buf = fs.readFileSync(filePath);
      assert.strictEqual(buf[0], 0xef, `${path.basename(filePath)}: BOM 첫째 바이트(0xEF) 일치`);
      assert.strictEqual(buf[1], 0xbb, `${path.basename(filePath)}: BOM 둘째 바이트(0xBB) 일치`);
      assert.strictEqual(buf[2], 0xbf, `${path.basename(filePath)}: BOM 셋째 바이트(0xBF) 일치`);
    }
  });
});
