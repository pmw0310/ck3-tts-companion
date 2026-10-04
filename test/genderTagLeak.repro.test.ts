import test from 'node:test';
import assert from 'node:assert/strict';
import { extractCk3EventsFromChunk, sanitizeCk3Text } from '@/main/textSanitizer';

/**
 * [결함 재현 및 방어 검증]
 * 사용자 제보: 이벤트 본문 끝에 "|||GENDER:M" 또는 성별 마커가 그대로 노출되는 결함
 */
test('화자 성별 태그(GENDER:M, GENDER:F) 본문 유출 원천 차단 검증', async (t) => {
  await t.test('1. 사용자 실전 로그: 본문 끝에 따옴표와 함께 붙은 |||GENDER:M 태그가 본문에서 완전히 제거되어야 함', () => {
    const chunk = `[21:41:52][D][console.cpp:1164]: Running console command: effect debug_log = "##CK3_TTS_FORCE## 도움이 되는 경고||| ONCLICK:CHARACTER,28422  TOOLTIP:CHARACTER,28422  L 레인스터의 에오를 디아르마이트 ! ! !에게서 서신이 한 통 날아들었다. 그 내용에 따르면 재상  ONCLICK:CHARACTER,32365  TOOLTIP:CHARACTER,32365  L 에오를 론발 ! ! !(이)가 나를 상대로 한 모략에 자신의 도움을 청했다고 한다!\n\n"저는 충성심을 가장 중요시합니다. 그런 연유에서 알려드리는 것입니다."|||GENDER:M##CK3_TTS_END##"`;
    const events = extractCk3EventsFromChunk(chunk);

    assert.equal(events.length, 1);
    const event = events[0]!;
    assert.equal(event.title, '도움이 되는 경고');
    assert.ok(
      !event.content.includes('GENDER'),
      `본문(content)에 GENDER 태그가 노출되지 않아야 합니다: "${event.content}"`
    );
    assert.ok(
      !event.content.includes('|||'),
      `본문(content)에 ||| 파이프 구분자가 노출되지 않아야 합니다: "${event.content}"`
    );
    assert.equal(event.speakerGender, 'male');
  });

  await t.test('2. 성별 토큰 뒤에 따옴표나 개행 등 부가 문자가 붙어 있어도 성별이 정확히 파싱되고 본문에서 제거되어야 함', () => {
    // 끝에 따옴표나 공백이 붙은 변종 청크
    const chunk = `##CK3_TTS## 밀서|||반역을 꾀하는 자가 있습니다.|||GENDER:F"##CK3_TTS_END##`;
    const events = extractCk3EventsFromChunk(chunk);

    assert.equal(events.length, 1);
    const event = events[0]!;
    assert.equal(event.speakerGender, 'female');
    assert.equal(event.content, '반역을 꾀하는 자가 있습니다.');
    assert.ok(!event.content.includes('GENDER'));
  });

  await t.test('3. sanitizeCk3Text 단독 호출 시에도 |||GENDER:* 태그가 완벽하게 정제되어야 함 (2중 방어선)', () => {
    const rawWithTag = '충성심을 중요시합니다."|||GENDER:M';
    const sanitized = sanitizeCk3Text(rawWithTag);

    assert.ok(!sanitized.includes('GENDER'), `정제 결과에 GENDER가 없어야 합니다: "${sanitized}"`);
    assert.ok(!sanitized.includes('|||'), `정제 결과에 |||가 없어야 합니다: "${sanitized}"`);
  });

  await t.test('4. splitNarrativeAndDialogue 호출 시 잔류 마커가 포함되어 있어도 세그먼트에 태그가 포함되지 않아야 함', async () => {
    const { splitNarrativeAndDialogue } = await import('@/shared/narrativeDialogueSplitter');
    const textWithTag = '그는 "충성을 바칩니다!" 라고 외쳤다.|||GENDER:M';
    const segments = splitNarrativeAndDialogue(textWithTag, 'male');

    for (const seg of segments) {
      assert.ok(!seg.text.includes('GENDER'), `세그먼트 텍스트에 GENDER가 없어야 합니다: "${seg.text}"`);
      assert.ok(!seg.text.includes('|||'), `세그먼트 텍스트에 |||가 없어야 합니다: "${seg.text}"`);
    }
  });

  await t.test('5. 21:45:34 실전 다중 문단 로그: "모욕적으로 고발당하다" 청크에서 성별 마커 완전 제거 검증', () => {
    const chunk = `[21:45:34][D][console.cpp:1164]: Running console command: effect debug_log = "##CK3_TTS## 모욕적으로 고발당하다|||에오를 디아르마이트의 편지를  ONCLICK:CHARACTER,32365  TOOLTIP:CHARACTER,32365  L 에오를 론발 ! ! !에게 보여주자 처음엔 혼란스러워하더니 곧 분개했다. "소신의 말보다 그의 말을 더 믿어 주시는 겁니까? 전 항상 주군의 충직한 신하였사옵니다!"\n\n그렇게 화를 내는 모습을 보니 나도 뭔가 미심쩍어지기 시작했다. 아무래도 너무 성급하게 행동한 모양이군. 관계가 더 파탄 나기 전에 보상을 좀 해줘야겠어!|||GENDER:M##CK3_TTS_END##"`;
    const events = extractCk3EventsFromChunk(chunk);

    assert.equal(events.length, 1);
    const event = events[0]!;
    assert.equal(event.title, '모욕적으로 고발당하다');
    assert.equal(event.speakerGender, 'male');
    assert.ok(!event.content.includes('GENDER'), `본문에 GENDER가 없어야 합니다: "${event.content}"`);
    assert.ok(!event.content.includes('|||'), `본문에 |||가 없어야 합니다: "${event.content}"`);
    assert.ok(event.content.includes('관계가 더 파탄 나기 전에 보상을 좀 해줘야겠어'));
  });
});


