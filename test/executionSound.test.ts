import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  resolveExecutionSoundType,
  extractExecutionSoundsFromChunk
} from '@/main/logWatcher';
import { resolveExecutionSoundKey } from '@/shared/executionSoundHelper';

describe('⚔️ 처형 효과음 시스템(성별 분기 및 사형 유형 매칭) 무결성 검증', () => {
  it('1. 사형 방식 텍스트를 최적의 ExecutionSoundType으로 정확하게 매핑해야 함', () => {
    // 화형
    assert.equal(resolveExecutionSoundType('화형'), 'burning');
    assert.equal(resolveExecutionSoundType('장작더미에서 화형'), 'burning');

    // 사냥개 / 맹견형
    assert.equal(resolveExecutionSoundType('사냥개에게 던지기'), 'kennel');
    assert.equal(resolveExecutionSoundType('맹견형 집행'), 'kennel');
    assert.equal(resolveExecutionSoundType('거열형'), 'kennel');

    // 인신공양 / 제물
    assert.equal(resolveExecutionSoundType('블로트 인신공양'), 'sacrifice');
    assert.equal(resolveExecutionSoundType('신들을 위한 제물'), 'sacrifice');
    assert.equal(resolveExecutionSoundType('희생제에 바치기'), 'sacrifice');

    // 참수형
    assert.equal(resolveExecutionSoundType('참수형'), 'beheading');
    assert.equal(resolveExecutionSoundType('도끼로 참수'), 'beheading');
    assert.equal(resolveExecutionSoundType('단두대 처형'), 'beheading');

    // 교수형
    assert.equal(resolveExecutionSoundType('교수형 집행'), 'hanging');
    assert.equal(resolveExecutionSoundType('밧줄로 목매달기'), 'hanging');

    // 식인 / 잡아먹기
    assert.equal(resolveExecutionSoundType('죄수 잡아먹기'), 'devour');
    assert.equal(resolveExecutionSoundType('식인 연회'), 'devour');

    // 효수 / 공개 처형 / 말뚝 관통형
    assert.equal(resolveExecutionSoundType('광장 공개 처형'), 'public');
    assert.equal(resolveExecutionSoundType('성문에 효수'), 'public');
    assert.equal(resolveExecutionSoundType('말뚝에 꿰뚫기'), 'public');
    assert.equal(resolveExecutionSoundType('꼬챙이 관통형'), 'public');

    // 일반 / 기본 처형 및 사형 (바닐라 기본 참수형 매핑)
    assert.equal(resolveExecutionSoundType('비밀 처형'), 'beheading');
    assert.equal(resolveExecutionSoundType('알 수 없는 사형'), 'beheading');
    assert.equal(resolveExecutionSoundType('일반 상호작용'), null);
  });

  it('2. 로그 청크에서 ##CK3_EXECUTION## 마커와 죄수 성별(GENDER:F/M)을 완벽히 추출해야 함', () => {
    const chunk = `
[10:15:00][D][gui.cpp:123]: Button clicked
##CK3_EXECUTION## 화형|||GENDER:F##
[10:15:02][D][gui.cpp:125]: Other event
##CK3_EXECUTION## 사냥개에게 던지기|||GENDER:M##
##CK3_EXECUTION## 단두대 참수##
`;

    const events = extractExecutionSoundsFromChunk(chunk);
    assert.equal(events.length, 3);

    // 여성 화형
    assert.equal(events[0].type, 'burning');
    assert.equal(events[0].gender, 'female');
    assert.equal(events[0].rawName, '화형');

    // 남성 사냥개형
    assert.equal(events[1].type, 'kennel');
    assert.equal(events[1].gender, 'male');
    assert.equal(events[1].rawName, '사냥개에게 던지기');

    // 성별 미지정 참수형 (기본 남성)
    assert.equal(events[2].type, 'beheading');
    assert.equal(events[2].gender, 'male');
    assert.equal(events[2].rawName, '단두대 참수');
  });

  it('3. 성별 인식 5대 사형(화형/제물/사냥개/관통공개/식인)은 남/녀 분기 사운드 키를 정확히 반환해야 함', () => {
    // 화형 남/녀 분기
    assert.equal(resolveExecutionSoundKey('burning', 'F'), 'burning_female');
    assert.equal(resolveExecutionSoundKey('burning', 'M'), 'burning_male');
    assert.equal(resolveExecutionSoundKey('burning', 'UNKNOWN'), 'burning_male');

    // 인신공양 남/녀 분기
    assert.equal(resolveExecutionSoundKey('sacrifice', 'F'), 'sacrifice_female');
    assert.equal(resolveExecutionSoundKey('sacrifice', 'M'), 'sacrifice_male');

    // 사냥개 남/녀 분기
    assert.equal(resolveExecutionSoundKey('kennel', 'F'), 'kennel_female');
    assert.equal(resolveExecutionSoundKey('kennel', 'M'), 'kennel_male');

    // 공개/관통형 남/녀 분기
    assert.equal(resolveExecutionSoundKey('public', 'F'), 'public_female');
    assert.equal(resolveExecutionSoundKey('public', 'M'), 'public_male');
    assert.equal(resolveExecutionSoundKey('public', 'UNKNOWN'), 'public_male');

    // 식인 포식형 남/녀 분기
    assert.equal(resolveExecutionSoundKey('devour', 'F'), 'devour_female');
    assert.equal(resolveExecutionSoundKey('devour', 'M'), 'devour_male');
    assert.equal(resolveExecutionSoundKey('devour', 'UNKNOWN'), 'devour_male');

    // 중립 사형 (참수, 교수형 등)은 성별과 무관하게 고정 키 반환
    assert.equal(resolveExecutionSoundKey('beheading', 'F'), 'beheading');
    assert.equal(resolveExecutionSoundKey('beheading', 'M'), 'beheading');
    assert.equal(resolveExecutionSoundKey('hanging', 'F'), 'hanging');
    assert.equal(resolveExecutionSoundKey('hanging', 'M'), 'hanging');
    assert.equal(resolveExecutionSoundKey('generic', 'UNKNOWN'), 'generic');
  });

  it('4. 모드 scripted_effects(zz_tts_companion_prison_effects.txt) 내에 처형 방식 및 성별 로깅이 구현되어 있어야 함', () => {
    const scriptPath = path.resolve(
      process.cwd(),
      'ck3-mod/common/scripted_effects/zz_tts_companion_prison_effects.txt'
    );
    assert.ok(fs.existsSync(scriptPath), 'zz_tts_companion_prison_effects.txt 파일이 존재해야 함');

    const content = fs.readFileSync(scriptPath, 'utf-8');
    assert.ok(content.includes('##CK3_EXECUTION##'), '처형 마커가 포함되어 있어야 함');
    assert.ok(
      content.includes('scope:victim = { is_female = yes }'),
      '죄수 성별(is_female) 판별 코드가 포함되어 있어야 함'
    );
    assert.ok(content.includes('GENDER:F'), '여성 죄수 태그가 포함되어 있어야 함');
    assert.ok(content.includes('GENDER:M'), '남성 죄수 태그가 포함되어 있어야 함');
    assert.ok(content.includes('scope:execution_burned'), '화형(burned) 분기가 포함되어 있어야 함');
    assert.ok(content.includes('scope:execution_kennel'), '사냥개(kennel) 분기가 포함되어 있어야 함');
    assert.ok(content.includes('scope:execution_public'), '공개 처형(public) 분기가 포함되어 있어야 함');
    assert.ok(content.includes('scope:execution_beheaded'), '참수형(beheading) 분기가 포함되어 있어야 함');
    assert.ok(content.includes('scope:executioner = { is_ai = no }'), '플레이어 처형자 한정 필터가 포함되어 있어야 함');
  });
});
