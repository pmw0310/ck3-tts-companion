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

/** 대화문으로 볼지 인라인 강조(용어/별칭/칭호)로 볼지 판별하는 최소 대사 길이 기준 (12자 이하 단문 중 종결부호 없는 명사구는 지문에 유지) */
const INLINE_EMPHASIS_MAX_LENGTH = 14;

/** 대화문임을 확정하는 문장 종결/호격/감탄 패턴 */
const DIALOGUE_SENTENCE_CLUE_REGEX =
  /[.!?…~]$|(?:다|요|까|네|오|소|라|자|지|군|구나|구먼|구려|느냐|리라|도다|소서|시지요|십시오|시오|거라|어라|아라|렴|마|야|아|여|시여)$/;

/**
 * 따옴표 내부 텍스트가 실제 인물의 발화(대화문)인지, 아니면 문장 중간에 삽입된 단순 별칭·강조 어구(예: '장경', "붉은 사자")인지 판별합니다.
 * - 문장 중간의 짧은 별칭이나 강조 어구를 대화문으로 쪼개면 한 문장이 [사관] -> [인물] -> [사관] 3토막으로 갈라져
 *   한 문장이 이어진다는 느낌이 완전히 파괴됩니다.
 * @param content - 따옴표 내부 텍스트
 * @param matchStart - 전체 문장에서 여는 따옴표 위치
 * @param matchEnd - 전체 문장에서 닫는 따옴표 다음 위치
 * @param fullText - 전체 텍스트
 * @returns 실제 대화문 여부
 */
const isActualSpokenDialogue = (
  content: string,
  matchStart: number,
  matchEnd: number,
  fullText: string
): boolean => {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return false;
  }

  // 1) 닫는 따옴표 바로 뒤에 공백 없이 한국어 조사/어미(의, 이, 가, 을, 를, 은, 는, 에, 로, 와, 과, 마저, 조차, 만, 도, 이라, 라 등)가 직결된 경우:
  //    예: "'엽사'의 별칭을 가진", '"철혈"이라 불리는', "'제국의 방패'를 하사했다" -> 100% 문장 내 인라인 명사구이므로 지문으로 유지!
  const afterChar = fullText.slice(matchEnd, matchEnd + 4);
  if (/^(?:의|이|가|을|를|은|는|에서|에게|에|으로|로|와|과|도|만|마저|조차|부터|까지|이라|라|이란|란|이며|며|이고|고|이나|나|인)(?=\s|[,.!?]|$)/.test(afterChar)) {
    return false;
  }

  // 2) 길이가 15자 이상이거나 내부에 종결 부호(. ! ? …)나 서술어/종결어미가 있으면 실제 대사로 인정
  if (trimmed.length > INLINE_EMPHASIS_MAX_LENGTH || DIALOGUE_SENTENCE_CLUE_REGEX.test(trimmed)) {
    return true;
  }

  // 3) 문장 맨 앞(또는 앞 문장 종결 직후)에서 시작하고 뒤에도 조사 결합이 없는 경우 대사로 인정 (예: '"도망쳐라!"', '"안 돼"')
  const beforeSlice = fullText.slice(0, matchStart).trim();
  const isAtSentenceBoundary =
    beforeSlice.length === 0 || /[.!?。！？\n]$/.test(beforeSlice);
  const afterSlice = fullText.slice(matchEnd).trim();
  const isFollowedBySentenceEnd =
    afterSlice.length === 0 || /^[.!?。！？\n]/.test(afterSlice);

  if (isAtSentenceBoundary && isFollowedBySentenceEnd) {
    return true;
  }

  // 4) 문장 한가운데에 끼어 있는 짧은 단어/어구(예: 그는 '왕국의 수호자' 칭호를 얻었다)는 문장 단절 방지를 위해 지문(narration)에 통합
  return false;
};

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
      const rawInner = match[1] ?? '';
      const dialogueContent = rawInner.trim();

      // 인용구 내부가 비어있지 않고 실제 발화 대사인 경우만 대화문으로 분리 (문장 내 짧은 별칭/강조 어구는 지문 유지)
      if (dialogueContent.length > 0) {
        // 작은따옴표 패턴의 경우 앞선 공백이 포함될 수 있으므로 실제 따옴표 시작 인덱스 보정
        const quoteStartIndex = fullMatch.indexOf(rawInner) - 1;
        const actualStart = match.index + Math.max(0, quoteStartIndex);
        const actualEnd = Math.min(trimmedText.length, actualStart + rawInner.length + 2);

        if (isActualSpokenDialogue(dialogueContent, actualStart, actualEnd, trimmedText)) {
          matches.push({
            start: actualStart,
            end: actualEnd,
            content: dialogueContent
          });
        }
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
