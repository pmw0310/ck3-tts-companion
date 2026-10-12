import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { sanitizeCk3Text } from '@/main/textSanitizer';

/**
 * 모험가 세금 징수 계약 이벤트(laamp_base_contract_schemes.2004)에서
 * person_a 및 destination_1 스코프 부재로 인한 ERROR:[...] 노출 방어 무결성 검증 테스트입니다.
 */
describe('모험가 세금 징수 계약 스코프 결함 방어 무결성 검증 (laamp_base_contract_schemes.2004)', () => {
  const workspaceRoot = path.resolve(__dirname, '..');
  const modLocDir = path.join(workspaceRoot, 'ck3-mod', 'localization');

  const filesToCheck = [
    path.join(modLocDir, 'korean', 'replace', 'debug_cleanup_l_korean.yml'),
    path.join(modLocDir, 'replace', 'korean', 'debug_cleanup_l_korean.yml'),
    path.join(modLocDir, 'english', 'replace', 'debug_cleanup_l_english.yml'),
    path.join(modLocDir, 'replace', 'english', 'debug_cleanup_l_english.yml')
  ];

  it('1. 모든 debug_cleanup 로컬라이제이션 파일에 2004 계약 이벤트 안전 오버라이드 키가 등록되어 있어야 한다', () => {
    const requiredKeys = [
      'laamp_base_contract_schemes.2004.desc:',
      'laamp_base_contract_schemes.2004.tt.destination_list:'
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

  it('2. 오버라이드된 키에 취약한 스코프 직접 호출([destination_1...] 또는 [person_a...])이 없어야 한다', () => {
    for (const filePath of filesToCheck) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      const targetLines = lines.filter((line: string) =>
        line.includes('laamp_base_contract_schemes.2004.desc:') ||
        line.includes('laamp_base_contract_schemes.2004.tt.destination_list:')
      );

      for (const line of targetLines) {
        assert.strictEqual(
          line.includes('[destination_1.GetBaseNameNoTier]'),
          false,
          `취약한 직접 호출 [destination_1.GetBaseNameNoTier]이 남아있지 않아야 합니다: ${line}`
        );
        assert.strictEqual(
          line.includes('[person_a.GetTitledFirstName]'),
          false,
          `취약한 직접 호출 [person_a.GetTitledFirstName]이 남아있지 않아야 합니다: ${line}`
        );
        assert.strictEqual(
          line.includes('[destination_1.GetBaseNameNoTierNoTooltip]'),
          false,
          `취약한 직접 호출 [destination_1.GetBaseNameNoTierNoTooltip]이 남아있지 않아야 합니다: ${line}`
        );
      }
    }
  });

  it('3. 2004 키들은 destination_1, person_a 스코프 검사 및 Select_CString 안전 폴백을 포함해야 한다', () => {
    for (const filePath of filesToCheck) {
      const content = fs.readFileSync(filePath, 'utf-8');
      assert.strictEqual(
        content.includes("SCOPE.sTitle('destination_1')"),
        true,
        `${path.basename(filePath)}에 안전한 SCOPE.sTitle('destination_1') 참조가 포함되어야 합니다.`
      );
      assert.strictEqual(
        content.includes("SCOPE.sC('person_a')"),
        true,
        `${path.basename(filePath)}에 안전한 SCOPE.sC('person_a') 참조가 포함되어야 합니다.`
      );
      assert.strictEqual(
        content.includes('Select_CString'),
        true,
        `${path.basename(filePath)}에 Select_CString 안전 분기가 포함되어야 합니다.`
      );
    }
  });

  it('4. sanitizeCk3Text는 인게임에서 ERROR:[destination_1...] 및 ERROR:[person_a...] 유입 시 안전하게 필터링해야 한다', () => {
    const rawWithErrors = [
      '투르마체스 라자로스의 대표자는 빠르게 본론으로 넘어갔다.',
      'ERROR:[destination_1.GetBaseNameNoTier]의 도시는 투르마체스(이)가 부과한 추가 세금을 내지 못하고 있었다.',
      '중립적인 위치에 있는 제삼자는 반항적인 정착지의 지도자, ERROR:[person_a.GetTitledFirstName](을)를 굴복시키기 위한 편리한 핑계일 뿐이다.',
      '이제 ERROR:[destination_1.GetBaseNameNoTierNoTooltip](을)를 향한 여정만이 남았다.'
    ].join('\n');

    const sanitized = sanitizeCk3Text(rawWithErrors);

    assert.strictEqual(
      sanitized.includes('ERROR:'),
      false,
      'ERROR: 접두사가 완전히 제거되어야 합니다.'
    );
    assert.strictEqual(
      sanitized.includes('destination_1'),
      false,
      'destination_1 스코프 코드가 완전히 제거되어야 합니다.'
    );
    assert.strictEqual(
      sanitized.includes('person_a'),
      false,
      'person_a 스코프 코드가 완전히 제거되어야 합니다.'
    );
    assert.ok(
      sanitized.includes('대표자는 빠르게 본론으로 넘어갔다'),
      '정상 문맥은 보존되어야 합니다.'
    );
    assert.ok(
      sanitized.includes('향한 여정만이 남았다'),
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
