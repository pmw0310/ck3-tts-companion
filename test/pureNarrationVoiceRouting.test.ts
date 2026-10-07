import test from 'node:test';
import assert from 'node:assert/strict';
import { splitNarrativeAndDialogue } from '@/shared/narrativeDialogueSplitter';
import type { AppSettings, SpeakerGender } from '@/shared/types';

/** 테스트용 앱 설정 mock */
const MOCK_SETTINGS: AppSettings = {
  provider: 'gemini',
  edgeVoice: 'ko-KR-SunHiNeural',
  geminiApiKey: 'test-key',
  geminiModel: 'gemini-3.8-flash-tts',
  geminiVoice: 'Algenib', // 사관 나레이터 보이스
  geminiVoiceMale: 'Charon', // 남성 대사 보이스
  geminiVoiceFemale: 'Aoede', // 여성 대사 보이스
  geminiSystemPrompt: 'Narrator prompt',
  speechRate: '+0%',
  speechVolume: '+0%',
  customLogPath: null,
  isAutoPlayEnabled: true,
  isAudioDramaEnabled: true,
  edgeVoiceMale: 'ko-KR-InJoonNeural',
  edgeVoiceFemale: 'ko-KR-SunHiNeural',
  openaiApiKey: '',
  openaiModel: 'tts-1',
  openaiVoice: 'onyx',
  openaiVoiceMale: 'onyx',
  openaiVoiceFemale: 'nova',
  elevenLabsApiKey: '',
  elevenLabsModel: 'eleven_multilingual_v2',
  elevenLabsVoiceId: 'JBFqnCBsd6RMkjVDRZzb',
  elevenLabsVoiceMale: 'JBFqnCBsd6RMkjVDRZzb',
  elevenLabsVoiceFemale: 'Xb7hH8MSUJpSbSDYk0k2',
  elevenLabsStability: 0.5,
  elevenLabsSimilarity: 0.75,
  isCacheEnabled: true,
  maxCacheSizeMb: 500,
  isExecutionSoundEnabled: true,
  executionSoundVolume: 0.8
};

/** main.ts와 동일한 보이스 및 프롬프트 결정 순수 헬퍼 */
const resolveVoiceForSegment = (
  type: 'narration' | 'dialogue',
  gender: SpeakerGender,
  settings: AppSettings
): { voice: string; isNarrator: boolean } => {
  if (type === 'narration' || gender === 'narrator') {
    return { voice: settings.geminiVoice, isNarrator: true };
  }
  if (gender === 'female') {
    return { voice: settings.geminiVoiceFemale, isNarrator: false };
  }
  return { voice: settings.geminiVoiceMale, isNarrator: false };
};

test('따옴표 없는 순수 지문 이벤트의 사관 나레이터 보이스 고정 검증', async (t) => {
  await t.test('1. 사용자 실전 제보 사례: 따옴표 없는 순수 지문은 무조건 사관 나레이터(Algenib)로 라우팅되어야 함', () => {
    const text =
      '내 아내(이)가 자신을 무시하는 누군가가 있다며 또 불만을 터뜨렸다. 이번엔 로칸(이)가 노여움을 산 것 같다. 배우자는 내게 뭔가 조치를 해달라고 부탁하고 있다.\n\n의심 많은 남편(이)라면 지금쯤 그녀가 내 선의를 자기가 좋아하지 않는 이를 숙청하는데 사용한다고 생각할 때도 되었다.';

    // 화자 성별이 female(아내)로 들어오더라도
    const segments = splitNarrativeAndDialogue(text, 'female');

    // 따옴표가 없으므로 100% narration 세그먼트만 생성되어야 함
    assert.equal(segments.length, 1);
    assert.equal(segments[0]?.type, 'narration');
    assert.equal(segments[0]?.speakerGender, 'narrator');

    // 음성 결정 시 사관 나레이터 보이스가 선택되어야 함 (여성 목소리 Aoede X)
    const { voice, isNarrator } = resolveVoiceForSegment(
      segments[0]!.type,
      segments[0]!.speakerGender,
      MOCK_SETTINGS
    );

    assert.equal(voice, 'Algenib', '지문은 여성 목소리가 아닌 기본 사관 나레이터(Algenib)여야 합니다.');
    assert.equal(isNarrator, true);
  });

  await t.test('2. 오직 큰따옴표("...")로 둘러싸인 대사만 남/여 전용 보이스로 분기되어야 함', () => {
    const text = '소여왕 오를라흐가 다가와 말했다. "결코 용납할 수 없소!" 그러자 재상이 머리를 숙였다.';
    const segments = splitNarrativeAndDialogue(text, 'female');

    assert.equal(segments.length, 3);

    // 1구절 (지문) -> 사관 나레이터
    assert.equal(segments[0]?.type, 'narration');
    const seg1 = resolveVoiceForSegment(segments[0]!.type, segments[0]!.speakerGender, MOCK_SETTINGS);
    assert.equal(seg1.voice, 'Algenib');

    // 2구절 (따옴표 대사) -> 여성 목소리(Aoede)
    assert.equal(segments[1]?.type, 'dialogue');
    const seg2 = resolveVoiceForSegment(segments[1]!.type, segments[1]!.speakerGender, MOCK_SETTINGS);
    assert.equal(seg2.voice, 'Aoede');

    // 3구절 (지문) -> 사관 나레이터
    assert.equal(segments[2]?.type, 'narration');
    const seg3 = resolveVoiceForSegment(segments[2]!.type, segments[2]!.speakerGender, MOCK_SETTINGS);
    assert.equal(seg3.voice, 'Algenib');
  });
});
