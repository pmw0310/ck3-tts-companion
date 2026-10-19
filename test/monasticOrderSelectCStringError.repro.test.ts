import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sanitizeCk3Text } from '@/main/textSanitizer';

/**
 * 수도회 창설 툴팁 Select_CString 컴파일 실패 결함
 * (ERROR:[Select_CString( SCOPE.sTitle('monastic_order').IsValid, monastic_order.GetName, '수도회' )]) 무결성 검증
 */
describe('수도회 Select_CString 컴파일 에러 및 로컬라이제이션 정제 무결성 검증 (debug-harness)', () => {
  const modRoot = path.join(process.cwd(), 'ck3-mod');
  const locPaths = [
    path.join(modRoot, 'localization', 'korean', 'replace', 'debug_cleanup_l_korean.yml'),
    path.join(modRoot, 'localization', 'replace', 'korean', 'debug_cleanup_l_korean.yml'),
    path.join(modRoot, 'localization', 'english', 'replace', 'debug_cleanup_l_english.yml'),
    path.join(modRoot, 'localization', 'replace', 'english', 'debug_cleanup_l_english.yml')
  ];

  it('1. 모든 로컬라이제이션 파일에서 CDataSystem 컴파일 에러를 유발하는 monastic_order.GetName 및 new_holy_order 직접 참조가 제거되어야 한다', () => {
    for (const filePath of locPaths) {
      assert.ok(fs.existsSync(filePath), `파일이 존재해야 함: ${filePath}`);
      const content = fs.readFileSync(filePath, 'utf-8');
      assert.ok(
        !content.includes('monastic_order.GetName'),
        `${path.basename(filePath)}에 컴파일 에러를 유발하는 monastic_order.GetName이 남아있지 않아야 합니다.`
      );
      assert.ok(
        !content.includes('new_holy_order.GetTitle'),
        `${path.basename(filePath)}에 컴파일 에러를 유발하는 new_holy_order.GetTitle이 남아있지 않아야 합니다.`
      );
      assert.ok(
        !content.includes('new_holy_order.IsValid'),
        `${path.basename(filePath)}에 컴파일 에러를 유발하는 new_holy_order.IsValid가 남아있지 않아야 합니다.`
      );
    }
  });

  it('2. 한국어 로컬라이제이션 키들에 에러 없는 안전한 "수도회" 표현이 적용되어 있어야 한다', () => {
    const koreanContent = fs.readFileSync(locPaths[0]!, 'utf-8');
    assert.ok(
      koreanContent.includes('pick_becomes_monastic_order_leader_tt:0 "[chosen_leader.GetShortUIName](이)가 수도회의 [ruler|E]가 됨"'),
      'pick_becomes 키가 안전한 수도회 문구로 수정되어야 합니다.'
    );
    assert.ok(
      koreanContent.includes('pick_remains_monastic_order_leader_tt:0 "[chosen_leader.GetShortUIName](이)가 수도회의 [ruler|E]로 남음"'),
      'pick_remains 키가 안전한 수도회 문구로 수정되어야 합니다.'
    );
    assert.ok(
      koreanContent.includes('monastic_order_tenet_advocated_tt:0 "수도회가 [tenet_pick.GetName( order_rite )](을)를 지지함"'),
      'monastic_order_tenet_advocated 키가 수정되어야 합니다.'
    );
    assert.ok(
      koreanContent.includes('i_created_monastic_holy_order_message:0 "당신의 지원 덕분에 [new_monastic_leader.GetShortUIName](이)가 수도회를 창설했습니다!"'),
      'i_created_monastic_holy_order_message 키가 수정되어야 합니다.'
    );
  });

  it('3. sanitizeCk3Text는 실전 인게임 ERROR:[Select_CString(...monastic_order...)] 유출을 "수도회의"로 자연스럽게 정제해야 한다', () => {
    const rawImage1Text =
      '• 보누슬로 발루예프(이)가 ERROR:[Select_CString( SCOPE.sTitle(\'monastic_order\').IsValid, monastic_order.GetName, \'수도회\' )]의 영주가 됨\n• 전쟁광(이)가 수도회의 원리가 될 것임';
    const rawImage2Text =
      '• 첸지 니키티치(이)가 ERROR:[Select_CString( SCOPE.sTitle(\'monastic_order\').IsValid, monastic_order.GetName, \'수도회\' )]의 영주가 됨\n• 사그라지지 않는 믿음(이)가 수도회의 원리가 될 것임';

    const sanitized1 = sanitizeCk3Text(rawImage1Text);
    const sanitized2 = sanitizeCk3Text(rawImage2Text);

    assert.ok(!sanitized1.includes('ERROR'), 'ERROR 단어가 완전히 제거되어야 합니다.');
    assert.ok(!sanitized1.includes('Select_CString'), 'Select_CString 코드가 제거되어야 합니다.');
    assert.strictEqual(
      sanitized1,
      '• 보누슬로 발루예프가 수도회의 영주가 됨 • 전쟁광이 수도회의 원리가 될 것임'
    );

    assert.ok(!sanitized2.includes('ERROR'), 'ERROR 단어가 완전히 제거되어야 합니다.');
    assert.strictEqual(
      sanitized2,
      '• 첸지 니키티치가 수도회의 영주가 됨 • 사그라지지 않는 믿음이 수도회의 원리가 될 것임'
    );
  });

  it('4. 모든 로컬라이제이션 파일은 UTF-8 with BOM 인코딩을 준수해야 한다', () => {
    for (const filePath of locPaths) {
      const buf = fs.readFileSync(filePath);
      assert.strictEqual(buf[0], 0xef, `${path.basename(filePath)}: BOM 첫째 바이트 일치`);
      assert.strictEqual(buf[1], 0xbb, `${path.basename(filePath)}: BOM 둘째 바이트 일치`);
      assert.strictEqual(buf[2], 0xbf, `${path.basename(filePath)}: BOM 셋째 바이트 일치`);
    }
  });
});

