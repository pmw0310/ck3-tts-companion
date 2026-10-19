import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sanitizeCk3Text } from '@/main/textSanitizer';

/**
 * 수도회 창설 툴팁/토스트/이벤트의 monastic_order 스코프 결함(ERROR:[monastic_order.GetName]) 및
 * CDataSystem NULL 평가(None 창설, 신흥 수도회 'None') 무결성 재현 테스트입니다.
 */
describe('수도회 monastic_order 스코프 결함 및 None 찌꺼기 정제 검증 (debug-harness)', () => {
  const modRoot = path.join(process.cwd(), 'ck3-mod');
  const locPaths = [
    path.join(modRoot, 'localization', 'korean', 'replace', 'debug_cleanup_l_korean.yml'),
    path.join(modRoot, 'localization', 'replace', 'korean', 'debug_cleanup_l_korean.yml'),
    path.join(modRoot, 'localization', 'english', 'replace', 'debug_cleanup_l_english.yml'),
    path.join(modRoot, 'localization', 'replace', 'english', 'debug_cleanup_l_english.yml')
  ];

  const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

  it('1. 4개 debug_cleanup 로컬라이제이션 파일이 모두 존재하고 UTF-8 with BOM(0xEF, 0xBB, 0xBF)으로 인코딩되어야 한다', () => {
    for (const filePath of locPaths) {
      assert.ok(fs.existsSync(filePath), `파일이 존재해야 함: ${filePath}`);
      const buf = fs.readFileSync(filePath);
      assert.ok(
        buf.subarray(0, 3).equals(BOM),
        `${path.basename(filePath)}는 반드시 UTF-8 with BOM으로 시작해야 합니다.`
      );
    }
  });

  it('2. 4개 로컬라이제이션 파일에 수도회 관련 7개 안전 오버라이드 키가 등록되어 있어야 한다', () => {
    const requiredKeys = [
      'pick_becomes_monastic_order_leader_tt:0',
      'pick_remains_monastic_order_leader_tt:0',
      'monastic_order_tenet_advocated_tt:0',
      'monastic_tenet_pick_tt:0',
      'monastic_order_entering_interaction_range_tt:0',
      'i_created_monastic_holy_order_message:0',
      'holy_order.2010.desc:0'
    ];

    for (const filePath of locPaths) {
      const content = fs.readFileSync(filePath, 'utf-8');
      for (const key of requiredKeys) {
        assert.ok(
          content.includes(key),
          `${path.basename(filePath)}에 ${key} 키가 등록되어 있어야 합니다.`
        );
      }
    }
  });

  it('3. 한국어 로컬라이제이션에 CDataSystem 컴파일 에러 없는 안전한 "수도회" 표준 문구가 적용되어 있어야 한다', () => {
    const koreanContent = fs.readFileSync(locPaths[0]!, 'utf-8');
    assert.ok(
      koreanContent.includes('pick_becomes_monastic_order_leader_tt:0 "[chosen_leader.GetShortUIName](이)가 수도회의 [ruler|E]가 됨"'),
      "monastic_order.GetName 대신 안전한 수도회 문구가 포함되어야 합니다."
    );
    assert.ok(
      !koreanContent.includes('monastic_order.GetName'),
      "CDataSystem 컴파일 에러를 유발하는 monastic_order.GetName이 없어야 합니다."
    );
  });

  it('4. 스크린샷 1 사례: ERROR:[monastic_order.GetName]의 영주로 남음이 수도회의 영주로 남음으로 자연스럽게 정제되어야 한다', () => {
    const input = '• 임마 폰 오르텐부르크(이)가\nERROR:[monastic_order.GetName]의 영주로 남음\n• 인신 공양(이)가 수도회의 원리가 될 것임';
    const output = sanitizeCk3Text(input);

    assert.ok(
      !output.includes('ERROR'),
      `ERROR 문자열이 완전히 제거되어야 함: ${output}`
    );
    assert.ok(
      output.includes('임마 폰 오르텐부르크가 수도회의 영주로 남음'),
      `자연스러운 영주 문구로 복원되어야 함: ${output}`
    );
    assert.ok(
      output.includes('인신 공양이 수도회의 원리가 될 것임'),
      `조사가 자연스럽게 보정되어야 함: ${output}`
    );
  });

  it('5. 스크린샷 2 사례: None 창설 및 ERROR:ERROR:[monastic_order.GetName]가 수도회 및 정상 지지 문장으로 정제되어야 한다', () => {
    const input = '당신의 지원 덕분에 임마 폰 오르텐부르크(이)가 None(을)를 창설했습니다!\n• ERROR:ERROR:[monastic_order.GetName](이)가 인신 공양(을)를 지지함';
    const output = sanitizeCk3Text(input);

    assert.ok(
      !output.includes('ERROR'),
      `ERROR 문자열이 완전히 제거되어야 함: ${output}`
    );
    assert.ok(
      !output.includes('None'),
      `None 찌꺼기가 완전히 제거되어야 함: ${output}`
    );
    assert.ok(
      output.includes('임마 폰 오르텐부르크가 수도회를 창설했습니다!'),
      `수도회 창설 문구로 복원되어야 함: ${output}`
    );
    assert.ok(
      output.includes('수도회가 인신 공양을 지지함'),
      `수도회 지지 문구로 복원되어야 함: ${output}`
    );
  });

  it('6. 스크린샷 3 사례: ERROR:[monastic_order.GetName]의 영주가 됨 및 신흥 수도회 None이 정상 정제되어야 한다', () => {
    const input = '• 아르놀프(이)가 ERROR:[monastic_order.GetName]의 영주가 됨\n자연스럽게 이 신흥 수도회 \'None\'의 우두머리가 되었다...';
    const output = sanitizeCk3Text(input);

    assert.ok(
      !output.includes('ERROR'),
      `ERROR 문자열이 제거되어야 함: ${output}`
    );
    assert.ok(
      !output.includes('None'),
      `None 문자열이 제거되어야 함: ${output}`
    );
    assert.ok(
      output.includes('아르놀프가 수도회의 영주가 됨'),
      `자연스러운 영주 문구로 복원되어야 함: ${output}`
    );
    assert.ok(
      output.includes('신흥 수도회의 우두머리가 되었다'),
      `신흥 수도회의 문맥이 온전해야 함: ${output}`
    );
  });
});

