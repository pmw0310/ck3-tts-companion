import test from 'node:test';
import assert from 'node:assert/strict';
import {
  maskApiKeyInMessage,
  synthesizeWithElevenLabs,
  processTtsRequest
} from '@/main/ttsService';
import type { AppSettings, SynthesizeRequest } from '@/shared/types';

/** 테스트용 기본 AppSettings mock 생성 헬퍼 */
const createMockSettings = (overrides?: Partial<AppSettings>): AppSettings => ({
  provider: 'elevenlabs',
  edgeVoice: 'ko-KR-SunHiNeural',
  geminiApiKey: '',
  geminiModel: 'gemini-3.8-flash-tts',
  geminiVoice: 'Charon',
  geminiSystemPrompt: '',
  openaiApiKey: '',
  openaiModel: 'tts-1',
  openaiVoice: 'onyx',
  openaiVoiceMale: 'onyx',
  openaiVoiceFemale: 'nova',
  elevenLabsApiKey: 'xi-api-testkey-1234567890abcdef',
  elevenLabsModel: 'eleven_multilingual_v2',
  elevenLabsVoiceId: 'JBFqnCBsd6RMkjVDRZzb',
  elevenLabsVoiceMale: 'JBFqnCBsd6RMkjVDRZzb',
  elevenLabsVoiceFemale: 'Xb7hH8MSUJpSbSDYk0k2',
  elevenLabsStability: 0.5,
  elevenLabsSimilarity: 0.75,
  speechRate: '+0%',
  speechVolume: '+0%',
  customLogPath: null,
  isAutoPlayEnabled: true,
  isAudioDramaEnabled: true,
  edgeVoiceMale: 'ko-KR-InJoonNeural',
  edgeVoiceFemale: 'ko-KR-SunHiNeural',
  geminiVoiceMale: 'Charon',
  geminiVoiceFemale: 'Kore',
  isCacheEnabled: true,
  maxCacheSizeMb: 500,
  isExecutionSoundEnabled: true,
  executionSoundVolume: 0.8,
  ...overrides
});

test('▶ ElevenLabs API 키 유효성 및 마스킹 검증', async (t) => {
  await t.test('1. API 키가 공백이거나 비어 있으면 명확한 한글 예외를 던져야 함', async () => {
    const settings = createMockSettings({ elevenLabsApiKey: '   ' });
    await assert.rejects(
      async () => {
        await synthesizeWithElevenLabs('테스트 문장', settings);
      },
      {
        name: 'Error',
        message: /ElevenLabs API 키가 설정되지 않았습니다/
      }
    );
  });

  await t.test('2. 에러 메시지 내의 ElevenLabs API 키가 안전하게 마스킹되어야 함', () => {
    const sensitiveKey = 'xi-api-testkey-1234567890abcdef';
    const rawError = `Request failed with key xi-api-testkey-1234567890abcdef: 401 Unauthorized`;
    const masked = maskApiKeyInMessage(rawError, sensitiveKey);

    assert.ok(!masked.includes(sensitiveKey), '실제 API 키가 노출되지 않아야 합니다');
    assert.ok(masked.includes('***API_KEY_PROTECTED***'), '마스킹된 포맷이 포함되어야 합니다');
  });
});

test('▶ synthesizeWithElevenLabs HTTP 통신 및 페이로드 검증 (Fetch Mock)', async (t) => {
  const originalFetch = global.fetch;

  t.afterEach(() => {
    global.fetch = originalFetch;
  });

  await t.test('1. 올바른 URL, 헤더(xi-api-key), 모델 및 voice_settings 페이로드를 전송해야 함', async () => {
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: Record<string, unknown> = {};

    global.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      capturedUrl = input.toString();
      capturedHeaders = (init?.headers as Record<string, string>) || {};
      capturedBody = JSON.parse((init?.body as string) || '{}');

      const dummyAudioData = Buffer.from('MOCK_ELEVENLABS_MP3_STREAM');
      return new Response(dummyAudioData, {
        status: 200,
        headers: { 'Content-Type': 'audio/mpeg' }
      });
    };

    const settings = createMockSettings({
      elevenLabsApiKey: 'xi-api-secret-key-9999',
      elevenLabsModel: 'eleven_turbo_v2_5',
      elevenLabsVoiceId: 'pNInz6obpgDQGcFmaJgB',
      elevenLabsStability: 0.7,
      elevenLabsSimilarity: 0.85
    });

    const result = await synthesizeWithElevenLabs('사관의 낭독 문장', settings);

    assert.strictEqual(
      capturedUrl,
      'https://api.elevenlabs.io/v1/text-to-speech/pNInz6obpgDQGcFmaJgB',
      '지정된 voice_id 엔드포인트로 호출해야 함'
    );
    assert.strictEqual(capturedHeaders['xi-api-key'], 'xi-api-secret-key-9999');
    assert.strictEqual(capturedHeaders['Content-Type'], 'application/json');
    assert.strictEqual(capturedBody.text, '사관의 낭독 문장');
    assert.strictEqual(capturedBody.model_id, 'eleven_turbo_v2_5');

    const voiceSettings = capturedBody.voice_settings as Record<string, unknown>;
    assert.strictEqual(voiceSettings.stability, 0.7);
    assert.strictEqual(voiceSettings.similarity_boost, 0.85);
    assert.strictEqual(voiceSettings.use_speaker_boost, true);

    assert.strictEqual(result.mimeType, 'audio/mp3');
    assert.strictEqual(
      Buffer.from(result.audioBase64, 'base64').toString(),
      'MOCK_ELEVENLABS_MP3_STREAM'
    );
  });

  await t.test('2. ElevenLabs API가 401 또는 429 오류를 반환할 때 적절한 Error를 throw해야 함', async () => {
    global.fetch = async (): Promise<Response> => {
      return new Response(JSON.stringify({ detail: { message: 'Quota exceeded or invalid api key' } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    };

    const settings = createMockSettings();
    await assert.rejects(
      async () => {
        await synthesizeWithElevenLabs('낭독 문장', settings);
      },
      {
        name: 'Error',
        message: /ElevenLabs API 오류 \(상태 코드: 401\)/
      }
    );
  });
});

test('▶ processTtsRequest 파이프라인 및 Edge-TTS 안전 자동 폴백 검증', async (t) => {
  const originalFetch = global.fetch;

  t.afterEach(() => {
    global.fetch = originalFetch;
  });

  await t.test('1. ElevenLabs 성공 시 정상 결과 및 MIME 타입을 반환해야 함', async () => {
    global.fetch = async (): Promise<Response> => {
      return new Response(Buffer.from('ELEVENLABS_SUCCESS_AUDIO'), {
        status: 200,
        headers: { 'Content-Type': 'audio/mpeg' }
      });
    };

    const request: SynthesizeRequest = {
      text: '국경 지대의 비밀 회합 보고서',
      settings: createMockSettings()
    };

    const result = await processTtsRequest(request);
    assert.strictEqual(result.isSuccess, true);
    assert.strictEqual(result.mimeType, 'audio/mp3');
    assert.strictEqual(result.isFallback, undefined);
  });

  await t.test('2. ElevenLabs API 장애/할당량 초과 시 기본 Edge-TTS로 안전하게 자동 폴백해야 함', async () => {
    global.fetch = async (): Promise<Response> => {
      return new Response('429 Too Many Requests (Rate limit or credits exhausted)', {
        status: 429,
        headers: { 'Content-Type': 'text/plain' }
      });
    };

    const request: SynthesizeRequest = {
      text: '가신들의 비밀 반란 모의',
      settings: createMockSettings()
    };

    const result = await processTtsRequest(request);
    assert.strictEqual(result.isSuccess, true, '자동 폴백으로 인해 최종 합성은 성공해야 함');
    assert.strictEqual(result.isFallback, true, '폴백 플래그가 true여야 함');
    assert.ok(
      result.fallbackReason?.includes('429'),
      '폴백 사유에 원본 에러가 마스킹되어 포함되어야 함'
    );
  });
});
