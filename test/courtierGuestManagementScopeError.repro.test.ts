import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 문객/궁신 이탈 알림(courtier_guest_management.0500, 0001)의
 * liege 루트 타입 부재 및 스코프 오타로 인한 Jomini CDataSystem 에러 방어 검증 재현 테스트입니다.
 */
describe('문객/궁신 이탈 알림 로컬라이제이션 스코프 무결성 검증 (courtier_guest_management)', () => {
  const workspaceRoot = path.resolve(__dirname, '..');
  const modLocDir = path.join(workspaceRoot, 'ck3-mod', 'localization');

  const filesToCheck = [
    path.join(modLocDir, 'korean', 'replace', 'debug_cleanup_l_korean.yml'),
    path.join(modLocDir, 'replace', 'korean', 'debug_cleanup_l_korean.yml'),
    path.join(modLocDir, 'english', 'replace', 'debug_cleanup_l_english.yml'),
    path.join(modLocDir, 'replace', 'english', 'debug_cleanup_l_english.yml')
  ];

  it('모든 debug_cleanup 로컬라이제이션 파일에 문객/궁신 이탈 오버라이드 키가 등록되어 있어야 한다', () => {
    const requiredKeys = [
      'courtier_guest_management.0500.t:',
      'courtier_guest_management.0500.desc:',
      'courtier_guest_management.0001.t:',
      'courtier_guest_management.desc:'
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

  it('어떠한 오버라이드 키에도 CDataSystem 런타임 에러를 유발하는 liege.Custom 호출이 없어야 한다', () => {
    for (const filePath of filesToCheck) {
      const content = fs.readFileSync(filePath, 'utf-8');
      assert.strictEqual(
        content.includes("liege.Custom('GetCourt')"),
        false,
        `${path.basename(filePath)}에 취약한 liege.Custom('GetCourt') 호출이 없어야 합니다.`
      );
      assert.strictEqual(
        content.includes("liege.Custom('GetCourtConcept')"),
        false,
        `${path.basename(filePath)}에 취약한 liege.Custom('GetCourtConcept') 호출이 없어야 합니다.`
      );
    }
  });

  it('문객/궁신 이탈 알림은 전역 안전 스코프인 GetPlayer.Custom을 사용해야 한다', () => {
    for (const filePath of filesToCheck) {
      const content = fs.readFileSync(filePath, 'utf-8');
      assert.strictEqual(
        content.includes("GetPlayer.Custom('GetCourt')"),
        true,
        `${path.basename(filePath)}에 안전한 GetPlayer.Custom('GetCourt') 참조가 포함되어야 합니다.`
      );
      assert.strictEqual(
        content.includes("GetPlayer.Custom('GetCourtConcept')"),
        true,
        `${path.basename(filePath)}에 안전한 GetPlayer.Custom('GetCourtConcept') 참조가 포함되어야 합니다.`
      );
    }
  });

  it('문객 이탈 본문(courtier_guest_management.0500.desc)은 미존재 스코프인 liege 대신 host 스코프를 참조해야 한다', () => {
    for (const filePath of filesToCheck) {
      const content = fs.readFileSync(filePath, 'utf-8');
      assert.strictEqual(
        content.includes("SCOPE.sC('host').Custom2('RelationToMeShort', SCOPE.sC('guest'))"),
        true,
        `${path.basename(filePath)}의 0500.desc는 SCOPE.sC('host')를 참조해야 합니다.`
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
