import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sanitizeCk3Text } from '../src/main/textSanitizer.js';

describe('ep3_emperor_yearly.8000 suggestor 스코프 결함 및 ERROR:[...] 정제 무결성 검증 (debug-harness)', () => {
  const modRoot = path.join(process.cwd(), 'ck3-mod');
  const locPaths = [
    path.join(modRoot, 'localization', 'korean', 'replace', 'debug_cleanup_l_korean.yml'),
    path.join(modRoot, 'localization', 'replace', 'korean', 'debug_cleanup_l_korean.yml'),
    path.join(modRoot, 'localization', 'english', 'replace', 'debug_cleanup_l_english.yml'),
    path.join(modRoot, 'localization', 'replace', 'english', 'debug_cleanup_l_english.yml')
  ];

  it('1. 모든 debug_cleanup 로컬라이제이션 파일에 8000/8020 이벤트 안전 오버라이드 키가 등록되어 있어야 한다', () => {
    for (const filePath of locPaths) {
      assert.ok(fs.existsSync(filePath), `파일이 존재해야 함: ${filePath}`);
      const content = fs.readFileSync(filePath, 'utf-8');
      assert.ok(
        content.includes('ep3_emperor_yearly.8000.desc:0'),
        `${path.basename(filePath)}에 ep3_emperor_yearly.8000.desc 오버라이드가 등록되어 있어야 합니다.`
      );
      assert.ok(
        content.includes('ep3_emperor_yearly.8020.desc:0'),
        `${path.basename(filePath)}에 ep3_emperor_yearly.8020.desc 오버라이드가 등록되어 있어야 합니다.`
      );
    }
  });

  it('2. 오버라이드된 키에 suggestor 스코프 검사 및 Select_CString 안전 폴백이 적용되어 있어야 한다', () => {
    const koreanContent = fs.readFileSync(locPaths[0]!, 'utf-8');
    assert.ok(
      koreanContent.includes("SCOPE.sC('suggestor').IsValid"),
      '한국어 오버라이드에 SCOPE.sC(\'suggestor\').IsValid 안전 가드가 포함되어야 합니다.'
    );
    assert.ok(
      !koreanContent.includes("RelationToMeShort', suggestor)"),
      '바닐라의 취약한 비스코프 직접 인자 suggestor가 제거되어야 합니다.'
    );

    const englishContent = fs.readFileSync(locPaths[2]!, 'utf-8');
    assert.ok(
      englishContent.includes("SCOPE.sC('suggestor').IsValid"),
      '영어 오버라이드에 SCOPE.sC(\'suggestor\').IsValid 안전 가드가 포함되어야 합니다.'
    );
  });

  it('3. sanitizeCk3Text는 실전 인게임 중첩 ERROR:ERROR:[...] 유출 시 안전하게 정제해야 한다', () => {
    const rawErrorText =
      "나의 ERROR:ERROR:[ROOT.Char.Custom2('RelationToMeShort', suggestor)] ERROR:ERROR:[suggestor.GetTitledFirstName](은)는 힘든 시기에 수도를 지원할 수 있는 부유한 지방의 목록을 작성했다.";

    const sanitized = sanitizeCk3Text(rawErrorText);

    // ERROR 문자열이나 대괄호 스크립트 코드가 일절 남아있지 않아야 함
    assert.ok(!sanitized.includes('ERROR'), 'ERROR 단어가 정제되어야 합니다.');
    assert.ok(!sanitized.includes('RelationToMeShort'), '스크립트 함수명이 제거되어야 합니다.');
    assert.ok(!sanitized.includes('suggestor'), '스코프명이 제거되어야 합니다.');

    // 문장이 자연스럽게 이어져야 함
    assert.ok(sanitized.includes('힘든 시기에 수도를 지원할 수 있는'));
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
