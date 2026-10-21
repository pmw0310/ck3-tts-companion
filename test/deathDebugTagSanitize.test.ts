import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sanitizeCk3Text, extractCk3EventsFromChunk } from '@/main/textSanitizer';

/**
 * 군주 사망 및 승계 창에서 발생하는 'D 디버그!' 잔여물 정제 및 로컬라이제이션 무결성 검증 테스트
 */
test('군주 사망 승계 창 디버그 태그 정제 및 로컬라이제이션 무결성 검증', async (t) => {
  await t.test('1. [정제기 검증] 엔진 콘솔 직렬화 잔여물(D 디버그 !)이 말끔하게 소거되어야 함', () => {
    const rawNarrative =
      '개성의 공작 김 헌종(은)는 18세의 나이에 그의 세속의 족쇄를 벗어던졌습니다.  D 디버그 !한 그는 외모가 얼마가 추했는지, 그 모습만 봐도 악몽에 시달리게 된다는 소문이 돌았습니다.';
    const cleaned = sanitizeCk3Text(rawNarrative);

    assert.equal(
      cleaned.includes('디버그'),
      false,
      `정제 후 문자열에 '디버그'가 남아있지 않아야 합니다: ${cleaned}`
    );
    assert.equal(
      cleaned.includes('D '),
      false,
      `정제 후 문자열에 고립된 마커 'D '가 남아있지 않아야 합니다: ${cleaned}`
    );
    assert.equal(
      cleaned.includes('!한'),
      false,
      `정제 후 문자열에 파편 느낌표 '!한'이 남아있지 않아야 합니다: ${cleaned}`
    );
    assert.equal(
      cleaned.includes('개성의 공작 김 헌종은 18세의 나이에 그의 세속의 족쇄를 벗어던졌습니다.'),
      true,
      `정제 후 기본 내러티브와 조사 보정이 온전히 유지되어야 합니다: ${cleaned}`
    );
  });

  await t.test('2. [정제기 검증] 원본 Jomini 서식 태그(#D 디버그#!)도 완벽하게 제거되어야 함', () => {
    const rawTagNarrative =
      '개성의 공작 김 헌종(은)는 18세의 나이에 세속을 떠났습니다. #D 디버그#!한 그는 외모가 추했습니다.';
    const cleaned = sanitizeCk3Text(rawTagNarrative);

    assert.equal(
      cleaned.includes('디버그'),
      false,
      `'#D 디버그#!' 태그가 제거되어야 합니다: ${cleaned}`
    );
    assert.equal(
      cleaned.includes('#D'),
      false,
      `'#D' 서식 태그가 남아있지 않아야 합니다: ${cleaned}`
    );
  });

  await t.test('3. [이벤트 청크 추출 검증] 실제 debug.log의 사망 승계 로그에서 디버그 문구가 정제되어 추출되어야 함', () => {
    const logChunk =
      '[10:36:56][D][console.cpp:1164]: Running console command: effect debug_log = "##CK3_TTS## 당신은 사망했습니다.|||개성의 공작 김 헌종(은)는 18세의 나이에 그의 세속의 족쇄를 벗어던졌습니다.  D 디버그 !한 그는 외모가 얼마가 추했는지, 그 모습만 봐도 악몽에 시달리게 된다는 소문이 돌았습니다. 공작 김 광정 권좌에 오름. 그는 매사에 공명정대한 모습을 보여주기 때문에 어떠한 분쟁도 깔끔하게 처리해주기를 모두가 바라고 있습니다.##CK3_TTS_END##"';

    const events = extractCk3EventsFromChunk(logChunk);
    assert.equal(events.length, 1, '정상적으로 1개의 승계 이벤트가 추출되어야 합니다.');

    const event = events[0];
    assert.equal(event.title, '당신은 사망했습니다.');
    assert.equal(
      event.content.includes('디버그'),
      false,
      `추출된 본문에 '디버그'가 포함되지 않아야 합니다: ${event.content}`
    );
    assert.equal(
      event.content.includes('D !'),
      false,
      `추출된 본문에 엔진 포맷 잔여물이 포함되지 않아야 합니다: ${event.content}`
    );
  });
});
