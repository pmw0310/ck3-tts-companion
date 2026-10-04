import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractCk3EventsFromChunk, sanitizeCk3Text } from '../src/main/textSanitizer';
import { splitIntoPlaybackChunks } from '../src/shared/sentenceSplitter';
import type { SpeakerGender } from '../src/shared/types';

describe('편지 이벤트(letter_event) 1인 발신자 단일 보이스 라우팅 및 태그 정제 검증', () => {
  it('1. 편지 이벤트 여성 발신자 로그 파싱 시 eventType: letter 및 female 성별 인식 검증', () => {
    const rawLetterLog = `[12:00:00][jomini_script_system.cpp:278]: Script Log: [CK3_TTS]|||귀부인의 답장|||친애하는 영주님께. 보내주신 서신은 잘 읽었습니다. 우리의 동맹은 영원할 것입니다.|||GENDER:LETTER_F##CK3_TTS_END##"`;

    const chunks = extractCk3EventsFromChunk(rawLetterLog);
    assert.strictEqual(chunks.length, 1, '1개의 이벤트 청크가 추출되어야 함');

    const event = chunks[0]!;
    assert.strictEqual(event.title, '귀부인의 답장', '제목 추출 정상');
    assert.strictEqual(event.eventType, 'letter', '이벤트 타입이 letter여야 함');
    assert.strictEqual(event.speakerGender, 'female', '발신자 성별이 female로 인식되어야 함');
    assert.ok(!event.content.includes('GENDER'), 'GENDER 태그가 본문에 남아있지 않아야 함');
    assert.ok(!event.content.includes('CK3_TTS_END'), 'CK3_TTS_END 마커가 본문에 남아있지 않아야 함');
    assert.ok(!event.content.endsWith('"'), '끝 따옴표 노이즈가 제거되어야 함');
    assert.strictEqual(
      event.content,
      '친애하는 영주님께. 보내주신 서신은 잘 읽었습니다. 우리의 동맹은 영원할 것입니다.'
    );
  });

  it('2. 편지 이벤트 남성 발신자 로그 파싱 시 eventType: letter 및 male 성별 인식 검증', () => {
    const rawLetterLog = `[12:01:00][jomini_script_system.cpp:278]: Script Log: [CK3_TTS]|||선전포고|||오만한 군주여, 당신의 폭정은 이제 끝이다. 전장에서 결판을 내자.|||GENDER:LETTER_M##CK3_TTS_END##"`;

    const chunks = extractCk3EventsFromChunk(rawLetterLog);
    assert.strictEqual(chunks.length, 1, '1개의 이벤트 청크가 추출되어야 함');

    const event = chunks[0]!;
    assert.strictEqual(event.title, '선전포고', '제목 추출 정상');
    assert.strictEqual(event.eventType, 'letter', '이벤트 타입이 letter여야 함');
    assert.strictEqual(event.speakerGender, 'male', '발신자 성별이 male로 인식되어야 함');
    assert.ok(!event.content.includes('GENDER'), 'GENDER 태그가 본문에 남아있지 않아야 함');
    assert.strictEqual(
      event.content,
      '오만한 군주여, 당신의 폭정은 이제 끝이다. 전장에서 결판을 내자.'
    );
  });

  it('3. sanitizeCk3Text 단독 호출 시에도 LETTER_F/LETTER_M 태그 완벽 정제 검증', () => {
    const dirtyText = '편지 내용입니다.|||GENDER:LETTER_F##CK3_TTS_END##';
    const cleaned = sanitizeCk3Text(dirtyText);
    assert.strictEqual(cleaned, '편지 내용입니다.');
    assert.ok(!cleaned.includes('GENDER'), 'GENDER가 정제되어야 함');
  });

  it('4. [핵심 라우팅 로직] 편지는 따옴표가 있든 없든 사관과 교차하지 않고 발신자 단일 보이스로 전체 완독', () => {
    // 렌더러의 편지 라우팅 알고리즘 모의 검증
    const resolveVoiceAndPromptForSegment = (
      _type: 'narration' | 'dialogue',
      gender?: SpeakerGender
    ) => {
      if (gender === 'female') {
        return { voice: 'Kore', prompt: 'female_noble' };
      }
      if (gender === 'male') {
        return { voice: 'Charon', prompt: 'male_lord' };
      }
      return { voice: 'Algenib', prompt: 'narrator' };
    };

    // 편지 본문에 따옴표가 섞여 있어도 (예: 인용구 인용 등)
    const letterContent = '친애하는 친우여. 그가 말하기를 "반드시 승리할 것이다"라고 하였소. 부디 건강하시오.';
    const eventType = 'letter';
    const speakerGender: SpeakerGender = 'female';

    // main.ts의 편지 예외 라우팅 로직
    type PlaybackItem = {
      text: string;
      voiceOverride?: string;
      promptOverride?: string;
    };

    let playbackItems: PlaybackItem[] = [];

    if (eventType === 'letter') {
      const letterVoiceInfo = resolveVoiceAndPromptForSegment('dialogue', speakerGender);
      const chunks = splitIntoPlaybackChunks(letterContent, 'gemini');
      playbackItems = chunks.map((chunk) => ({
        text: chunk,
        voiceOverride: letterVoiceInfo.voice,
        promptOverride: letterVoiceInfo.prompt
      }));
    }

    assert.ok(playbackItems.length > 0, '재생 아이템이 생성되어야 함');
    // 모든 청크가 나레이터가 아닌 오직 여성 발신자 목소리(Kore)로만 설정되어야 함!
    for (const item of playbackItems) {
      assert.strictEqual(item.voiceOverride, 'Kore', '편지의 모든 청크는 발신자 여성 보이스(Kore)여야 함');
      assert.strictEqual(item.promptOverride, 'female_noble', '편지의 어조는 여성 귀족이어야 함');
    }
  });
});
