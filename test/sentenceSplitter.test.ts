import test from 'node:test';
import assert from 'node:assert/strict';
import { splitIntoPlaybackChunks } from '@/shared/sentenceSplitter';

/**
 * Gemini 및 Edge TTS의 저지연(Fast-Start) 청크 분할 알고리즘 검증
 */
test('TTS 청크 분할 및 재생 레이턴시 최적화 검증', async (t) => {
  const shortText = '폐하, 국경 지대에서 반란이 일어났습니다.';
  const duelText = `상대에게 달려들며 장검을 거칠게 내질렀다. 이대로 죽을지도 모르는 일 아닌가. 그러니 격렬한 기세로 싸우겠노라. 죽음을 각오한 열의로 에렌스트를 쓰러뜨리겠노라. 에렌스트가 빠르게 그어버렸다가 세차게 베어버리기를 반복하면서 유려한 연격을 선보였다. 이어지는 공격에 조금씩 뒤로 물러설 수밖에 없었다. 실수를 좀 저지르긴 했어도 내 솜씨는 나쁘지 않았으며, 에렌스트의 방어 태세는 믿기지 않을 만치 놀라웠다. 상대를 불리한 형국으로 몰아세우는 데 성공했다. 이대로 승리를 굳혀야만 했다.`;

  await t.test('1. 단일 문장인 경우 분할 없이 1개 청크 반환', () => {
    const edgeChunks = splitIntoPlaybackChunks(shortText, 'edge');
    assert.equal(edgeChunks.length, 1);
    assert.equal(edgeChunks[0], shortText);

    const geminiChunks = splitIntoPlaybackChunks(shortText, 'gemini');
    assert.equal(geminiChunks.length, 1);
    assert.equal(geminiChunks[0], shortText);
  });

  await t.test('2. Edge-TTS는 자연스러운 문장별 분할 유지', () => {
    const edgeChunks = splitIntoPlaybackChunks(duelText, 'edge');
    assert.ok(edgeChunks.length >= 7, 'Edge-TTS는 개별 문장 단위로 분할되어야 합니다.');
  });

  await t.test('3. Gemini TTS는 첫 재생 레이턴시를 위해 첫 문장을 즉시 청크로 분리하고 이후 문장을 적절히 묶음', () => {
    const geminiChunks = splitIntoPlaybackChunks(duelText, 'gemini');

    // 1) 전체 청크 수가 너무 많지 않아야 함 (Rate Limit 방어, 3~5개)
    assert.ok(
      geminiChunks.length >= 3 && geminiChunks.length <= 5,
      `Gemini 청크 개수가 효율적으로 묶여야 합니다 (현재: ${geminiChunks.length}개)`
    );

    // 2) 첫 번째 청크는 첫 1~2문장으로 60자 안팎이어야 1초대에 즉시 재생 시작 가능!
    const firstChunk = geminiChunks[0]!;
    assert.ok(
      firstChunk.includes('상대에게 달려들며 장검을 거칠게 내질렀다.'),
      '첫 번째 청크에 첫 문장이 포함되어야 합니다.'
    );
    assert.ok(
      firstChunk.length < 80,
      `첫 번째 청크 길이가 짧아야 1초대 Fast-Start가 가능합니다 (현재: ${firstChunk.length}자)`
    );

    // 3) 모든 문장 텍스트가 유실 없이 포함되어 있는지 검증
    const combined = geminiChunks.join(' ');
    assert.ok(combined.includes('이대로 승리를 굳혀야만 했다.'));
    assert.ok(combined.includes('에렌스트의 방어 태세는 믿기지 않을 만치 놀라웠다.'));
  });
});
