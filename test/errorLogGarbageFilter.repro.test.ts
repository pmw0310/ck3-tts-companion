import test from 'node:test';
import assert from 'node:assert/strict';
import { extractCk3EventsFromChunk } from '@/main/textSanitizer';

/**
 * 인게임 본문 내 따옴표/개행으로 인해 C++ 콘솔 파서가 error.log에 단어 파편을 쏟아낼 때,
 * 앱이 임의의 '크루세이더 킹즈 3 사건' 가짜 제목을 부여하거나,
 * debug.log의 완전한 원본 이벤트를 덮어쓰지 않도록 방어하는 결함 검증 테스트
 */
test('1. error.log 단독 파편 복원 시 임의의 가짜 제목("크루세이더 킹즈 3 사건")이 절대 부여되지 않아야 함', () => {
  // 실제 사용자의 12:35:10 error.log 청크
  const realErrorLogChunk = `[12:35:10][E][pdx_persistent_reader.cpp:216]: Error: "Unknown effect: 아이로, near line: 1
Unknown effect: 싶니, near line: 1
Unknown effect: 

, near line: 3
Unknown effect:  그는 코를 찡그리며 대답했다. , near line: 3
Unknown effect: 저를, near line: 3
Unknown effect: 취급해요, near line: 3
Unknown effect: 늘, near line: 3
Unknown effect: 시키기만, near line: 3
Unknown effect: !, near line: 5 (expanded from file: effect console command line: 3)
Unknown effect: 그, near line: 5
Unknown effect: 틀렸단, near line: 5
Unknown effect: 보여줘, near line: 5
Unknown effect: 열정을, near line: 5
Unknown effect: 더, near line: 5
Unknown effect: 애를, near line: 5
Unknown effect: 거다., near line: 5
Unknown effect: 나이가, near line: 5
Unknown effect: 들어서도, near line: 5
Unknown effect: 아이, near line: 5
Unknown effect:  EMP, near line: 5
Unknown effect: 싶다면 , near line: 5
Unknown effect: 그럴, near line: 5
Unknown effect: 없겠지만., near line: 7 (expanded from file: effect console command line: 5)
Unknown effect: 저는..., near line: 7
Unknown effect: 안, near line: 7
Unknown effect:  라그나르(이)가 한숨을 쉬었다. , near line: 7
Unknown effect: 쪽으로든, near line: 7
Unknown effect: 죽는, near line: 7
Unknown effect: 마찬가지겠죠., near line: 7" in file: "effect console command" near line: 7
`;

  const events = extractCk3EventsFromChunk(realErrorLogChunk);
  for (const event of events) {
    assert.notStrictEqual(
      event.title,
      '크루세이더 킹즈 3 사건',
      '인게임에 존재하지 않는 임의의 가짜 제목("크루세이더 킹즈 3 사건")이 부여되어서는 안 됨'
    );
  }
});

test('2. debug.log 원본과 error.log 파편이 동시에 발생할 때 온전한 이벤트만 채택되고 파편은 폐기되어야 함', () => {
  // 12:35:10 debug.log 실전 원본 청크
  const debugChunk = `[12:35:10][D][console.cpp:1164]: Running console command: effect debug_log = "##CK3_TTS## 피후견인 성격 영향: 야심찬 — 실패|||나는 내 아들  ONCLICK:CHARACTER,17254  TOOLTIP:CHARACTER,17254  L 라그나르 ! ! !에게 다가갔다. 그리고 한 가지 질문을 던졌다. "아이로 남고 싶니?"

"아뇨." 그는 코를 찡그리며 대답했다. "어른들은 저를 사냥개로 취급해요! 늘 이래라저래라 시키기만 하죠!"

"그 녀석들이 틀렸단 걸 보여줘! 열정을 불태우고 더 발전하려고 애를 쓰는 거다. 뭐... 나이가 더 들어서도 계속 아이 취급이나  EMP 받고 싶다면 ! 그럴 필요 없겠지만."

"저는... 신경 안 써요." 라그나르(이)가 한숨을 쉬었다. "어느 쪽으로든 말라 죽는 건 마찬가지겠죠."|||GENDER:M##CK3_TTS_END##"
`;

  const errorChunk = `[12:35:10][E][pdx_persistent_reader.cpp:216]: Error: "Unknown effect: 아이로, near line: 1
Unknown effect: 싶니, near line: 1
Unknown effect:  그는 코를 찡그리며 대답했다. , near line: 3
Unknown effect: 저를, near line: 3
Unknown effect: 취급해요, near line: 3
Unknown effect: 늘, near line: 3
Unknown effect: 시키기만, near line: 3
Unknown effect: !, near line: 5 (expanded from file: effect console command line: 3)
Unknown effect: 그, near line: 5
Unknown effect: 틀렸단, near line: 5
Unknown effect: 보여줘, near line: 5
Unknown effect: 열정을, near line: 5
Unknown effect: 더, near line: 5
Unknown effect: 애를, near line: 5
Unknown effect: 거다., near line: 5
Unknown effect: 나이가, near line: 5
Unknown effect: 들어서도, near line: 5
Unknown effect: 아이, near line: 5
Unknown effect:  EMP, near line: 5
Unknown effect: 싶다면 , near line: 5
Unknown effect: 그럴, near line: 5
Unknown effect: 없겠지만., near line: 7 (expanded from file: effect console command line: 5)
Unknown effect: 저는..., near line: 7
Unknown effect: 안, near line: 7
Unknown effect:  라그나르(이)가 한숨을 쉬었다. , near line: 7
Unknown effect: 쪽으로든, near line: 7
Unknown effect: 죽는, near line: 7
Unknown effect: 마찬가지겠죠., near line: 7" in file: "effect console command" near line: 7
`;

  // 두 로그가 동시에 섞여 들어왔을 때
  const combinedChunk = `${debugChunk}\n${errorChunk}`;
  const events = extractCk3EventsFromChunk(combinedChunk);

  assert.strictEqual(events.length, 1, '온전한 이벤트 1개만 남고 파편 이벤트는 중복 제거되어야 함');
  assert.strictEqual(events[0]?.title, '피후견인 성격 영향: 야심찬 — 실패', '인게임 원본 제목이 보존되어야 함');
  assert.strictEqual(events[0]?.speakerGender, 'male', '인게임 원본 성별 태그가 보존되어야 함');
  assert.ok(events[0]?.content.includes('나는 내 아들'), '앞부분 질문 지문이 온전해야 함');
  assert.ok(events[0]?.content.includes('말라 죽는 건 마찬가지겠죠'), '뒷부분 대사까지 온전해야 함');
});
