import test from 'node:test';
import assert from 'node:assert/strict';
import {
  splitNarrativeAndDialogue,
  type DialogueSegment
} from '@/shared/narrativeDialogueSplitter';

/**
 * 지문(나레이션) 및 대화문(인물 대사) 자동 분할 알고리즘 검증 테스트
 */
test('지문 및 대화문 분할 엔진 검증', async (t) => {
  await t.test('1. 순수 지문만 있는 경우 단일 narration 세그먼트 반환', () => {
    const text = '폭풍우가 성벽을 세차게 때리며 어두운 밤하늘을 갈랐다.';
    const segments: DialogueSegment[] = splitNarrativeAndDialogue(text, 'female');

    assert.equal(segments.length, 1);
    assert.equal(segments[0]?.type, 'narration');
    assert.equal(segments[0]?.text, text);
    assert.equal(segments[0]?.speakerGender, 'narrator');
  });

  await t.test('2. 순수 대화문만 있는 경우 단일 dialogue 세그먼트 반환 및 화자 성별 반영', () => {
    const text = '"이 영지는 이제 나의 것이다!"';
    const segmentsFemale: DialogueSegment[] = splitNarrativeAndDialogue(text, 'female');

    assert.equal(segmentsFemale.length, 1);
    assert.equal(segmentsFemale[0]?.type, 'dialogue');
    assert.equal(segmentsFemale[0]?.text, '이 영지는 이제 나의 것이다!');
    assert.equal(segmentsFemale[0]?.speakerGender, 'female');

    const segmentsMale: DialogueSegment[] = splitNarrativeAndDialogue(text, 'male');
    assert.equal(segmentsMale[0]?.speakerGender, 'male');
  });

  await t.test('3. 지문 + 대화문 + 지문 복합 구조를 순서대로 정확하게 분할', () => {
    const text = '궁정의 문이 거칠게 열리며 왕비가 다가왔다. "폐하, 국경에서 반란이 일어났습니다!" 그녀의 목소리는 떨리고 있었다.';
    const segments: DialogueSegment[] = splitNarrativeAndDialogue(text, 'female');

    assert.equal(segments.length, 3);

    // 세그먼트 1: 지문
    assert.equal(segments[0]?.type, 'narration');
    assert.equal(segments[0]?.text, '궁정의 문이 거칠게 열리며 왕비가 다가왔다.');
    assert.equal(segments[0]?.speakerGender, 'narrator');

    // 세그먼트 2: 대화문
    assert.equal(segments[1]?.type, 'dialogue');
    assert.equal(segments[1]?.text, '폐하, 국경에서 반란이 일어났습니다!');
    assert.equal(segments[1]?.speakerGender, 'female');

    // 세그먼트 3: 지문
    assert.equal(segments[2]?.type, 'narration');
    assert.equal(segments[2]?.text, '그녀의 목소리는 떨리고 있었다.');
    assert.equal(segments[2]?.speakerGender, 'narrator');
  });

  await t.test('4. 다양한 따옴표 및 인용 부호(“”, \'\', 「」, 『』) 정상 인식', () => {
    const textCurly = '사제가 말했다. “신의 가호가 함께하길.” 그러자 기사가 고개를 끄덕였다.';
    const segCurly = splitNarrativeAndDialogue(textCurly, 'male');
    assert.equal(segCurly.length, 3);
    assert.equal(segCurly[1]?.type, 'dialogue');
    assert.equal(segCurly[1]?.text, '신의 가호가 함께하길.');
    assert.equal(segCurly[1]?.speakerGender, 'male');

    const textCorner = '밀서에는 『자정에 북문에서 접선하라』 라고 적혀 있었다.';
    const segCorner = splitNarrativeAndDialogue(textCorner, 'male');
    assert.equal(segCorner.length, 3);
    assert.equal(segCorner[1]?.type, 'dialogue');
    assert.equal(segCorner[1]?.text, '자정에 북문에서 접선하라');
  });

  await t.test('5. 화자 성별이 미지정(narrator 또는 auto)인 경우 대화문도 기본 narrator 처리', () => {
    const text = '누군가 외쳤다. "도망쳐라!"';
    const segments: DialogueSegment[] = splitNarrativeAndDialogue(text, 'narrator');

    assert.equal(segments.length, 2);
    assert.equal(segments[1]?.type, 'dialogue');
    assert.equal(segments[1]?.speakerGender, 'narrator');
  });

  await t.test('6. [실전 제보] 인접 지문에 여성 주어(아내/부인/그녀 등)가 있는 경우 대화문 성별을 female로 지능적 보정', () => {
    const text = '"절대로 용납할 수 없어요!" 아내 오를라흐가 내 내실을 박차고 들어왔다. 화가 나서 새빨개진 얼굴을 하고 고함친다. "타즈가 내 명예를 더럽혔어요!"';
    // 이벤트 기본값이 male로 잘못 유입되었더라도
    const segments = splitNarrativeAndDialogue(text, 'male');

    assert.equal(segments.length, 3);
    // 첫 번째 대사: 인접 지문의 '아내' 단서로 female 보정
    assert.equal(segments[0]?.type, 'dialogue');
    assert.equal(segments[0]?.speakerGender, 'female');
    assert.equal(segments[0]?.text, '절대로 용납할 수 없어요!');

    // 두 번째 지문
    assert.equal(segments[1]?.type, 'narration');
    assert.equal(segments[1]?.speakerGender, 'narrator');

    // 세 번째 대사: 인접 지문의 '아내' 단서로 female 보정
    assert.equal(segments[2]?.type, 'dialogue');
    assert.equal(segments[2]?.speakerGender, 'female');
    assert.equal(segments[2]?.text, '타즈가 내 명예를 더럽혔어요!');
  });
});


