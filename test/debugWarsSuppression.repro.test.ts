import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * CK3 디버그 전쟁 명분(debug_war, debug_artifact_war) 숨김 오버라이드 무결성 검증 테스트
 */
test('CK3 디버그 전쟁 명분 숨김 오버라이드 무결성 검증', async (t) => {
  const cbFilePath = path.resolve('ck3-mod/common/casus_belli_types/00_casus_belli_types.txt');

  await t.test('1. 00_casus_belli_types.txt 파일이 존재하고 UTF-8 BOM으로 시작해야 함', () => {
    assert.ok(fs.existsSync(cbFilePath), '00_casus_belli_types.txt 파일이 존재해야 합니다.');
    const buffer = fs.readFileSync(cbFilePath);
    assert.equal(buffer[0], 0xEF, 'BOM 첫 번째 바이트는 0xEF여야 합니다.');
    assert.equal(buffer[1], 0xBB, 'BOM 두 번째 바이트는 0xBB여야 합니다.');
    assert.equal(buffer[2], 0xBF, 'BOM 세 번째 바이트는 0xBF여야 합니다.');
  });

  await t.test('2. 00_casus_belli_types.txt의 중괄호 쌍({, })이 100% 일치해야 함', () => {
    const content = fs.readFileSync(cbFilePath, 'utf8');
    let openCount = 0;
    let closeCount = 0;
    for (const char of content) {
      if (char === '{') openCount++;
      if (char === '}') closeCount++;
    }
    assert.equal(openCount, closeCount, `중괄호 열림(${openCount})과 닫힘(${closeCount}) 개수가 일치해야 합니다.`);
  });

  await t.test('3. debug_war와 debug_artifact_war에 always = no가 적용되어 화면에 표시되지 않아야 함', () => {
    const content = fs.readFileSync(cbFilePath, 'utf8');

    // debug_war 검증
    const debugWarIdx = content.indexOf('debug_war = {');
    assert.ok(debugWarIdx !== -1, 'debug_war 정의가 존재해야 합니다.');
    const debugWarBlock = content.slice(debugWarIdx, debugWarIdx + 2000);
    assert.ok(
      debugWarBlock.includes('always = no'),
      'debug_war의 allowed_for_character에 always = no가 적용되어 있어야 합니다.'
    );
    assert.ok(
      !debugWarBlock.includes('debug_only = yes'),
      'debug_war에 debug_only = yes가 남아있어서는 안 됩니다.'
    );

    // debug_artifact_war 검증
    const debugArtifactWarIdx = content.indexOf('debug_artifact_war = {');
    assert.ok(debugArtifactWarIdx !== -1, 'debug_artifact_war 정의가 존재해야 합니다.');
    const debugArtifactWarBlock = content.slice(debugArtifactWarIdx, debugArtifactWarIdx + 2000);
    assert.ok(
      debugArtifactWarBlock.includes('always = no'),
      'debug_artifact_war의 allowed_for_character에 always = no가 적용되어 있어야 합니다.'
    );
    assert.ok(
      !debugArtifactWarBlock.includes('debug_only = yes'),
      'debug_artifact_war에 debug_only = yes가 남아있어서는 안 됩니다.'
    );
  });
});
