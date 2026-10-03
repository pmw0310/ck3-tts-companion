import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractCk3EventsFromChunk, isValidNarrativeText } from '../src/main/textSanitizer';

describe('애완견 영입 등 1글자 제목 이벤트 TTS 파싱 결함 재현 테스트', () => {
  it('1글자 한글 제목("개", "말", "꿈" 등)도 isValidNarrativeText에서 유효한 것으로 판정되어야 한다', () => {
    assert.strictEqual(
      isValidNarrativeText('개'),
      true,
      '1글자 한글 명사 "개"는 유효한 내러티브 텍스트여야 합니다.'
    );
    assert.strictEqual(
      isValidNarrativeText('말'),
      true,
      '1글자 한글 명사 "말"은 유효한 내러티브 텍스트여야 합니다.'
    );
  });

  it('애완견 영입 로그 청크에서 제목 "개"와 본문이 온전하게 추출되어야 한다', () => {
    const dogLogChunk = `[21:30:10][D][console.cpp:1164]: Running console command: effect debug_log = "[CK3_TTS_FORCE] 개|||머리를 쓰다듬으니 녀석이 꼬리를 즐겁게 흔든다. 이 녀석한텐 어떤 이름이 어울릴까? 역사적인 이름? 이 녀석의 하얀색 털에 대한 이름? 이 녀석 귀 뒤를 쓰다듬을 때 느끼는, 마음이 가라앉는 듯한 기분을 나타낼 수 있는 이름? 이건 정말 중요한 결정이다. 그런데 녀석이 배를 쓰다듬어 달라고 발라당 드러눕자 정신이 산란해졌다.

근데 가만 있어봐... 생각났다! 이 녀석의 이름은...ERROR:[CK3_TTS_END]"
[21:30:10][D][console.cpp:1193]: console_success: Executing effect script "debug_log = "[CK3_TTS_FORCE] 개|||머리를 쓰다듬으니 녀석이 꼬리를 즐겁게 흔든다. 이 녀석한텐 어떤 이름이 어울릴까? 역사적인 이름? 이 녀석의 하얀색 털에 대한 이름? 이 녀석 귀 뒤를 쓰다듬을 때 느끼는, 마음이 가라앉는 듯한 기분을 나타낼 수 있는 이름? 이건 정말 중요한 결정이다. 그런데 녀석이 배를 쓰다듬어 달라고 발라당 드러눕자 정신이 산란해졌다.
[21:30:10][D][console.cpp:1193]: console_success: 
[21:30:10][D][console.cpp:1193]: console_success: 근데 가만 있어봐... 생각났다! 이 녀석의 이름은...[CK3_TTS_END]" "`;

    const events = extractCk3EventsFromChunk(dogLogChunk);

    assert.ok(events.length > 0, '애완견 이벤트가 최소 1건 추출되어야 합니다.');
    assert.strictEqual(events[0].title, '개', '이벤트 제목이 "개"로 추출되어야 합니다.');
    assert.ok(
      events[0].content.includes('머리를 쓰다듬으니'),
      '이벤트 본문에 "머리를 쓰다듬으니"가 포함되어야 합니다.'
    );
    assert.ok(
      events[0].content.includes('생각났다'),
      '이벤트 본문에 "생각났다"가 포함되어야 합니다.'
    );
  });
});
