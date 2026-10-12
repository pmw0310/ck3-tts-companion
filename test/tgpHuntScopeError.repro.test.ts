import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { sanitizeCk3Text } from '@/main/textSanitizer';

/**
 * 사냥 이벤트(tgp_hunt.0005, 0007, 0008)의 target_character 스코프 부재로 인한
 * ERROR:[target_character.GetFirstNameNoTooltip] 노출 및 TTS 오독 방어 무결성 검증 테스트입니다.
 */
describe('사냥 이벤트 target_character 스코프 무결성 검증 (tgp_hunt)', () => {
  const workspaceRoot = path.resolve(__dirname, '..');
  const modLocDir = path.join(workspaceRoot, 'ck3-mod', 'localization');

  const filesToCheck = [
    path.join(modLocDir, 'korean', 'replace', 'debug_cleanup_l_korean.yml'),
    path.join(modLocDir, 'replace', 'korean', 'debug_cleanup_l_korean.yml'),
    path.join(modLocDir, 'english', 'replace', 'debug_cleanup_l_english.yml'),
    path.join(modLocDir, 'replace', 'english', 'debug_cleanup_l_english.yml')
  ];

  it('1. 모든 debug_cleanup 로컬라이제이션 파일에 tgp_hunt 안전 오버라이드 키가 등록되어 있어야 한다', () => {
    const requiredKeys = [
      'tgp_hunt.0005.c:',
      'tgp_hunt.0007.b.flavor:',
      'tgp_hunt.0008.a:'
    ];

    for (const filePath of filesToCheck) {
      assert.strictEqual(fs.existsSync(filePath), true, `파일 존재 확인: ${filePath}`);
      const content = fs.readFileSync(filePath, 'utf-8');
      for (const key of requiredKeys) {
        assert.strictEqual(
          content.includes(key),
          true,
          `${path.basename(filePath)}에 ${key} 키가 반드시 포함되어 있어야 합니다.`
        );
      }
    }
  });

  it('2. 어떠한 오버라이드 키에도 취약한 [target_character.GetFirstNameNoTooltip] 직접 호출이 없어야 한다', () => {
    for (const filePath of filesToCheck) {
      const content = fs.readFileSync(filePath, 'utf-8');
      assert.strictEqual(
        content.includes('[target_character.GetFirstNameNoTooltip]'),
        false,
        `${path.basename(filePath)}에 취약한 [target_character.GetFirstNameNoTooltip] 직접 호출이 없어야 합니다.`
      );
    }
  });

  it('3. tgp_hunt 키들은 SCOPE.sC(\'target_character\') 및 Select_CString 안전 폴백을 포함해야 한다', () => {
    for (const filePath of filesToCheck) {
      const content = fs.readFileSync(filePath, 'utf-8');
      assert.strictEqual(
        content.includes("SCOPE.sC('target_character')"),
        true,
        `${path.basename(filePath)}에 안전한 SCOPE.sC('target_character') 참조가 포함되어야 합니다.`
      );
      assert.strictEqual(
        content.includes('Select_CString'),
        true,
        `${path.basename(filePath)}에 Select_CString 안전 분기가 포함되어야 합니다.`
      );
    }
  });

  it('4. sanitizeCk3Text는 인게임에서 ERROR:[target_character...]가 유입되더라도 안전하게 필터링해야 한다', () => {
    const rawWithScopeError = '혹시 ERROR:[target_character.GetFirstNameNoTooltip]에게 좋은 생각이 있지 않을까?';
    const sanitized = sanitizeCk3Text(rawWithScopeError);

    assert.strictEqual(
      sanitized.includes('ERROR:'),
      false,
      'ERROR: 접두사가 완전히 제거되어야 합니다.'
    );
    assert.strictEqual(
      sanitized.includes('target_character'),
      false,
      '미치환 스코프 내부 코드가 완전히 제거되어야 합니다.'
    );
    assert.ok(
      sanitized.includes('좋은 생각이 있지 않을까?'),
      '정상 문맥은 보존되어야 합니다.'
    );
  });

  it('5. 모든 로컬라이제이션 파일은 UTF-8 with BOM 인코딩을 준수해야 한다', () => {
    for (const filePath of filesToCheck) {
      const buffer = fs.readFileSync(filePath);
      const hasBom = buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
      assert.strictEqual(
        hasBom,
        true,
        `${path.basename(filePath)} 파일은 반드시 UTF-8 with BOM(0xEF, 0xBB, 0xBF)이어야 합니다.`
      );
    }
  });
});
