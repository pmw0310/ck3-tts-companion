import test from 'node:test';
import assert from 'node:assert/strict';
import {
  splitIntoPlaybackChunks,
  splitIntoSentences,
  splitLongSentenceIntoClauses
} from '@/shared/sentenceSplitter';
import { splitNarrativeAndDialogue } from '@/shared/narrativeDialogueSplitter';

/**
 * TTS 문장 연결성(Prosody Continuity) 보존 및 초장문 저지연(Fast-Start) 청크 분할 검증
 */
test('TTS 청크 분할 및 재생 레이턴시 최적화 검증', async (t) => {
  const shortText = '폐하, 국경 지대에서 반란이 일어났습니다.';
  const duelText = `상대에게 달려들며 장검을 거칠게 내질렀다. 이대로 죽을지도 모르는 일 아닌가. 그러니 격렬한 기세로 싸우겠노라. 죽음을 각오한 열의로 에렌스트를 쓰러뜨리겠노라. 에렌스트가 빠르게 그어버렸다가 세차게 베어버리기를 반복하면서 유려한 연격을 선보였다. 이어지는 공격에 조금씩 뒤로 물러설 수밖에 없었다. 실수를 좀 저지르긴 했어도 내 솜씨는 나쁘지 않았으며, 에렌스트의 방어 태세는 믿기지 않을 만치 놀라웠다. 상대를 불리한 형국으로 몰아세우는 데 성공했다. 이대로 승리를 굳혀야만 했다.`;

  await t.test('1. 단일 문장 및 90자 이하 일반 문장은 분할 없이 1개 청크로 한 번에 이어서 낭독', () => {
    const edgeChunks = splitIntoPlaybackChunks(shortText, 'edge');
    assert.equal(edgeChunks.length, 1);
    assert.equal(edgeChunks[0], shortText);

    const geminiChunks = splitIntoPlaybackChunks(shortText, 'gemini');
    assert.equal(geminiChunks.length, 1);
    assert.equal(geminiChunks[0], shortText);

    // 70~85자 수준의 일반적인 복문도 허리가 쪼개지지 않고 1개 청크로 온전히 유지되어야 함
    const mediumSentence =
      '실수를 좀 저지르긴 했어도 내 솜씨는 나쁘지 않았으며, 에렌스트의 방어 태세는 믿기지 않을 만치 놀라웠다.';
    assert.equal(splitIntoPlaybackChunks(mediumSentence, 'edge').length, 1);
    assert.equal(splitIntoPlaybackChunks(mediumSentence, 'gemini').length, 1);
    assert.equal(splitLongSentenceIntoClauses(mediumSentence).length, 1);
  });

  await t.test('2. Edge-TTS는 짧은 단문들을 무리하게 낱개로 쪼개지 않고 자연스러운 문장 호흡 단위로 묶어 연결감 유지', () => {
    const edgeChunks = splitIntoPlaybackChunks(duelText, 'edge');
    // 기존에는 9개 이상의 파편으로 잘게 쪼개져 한 문장이 이어지지 않고 끊겼으나,
    // 이제 완결된 문장 단위로 병합되어 2~4개의 매끄러운 호흡 청크로 구성되어야 함
    assert.ok(
      edgeChunks.length >= 2 && edgeChunks.length <= 4,
      `Edge-TTS 청크가 지나치게 잘게 쪼개지지 않고 2~4개로 자연스럽게 묶여야 합니다 (현재: ${edgeChunks.length}개)`
    );
    // 각 청크는 문장 중간 어절에서 끊기지 않고 마침표('.')로 완결되어야 함
    for (const chunk of edgeChunks) {
      assert.ok(
        chunk.endsWith('.'),
        `각 청크는 문장 중간이 아닌 온전한 문장 종결부호로 끝나야 합니다: "${chunk}"`
      );
    }
  });

  await t.test('3. Gemini TTS는 첫 재생 레이턴시를 위해 첫 문장 호흡을 분리하고 이후 문장을 넉넉히 묶음', () => {
    const geminiChunks = splitIntoPlaybackChunks(duelText, 'gemini');

    // 1) 전체 청크 수가 효율적으로 묶여야 함 (2~4개)
    assert.ok(
      geminiChunks.length >= 2 && geminiChunks.length <= 4,
      `Gemini 청크 개수가 효율적으로 묶여야 합니다 (현재: ${geminiChunks.length}개)`
    );

    // 2) 첫 번째 청크는 첫 문장 호흡으로 80자 미만이어야 즉시 재생 시작 가능!
    const firstChunk = geminiChunks[0]!;
    assert.ok(
      firstChunk.includes('상대에게 달려들며 장검을 거칠게 내질렀다.'),
      '첫 번째 청크에 첫 문장이 포함되어야 합니다.'
    );
    assert.ok(
      firstChunk.length < 85,
      `첫 번째 청크 길이가 적절해야 Fast-Start가 가능합니다 (현재: ${firstChunk.length}자)`
    );

    // 3) 모든 문장 텍스트가 유실 없이 포함되어 있는지 검증
    const combined = geminiChunks.join(' ');
    assert.ok(combined.includes('이대로 승리를 굳혀야만 했다.'));
    assert.ok(combined.includes('에렌스트의 방어 태세는 믿기지 않을 만치 놀라웠다.'));
  });

  await t.test('4. 시스템 로컬 TTS(system)는 90자 이하 단문은 1청크, 긴 본문은 문장 호흡 단위로 청킹 수행', () => {
    // 1) 90자 이하 단문은 1개 청크로 일괄 유지
    const shortChunks = splitIntoPlaybackChunks(shortText, 'system');
    assert.equal(shortChunks.length, 1);
    assert.equal(shortChunks[0], shortText);

    // 2) 긴 본문은 첫 문장 호흡(Fast-Start) + 후속 묶음 청크로 분할
    const sysChunks = splitIntoPlaybackChunks(duelText, 'system');
    assert.ok(sysChunks.length >= 2, '긴 본문은 2개 이상의 청크로 분할되어야 합니다.');

    // 첫 청크는 85자 미만이어야 빠른 발화 가능
    assert.ok(sysChunks[0]!.length < 85);
    assert.ok(sysChunks[0]!.includes('상대에게 달려들며 장검을 거칠게 내질렀다.'));

    // 본문 전체 내용 무손실 보존
    const fullText = sysChunks.join(' ');
    assert.ok(fullText.includes('이대로 승리를 굳혀야만 했다.'));
  });

  await t.test('5. [초장문 지연 방어 & 뒷문장 결합] 마침표가 끝에만 있는 120자 이상 단일 초장문은 첫 절만 55자 이내로 분리하고 뒷부분은 하나로 이어 읽어야 함', () => {
    const longSingleSentence =
      '위대한 수도 경주는 태봉의 수많은 요구로 인해 몸살을 앓고 있으며 최근 벌어진 갈등으로 상당한 피해가 발생하여 신병 모집관은 할당량을 채우기 힘들어하고 도시 전역에서 노동력 부족으로 인한 문제가 빈번히 나타나고 있습니다.';

    // 1) 시스템(로컬) TTS 검증: 120자 초장문도 첫 청크가 55자 이내로 분리되고, 뒷부분은 산산조각 나지 않고 이어져야 함
    const sysChunks = splitIntoPlaybackChunks(longSingleSentence, 'system');
    assert.equal(
      sysChunks.length,
      2,
      `120자 단일 초장문은 첫 절(Fast-Start)과 나머지 본문 2개 청크로 깔끔하게 나뉘어야 합니다 (현재: ${sysChunks.length}개)`
    );
    assert.ok(
      sysChunks[0]!.length <= 55,
      `첫 번째 청크는 1초 내 즉각 재생을 위해 55자 이내여야 합니다 (현재: ${sysChunks[0]!.length}자: "${sysChunks[0]}")`
    );
    assert.ok(
      sysChunks.join(' ').includes('노동력 부족으로 인한 문제가 빈번히 나타나고 있습니다.'),
      '전체 문장 텍스트가 유실 없이 보존되어야 합니다.'
    );

    // 2) Edge-TTS 검증: Edge-TTS 역시 초장문일 때 첫 청크가 55자 이내이고 나머지가 하나로 이어져야 함
    const edgeChunks = splitIntoPlaybackChunks(longSingleSentence, 'edge');
    assert.equal(edgeChunks.length, 2);
    assert.ok(
      edgeChunks[0]!.length <= 55,
      `Edge-TTS 첫 청크도 55자 이내여야 합니다 (현재: ${edgeChunks[0]!.length}자)`
    );
  });

  await t.test('6. [문장 단절 방지] 줄임표(...)가 포함된 문장이나 문장 내 짧은 별칭 따옴표(\'장경\')에서 문장이 쪼개지지 않아야 함', () => {
    // 1) 줄임표(...) 뒤에서 문장이 조각나지 않고 한 문장으로 이어져야 함
    const ellipsisText = '어두운 밤하늘 아래... 누군가 성문을 두드렸다.';
    const sentences = splitIntoSentences(ellipsisText);
    assert.equal(sentences.length, 1, '줄임표나 짧은 앞 구절은 다음 문장과 하나로 이어져야 합니다.');
    assert.equal(sentences[0], ellipsisText);

    // 2) 문장 중간에 작은따옴표/큰따옴표로 별칭이나 칭호가 들어간 경우 대화문으로 오인해 3토막 내지 않아야 함
    const nicknameSentence = "적장 '장경' 자현의 잘린 머리를 창끝에 매달고 개선했다.";
    const segments = splitNarrativeAndDialogue(nicknameSentence, 'male');
    assert.equal(
      segments.length,
      1,
      "문장 중간의 짧은 별칭('장경') 때문에 한 문장이 3토막으로 쪼개져서는 안 됩니다."
    );
    assert.equal(segments[0]?.type, 'narration');
  });
});
