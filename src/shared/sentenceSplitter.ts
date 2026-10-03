import type { TtsProviderType } from '@/shared/types';

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
 * - 첫 번째 청크는 1~1.5초 내에 즉시 합성되도록 짧은 첫 문장(40~80자)을 배정합니다.
 * - 이후 청크는 재생 시간 동안 백그라운드에서 완료될 수 있도록 적절한 길이(100~150자)로 묶어 API 호출 횟수를 최소화합니다.
 * @param text - 원본 낭독 텍스트
 * @param provider - TTS 제공자 ('edge' | 'gemini')
 * @returns 재생용 청크 배열
 */
export const splitIntoPlaybackChunks = (
  text: string,
  provider: TtsProviderType
): string[] => {
  const sentences = splitIntoSentences(text);
  if (sentences.length <= 1) {
    return sentences;
  }

  // Edge-TTS는 응답 속도가 매우 빠르므로 기존 문장 단위 분할 유지
  if (provider === 'edge') {
    return sentences;
  }

  // Gemini는 API 왕복 지연시간(RTT) 및 Rate Limit을 최적화하기 위해 스마트 청킹 적용:
  // 청크 1: 첫 문장(또는 35자 미만 시 2문장) -> 1~1.5초 내 즉각 낭독 시작!
  // 청크 2 이후: 120~180자 단위로 묶어 낭독 중 백그라운드 사전 합성
  const chunks: string[] = [];

  let firstChunk = sentences[0]!;
  let startIndex = 1;
  if (sentences.length > 2 && firstChunk.length < 35 && sentences[1]!.length < 45) {
    firstChunk = `${firstChunk} ${sentences[1]!}`;
    startIndex = 2;
  }
  chunks.push(firstChunk);

  let buffer = '';
  for (let i = startIndex; i < sentences.length; i++) {
    const s = sentences[i]!;
    if (buffer.length === 0) {
      buffer = s;
    } else if (buffer.length + s.length < 150) {
      buffer = `${buffer} ${s}`;
    } else {
      chunks.push(buffer);
      buffer = s;
    }
  }
  if (buffer.length > 0) {
    chunks.push(buffer);
  }

  return chunks;
};

