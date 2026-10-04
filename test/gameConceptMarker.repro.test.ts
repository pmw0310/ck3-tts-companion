import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeCk3Text, extractCk3EventsFromChunk } from '@/main/textSanitizer';

/**
 * CK3 게임 컨셉(Game Concept) 마커 'G;' 노출 결함 재현 및 방어 테스트
 */
test('CK3 Game Concept 서식 마커(G;) 및 서술격 조사(임이) 정제 검증', async (t) => {
  await t.test('1. [결함 재현] "G; 강령술사" 마커가 제거되어 깨끗한 "강령술사"만 남아야 함', () => {
    const rawSample = '이 남자는 G; 강령술사 임이 틀림없다 놀란 나는 그만 발을 헛디뎌 넘어지며 큰 소리를 내고 말았다.';
    const sanitized = sanitizeCk3Text(rawSample);

    // 결함 검증: 'G;'가 포함되어 있으면 안 됨
    assert.ok(
      !sanitized.includes('G;'),
      `정제된 텍스트에 "G;" 마커가 포함되어 있어서는 안 됩니다. 현재 출력: "${sanitized}"`
    );
    assert.ok(
      !sanitized.includes('G '),
      `정제된 텍스트에 단독 "G" 마커가 포함되어 있어서는 안 됩니다. 현재 출력: "${sanitized}"`
    );
    // 내러티브 본문은 온전히 보존되어야 함
    assert.ok(
      sanitized.includes('강령술사'),
      `"강령술사" 텍스트는 보존되어야 합니다. 현재 출력: "${sanitized}"`
    );
    // 조사 앞 불필요 공백 정리 검증: "강령술사 임이" -> "강령술사임이"
    assert.ok(
      sanitized.includes('강령술사임이'),
      `"강령술사 임이"의 불필요한 공백이 정리되어 "강령술사임이"로 이어져야 합니다. 현재 출력: "${sanitized}"`
    );
  });

  await t.test('2. [다양한 G 마커 패턴] 세미콜론 유무 및 대소문자 변종 정제 검증', () => {
    // 1) 대소문자 변종: g; 강령술사
    assert.equal(
      sanitizeCk3Text('그는 g; 강령술사이다.'),
      '그는 강령술사이다.',
      '소문자 g; 마커도 정제되어야 합니다.'
    );

    // 2) 세미콜론 뒤 공백 없음: G;강령술사
    assert.equal(
      sanitizeCk3Text('그는 G;강령술사이다.'),
      '그는 강령술사이다.',
      '공백 없는 G; 마커도 정제되어야 합니다.'
    );

    // 3) 단독 마커: G 강령술사
    assert.equal(
      sanitizeCk3Text('그는 G 강령술사이다.'),
      '그는 강령술사이다.',
      '세미콜론 없는 단독 G 마커도 정제되어야 합니다.'
    );

    // 4) 문장 시작 마커: G; 강령술사가 나타났다.
    assert.equal(
      sanitizeCk3Text('G; 강령술사가 나타났다.'),
      '강령술사가 나타났다.',
      '문장 시작 부분의 G; 마커도 정제되어야 합니다.'
    );
  });

  await t.test('3. [로그 청크 통합 추출] [CK3_TTS] 청크 추출 시 G; 마커가 제거되어 이벤트 큐로 전달되어야 함', () => {
    const rawChunk = `[14:15:30][D][console.cpp:1193]: console_success: [CK3_TTS] 강령술사|||잠이 오지 않았던 나는 평야에서 밤 산책을 하며 정처 없이 돌아다녔다. 그러다가 어떤 소리를 들었는데... 누군가 주문을 외는 듯한 소리였다. 소리가 나는 곳으로 가 보니, 횃불로 둘러싸인 환한 곳에서 기괴하고도 불안한 광경이 펼쳐졌다. 로브를 입은 한 남자가 주문서를 들여다보며 지배하고 싶은 악마들의 이름을 부르고 있었다. 남자의 앞에는 복잡하고 우아하면서도 광기 어린 의식의 원이 분필로 그려져 있었다. 이 남자는 G; 강령술사 임이 틀림없다 놀란 나는 그만 발을 헛디뎌 넘어지며 큰 소리를 내고 말았다.[CK3_TTS_END]`;

    const events = extractCk3EventsFromChunk(rawChunk);
    assert.equal(events.length, 1, '이벤트가 1건 정상 추출되어야 합니다.');
    assert.equal(events[0]?.title, '강령술사');
    assert.ok(
      !events[0]?.content.includes('G;'),
      `추출된 본문에 "G;"가 포함되지 않아야 합니다. 현재 내용: "${events[0]?.content}"`
    );
    assert.ok(
      events[0]?.content.includes('강령술사임이 틀림없다'),
      `자연스러운 "강령술사임이 틀림없다"로 정제되어야 합니다. 현재 내용: "${events[0]?.content}"`
    );
  });

  await t.test('4. [사용자 제보 결함 재현] 별명 따옴표 앞의 하이퍼링크 L 마커 정제 검증', () => {
    const rawSample = "L ' 엽사 ' 도브로고스트의 잘린 머리를 주교후 람베르트의 공모자 앞에 내던졌다.";
    const sanitized = sanitizeCk3Text(rawSample);

    // L 마커가 완벽히 제거되어야 함
    assert.ok(
      !sanitized.startsWith('L '),
      `문장 시작의 "L " 마커가 제거되어야 합니다. 현재 출력: "${sanitized}"`
    );
    assert.ok(
      !sanitized.includes('L \''),
      `"L \'" 형태의 마커가 남아있어서는 안 됩니다. 현재 출력: "${sanitized}"`
    );
    assert.ok(
      sanitized.includes('도브로고스트의 잘린 머리를'),
      `본문 내용이 보존되어야 합니다. 현재 출력: "${sanitized}"`
    );
  });

  await t.test('5. [사용자 실전 로그 재현] "그의 머리를 가져오라: 성공" 로그 청크의 L 마커 및 태그 완전 박멸 검증', () => {
    const rawChunk = `[13:35:26][D][console.cpp:1193]: console_success: Executing effect script "debug_log = \\"[CK3_TTS] 그의 머리를 가져오라: 성공!||| ONCLICK:CHARACTER,79491  TOOLTIP:CHARACTER,79491  L ' TOOLTIP:NICKNAME,nick_longshanks,79491  L; 장경 ! !' 자현의 ! ! ! 잘린 머리를  ONCLICK:CHARACTER,33922  TOOLTIP:CHARACTER,33922  L 목사 박 언부의 ! ! ! 공모자 앞에 내던졌다. 검붉은 자줏빛으로 물든 고깃덩이가 질척한 소리를 내며 그 곁을 굴렀다.[CK3_TTS_END]\\"`;
    const events = extractCk3EventsFromChunk(rawChunk);
    assert.equal(events.length, 1, '이벤트가 1건 정상 추출되어야 합니다.');
    assert.equal(events[0]?.title, '그의 머리를 가져오라: 성공');

    const content = events[0]?.content ?? '';
    assert.ok(!content.startsWith('L '), `본문이 "L "로 시작하지 않아야 합니다. 현재 본문: "${content}"`);
    assert.ok(!content.startsWith('L \''), `본문이 "L '"로 시작하지 않아야 합니다. 현재 본문: "${content}"`);
    assert.ok(!content.includes('L 목사'), `인물 앞 "L " 마커가 없어야 합니다. 현재 본문: "${content}"`);
    assert.ok(content.includes('장경'), `별칭 장경이 포함되어야 합니다. 현재 본문: "${content}"`);
    assert.ok(content.includes('자현의 잘린 머리를'), `자현의 잘린 머리 내용이 포함되어야 합니다. 현재 본문: "${content}"`);
  });
});
