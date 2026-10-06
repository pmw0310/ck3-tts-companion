import { describe, it } from 'node:test';
import assert from 'node:assert';
import { extractCk3EventsFromChunk } from '@/main/textSanitizer';

describe('error.log 내 큰따옴표 충돌 이벤트 자동 복원 테스트', () => {
  it('실제 error.log의 문성 대화문 파편을 정상 이벤트로 복원해야 한다', () => {
    const errorChunk = `
[15:48:52][E][pdx_persistent_reader.cpp:216]: Error: "Unknown effect: 이, near line: 3
Unknown effect: 앞으로, near line: 3
Unknown effect: 년, near line: 3
Unknown effect: 사람들의, near line: 3
Unknown effect: 책임질, near line: 3
Unknown effect:   ONCLICK:CHARACTER,16837035  TOOLTIP:CHARACTER,16837035  L 문성 ! ! !(이)가 말했다.|||GENDER:M##CK3_TTS_END##, near line: 3" in file: "effect console command" near line: 3
`;

    const events = extractCk3EventsFromChunk(errorChunk);
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0]?.speakerGender, 'male');
    assert.ok(events[0]?.content.includes('문성'));
    assert.ok(events[0]?.content.includes('말했다'));
    assert.ok(!events[0]?.content.includes('Unknown effect'));
    assert.ok(!events[0]?.content.includes('near line'));
    assert.ok(!events[0]?.content.includes('ONCLICK:CHARACTER'));
  });

  it('실제 error.log의 보수 지급 대화문 파편을 정상 이벤트로 복원해야 한다', () => {
    const errorChunk = `
[14:13:17][E][pdx_persistent_reader.cpp:216]: Error: "Unknown effect: 정말, near line: 3
Unknown effect: !, near line: 3
Unknown effect: 더, near line: 3
Unknown effect: 가축이, near line: 3
Unknown effect: 나가는, near line: 3
Unknown effect: 없고, near line: 3
Unknown effect: 아이들이, near line: 3
Unknown effect: 일도, near line: 3
Unknown effect: 됐어., near line: 3
Unknown effect: ,, near line: 3
Unknown effect: 약속한, near line: 3
Unknown effect: 앞으로, near line: 3
Unknown effect: 또, near line: 3
Unknown effect: 시작하면, near line: 3
Unknown effect: 연락하면, near line: 3
Unknown effect: |||GENDER:M##CK3_TTS_END##, near line: 3" in file: "effect console command" near line: 3
`;

    const events = extractCk3EventsFromChunk(errorChunk);
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0]?.speakerGender, 'male');
    assert.ok(events[0]?.content.includes('정말'));
    assert.ok(events[0]?.content.includes('가축'));
    assert.ok(events[0]?.content.includes('약속한'));
  });

  it('expanded from file 및 TOOLTIP:FAITH 메타데이터가 포함된 실제 error.log를 온전하게 복원해야 한다', () => {
    const errorChunk = `
[16:30:09][E][pdx_persistent_reader.cpp:216]: Error: "Unknown effect: 내가, near line: 1
Unknown effect: ,, near line: 1
Unknown effect:   TOOLTIP:FAITH, near line: 1
Unknown effect: maitreya_faith, near line: 1
Unknown effect: 미륵불께서는 선량하시니까요., near line: 3
Unknown effect: 암송하듯, near line: 2 (expanded from file: effect console command line: 3)
Unknown effect: 그래, 네 선의는 미륵불의 것이야. 네 지혜는 광목천왕의 것이고. 네 용기는 드리타라슈트라의 것이지. 넌 이 세상에서 혼자가 되고 싶나? 아니면 신의 대변인이 되는 건 어떻지? 내가 이끌어 줄 수 있다., near line: 7 (expanded from file: effect console command line: 5)
Unknown effect: 아버지, near line: 7
Unknown effect: 은, near line: 7
Unknown effect: 는, near line: 7
Unknown effect: 소리, near line: 7
Unknown effect: 김 광정의 은총이 느껴져요!, near line: 7" in file: "effect console command" near line: 7
`;

    const events = extractCk3EventsFromChunk(errorChunk);
    assert.strictEqual(events.length, 1);
    const event = events[0];
    assert.ok(event);

    // 1. 핵심 대화 내용 정상 포함 검증
    assert.ok(event.content.includes('미륵불께서는 선량하시니까요'));
    assert.ok(event.content.includes('네 선의는 미륵불의 것이야'));
    assert.ok(event.content.includes('광목천왕'));
    assert.ok(event.content.includes('드리타라슈트라'));

    // 2. 엔진 디버그/메타데이터 문자열 절대 유출 금지 검증
    assert.ok(!event.content.includes('expanded from file'));
    assert.ok(!event.content.includes('엑스판데드'));
    assert.ok(!event.content.includes('near line'));
    assert.ok(!event.content.includes('리네:'));
    assert.ok(!event.content.includes('effect console command'));
    assert.ok(!event.content.includes('에프펙트'));
    assert.ok(!event.content.includes('TOOLTIP:FAITH'));
    assert.ok(!event.content.includes('maitreya_faith'));
  });

  it('사용자 실전 제보 2: (expanded from file: effect console command line: 3)" in file:... 가 완벽히 제거되어야 한다', () => {
    const errorChunk = `
[16:52:46][E][pdx_persistent_reader.cpp:216]: Error: "Unknown effect: 오, near line: 3
Unknown effect: ,, near line: 3
Unknown effect: 일을, near line: 3
Unknown effect: !, near line: 3
Unknown effect: 아직, near line: 3
Unknown effect: 하지만, near line: 3
Unknown effect: 처음, near line: 3
Unknown effect: 때보다는, near line: 3
Unknown effect: 나아졌다네., near line: 3
Unknown effect: 영혼의, near line: 3
Unknown effect: 가벼워져서, near line: 3
Unknown effect: 영원한, near line: 3
Unknown effect: 돌아갈, near line: 3
Unknown effect: 있게, near line: 3
Unknown effect: 내가, near line: 3
Unknown effect: 나와, near line: 3
Unknown effect: 운명으로부터, near line: 3
Unknown effect: 때문이지., near line: 5 (expanded from file: effect console command line: 3)" in file: "effect console command" near line: 5
`;

    const events = extractCk3EventsFromChunk(errorChunk);
    assert.strictEqual(events.length, 1);
    const event = events[0];
    assert.ok(event);

    // 본문 내용 검증
    assert.ok(event.content.includes('처음 때보다는 나아졌다네'));
    assert.ok(event.content.includes('영원한'));
    assert.ok(event.content.includes('때문이지'));

    // 메타데이터 및 한글 음차 완벽 제거 검증
    assert.ok(!event.content.includes('expanded from file'));
    assert.ok(!event.content.includes('엑스판데드'));
    assert.ok(!event.content.includes('effect console command'));
    assert.ok(!event.content.includes('에프펙트'));
    assert.ok(!event.content.includes('콘솔레'));
    assert.ok(!event.content.includes('콤만드'));
    assert.ok(!event.content.includes('리네:'));
    assert.ok(!event.content.includes('near line'));
  });

  it('사용자 실전 제보 3: 파편화된 캐릭터/작위 ID(15301, 7232) 및 L 마커가 완벽히 제거되어야 한다', () => {
    const errorChunk = `
[17:25:13][E][pdx_persistent_reader.cpp:216]: Error: "Unknown effect: 백작, near line: 3
Unknown effect: 이, near line: 3
Unknown effect: 시여, near line: 3
Unknown effect:  ONCLICK:CHARACTER, near line: 3
Unknown effect: 15301, near line: 3
Unknown effect: ,, near line: 3
Unknown effect:  L, near line: 3
Unknown effect: !, near line: 3
Unknown effect: !, near line: 3
Unknown effect: !, near line: 3
Unknown effect: 싶어요., near line: 3
Unknown effect: 사람은, near line: 3
Unknown effect: ,, near line: 3
Unknown effect:  TOOLTIP:LANDED_TITLE, near line: 3
Unknown effect: 7232, near line: 3
Unknown effect:  ONCLICK:CHARACTER, near line: 5
Unknown effect: 15301, near line: 5
Unknown effect: ,, near line: 5
Unknown effect:  L, near line: 5
Unknown effect: !, near line: 5
Unknown effect: !, near line: 5
Unknown effect: !, near line: 5
Unknown effect: 이, near line: 5
Unknown effect: 가, near line: 5
Unknown effect: 인사하고, near line: 5
Unknown effect: 만나뵙게 되어 영광입니다, 부인(이)시여. 슬프게도  ONCLICK:TITLE,7232  TOOLTIP:LANDED_TITLE,7232  L; 아브랑슈 ! ! !(은)는 후계자가... 없이는 손에 넣지 못할 것 같사옵니다., near line: 5" in file: "effect console command" near line: 5
`;

    const events = extractCk3EventsFromChunk(errorChunk);
    assert.strictEqual(events.length, 1);
    const event = events[0];
    assert.ok(event);

    // 본문 내용 검증
    assert.ok(event.content.includes('만나뵙게 되어 영광입니다'));
    assert.ok(event.content.includes('아브랑슈'));
    assert.ok(event.content.includes('후계자'));

    // 파편화된 ID 숫자 및 마커 완벽 제거 검증
    assert.ok(!event.content.includes('15301'), '캐릭터 ID 15301이 제거되어야 합니다.');
    assert.ok(!event.content.includes('7232'), '작위 ID 7232가 제거되어야 합니다.');
    assert.ok(!event.content.includes('ONCLICK'), 'ONCLICK 태그가 제거되어야 합니다.');
    assert.ok(!event.content.includes('TOOLTIP'), 'TOOLTIP 태그가 제거되어야 합니다.');
    assert.ok(!event.content.includes('L;'), 'L; 마커가 제거되어야 합니다.');
    assert.ok(!event.content.includes('! ! !'), '연속 느낌표가 정리되어야 합니다.');
  });
});


