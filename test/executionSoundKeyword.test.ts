import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveExecutionSoundType,
  extractExecutionSoundsFromChunk
} from '@/main/logWatcher';

describe('⚔️ 처형 효과음 키워드 매핑 및 오발화 방지 결함 재현 테스트', () => {
  it('1. 인게임 기본 처형 명칭인 "처형" 및 "사형", "Execute"는 참수형(beheading)으로 매핑되어야 함', () => {
    // 바닐라 기본 처형 버튼 텍스트는 "처형"임.
    // 기존 코드에서는 '참수'만 검사하여 '처형'이 generic으로 잘못 분류되었거나 매핑이 불안정함.
    assert.equal(resolveExecutionSoundType('처형'), 'beheading');
    assert.equal(resolveExecutionSoundType('죄수 처형'), 'beheading');
    assert.equal(resolveExecutionSoundType('사형 집행'), 'beheading');
    assert.equal(resolveExecutionSoundType('Execute'), 'beheading');
    assert.equal(resolveExecutionSoundType('Execution'), 'beheading');
  });

  it('2. 처형과 무관한 일반 상호작용(선물 보내기, 작위 수여 등)은 처형 사운드를 유발하지 않아야 함 (null 반환)', () => {
    // interaction_confirmation.gui는 모든 상호작용이 공유하므로,
    // 처형 외 상호작용이 유입될 때 generic 참수 사운드가 잘못 재생되는 결함을 차단해야 함.
    assert.equal(resolveExecutionSoundType('선물 보내기'), null);
    assert.equal(resolveExecutionSoundType('작위 수여'), null);
    assert.equal(resolveExecutionSoundType('투옥'), null);
    assert.equal(resolveExecutionSoundType('구실 조작'), null);
  });

  it('3. extractExecutionSoundsFromChunk에서 일반 상호작용은 이벤트 목록에서 제외되어야 함', () => {
    const chunk = `
[10:30:00][D][gui.cpp:100]: Button clicked
##CK3_EXECUTION## 선물 보내기|||GENDER:M##
[10:30:02][D][gui.cpp:102]: Execution clicked
##CK3_EXECUTION## 처형|||GENDER:M##
##CK3_EXECUTION## 단두대 참수|||GENDER:F##
`;

    const events = extractExecutionSoundsFromChunk(chunk);
    // 선물 보내기는 무시되고, 처형과 참수 2개만 추출되어야 함
    assert.equal(events.length, 2);
    assert.equal(events[0].rawName, '처형');
    assert.equal(events[0].type, 'beheading');
    assert.equal(events[0].gender, 'male');

    assert.equal(events[1].rawName, '단두대 참수');
    assert.equal(events[1].type, 'beheading');
    assert.equal(events[1].gender, 'female');
  });
});
