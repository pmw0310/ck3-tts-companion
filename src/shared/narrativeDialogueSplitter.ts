import type { SpeakerGender } from '@/shared/types';

/** 분할된 대사 또는 지문 세그먼트 */
export type DialogueSegment = {
  readonly id: string;
  readonly type: 'narration' | 'dialogue';
  readonly text: string;
  readonly speakerGender: SpeakerGender;
};

/**
 * 인용 부호(큰따옴표, 둥근 따옴표, 작은따옴표, 낫표 등)로 둘러싸인 대화문을 매칭하는 정규식 패턴 목록
 */
const DIALOGUE_PAIR_PATTERNS: readonly RegExp[] = [
  /["“]([^"”]+)["”]/g, // 큰따옴표: "...", “...”
  /[「『]([^」』]+)[」』]/g, // 낫표: 「...」, 『...』
  /(?:^|\s)['‘]([^'’]+)['’](?=\s|[.,!?]|$)/g // 작은따옴표: '...', ‘...’ (단독 소유격 's와 구분)
];
/** 한국어 문맥에서 여성 화자를 강하게 암시하는 주어/호칭 키워드 패턴 */
const FEMALE_SPEAKER_CLUES =
  /(?:그녀(?:가|는|의|에게|와|도)?|아내(?:가|는|의|에게|와|도)?|부인(?:이|은|의|에게|과|도)?|여왕(?:이|은|의|에게|과|도)?|소여왕(?:이|은|의|에게|과|도)?|공작부인(?:이|은|의|에게|과|도)?|백작부인(?:이|은|의|에게|과|도)?|공주(?:가|는|의|에게|와|도)?|어머니(?:가|는|의|에게|와|도)?|딸(?:이|은|의|에게|과|도)?|시녀(?:가|는|의|에게|와|도)?|숙녀(?:가|는|의|에게|와|도)?|모친(?:이|은|의|에게|과|도)?|여동생(?:이|은|의|에게|과|도)?|누나(?:가|는|의|에게|와|도)?|할머니(?:가|는|의|에게|와|도)?|황후(?:가|는|의|에게|와|도)?|마님(?:이|은|의|에게|과|도)?|낭자(?:가|는|의|에게|와|도)?)/;

/** 한국어 문맥에서 남성 화자를 강하게 암시하는 주어/호칭 키워드 패턴 (지시관형사 '그 사람' 등과 구분) */
const MALE_SPEAKER_CLUES =
  /(?:그(?:가|는|의|에게|와|도)|남편(?:이|은|의|에게|과|도)?|기사(?:가|는|의|에게|와|도)?|신하(?:가|는|의|에게|와|도)?|아버지(?:가|는|의|에게|와|도)?|아들(?:이|은|의|에게|과|도)?|왕자(?:가|는|의|에게|와|도)?|부친(?:이|은|의|에게|과|도)?|형(?:이|은|의|에게|과|도)?|남동생(?:이|은|의|에게|과|도)?|오빠(?:가|는|의|에게|와|도)?|할아버지(?:가|는|의|에게|와|도)?|황제(?:가|는|의|에게|와|도)?|나리(?:가|는|의|에게|와|도)?|도련님(?:이|은|의|에게|과|도)?)/;


/**
 * 대화문 주변 인접 텍스트를 분석하여 문맥상 가장 타당한 화자 성별을 결정합니다.
 * @param start - 대화문 시작 인덱스
 * @param end - 대화문 종료 인덱스
 * @param fullText - 전체 이벤트 본문 텍스트
 * @param fallbackGender - 이벤트 기본 화자 성별
 * @returns 판별된 화자 성별 ('male' | 'female' | 'narrator')
 */
const resolveSegmentGender = (
  start: number,
  end: number,
  fullText: string,
  fallbackGender: SpeakerGender
): SpeakerGender => {
  // 대화문 직전 120자 및 직후 120자의 인접 지문 추출
  const prevContext = fullText.slice(Math.max(0, start - 120), start);
  const nextContext = fullText.slice(end, Math.min(fullText.length, end + 120));
  const nearbyContext = `${prevContext} ${nextContext}`;

  const hasFemaleClue = FEMALE_SPEAKER_CLUES.test(nearbyContext);
  const hasMaleClue = MALE_SPEAKER_CLUES.test(nearbyContext);

  if (hasFemaleClue && !hasMaleClue) {
    return 'female';
  }
  if (hasMaleClue && !hasFemaleClue) {
    return 'male';
  }

  return fallbackGender;
};
/**
 * 텍스트 내에서 인용구(대화문)의 시작/끝 인덱스를 추출하여 지문과 대화문 세그먼트 배열로 분할합니다.
 * @param text - 분할할 전체 이벤트 본문 텍스트
 * @param speakerGender - 이벤트 등장인물/화자의 성별 (기본값: 'narrator')
 * @returns 순서대로 정렬된 지문 및 대화문 세그먼트 배열
 */
export const splitNarrativeAndDialogue = (
  text: string,
  speakerGender: SpeakerGender = 'narrator'
): DialogueSegment[] => {
  if (!text || text.trim().length === 0) {
    return [];
  }

  // 혹시 텍스트 끝에 남아있을 수 있는 성별 메타데이터 마커 및 파이프 기호 제거
  const cleanedText = text
    .replace(/(?:\|{1,3}\s*)?GENDER:[A-Za-z_]+(?:\b|(?=["'\s]))/gi, '')
    .replace(/\s*\|{2,}\s*/g, ' ')
    .replace(/\s*\|\s*$/g, '')
    .trim();

  if (cleanedText.length === 0) {
    return [];
  }

  const trimmedText = cleanedText;

  // 1. 대화문으로 간주할 인용구 위치(start, end, content) 수집
  type MatchRange = {
    start: number;
    end: number;
    content: string;
  };

  const matches: MatchRange[] = [];

  for (const pattern of DIALOGUE_PAIR_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null = pattern.exec(trimmedText);

    while (match !== null) {
      const fullMatch = match[0] ?? '';
      const dialogueContent = (match[1] ?? '').trim();

      // 인용구 내부가 너무 짧거나(공백만 있음) 기호뿐인 경우는 제외
      if (dialogueContent.length > 0) {
        // 작은따옴표 패턴의 경우 앞선 공백이 포함될 수 있으므로 실제 따옴표 시작 인덱스 보정
        const quoteStartIndex = fullMatch.indexOf(match[1] ?? '') - 1;
        const actualStart = match.index + Math.max(0, quoteStartIndex);
        const actualEnd = actualStart + dialogueContent.length + 2;

        matches.push({
          start: actualStart,
          end: Math.min(trimmedText.length, actualEnd),
          content: dialogueContent
        });
      }

      match = pattern.exec(trimmedText);
    }
  }

  // 매칭된 인용구가 없다면 전체를 지문(narration)으로 반환
  if (matches.length === 0) {
    return [
      {
        id: 'seg-narration-0',
        type: 'narration',
        text: trimmedText,
        speakerGender: 'narrator'
      }
    ];
  }

  // 2. 인덱스 순서대로 정렬하고 겹치는(중복) 구간 제거
  matches.sort((a, b) => a.start - b.start);

  const nonOverlappingMatches: MatchRange[] = [];
  let lastEnd = -1;

  for (const m of matches) {
    if (m.start >= lastEnd) {
      nonOverlappingMatches.push(m);
      lastEnd = m.end;
    }
  }

  // 3. 지문과 대화문을 번갈아 가며 세그먼트 구성
  const segments: DialogueSegment[] = [];
  let currentIndex = 0;
  let segCounter = 0;

  for (const dialogue of nonOverlappingMatches) {
    // 대화문 앞의 지문 추가
    if (dialogue.start > currentIndex) {
      const narrationText = trimmedText.slice(currentIndex, dialogue.start).trim();
      if (narrationText.length > 0) {
        segments.push({
          id: `seg-narration-${segCounter++}`,
          type: 'narration',
          text: narrationText,
          speakerGender: 'narrator'
        });
      }
    }

    const segmentGender = resolveSegmentGender(
      dialogue.start,
      dialogue.end,
      trimmedText,
      speakerGender
    );

    // 대화문 추가
    segments.push({
      id: `seg-dialogue-${segCounter++}`,
      type: 'dialogue',
      text: dialogue.content,
      speakerGender: segmentGender
    });


    currentIndex = dialogue.end;
  }

  // 마지막 대화문 뒤의 잔여 지문 추가
  if (currentIndex < trimmedText.length) {
    const trailingNarration = trimmedText.slice(currentIndex).trim();
    if (trailingNarration.length > 0) {
      segments.push({
        id: `seg-narration-${segCounter++}`,
        type: 'narration',
        text: trailingNarration,
        speakerGender: 'narrator'
      });
    }
  }

  return segments;
};
