import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 건물 툴팁에서 디버그 로우 키(BUILDING_DEBUG_KEY, BUILDING_DEBUG_FULL) 노출 결함 방어 및
 * 로컬라이제이션 파일의 UTF-8 with BOM 무결성을 검증하는 테스트입니다.
 */
describe('건물 툴팁 디버그 키 은닉 및 로컬라이제이션 무결성 검증 (buildingTooltipCleanup)', () => {
  const workspaceRoot = path.resolve(__dirname, '..');
  const modLocDir = path.join(workspaceRoot, 'ck3-mod', 'localization');

  const filesToCheck = [
    path.join(modLocDir, 'korean', 'replace', 'debug_cleanup_l_korean.yml'),
    path.join(modLocDir, 'replace', 'korean', 'debug_cleanup_l_korean.yml'),
    path.join(modLocDir, 'english', 'replace', 'debug_cleanup_l_english.yml'),
    path.join(modLocDir, 'replace', 'english', 'debug_cleanup_l_english.yml')
  ];

  it('모든 debug_cleanup 로컬라이제이션 파일에 BUILDING_DEBUG_KEY와 BUILDING_DEBUG_FULL이 공백으로 등록되어 있어야 한다', () => {
    for (const filePath of filesToCheck) {
      assert.strictEqual(fs.existsSync(filePath), true, `파일 존재 확인: ${filePath}`);
      const content = fs.readFileSync(filePath, 'utf-8');
      assert.strictEqual(
        content.includes('BUILDING_DEBUG_KEY:0 ""'),
        true,
        `${path.basename(filePath)}에 BUILDING_DEBUG_KEY:0 "" 키가 반드시 포함되어야 합니다.`
      );
      assert.strictEqual(
        content.includes('BUILDING_DEBUG_FULL:0 ""'),
        true,
        `${path.basename(filePath)}에 BUILDING_DEBUG_FULL:0 "" 키가 반드시 포함되어야 합니다.`
      );
    }
  });

  it('DEBUG_COLON은 투명/크기 0 태그(#color:{0,0,0,0};size:0)로 엔진 주입 텍스트를 은닉해야 한다', () => {
    for (const filePath of filesToCheck) {
      const content = fs.readFileSync(filePath, 'utf-8');
      assert.strictEqual(
        content.includes('DEBUG_COLON:0 "#color:{0,0,0,0};glow_color:{0,0,0,0};size:0 "'),
        true,
        `${path.basename(filePath)}의 DEBUG_COLON은 투명 색상 및 크기 0 포맷이어야 합니다.`
      );
    }
  });

  it('모든 로컬라이제이션 파일은 UTF-8 with BOM(0xEF, 0xBB, 0xBF) 인코딩을 준수해야 한다', () => {
    for (const filePath of filesToCheck) {
      const buffer = fs.readFileSync(filePath);
      const hasBom = buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
      assert.strictEqual(
        hasBom,
        true,
        `${path.basename(filePath)} 파일은 반드시 UTF-8 with BOM이어야 합니다.`
      );
    }
  });
});
