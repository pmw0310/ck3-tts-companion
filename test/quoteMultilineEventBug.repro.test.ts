import test from 'node:test';
import assert from 'node:assert/strict';
import { extractCk3EventsFromChunk } from '@/main/textSanitizer';

/**
 * 인게임 본문에 따옴표/개행이 포함되었을 때 콘솔 에코 및 debug_log 파편으로 인해
 * 이벤트 전체가 스크립트 쓰레기로 오판되어 차단되는 치명적 결함 재현 테스트
 */
test('인게임 본문에 따옴표 및 개행이 포함된 이벤트 추출 결함 재현', () => {
  // 실제 사용자의 debug.log 9073~9079줄에서 발췌한 실전 로그 청크
  const realChunk = `[13:30:02][D][console.cpp:1164]: Running console command: effect debug_log = "##CK3_TTS## 부상 부위: 깊게 베임|||매 발걸음마다 고통이 찾아온다. 조금만 움직여도 "헉"하는 소리가 난다. 조심조심 상처를 만져보니 손이 피로 빨갛게 물든다. 나는 피를 뚝뚝 흘리며 비틀비틀 걸어갔다. 

"걱정하실 일은 아닙니다, 단장님. 상처가 깊긴 하지만 제 의학 수준이 더 깊으니까요."|||GENDER:M##CK3_TTS_END##"
[13:30:02][D][jomini_effect_impl.cpp:450]: file: effect console command line: 1: ##CK3_TTS## 부상 부위: 깊게 베임|||매 발걸음마다 고통이 찾아온다. 조금만 움직여도 
[13:30:02][D][console.cpp:1193]: console_success: Executing effect script "debug_log = "##CK3_TTS## 부상 부위: 깊게 베임|||매 발걸음마다 고통이 찾아온다. 조금만 움직여도 "헉"하는 소리가 난다. 조심조심 상처를 만져보니 손이 피로 빨갛게 물든다. 나는 피를 뚝뚝 흘리며 비틀비틀 걸어갔다. 
[13:30:02][D][console.cpp:1193]: console_success: 
[13:30:02][D][console.cpp:1193]: console_success: "걱정하실 일은 아닙니다, 단장님. 상처가 깊긴 하지만 제 의학 수준이 더 깊으니까요."|||GENDER:M##CK3_TTS_END##" "
`;

  const events = extractCk3EventsFromChunk(realChunk);

  console.log('추출된 이벤트 수:', events.length);
  if (events.length > 0) {
    console.log('이벤트 제목:', events[0]?.title);
    console.log('이벤트 본문:', events[0]?.content);
  }

  assert.strictEqual(events.length, 1, '따옴표와 대화문이 포함된 이벤트가 1개 정상 추출되어야 함');
  assert.ok(events[0]?.content.includes('의학 수준이 더 깊으니까요'), '본문 뒷부분 대사까지 온전하게 추출되어야 함');
});
