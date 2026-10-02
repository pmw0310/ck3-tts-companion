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
