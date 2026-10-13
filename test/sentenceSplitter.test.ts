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

  await t.test('4. 시스템 로컬 TTS(system)는 80자 이하 단문은 1청크, 긴 본문은 Fast-Start 청킹 수행', () => {
    // 1) 80자 이하 단문은 1개 청크로 일괄 유지
    const shortChunks = splitIntoPlaybackChunks(shortText, 'system');
    assert.equal(shortChunks.length, 1);
    assert.equal(shortChunks[0], shortText);

    // 2) 긴 본문은 첫 문장(Fast-Start) + 후속 묶음 청크로 분할
    const sysChunks = splitIntoPlaybackChunks(duelText, 'system');
    assert.ok(sysChunks.length >= 2, '긴 본문은 2개 이상의 청크로 분할되어야 합니다.');

    // 첫 청크는 짧은 문장(80자 미만)이어야 1~2초 내 즉시 발화 가능
    assert.ok(sysChunks[0]!.length < 80);
    assert.ok(sysChunks[0]!.includes('상대에게 달려들며 장검을 거칠게 내질렀다.'));

    // 본문 전체 내용 무손실 보존
    const fullText = sysChunks.join(' ');
    assert.ok(fullText.includes('이대로 승리를 굳혀야만 했다.'));
  });

  await t.test('5. [긴 문장 지연 결함 완치] 마침표가 1개뿐인 120자 이상 장문 및 쉼표 복합문도 첫 청크가 50자 이내로 Fast-Start 분할되어야 함', () => {
    const longSingleSentence =
      '위대한 수도 경주는 태봉의 수많은 요구로 인해 몸살을 앓고 있으며 최근 벌어진 갈등으로 상당한 피해가 발생하여 신병 모집관은 할당량을 채우기 힘들어하고 도시 전역에서 노동력 부족으로 인한 문제가 빈번히 나타나고 있습니다.';

    // 1) 시스템(로컬) TTS 검증: 120자 장문도 첫 청크가 55자 이내로 신속 분리되어야 함
    const sysChunks = splitIntoPlaybackChunks(longSingleSentence, 'system');
    assert.ok(
      sysChunks.length >= 2,
      `마침표가 끝에만 있는 120자 장문도 2개 이상의 청크로 분할되어야 합니다 (현재: ${sysChunks.length}개)`
    );
    assert.ok(
      sysChunks[0]!.length <= 55,
      `첫 번째 청크는 1초 내 즉각 재생을 위해 55자 이내여야 합니다 (현재: ${sysChunks[0]!.length}자: "${sysChunks[0]}")`
    );
    assert.ok(
      sysChunks.join(' ').includes('노동력 부족으로 인한 문제가 빈번히 나타나고 있습니다.'),
      '전체 문장 텍스트가 유실 없이 보존되어야 합니다.'
    );

    // 2) Edge-TTS 검증: Edge-TTS 역시 장문일 때 첫 청크가 55자 이내로 Fast-Start 처리되어야 함
    const edgeChunks = splitIntoPlaybackChunks(longSingleSentence, 'edge');
    assert.ok(edgeChunks.length >= 2);
    assert.ok(
      edgeChunks[0]!.length <= 55,
      `Edge-TTS 첫 청크도 55자 이내여야 합니다 (현재: ${edgeChunks[0]!.length}자)`
    );
  });
});
