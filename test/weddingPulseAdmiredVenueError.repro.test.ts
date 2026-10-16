import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sanitizeCk3Text } from '@/main/textSanitizer';

/**
 * activity_pulse_action_admired_venue (admired_venue) first 스코프 누락 및 ERROR:[first.GetShortUINameNoTooltip| 정제 재현 테스트
 */
describe('admired_venue 펄스 액션 first 스코프 결함 및 ERROR:[...| 정제 무결성 검증 (debug-harness)', () => {
  const modRoot = path.join(process.cwd(), 'ck3-mod');
  const locPaths = [
    path.join(modRoot, 'localization', 'korean', 'replace', 'debug_cleanup_l_korean.yml'),
    path.join(modRoot, 'localization', 'replace', 'korean', 'debug_cleanup_l_korean.yml'),
    path.join(modRoot, 'localization', 'english', 'replace', 'debug_cleanup_l_english.yml'),
    path.join(modRoot, 'localization', 'replace', 'english', 'debug_cleanup_l_english.yml')
  ];
  const pulseFixPath = path.join(
    modRoot,
    'common',
    'activities',
    'pulse_actions',
    'zz_tts_companion_pulse_actions.txt'
  );

  it('1. 모든 debug_cleanup 로컬라이제이션 파일에 activity_pulse_action_admired_venue 안전 오버라이드 키가 등록되어 있어야 한다', () => {
    for (const filePath of locPaths) {
      assert.ok(fs.existsSync(filePath), `파일이 존재해야 함: ${filePath}`);
      const content = fs.readFileSync(filePath, 'utf-8');
      assert.ok(
        content.includes('activity_pulse_action_admired_venue:0'),
        `${path.basename(filePath)}에 activity_pulse_action_admired_venue 오버라이드가 등록되어 있어야 합니다.`
      );
      assert.ok(
        content.includes("SCOPE.sC('first').IsValid"),
        `${path.basename(filePath)}에 SCOPE.sC('first').IsValid 안전 가드가 포함되어야 합니다.`
      );
    }
  });

  it('2. admired_venue 펄스 액션 스크립트가 오버라이드되어 NOR 내부의 is_physically_able_ai_adult 역전 버그를 교정하고 first 폴백을 보장해야 한다', () => {
    assert.ok(fs.existsSync(pulseFixPath), `펄스 액션 패치 파일이 존재해야 함: ${pulseFixPath}`);
    const content = fs.readFileSync(pulseFixPath, 'utf-8');
    assert.ok(content.includes('admired_venue = {'), 'admired_venue 정의가 포함되어야 합니다.');
    assert.ok(
      content.includes('save_scope_as = first'),
      'first 스코프 저장이 보장되어야 합니다.'
    );
    // NOR 블록 내부에 is_physically_able_ai_adult = yes 가 들어가는 바닐라 버그가 없어야 함
    assert.ok(
      !/NOR\s*=\s*\{[^}]*is_physically_able_ai_adult\s*=\s*yes/s.test(content),
      'NOR 블록 내부에 is_physically_able_ai_adult = yes 가 위치하는 바닐라 역전 버그가 제거되어야 합니다.'
    );
  });

  it('3. sanitizeCk3Text는 닫는 대괄호가 잘린 ERROR:[first.GetShortUINameNoTooltip|(이)가 및 주어 누락 • (이)가 패턴을 왜곡 없이 정제해야 한다', () => {
    const rawHeader = 'ERROR:[first.GetShortUINameNoTooltip|(이)가 멈춰 서서 풍경을 감상함';
    const rawBullet = '• (이)가 스트레스를 15만큼 상실함';

    const sanitizedHeader = sanitizeCk3Text(rawHeader);
    const sanitizedBullet = sanitizeCk3Text(rawBullet);

    assert.ok(!sanitizedHeader.includes('ERROR'), 'ERROR 단어가 제거되어야 합니다.');
    assert.ok(!sanitizedHeader.includes('GetShortUINameNoTooltip'), '함수명이 제거되어야 합니다.');
    assert.strictEqual(sanitizedHeader, '멈춰 서서 풍경을 감상함');
    assert.strictEqual(sanitizedBullet, '• 스트레스를 15만큼 상실함');
  });

  it('4. 모든 로컬라이제이션 파일은 UTF-8 with BOM 인코딩을 준수해야 한다', () => {
    for (const filePath of locPaths) {
      const buf = fs.readFileSync(filePath);
      assert.strictEqual(buf[0], 0xef, `${path.basename(filePath)}: BOM 첫째 바이트(0xEF) 일치`);
      assert.strictEqual(buf[1], 0xbb, `${path.basename(filePath)}: BOM 둘째 바이트(0xBB) 일치`);
      assert.strictEqual(buf[2], 0xbf, `${path.basename(filePath)}: BOM 셋째 바이트(0xBF) 일치`);
    }
  });
});

