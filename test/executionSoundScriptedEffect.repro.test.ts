import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { resolveExecutionSoundType } from '@/main/logWatcher';

describe('⚔️ 참수 처형 시 화형 사운드 오발화 결함 재현 테스트 (debug-harness)', () => {
  it('1. zz_tts_companion_prison_effects.txt에서 exists만으로 판정하는 OR 조건식이 없어야 하고 = yes 불리언 가드가 필수여야 함', () => {
    const scriptPath = path.resolve(
      process.cwd(),
      'ck3-mod/common/scripted_effects/zz_tts_companion_prison_effects.txt'
    );
    const content = fs.readFileSync(scriptPath, 'utf-8');

    // 결함 1: OR = { always = scope:execution_burned exists = scope:execution_burned }
    // exists = scope:execution_burned 단독 평가는 send_option 플래그가 비활성(no)이어도 scope가 존재하므로 항상 참이 됨!
    assert.strictEqual(
      content.includes('OR = {\n\t\t\t\t\t\talways = scope:execution_burned\n\t\t\t\t\t\texists = scope:execution_burned\n\t\t\t\t\t}'),
      false,
      'exists = scope:execution_burned OR 조건식은 참수 시에도 화형으로 오판정되므로 제거되어야 함'
    );

    // 사형 방식별 = yes 검증
    assert.ok(
      content.includes('scope:execution_burned = yes'),
      '화형(burned)은 반드시 scope:execution_burned = yes로 검증해야 함'
    );
    assert.ok(
      content.includes('scope:execution_kennel = yes'),
      '사냥개(kennel)는 반드시 scope:execution_kennel = yes로 검증해야 함'
    );
    assert.ok(
      content.includes('scope:execution_devour = yes'),
      '식인(devour)은 반드시 scope:execution_devour = yes로 검증해야 함'
    );
    assert.ok(
      content.includes('scope:execution_public = yes'),
      '공개 처형(public)은 반드시 scope:execution_public = yes로 검증해야 함'
    );
    assert.ok(
      content.includes('scope:execution_beheaded = yes'),
      '참수형(beheading)은 명시적 선택(scope:execution_beheaded = yes) 및 기본 폴백(else)으로 지원되어야 함'
    );
  });

  it('2. logWatcher.ts의 resolveExecutionSoundType에서 1글자 "불" 매칭으로 인한 오발화가 방어되어야 함', () => {
    // "불가침 조약" 등 일반 단어가 "불" 1글자로 인해 burning으로 분류되는 결함 방어
    assert.strictEqual(resolveExecutionSoundType('불가침 조약 체결'), null);
    assert.strictEqual(resolveExecutionSoundType('불안감 해소'), null);

    // 정상 화형 키워드는 정상 burning 매핑
    assert.strictEqual(resolveExecutionSoundType('화형'), 'burning');
    assert.strictEqual(resolveExecutionSoundType('장작더미에서 화형'), 'burning');
    assert.strictEqual(resolveExecutionSoundType('산 채로 불태우기'), 'burning');
    assert.strictEqual(resolveExecutionSoundType('불태워 처형'), 'burning');
    assert.strictEqual(resolveExecutionSoundType('burn at the stake'), 'burning');
  });
});
