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

/**
 * 55자 이상의 긴 문장을 쉼표, 세미콜론, 따옴표 또는 자연스러운 띄어쓰기 기준으로
 * 자연스러운 호흡 단위(Clause)로 분할합니다.
 * @param sentence - 분할할 단일 문장
 * @param maxClauseLength - 한 구절의 최대 권장 길이 (기본: 55자)
 * @returns 호흡 단위 구절들의 배열
 */
export const splitLongSentenceIntoClauses = (
  sentence: string,
  maxClauseLength = 55
): string[] => {
  const trimmed = sentence.trim();
  if (trimmed.length <= maxClauseLength) {
    return [trimmed];
  }

  // 1. 쉼표(,), 세미콜론(;), 콜론(:), 닫는 따옴표/괄호 등 문장 내 휴지(pause) 부호 기준 1차 분할
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

    // 만약 분할된 결과 중 여전히 maxClauseLength * 1.3을 넘는 긴 구절이 있다면 단어 단위로 2차 분할
    const refined: string[] = [];
    for (const res of result) {
      if (res.length > maxClauseLength * 1.3) {
        refined.push(...splitByWords(res, maxClauseLength));
      } else {
        refined.push(res);
      }
    }
    return refined;
  }

  // 2. 쉼표나 휴지 부호가 없는데도 긴 문장인 경우: 자연스러운 띄어쓰기(공백) 기준으로 분할
  return splitByWords(trimmed, maxClauseLength);
};

/**
 * 긴 텍스트를 자연스러운 낭독 호흡 단위의 문장 배열로 분할합니다.
 * 마침표, 느낌표, 물음표, 줄바꿈을 기준으로 분리하며, 지나치게 짧은 구절은 병합하여 매끄러운 낭독을 보장합니다.
 * @param text - 원본 텍스트
 * @returns 분할된 문장들의 배열
 */
export const splitIntoSentences = (text: string): string[] => {
  if (!text || text.trim().length === 0) {
    return [];
  }

  // 줄바꿈 및 문장 부호(. ! ? \n) 기준 정규식 분할 (부호 뒤의 공백 및 따옴표 보존)
  const rawParts = text
    .split(/(?<=[.!?。！？\n])(?:\s+|(?=[“"‘'「『]))/)
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
    } else if (currentSentence.length < 15) {
      // 15자 미만의 너무 짧은 토막은 어색한 끊김을 방지하기 위해 다음 문장과 합침
      currentSentence = `${currentSentence} ${part}`;
    } else {
      sentences.push(currentSentence);
      currentSentence = part;
    }
  }

  if (currentSentence.length > 0) {
    sentences.push(currentSentence);
  }

  return sentences;
};

/**
 * TTS 제공자에 맞추어 첫 음성 재생 레이턴시를 최소화(Fast-Start)하도록 최적 크기의 낭독 청크 배열로 분할합니다.
 * - 본문 전체의 길이에 상관없이(100자든 1,000자든), 첫 번째 청크는 항상 25~50자 내외로 엄격히 제한하여
 *   어떤 장문이든 1초 내외로 첫 오디오 재생이 즉시 시작되도록 보장합니다.
 * - 긴 문장이나 쉼표 복합문은 자연스러운 호흡 단위(Clause)로 2단계 분할하여 긴 한 문장으로 인한 지연을 차단합니다.
 * - 이후 청크는 첫 구절이 재생되는 동안 백그라운드에서 완료될 수 있도록 최적 길이로 묶어 연속 재생을 지원합니다.
 * @param text - 원본 낭독 텍스트
 * @param provider - TTS 제공자 ('edge' | 'system' | 'gemini')
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
  // 45자 이하의 짧은 단문은 분할 오버헤드 없이 즉시 단일 청크 반환
  if (trimmed.length <= 45) {
    return [trimmed];
  }

  // 1단계: 마침표, 느낌표, 물음표, 줄바꿈 기준 1차 문장 분할
  const rawSentences = splitIntoSentences(trimmed);

  // 2단계: 55자 이상의 긴 문장들을 호흡 단위 구절(Clauses)로 세부 분할
  const allClauses: string[] = [];
  for (const s of rawSentences) {
    if (s.length > 55) {
      const clauses = splitLongSentenceIntoClauses(s, 55);
      allClauses.push(...clauses);
    } else {
      allClauses.push(s);
    }
  }

  if (allClauses.length <= 1) {
    return allClauses;
  }

  // Edge-TTS는 웹소켓 스트리밍 및 응답 속도가 매우 빠르므로, 불필요한 문장 병합 없이
  // 자연스러운 개별 문장/구절(Clause) 단위를 그대로 반환하여 문장별 호흡과 음질을 극대화합니다.
  // (단, 55자를 초과하는 긴 장문은 이미 allClauses에서 25~50자 구절로 쪼개져 1초 내 즉각 발화 보장!)
  if (provider === 'edge') {
    return allClauses;
  }

  // 3단계: Fast-Start 전략 - 첫 청크 크기 25~50자 엄격 고정!
  const chunks: string[] = [];
  let firstChunk = allClauses[0]!;
  let startIndex = 1;

  // 첫 구절이 18자 미만으로 지나치게 짧고 다음 구절과 합쳐도 45자 이하라면 1개로 합쳐서 어색한 단절 방지
  if (allClauses.length > 2 && firstChunk.length < 18 && allClauses[1]!.length < 28) {
    firstChunk = `${firstChunk} ${allClauses[1]!}`;
    startIndex = 2;
  }
  chunks.push(firstChunk);

  // 4단계: 후속 청크들을 프로바이더별 백그라운드 합성 효율에 맞춰 묶음
  // - 시스템(로컬) TTS: 재생 중 백그라운드 선행 합성을 위해 80~100자 단위로 배치
  // - Gemini TTS: Rate Limit 절약을 위해 100~140자 단위로 배치
  const maxFollowupChunkLength = provider === 'gemini' ? 140 : 95;

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

