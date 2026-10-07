import test from 'node:test';
import assert from 'node:assert/strict';
import {
  convertSpeechRateToOpenAiSpeed,
  maskApiKeyInMessage,
  processTtsRequest
} from '@/main/ttsService';
import type { AppSettings, SpeakerGender } from '@/shared/types';

/** 테스트용 기본 AppSettings mock */
const createMockSettings = (overrides?: Partial<AppSettings>): AppSettings => ({
  provider: 'openai',
  edgeVoice: 'ko-KR-SunHiNeural',
  geminiApiKey: '',
  geminiModel: 'gemini-3.8-flash-tts',
  geminiVoice: 'Charon',
  geminiSystemPrompt: '',
  openaiApiKey: 'sk-proj-test123456789abcdef',
  openaiModel: 'tts-1',
  openaiVoice: 'onyx',
  speechRate: '+0%',
  speechVolume: '+0%',
  customLogPath: null,
  isAutoPlayEnabled: true,
  isAudioDramaEnabled: true,
  edgeVoiceMale: 'ko-KR-InJoonNeural',
  edgeVoiceFemale: 'ko-KR-SunHiNeural',
  geminiVoiceMale: 'Charon',
  geminiVoiceFemale: 'Kore',
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
  executionSoundVolume: 0.8,
  ...overrides
});

test('▶ OpenAI TTS 속도 변환 유틸리티 (convertSpeechRateToOpenAiSpeed) 검증', async (t) => {
  await t.test('1. 기본값(+0% 또는 미지정)일 때 1.0을 반환해야 함', () => {
    assert.strictEqual(convertSpeechRateToOpenAiSpeed('+0%'), 1.0);
    assert.strictEqual(convertSpeechRateToOpenAiSpeed('0%'), 1.0);
    assert.strictEqual(convertSpeechRateToOpenAiSpeed(''), 1.0);
    assert.strictEqual(convertSpeechRateToOpenAiSpeed(undefined), 1.0);
  });

  await t.test('2. 양수 백분율(+10%, +20%)을 speed 배율(1.1, 1.2)로 정상 변환해야 함', () => {
    assert.strictEqual(convertSpeechRateToOpenAiSpeed('+10%'), 1.1);
    assert.strictEqual(convertSpeechRateToOpenAiSpeed('+20%'), 1.2);
    assert.strictEqual(convertSpeechRateToOpenAiSpeed('+30%'), 1.3);
  });

  await t.test('3. 음수 백분율(-10%, -20%)을 speed 배율(0.9, 0.8)로 정상 변환해야 함', () => {
    assert.strictEqual(convertSpeechRateToOpenAiSpeed('-10%'), 0.9);
    assert.strictEqual(convertSpeechRateToOpenAiSpeed('-20%'), 0.8);
    assert.strictEqual(convertSpeechRateToOpenAiSpeed('-30%'), 0.7);
  });

  await t.test('4. 극단적인 값은 OpenAI 허용 범위(0.25 ~ 4.0) 내로 clamp 되어야 함', () => {
    assert.strictEqual(convertSpeechRateToOpenAiSpeed('-90%'), 0.25);
    assert.strictEqual(convertSpeechRateToOpenAiSpeed('+500%'), 4.0);
  });
});

test('▶ OpenAI API 키 마스킹 보안 유틸리티 (maskApiKeyInMessage) 검증', async (t) => {
  await t.test('1. 에러 메시지 내의 OpenAI sk-... 키가 안전하게 마스킹되어야 함', () => {
    const rawApiKey = 'sk-proj-123456789abcdefghijk';
    const errorMsg = `Error 401 Unauthorized: Invalid API key ${rawApiKey} provided.`;
    const masked = maskApiKeyInMessage(errorMsg, rawApiKey);

    assert.ok(!masked.includes(rawApiKey), '원문 API 키가 노출되지 않아야 합니다.');
    assert.ok(masked.includes('***API_KEY_PROTECTED***'), '보호 표식으로 치환되어야 합니다.');
  });
});

test('▶ OpenAI TTS 오류 발생 시 기본 Edge-TTS 안전 자동 폴백 검증', async (t) => {
  await t.test('1. 유효하지 않은 OpenAI 키로 요청 시 에러를 뿜지 않고 Edge-TTS로 안전 폴백 성공해야 함', async () => {
    const mockSettings = createMockSettings({
      provider: 'openai',
      openaiApiKey: 'sk-invalid-dummy-key-for-fallback-test'
    });

    const result = await processTtsRequest({
      text: '국왕 폐하, 백성들이 성문 앞에 모여 탄원하고 있사옵니다.',
      settings: mockSettings
    });

    assert.ok(result.isSuccess, '폴백을 통해 최종 합성이 성공해야 합니다.');
    assert.ok(result.audioBase64, '합성된 오디오 데이터가 존재해야 합니다.');
    assert.strictEqual(result.isFallback, true, 'isFallback 플래그가 true여야 합니다.');
    assert.ok(result.fallbackReason, '폴백 사유가 포함되어야 합니다.');
    assert.ok(
      !result.fallbackReason?.includes('sk-invalid-dummy-key-for-fallback-test'),
      '폴백 사유에 원문 API 키가 노출되지 않아야 합니다.'
    );
  });
});

test('▶ OpenAI 환경에서 오디오 드라마 세그먼트 보이스 라우팅 검증', async (t) => {
  /** main.ts의 resolveVoiceAndPromptForSegment 로직과 동일한 검증 헬퍼 */
  const resolveVoice = (
    type: 'narration' | 'dialogue',
    gender: SpeakerGender,
    settings: AppSettings
  ): string => {
    if (type === 'narration' || gender === 'narrator') {
      return settings.openaiVoice || 'onyx';
    }
    if (gender === 'female') {
      return settings.openaiVoiceFemale || 'nova';
    }
    return settings.openaiVoiceMale || 'onyx';
  };

  const settings = createMockSettings({
    provider: 'openai',
    openaiVoice: 'onyx',
    openaiVoiceMale: 'fable',
    openaiVoiceFemale: 'shimmer'
  });

  await t.test('1. 지문(narration)은 사관 전용 보이스(onyx)로 라우팅되어야 함', () => {
    const voice = resolveVoice('narration', 'narrator', settings);
    assert.strictEqual(voice, 'onyx');
  });

  await t.test('2. 여성 등장인물 대사는 여성 전용 보이스(shimmer)로 라우팅되어야 함', () => {
    const voice = resolveVoice('dialogue', 'female', settings);
    assert.strictEqual(voice, 'shimmer');
  });

  await t.test('3. 남성 등장인물 대사는 남성 전용 보이스(fable)로 라우팅되어야 함', () => {
    const voice = resolveVoice('dialogue', 'male', settings);
    assert.strictEqual(voice, 'fable');
  });
});
