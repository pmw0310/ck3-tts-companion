import type { TtsProviderType } from '@/shared/types';

/**
 * 띄어쓰기(단어) 경계를 보존하며 지정된 최대 길이 이내로 분할합니다.
 * @param text - 분할할 텍스트
 * @param maxLength - 최대 허용 글자 수
 * @returns 분할된 단어 묶음 배열
 */
const splitByWords = (text: string, maxLength: number): string[] => {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length <= 1) {
    return [text];
  }

  const result: string[] = [];
  let current = '';

  for (const word of words) {
    if (current.length === 0) {
      current = word;
    } else if (current.length + word.length + 1 <= maxLength) {
      current = `${current} ${word}`;
    } else {
      result.push(current);
      current = word;
    }
  }

  if (current.length > 0) {
    result.push(current);
  }

  return result;
};

/** 한국어 자연스러운 절(Clause) 연결 어미 뒤 공백 분할 정규식 (문맥 파편화 없이 긴 문장을 2등분할 때만 사용) */
const KOREAN_CLAUSE_CONNECTIVE_SPLIT_REGEX =
  /(?<=[가-힣]+(?:하며|하고|하여|해서|지만|으나|는데|면서|므로|자면|더니|다가|도록|거나|든지|거든|건만|길래|느라|려고|아서|어서|여서|니까|므로써))\s+/;

/**
 * 긴 문장을 문맥과 억양 흐름이 깨지지 않도록 최소 침습으로 분할합니다.
 * - 기존처럼 55자마다 어절(띄어쓰기)이나 쉼표 단위로 잘게 쪼개면 한 문장 안에서 TTS 억양이 초기화되어
 *   문장이 이어지지 않고 뚝뚝 끊기는(Staccato) 현상이 발생합니다.
 * - 따라서 110자 이하의 일반 문장은 절대 쪼개지 않고 온전한 1개 문장으로 보존합니다.
 * - 110자를 초과하는 초장문 복합문에 한해서만 쉼표/세미콜론/콜론 또는 한국어 연결 어미 경계에서 큼직한 절 단위로 나눕니다.
 * @param sentence - 분할할 단일 문장
 * @param maxClauseLength - 한 구절의 최대 권장 길이 (기본: 110자)
 * @returns 호흡 단위 구절들의 배열
 */
export const splitLongSentenceIntoClauses = (
  sentence: string,
  maxClauseLength = 110
): string[] => {
  const trimmed = sentence.trim();
  if (trimmed.length <= maxClauseLength) {
    return [trimmed];
  }

  // 1. 쉼표(,), 세미콜론(;), 콜론(:), 닫는 따옴표/괄호 등 문장 내 명시적 휴지(pause) 부호 기준 1차 분할
  const clauseParts = trimmed
    .split(/(?<=[,，、;；:：])\s+|(?<=[”"’'」』\)])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (clauseParts.length > 1) {
    const result: string[] = [];
    let current = '';

    for (const part of clauseParts) {
      if (current.length === 0) {
        current = part;
      } else if (current.length + part.length + 1 <= maxClauseLength) {
        current = `${current} ${part}`;
      } else {
        result.push(current);
        current = part;
      }
    }
    if (current.length > 0) {
      result.push(current);
    }

    // 만약 분할된 결과 중 여전히 maxClauseLength * 1.4를 넘는 초장문 구절이 있다면 연결어미/어절 단위로 2차 분할
    const refined: string[] = [];
    for (const res of result) {
      if (res.length > maxClauseLength * 1.4) {
        refined.push(...splitByConnectivesOrWords(res, maxClauseLength));
      } else {
        refined.push(res);
      }
    }
    return refined;
  }

  // 2. 쉼표나 휴지 부호가 없는 무구두점 초장문인 경우: 한국어 연결 어미 경계를 우선 탐색하고, 없을 때만 어절 단위로 분할
  return splitByConnectivesOrWords(trimmed, maxClauseLength);
};

/**
 * 구두점이 없는 긴 문장을 한국어 연결어미(`~하며`, `~하고`, `~하여` 등) 경계에서 우선 분할하고,
 * 여전히 길 경우에만 띄어쓰기 경계로 분할합니다.
 * @param text - 분할할 텍스트
 * @param maxLength - 최대 허용 길이
 * @returns 분할된 구절 배열
 */
const splitByConnectivesOrWords = (text: string, maxLength: number): string[] => {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) {
    return [trimmed];
  }

  const connectiveParts = trimmed
    .split(KOREAN_CLAUSE_CONNECTIVE_SPLIT_REGEX)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (connectiveParts.length > 1) {
    const merged: string[] = [];
    let current = '';

    for (const part of connectiveParts) {
      if (current.length === 0) {
        current = part;
      } else if (current.length + part.length + 1 <= maxLength) {
        current = `${current} ${part}`;
      } else {
        merged.push(current);
        current = part;
      }
    }
    if (current.length > 0) {
      merged.push(current);
    }

    const finalChunks: string[] = [];
    for (const item of merged) {
      if (item.length > maxLength) {
        finalChunks.push(...splitByWords(item, maxLength));
      } else {
        finalChunks.push(item);
      }
    }
    return finalChunks;
  }

  return splitByWords(trimmed, maxLength);
};

/**
 * 긴 텍스트를 자연스러운 낭독 호흡 단위의 완결된 문장 배열로 분할합니다.
 * - 마침표, 느낌표, 물음표, 줄바꿈을 기준으로 분리하되, 줄임표(`...`, `…`) 내부나 약어/숫자 소수점은 문장 끝으로 오인하지 않도록 보호합니다.
 * - 35자 미만의 짧은 단문은 다음 문장과 병합하여 문장이 뚝뚝 끊기는 현상을 방지하고 유려한 사관 내레이션 흐름을 보장합니다.
 * @param text - 원본 텍스트
 * @returns 분할된 문장들의 배열
 */
export const splitIntoSentences = (text: string): string[] => {
  if (!text || text.trim().length === 0) {
    return [];
  }

  // 줄바꿈 및 종결 문장 부호(. ! ? \n) 기준 분할 (줄임표 '...' 한가운데 분할 방지 및 닫는 따옴표 보존)
  const rawParts = text
    .split(/(?<=[.!?。！？\n])(?![.!?。！？])(?:\s+|(?=[“"‘'「『]))/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (rawParts.length <= 1) {
    return [text.trim()];
  }

  const sentences: string[] = [];
  let currentSentence = '';

  for (const part of rawParts) {
    if (currentSentence.length === 0) {
      currentSentence = part;
    } else if (
      currentSentence.length < 35 &&
      currentSentence.length + part.length + 1 <= 130
    ) {
      // 35자 미만의 짧은 문장은 어색한 단절(뚝뚝 끊김)을 방지하기 위해 다음 문장과 자연스럽게 이어 붙임
      currentSentence = `${currentSentence} ${part}`;
    } else {
      sentences.push(currentSentence);
      currentSentence = part;
    }
  }

  if (currentSentence.length > 0) {
    // 마지막 남은 문장이 20자 미만으로 너무 짧고 앞 문장과 합쳐도 140자 이하라면 앞 문장에 병합
    if (
      sentences.length > 0 &&
      currentSentence.length < 20 &&
      sentences[sentences.length - 1]!.length + currentSentence.length + 1 <= 140
    ) {
      sentences[sentences.length - 1] = `${sentences[sentences.length - 1]!} ${currentSentence}`;
    } else {
      sentences.push(currentSentence);
    }
  }

  return sentences;
};

/**
 * TTS 제공자에 맞추어 문장 본연의 호흡(Prosody)을 해치지 않으면서 첫 음성 재생 레이턴시(Fast-Start)와
 * 문장 연결감을 동시에 만족하는 최적 크기의 낭독 청크 배열로 분할합니다.
 * - 한 문장을 무리하게 25~50자로 토막 내지 않고, 완결된 문장(최대 110~120자)을 온전히 유지하여 한 문장이 매끄럽게 이어지도록 합니다.
 * - 마침표가 끝에만 있는 110자 초과 초장문에 한해서만 첫 번째 절(55자 안팎)을 분리하여 초기 재생 지연을 방지하고,
 *   이후 문장들은 130~200자 단위의 호흡 블록으로 묶어 성우가 자연스러운 억양으로 낭독하도록 구성합니다.
 * @param text - 원본 낭독 텍스트
 * @param provider - TTS 제공자 ('edge' | 'system' | 'gemini' | 'openai' | 'elevenlabs')
 * @returns 재생용 청크 배열
 */
export const splitIntoPlaybackChunks = (
  text: string,
  provider: TtsProviderType
): string[] => {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const trimmed = text.trim();
  // 90자 이하의 일반 문장/단락은 어떤 프로바이더든 분할 없이 단일 청크로 한 번에 매끄럽게 낭독
  if (trimmed.length <= 90) {
    return [trimmed];
  }

  // 1단계: 마침표, 느낌표, 물음표, 줄바꿈 기준 완결 문장 분할 (짧은 단문 병합 포함)
  const rawSentences = splitIntoSentences(trimmed);

  // 2단계: 첫 문장이 95자를 초과하는 초장문인 경우에만 Fast-Start를 위해 첫 절을 55자 내외로 분리하고,
  //        나머지 일반 문장은 120자를 초과할 때만 큼직한 절(110자) 단위로 분리하여 문장 허리가 끊기지 않게 보호
  const allClauses: string[] = [];
  for (let idx = 0; idx < rawSentences.length; idx++) {
    const s = rawSentences[idx]!;
    if (idx === 0 && s.length > 95) {
      const firstSentenceClauses = splitLongSentenceIntoClauses(s, 55);
      if (firstSentenceClauses.length > 2) {
        // 첫 절(55자 이내)만 빠르게 발화하고, 같은 문장의 나머지 뒷부분은 다시 하나로 합쳐 문장 연결감 보존
        const firstHead = firstSentenceClauses[0]!;
        const restMerged = firstSentenceClauses.slice(1).join(' ');
        allClauses.push(firstHead);
        if (restMerged.length > 130) {
          allClauses.push(...splitLongSentenceIntoClauses(restMerged, 115));
        } else {
          allClauses.push(restMerged);
        }
      } else {
        allClauses.push(...firstSentenceClauses);
      }
    } else if (s.length > 125) {
      allClauses.push(...splitLongSentenceIntoClauses(s, 115));
    } else {
      allClauses.push(s);
    }
  }

  if (allClauses.length <= 1) {
    return allClauses;
  }

  // 3단계: 첫 번째 청크 구성 (완결된 첫 문장 또는 초장문의 첫 절)
  const chunks: string[] = [];
  let firstChunk = allClauses[0]!;
  let startIndex = 1;

  // 첫 문장이 35자 미만으로 짧고 두 번째 문장과 합쳐도 90자 이하라면 함께 묶어 첫 발화의 자연스러운 호흡 확보
  if (
    allClauses.length >= 2 &&
    firstChunk.length < 35 &&
    firstChunk.length + allClauses[1]!.length + 1 <= 90
  ) {
    firstChunk = `${firstChunk} ${allClauses[1]!}`;
    startIndex = 2;
  }
  chunks.push(firstChunk);

  // 4단계: 후속 문장들을 프로바이더별 최적 호흡 단위로 병합
  // - Edge-TTS: 기존처럼 문장마다 낱개로 쪼개지 않고 135자 내외(완결된 2~3문장)로 묶어 문장 간 어색한 끊김 해소
  // - 시스템(로컬) TTS: 120자 단위로 묶어 연속 재생
  // - Gemini / OpenAI / ElevenLabs: 클라우드 고품질 모델의 문맥 억양 보존 및 Rate Limit 절약을 위해 180자 단위로 넉넉히 묶음
  const maxFollowupChunkLength =
    provider === 'gemini' || provider === 'openai' || provider === 'elevenlabs'
      ? 180
      : provider === 'edge'
        ? 135
        : 120;

  let buffer = '';
  for (let i = startIndex; i < allClauses.length; i++) {
    const clause = allClauses[i]!;
    if (buffer.length === 0) {
      buffer = clause;
    } else if (buffer.length + clause.length + 1 <= maxFollowupChunkLength) {
      buffer = `${buffer} ${clause}`;
    } else {
      chunks.push(buffer);
      buffer = clause;
    }
  }
  if (buffer.length > 0) {
    chunks.push(buffer);
  }

  return chunks;
};
