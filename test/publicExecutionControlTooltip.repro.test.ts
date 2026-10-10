import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 공개 처형 영지 장악력 툴팁(public_execution_control_effect)의
 * puppet_or_actor 스코프 누락 버그 해결 및 무결성을 검증하는 재현 테스트입니다.
 */
describe('공개 처형 툴팁 로컬라이제이션 검증 (public_execution_control_effect)', () => {
  const workspaceRoot = path.resolve(__dirname, '..');
  const modLocDir = path.join(workspaceRoot, 'ck3-mod', 'localization');

  const filesToCheck = [
    path.join(modLocDir, 'korean', 'replace', 'debug_cleanup_l_korean.yml'),
    path.join(modLocDir, 'replace', 'korean', 'debug_cleanup_l_korean.yml'),
    path.join(modLocDir, 'english', 'replace', 'debug_cleanup_l_english.yml'),
    path.join(modLocDir, 'replace', 'english', 'debug_cleanup_l_english.yml')
  ];

  it('모든 debug_cleanup 로컬라이제이션 파일에 public_execution_control_effect 키가 선언되어 있어야 한다', () => {
    for (const filePath of filesToCheck) {
      assert.strictEqual(fs.existsSync(filePath), true, `파일 존재 확인: ${filePath}`);
      const content = fs.readFileSync(filePath, 'utf-8');
      assert.strictEqual(
        content.includes('public_execution_control_effect:'),
        true,
        `${path.basename(filePath)}에 public_execution_control_effect 키가 포함되어 있어야 합니다.`
      );
    }
  });

  it('public_execution_control_effect 키는 이벤트 컨텍스트에서 깨지는 puppet_or_actor 대신 GetPlayer를 참조해야 한다', () => {
    for (const filePath of filesToCheck) {
      const content = fs.readFileSync(filePath, 'utf-8');
      assert.strictEqual(
        content.includes('puppet_or_actor.MakeScope.ScriptValue'),
        false,
        `${path.basename(filePath)}에 취약한 puppet_or_actor 참조가 없어야 합니다.`
      );

      assert.strictEqual(
        content.includes("GetPlayer.MakeScope.ScriptValue('executioner_control_value_tooltip')"),
        true,
        `${path.basename(filePath)}에 안전한 GetPlayer 참조가 포함되어야 합니다.`
      );
    }
  });

  it('로컬라이제이션 파일은 UTF-8 with BOM 인코딩을 준수해야 한다', () => {
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
