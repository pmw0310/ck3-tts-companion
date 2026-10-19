import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sanitizeCk3Text } from '@/main/textSanitizer';

/**
 * [debug-harness] 새로운 왕국 수립 결단 ERROR:[king_aspirant.GetShortUINamePossessive] 스코프 결함 재현 테스트
 *
 * 1. 문제 증상:
 *    "새로운 왕국 수립" 결단(form_new_kingdom_decision) 화면에서 단절 영지(exclave) 공작령(파푸아, 소 순다 등)
 *    툴팁(consecrate_kingdom_additional_duchy_exclave_tt) 평가 시,
 *    create_custom_kingdom_effect 스크립트 이펙트가 king_aspirant 스코프를 제공하지 않아
 *    ERROR:[king_aspirant.GetShortUINamePossessive] 런타임 스코프 결함이 인게임 화면에 노출됨.
 *
 * 2. 해결책:
 *    - 4개 debug_cleanup 로컬라이제이션 파일에 consecrate_kingdom_additional_duchy_exclave_tt를 오버라이드하여,
 *      founder 및 king_aspirant 유효성을 검사하는 Select_CString 안전 폴백 적용.
 *    - textSanitizer.ts에 ERROR:[king_aspirant...] 정제 규칙을 추가하여 TTS 및 로그 유출 원천 방어.
 */

const LOC_PATHS = [
  path.resolve(__dirname, '../ck3-mod/localization/korean/replace/debug_cleanup_l_korean.yml'),
  path.resolve(__dirname, '../ck3-mod/localization/replace/korean/debug_cleanup_l_korean.yml'),
  path.resolve(__dirname, '../ck3-mod/localization/english/replace/debug_cleanup_l_english.yml'),
  path.resolve(__dirname, '../ck3-mod/localization/replace/english/debug_cleanup_l_english.yml')
];

describe('새로운 왕국 수립 king_aspirant 스코프 결함 및 ERROR:[...] 정제 무결성 검증 (debug-harness)', () => {
  it('1. 모든 4개 debug_cleanup 로컬라이제이션 파일에 consecrate_kingdom_additional_duchy_exclave_tt 키가 등록되어 있어야 한다', () => {
    for (const locPath of LOC_PATHS) {
      assert.ok(fs.existsSync(locPath), `파일 존재 확인: ${locPath}`);
      const content = fs.readFileSync(locPath, 'utf-8');
      assert.ok(
        content.includes('consecrate_kingdom_additional_duchy_exclave_tt:0'),
        `${path.basename(locPath)}에 consecrate_kingdom_additional_duchy_exclave_tt 키가 오버라이드되어야 함`
      );
    }
  });

  it('2. 오버라이드된 키에 founder 스코프가 직접 적용되어 있고, 미보호된 king_aspirant 호출이 없어야 한다', () => {
    for (const locPath of LOC_PATHS) {
      const content = fs.readFileSync(locPath, 'utf-8');
      assert.ok(
        content.includes('[founder.GetShortUINamePossessive]'),
        `${path.basename(locPath)}: founder.GetShortUINamePossessive가 적용되어야 함`
      );
      assert.ok(
        !content.includes('king_aspirant'),
        `${path.basename(locPath)}: 결함 유발 원인인 king_aspirant가 완전히 제거되어야 함`
      );
    }
  });

  it('3. sanitizeCk3Text는 사용자가 제보한 실전 인게임 ERROR:[king_aspirant...] 및 ERROR:[Select_CString...] 결함을 자연스러운 문장으로 정제해야 한다', () => {
    // 1차 제보 실전 인게임 스크린샷 텍스트:
    const rawScreenshotSample1 =
      '• 파푸아 공작령(을)를 ERROR:[king_aspirant.GetShortUINamePossessive] 새로운 왕국의 규범 권역에 추가할 수 있음 (추가하지 않으면 현재 왕국 내의 단절 영지가 됨)';

    const sanitized1 = sanitizeCk3Text(rawScreenshotSample1);

    assert.ok(!sanitized1.includes('ERROR:'), `ERROR 접두사가 소거되어야 함: ${sanitized1}`);
    assert.ok(!sanitized1.includes('king_aspirant'), `king_aspirant 태그가 소거되어야 함: ${sanitized1}`);
    assert.ok(
      sanitized1.includes('당신의 새로운 왕국의'),
      `소유격 '당신의' 복원 확인: ${sanitized1}`
    );

    // 2차 제보 줄바꿈 포함 실전 인게임 스크린샷 텍스트:
    const rawScreenshotSample2 =
      '• 파푸아 공작령(을)를 ERROR:[Select_CString(\nSCOPE.sC(\x27founder\x27).IsValid,\nfounder.GetShortUINamePossessive, Select_CString(\nSCOPE.sC(\x27king_aspirant\x27).IsValid,\nking_aspirant.GetShortUINamePossessive,\nROOT.Char.GetShortUINamePossessive ) )] 새로운 왕국의 규범 권역에 추가할 수 있음 (추가하지 않으면 현재 왕국 내의 단절 영지가 됨)';

    const sanitized2 = sanitizeCk3Text(rawScreenshotSample2);

    assert.ok(!sanitized2.includes('ERROR:'), `ERROR 접두사가 소거되어야 함: ${sanitized2}`);
    assert.ok(!sanitized2.includes('Select_CString'), `Select_CString 잔재가 소거되어야 함: ${sanitized2}`);
    assert.ok(
      sanitized2.includes('당신의 새로운 왕국의'),
      `줄바꿈 에러에서도 소유격 '당신의' 복원 확인: ${sanitized2}`
    );
  });

  it('4. 모든 로컬라이제이션 파일은 UTF-8 with BOM 인코딩을 준수해야 한다', () => {
    for (const locPath of LOC_PATHS) {
      const buffer = fs.readFileSync(locPath);
      assert.strictEqual(buffer[0], 0xef, `${path.basename(locPath)}: BOM 첫째 바이트(0xEF) 일치`);
      assert.strictEqual(buffer[1], 0xbb, `${path.basename(locPath)}: BOM 둘째 바이트(0xBB) 일치`);
      assert.strictEqual(buffer[2], 0xbf, `${path.basename(locPath)}: BOM 셋째 바이트(0xBF) 일치`);
    }
  });
});
