import test from 'node:test';
import assert from 'node:assert/strict';
import { extractCk3EventsFromChunk, sanitizeCk3Text, isValidNarrativeText } from '@/main/textSanitizer';

/**
 * Jomini GUI 스크립트 코드 및 미평가 표현식이 TTS로 발화되는 결함 재현 및 방어 검증
 */
test('Jomini GUI 스크립트 및 비정상 코드의 TTS 낭독 차단 검증', async (t) => {
  // 실제 사용자가 겪은 버그 로그 샘플 (window_activity.gui의 파싱 오류로 인한 스크립트 출력)
  const buggyChunkSample1 = `[14:08:12][D][console.cpp:1193]: console_success: [CK3_TTS] ', Concatenate(Select_CString( StringIsEmpty(Activity.GetShortNameNoTooltip), EventWindowData.GetTitle, Concatenate(Activity.GetShortNameNoTooltip, Concatenate(': ', EventWindowData.GetTitle)) ), Concatenate('|||', Concatenate(EventWindowData.GetDescription, '[CK3_TTS_END]'))))))`;

  const buggyChunkSample2 = `[CK3_TTS_FORCE] ', Concatenate(Select_CString( StringIsEmpty(Activity.GetShortNameNoTooltip), EventWindowData.GetTitle, Concatenate(Activity.GetShortNameNoTooltip, Concatenate(': ', EventWindowData.GetTitle)) ), Concatenate('|||', Concatenate(EventWindowData.GetDescription, '[CK3_TTS_END]`;

  const validChunkSample = `[14:09:00][D][console.cpp:1193]: console_success: [CK3_TTS] 연회: 찰나의 여유|||화려한 연회장에서 봉신들과 함께 즐거운 시간을 보내며 피로를 풉니다.[CK3_TTS_END]`;

  await t.test('1. [결함 재현 및 차단] Concatenate / Select_CString 등 GUI 스크립트 원시 코드는 이벤트로 추출되지 않아야 함', () => {
    const extractedBuggy1 = extractCk3EventsFromChunk(buggyChunkSample1);
    assert.equal(
      extractedBuggy1.length,
      0,
      'Jomini 스크립트 코드(Concatenate, Select_CString 등)가 포함된 비정상 청크는 이벤트로 추출되지 않고 차단되어야 합니다.'
    );

    const extractedBuggy2 = extractCk3EventsFromChunk(buggyChunkSample2);
    assert.equal(
      extractedBuggy2.length,
      0,
      '수동 재낭독([CK3_TTS_FORCE])이라도 스크립트 코드가 포함된 비정상 청크는 차단되어야 합니다.'
    );
  });

  await t.test('2. [유효성 검사 함수 검증] isValidNarrativeText가 스크립트 표현식을 false로 판별하는지 검증', () => {
    const scriptText = `', Concatenate(Select_CString( StringIsEmpty(Activity.GetShortNameNoTooltip), EventWindowData.GetTitle, Concatenate(Activity.GetShortNameNoTooltip, Concatenate(': ', EventWindowData.GetTitle)) ), Concatenate('`;
    assert.equal(
      isValidNarrativeText(scriptText),
      false,
      '스크립트 함수 및 미평가 코드는 isValidNarrativeText에서 false를 반환해야 합니다.'
    );

    const validText = '화려한 연회장에서 봉신들과 함께 즐거운 시간을 보내며 피로를 풉니다.';
    assert.equal(
      isValidNarrativeText(validText),
      true,
      '정상적인 나레이션 문장은 isValidNarrativeText에서 true를 반환해야 합니다.'
    );
  });

  await t.test('3. [정상 나레이션 보존] 정상적인 이벤트 텍스트는 정상적으로 추출되어야 함', () => {
    const extractedValid = extractCk3EventsFromChunk(validChunkSample);
    assert.equal(extractedValid.length, 1, '정상 이벤트는 1개 추출되어야 합니다.');
    assert.equal(extractedValid[0]?.title, '연회: 찰나의 여유');
    assert.ok(extractedValid[0]?.content.includes('화려한 연회장에서'));
  });

  await t.test('4. [디버그 문구 필터링 검증] (BUG: ...) 엔진 경고 및 AI 수준: 25.00 디버그 텍스트 제거', () => {
    const rawWithBug =
      '현재 초점을 속임수 초점(으)로 설정함 (BUG: \'set_focus\': missing exact perspective \'first\' at file: common/effect_localization/00_character_effects.txt line: 506 (set_focus), using \'SET_FOCUS_EFFECT\' instead)';
    const sanitizedBug = sanitizeCk3Text(rawWithBug);
    assert.equal(
      sanitizedBug,
      '현재 초점을 속임수 초점으로 설정함',
      '(BUG: ...) 디버그 문구가 온전히 제거되어 깨끗한 내러티브만 남아야 합니다.'
    );

    const rawWithAiWeight =
      '다음의 효과가 발생할 것임 AI 수준: 25.00 당신이 마술 용인 교리에 관한 지식을 획득함';
    const sanitizedAi = sanitizeCk3Text(rawWithAiWeight);
    assert.ok(
      !sanitizedAi.includes('AI 수준'),
      'AI 수준: ... 디버그 문구가 제거되어야 합니다.'
    );
    assert.ok(
      sanitizedAi.includes('당신이 마술 용인 교리에 관한 지식을 획득함'),
      '실제 효과 내용은 보존되어야 합니다.'
    );
  });

  await t.test('5. [결투 내러티브 파싱 및 조사 보정 검증] 일대일 대결 이벤트 텍스트 추출 및 자연스러운 한국어 조사 보정', () => {
    const duelRawChunk = `[12:34:56][jomini_script_system.cpp:278]: Script Log: [CK3_TTS] 일대일 대결: 공작 에렌스트|||공작 에렌스트(와)과 나는 원을 그리면서, 어떤 식으로 공격해야 할지를 가늠했다. 이내 녀석이 장검(을)를 치켜세우고서 무시무시한 기세를 뽐냈다. 나는 그대로 장검(을)를 꽉 움켜쥐었다. 치명적인 무기를 거머쥔 손바닥으로 서늘하고 묵직한 감각이 전해졌다.

피를 보는 순간에 끝날 싸움이건만, 긴장이 누그러들 기미는 보이지 않았다.[CK3_TTS_END]`;

    const extracted = extractCk3EventsFromChunk(duelRawChunk);
    assert.equal(extracted.length, 1, '결투 이벤트 1건이 정상 추출되어야 합니다.');
    assert.equal(extracted[0].title, '일대일 대결: 공작 에렌스트');
    assert.ok(
      extracted[0].content.includes('공작 에렌스트와 나는 원을 그리면서'),
      '에렌스트(와)과 -> 에렌스트와 로 자연스럽게 보정되어야 합니다.'
    );
    assert.ok(
      extracted[0].content.includes('장검을 치켜세우고서'),
      '장검(을)를 -> 장검을 로 자연스럽게 보정되어야 합니다.'
    );
    assert.ok(
      extracted[0].content.includes('장검을 꽉 움켜쥐었다'),
      '장검(을)를 -> 장검을 로 자연스럽게 보정되어야 합니다.'
    );
  });

  await t.test('6. [미치환 스코프 태그 및 (이)다 서술격 조사 보정 검증] [differing_doctrine.GetDescriptiveName](이)다 버그 방어', () => {
    // 사용자가 제보한 실제 결함 샘플
    const rawChunkWithUnresolvedTag = `[15:20:00][D][console.cpp:1193]: console_success: [CK3_TTS] 새로운 기독교 교파|||새롭게 창설된 교파의 중심에서 프랑스 대주교 에라르가 투르를 관리한다. 추종자들에게 에라르주의(으)로 불리는 이 교파는 카롤루스와 아주 약간 다르며, 그중에서도 가장 눈에 띄는 차이는 [differing_doctrine.GetDescriptiveName](이)다.[CK3_TTS_END]`;

    const extracted = extractCk3EventsFromChunk(rawChunkWithUnresolvedTag);
    assert.equal(extracted.length, 1, '정상 1건 추출되어야 함');
    assert.equal(extracted[0].title, '새로운 기독교 교파');

    // 1) 대괄호 미치환 스코프 태그가 제거/치환되어야 함
    assert.ok(
      !extracted[0].content.includes('GetDescriptiveName'),
      '미치환 스코프 태그 원문이 텍스트에 노출되지 않아야 합니다.'
    );
    assert.ok(
      !extracted[0].content.includes('['),
      '대괄호가 남지 않아야 합니다.'
    );

    // 2) '가다.'로 잘못 변환되지 않고 자연스럽게 종결되어야 함
    assert.ok(
      !extracted[0].content.includes('가다.'),
      '(이)다가 가다.로 왜곡되지 않아야 합니다.'
    );
    assert.ok(
      extracted[0].content.includes('차이는 교리다.') || extracted[0].content.includes('차이는 다.'),
      '자연스러운 서술격 조사로 종결되어야 합니다.'
    );

    // 3) 단독 (이)다 일반 단어 조사 테스트
    const testWithBatchim = sanitizeCk3Text('그것은 법(이)다.');
    assert.equal(testWithBatchim, '그것은 법이다.', '받침 있는 명사 + (이)다 -> 이다');

    const testWithoutBatchim = sanitizeCk3Text('그것은 교리(이)다.');
    assert.equal(testWithoutBatchim, '그것은 교리다.', '받침 없는 명사 + (이)다 -> 다');
  });
});

