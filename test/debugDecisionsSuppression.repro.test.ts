import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 디버그 모드에서 노출되는 CK3 디버그 결단(test_decision.txt) 비활성화 무결성 검증 테스트
 */
test('CK3 디버그 결단(test_decision.txt) 숨김 오버라이드 무결성 검증', async (t) => {
  const decisionsPath = path.resolve('ck3-mod/common/decisions/test_decision.txt');

  await t.test('1. test_decision.txt 파일이 존재하고 UTF-8 BOM으로 시작해야 함', () => {
    assert.ok(fs.existsSync(decisionsPath), 'ck3-mod/common/decisions/test_decision.txt 파일이 존재해야 합니다.');
    const buffer = fs.readFileSync(decisionsPath);
    assert.equal(buffer[0], 0xef, 'BOM 첫째 바이트는 0xEF여야 합니다.');
    assert.equal(buffer[1], 0xbb, 'BOM 둘째 바이트는 0xBB여야 합니다.');
    assert.equal(buffer[2], 0xbf, 'BOM 셋째 바이트는 0xBF여야 합니다.');
  });

  await t.test('2. test_decision.txt의 중괄호 쌍({, })이 100% 일치해야 함', () => {
    const content = fs.readFileSync(decisionsPath, 'utf8');
    let openCount = 0;
    let closeCount = 0;
    for (const char of content) {
      if (char === '{') openCount++;
      if (char === '}') closeCount++;
    }
    assert.equal(openCount, closeCount, `중괄호 열림(${openCount})과 닫힘(${closeCount}) 개수가 일치해야 합니다.`);
  });

  await t.test('3. 사용자 보고 4대 결단을 포함한 모든 8개 테스트 결단에 always = no가 적용되어 있어야 함', () => {
    const content = fs.readFileSync(decisionsPath, 'utf8');

    // 사용자가 겪은 4대 디버그 결단 목록
    const targetDecisions = [
      'wild_goose_chase_decision',         // 야생 거위 잡기
      'change_all_house_relations_decision', // 모든 집안 관계 변경
      'add_to_steppe_decision',             // 초원에 추가
      'remove_from_steppe_decision',        // 초원에서 제거
      'become_leading_house_of_the_confederation_decision',
      'clear_our_confederations_leading_house_decision',
      'adjust_confederation_cohesion_decision',
      'chinese_concubines_decision'
    ];

    for (const decisionKey of targetDecisions) {
      assert.ok(content.includes(decisionKey), `결단 키 ${decisionKey}가 파일에 정의되어 있어야 합니다.`);
    }

    // debug_only = yes가 잔존하지 않고 모두 always = no로 차단되었는지 검증
    assert.ok(
      !content.includes('debug_only = yes'),
      'debug_only = yes가 남아있지 않아야 하며, 디버그 모드에서도 활성화되지 않아야 합니다.'
    );

    // always = no 가 8개 모두 적용되었는지 검증
    const alwaysNoMatches = content.match(/always\s*=\s*no/g);
    assert.equal(
      alwaysNoMatches?.length,
      8,
      '8개의 디버그 결단 모두에 always = no가 적용되어 화면에 표시되지 않아야 합니다.'
    );
  });
});
