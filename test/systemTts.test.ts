import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AppSettings, SynthesizeRequest } from '@/shared/types';
import {
  convertSpeechRateToMacWpm,
  convertSpeechRateToWinRate,
  synthesizeWithSystemTts
} from '@/main/systemTtsService';
import { processTtsRequest } from '@/main/ttsService';

describe('시스템(로컬) TTS 서비스 무결성 검증', () => {
  const dummySettings: AppSettings = {
    provider: 'system',
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
    elevenLabsApiKey: '',
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
    isAudioDramaEnabled: false,
    edgeVoiceMale: 'ko-KR-InJoonNeural',
    edgeVoiceFemale: 'ko-KR-SunHiNeural',
    geminiVoiceMale: 'Charon',
    geminiVoiceFemale: 'Kore',
    systemVoice: 'default',
    isCacheEnabled: false,
    maxCacheSizeMb: 500,
    isExecutionSoundEnabled: true,
    executionSoundVolume: 0.8
  };

  it('1. macOS 발화 속도(WPM) 계산 헬퍼가 정확히 동작해야 함', () => {
    assert.strictEqual(convertSpeechRateToMacWpm('+0%'), 180);
    assert.strictEqual(convertSpeechRateToMacWpm('+10%'), 198);
    assert.strictEqual(convertSpeechRateToMacWpm('-20%'), 144);
    assert.strictEqual(convertSpeechRateToMacWpm(''), 180);
  });

  it('2. Windows 발화 속도(-10 ~ 10) 계산 헬퍼가 정확히 동작해야 함', () => {
    assert.strictEqual(convertSpeechRateToWinRate('+0%'), 0);
    assert.strictEqual(convertSpeechRateToWinRate('+20%'), 2);
    assert.strictEqual(convertSpeechRateToWinRate('-30%'), -3);
  });

  if (process.platform === 'darwin') {
    it('3. [macOS 실전 합성] say + afconvert 기반 WAV 오디오 생성이 성공해야 함', async () => {
      const result = await synthesizeWithSystemTts('테스트 낭독입니다.', dummySettings);

      assert.ok(result.audioBase64.length > 0, '오디오 Base64 문자열이 비어있지 않아야 함');
      assert.strictEqual(result.mimeType, 'audio/wav');

      const buf = Buffer.from(result.audioBase64, 'base64');
      // 표준 RIFF WAV 헤더 매직 넘버 검증
      assert.strictEqual(buf.subarray(0, 4).toString('ascii'), 'RIFF');
      assert.strictEqual(buf.subarray(8, 12).toString('ascii'), 'WAVE');
    });

    it('4. [통합 파이프라인] processTtsRequest에서 system provider가 정상 동작해야 함', async () => {
      const req: SynthesizeRequest = {
        text: '사관이 역사를 기록합니다.',
        settings: dummySettings
      };

      const result = await processTtsRequest(req);
      assert.strictEqual(result.isSuccess, true);
      assert.ok(result.audioBase64 && result.audioBase64.length > 0);
      assert.strictEqual(result.mimeType, 'audio/wav');
    });

    it('5. [캐시 통합] isCacheEnabled: true일 때 시스템 TTS 오디오가 캐시되고 2회차에 0ms 즉시 반환되어야 함', async () => {
      const cacheSettings: AppSettings = {
        ...dummySettings,
        isCacheEnabled: true
      };
      const req: SynthesizeRequest = {
        text: '이벤트가 캐시되어 딜레이 없이 즉시 재생됩니다.',
        settings: cacheSettings
      };

      // 1회차: 실제 합성 및 캐시 저장
      const res1 = await processTtsRequest(req);
      assert.strictEqual(res1.isSuccess, true);

      // 캐시 디스크 저장이 비동기로 진행되므로 잠시 대기
      await new Promise((resolve) => setTimeout(resolve, 300));

      // 2회차: 캐시에서 즉시 반환 (0ms)
      const res2 = await processTtsRequest(req);
      assert.strictEqual(res2.isSuccess, true);
      assert.strictEqual(res2.fromCache, true);
      assert.strictEqual(res2.audioBase64, res1.audioBase64);
    });
  }
});
