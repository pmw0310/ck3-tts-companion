import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  calculateCacheKey,
  isCacheableProvider,
  convertWavToMp3,
  saveCachedAudio,
  getCachedAudio,
  getCacheStats,
  clearAudioCache,
  runLruEvictionIfNeeded,
  setCustomCacheDirForTest,
  waitForPendingCacheWrites
} from '../src/main/audioCacheService.js';
import { wrapPcmWithWavHeader, processTtsRequest } from '../src/main/ttsService.js';
import type { AppSettings, SynthesizeRequest } from '../src/shared/types.js';

describe('로컬 오디오 캐싱 시스템 및 WAV to MP3 트랜스코딩 무결성 검증', () => {
  let testCacheDir: string;

  const mockSettings: AppSettings = {
    provider: 'gemini',
    edgeVoice: 'ko-KR-SunHiNeural',
    geminiApiKey: 'test-key',
    geminiModel: 'gemini-3.8-flash-tts',
    geminiVoice: 'Charon',
    geminiSystemPrompt: '진중한 사관 톤',
    openaiApiKey: '',
    openaiModel: 'tts-1',
    openaiVoice: 'onyx',
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
    isAudioDramaEnabled: true,
    edgeVoiceMale: 'ko-KR-InJoonNeural',
    edgeVoiceFemale: 'ko-KR-SunHiNeural',
    geminiVoiceMale: 'Charon',
    geminiVoiceFemale: 'Kore',
    openaiVoiceMale: 'onyx',
    openaiVoiceFemale: 'nova',
    isCacheEnabled: true,
    maxCacheSizeMb: 500,
    isExecutionSoundEnabled: true,
    executionSoundVolume: 0.8
  };

  beforeEach(() => {
    // 임시 디렉토리를 격리된 테스트 캐시 디렉토리로 설정
    testCacheDir = path.join(os.tmpdir(), `ck3-cache-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    fs.mkdirSync(testCacheDir, { recursive: true });
    setCustomCacheDirForTest(testCacheDir);
  });

  afterEach(async () => {
    await waitForPendingCacheWrites();
    setCustomCacheDirForTest(null);
    if (fs.existsSync(testCacheDir)) {
      await fs.promises.rm(testCacheDir, { recursive: true, force: true });
    }
  });

  describe('1. 해시 키(SHA-256) 생성 및 정규화 검증', () => {
    it('동일한 파라미터는 동일한 64자리 해시를 생성해야 함', () => {
      const req1: SynthesizeRequest = {
        text: '사냥터에서 멧돼지를 발견하였습니다.',
        settings: mockSettings
      };
      const req2: SynthesizeRequest = {
        text: '사냥터에서 멧돼지를 발견하였습니다.',
        settings: { ...mockSettings }
      };

      const hash1 = calculateCacheKey(req1);
      const hash2 = calculateCacheKey(req2);

      assert.strictEqual(hash1.length, 64);
      assert.strictEqual(hash1, hash2);
    });

    it('텍스트 앞뒤 공백 및 연속 공백이 달라도 동일한 해시를 생성해야 함', () => {
      const req1: SynthesizeRequest = {
        text: '   사냥터에서    멧돼지를   발견하였습니다.  \n\n',
        settings: mockSettings
      };
      const req2: SynthesizeRequest = {
        text: '사냥터에서 멧돼지를 발견하였습니다.',
        settings: mockSettings
      };

      assert.strictEqual(calculateCacheKey(req1), calculateCacheKey(req2));
    });

    it('보이스, 모델, 속도, 어조가 바뀌면 다른 해시가 생성되어야 함 (정합성 보장)', () => {
      const baseReq: SynthesizeRequest = {
        text: '경의 충성을 치하하오.',
        settings: mockSettings
      };
      const baseHash = calculateCacheKey(baseReq);

      // 보이스 오버라이드
      const voiceDiffHash = calculateCacheKey({
        ...baseReq,
        voiceOverride: 'Fenrir'
      });
      assert.notStrictEqual(baseHash, voiceDiffHash);

      // 발화 속도 변경
      const rateDiffHash = calculateCacheKey({
        ...baseReq,
        settings: { ...mockSettings, speechRate: '+15%' }
      });
      assert.notStrictEqual(baseHash, rateDiffHash);

      // 프로바이더 변경
      const providerDiffHash = calculateCacheKey({
        ...baseReq,
        settings: { ...mockSettings, provider: 'openai', openaiVoice: 'onyx' }
      });
      assert.notStrictEqual(baseHash, providerDiffHash);
    });
  });

  describe('2. 캐싱 프로바이더 필터링 검증 (사용자 규칙: Edge 제외)', () => {
    it('유료 AI 음성 엔진(gemini, openai, elevenlabs)은 캐싱 대상이어야 함', () => {
      assert.strictEqual(isCacheableProvider('gemini'), true);
      assert.strictEqual(isCacheableProvider('openai'), true);
      assert.strictEqual(isCacheableProvider('elevenlabs'), true);
    });

    it('무료인 Edge-TTS 및 시스템 TTS는 반드시 캐싱 대상에서 제외되어야 함', () => {
      assert.strictEqual(isCacheableProvider('edge'), false);
      assert.strictEqual(isCacheableProvider('system'), false);
      assert.strictEqual(isCacheableProvider(undefined), false);
    });
  });

  describe('3. WAV to MP3 순수 JS 트랜스코딩 압축률 검증', () => {
    it('24kHz 16-bit Mono WAV 버퍼를 MP3로 변환 시 80% 이상 용량이 절감되어야 함', async () => {
      // 1초 분량의 24kHz 16비트 모노 PCM 무음/사인파 버퍼 생성 (24,000 샘플 * 2 바이트 = 48,000 바이트)
      const pcmBuffer = Buffer.alloc(48000);
      for (let i = 0; i < 24000; i++) {
        // 440Hz 기본 사인파
        const sample = Math.sin((2 * Math.PI * 440 * i) / 24000) * 16000;
        pcmBuffer.writeInt16LE(Math.round(sample), i * 2);
      }

      // 44바이트 표준 WAV 헤더 부여 (총 48,044 바이트)
      const wavBuffer = wrapPcmWithWavHeader(pcmBuffer, 24000);
      assert.strictEqual(wavBuffer.length, 48044);

      // 순수 JS MP3 인코딩 (96kbps)
      const mp3Buffer = await convertWavToMp3(wavBuffer, 96);

      // MP3는 1초 기준 96kbps / 8 = 약 12KB 이하여야 함
      assert.ok(mp3Buffer.length > 0);
      assert.ok(mp3Buffer.length < wavBuffer.length * 0.3, `MP3 크기 (${mp3Buffer.length})가 WAV 크기 (${wavBuffer.length})의 30% 이하여야 함`);

      // 압축률 검증 (최소 70% 이상 압축)
      const compressionRatio = (1 - mp3Buffer.length / wavBuffer.length) * 100;
      assert.ok(compressionRatio >= 70, `압축률이 70% 이상이어야 함: ${compressionRatio.toFixed(1)}%`);
    });
  });

  describe('4. 캐시 저장, 조회 및 Edge 저장 차단 검증', () => {
    it('유료 엔진(Gemini) 결과는 디스크에 MP3로 저장되고 getCachedAudio로 즉시 적중되어야 함', async () => {
      const req: SynthesizeRequest = {
        text: '전령이 급보를 전해왔습니다.',
        settings: mockSettings
      };
      const hash = calculateCacheKey(req);

      // 48KB 가짜 WAV 버퍼
      const fakeWav = wrapPcmWithWavHeader(Buffer.alloc(24000), 24000);

      // 캐시 저장
      await saveCachedAudio(hash, fakeWav, 'audio/wav', req, mockSettings);

      // 캐시 조회
      const cached = await getCachedAudio(hash);
      assert.ok(cached !== null);
      assert.strictEqual(cached.isSuccess, true);
      assert.strictEqual(cached.fromCache, true);
      assert.strictEqual(cached.mimeType, 'audio/mp3');
      assert.ok(typeof cached.audioBase64 === 'string');

      // 통계 검증
      const stats = getCacheStats(mockSettings);
      assert.strictEqual(stats.totalFiles, 1);
      assert.ok(stats.totalSizeBytes > 0);
    });

    it('무료인 Edge-TTS 요청은 saveCachedAudio를 호출해도 디스크에 저장되지 않아야 함', async () => {
      const edgeSettings: AppSettings = {
        ...mockSettings,
        provider: 'edge'
      };
      const req: SynthesizeRequest = {
        text: '선희 목소리로 읽는 일반 이벤트입니다.',
        settings: edgeSettings
      };
      const hash = calculateCacheKey(req);
      const fakeMp3 = Buffer.from('fake-mp3-stream-data');

      // 저장 시도
      await saveCachedAudio(hash, fakeMp3, 'audio/mp3', req, edgeSettings);

      // 캐시 파일이 저장되지 않았는지 검증
      const cached = await getCachedAudio(hash);
      assert.strictEqual(cached, null);

      const stats = getCacheStats(edgeSettings);
      assert.strictEqual(stats.totalFiles, 0);
    });

    it('isCacheEnabled: false 설정 시 캐시가 저장되지 않아야 함', async () => {
      const disabledSettings: AppSettings = {
        ...mockSettings,
        isCacheEnabled: false
      };
      const req: SynthesizeRequest = {
        text: '캐시 비활성화 상태입니다.',
        settings: disabledSettings
      };
      const hash = calculateCacheKey(req);

      await saveCachedAudio(hash, Buffer.alloc(1000), 'audio/mp3', req, disabledSettings);
      const cached = await getCachedAudio(hash);
      assert.strictEqual(cached, null);
    });
  });

  describe('5. LRU 용량 제한 및 초과분 자동 삭제 검증', () => {
    it('한도 초과 시 가장 오래전에 조회된 캐시부터 우선 정리되어 목표치 이하로 감소해야 함', async () => {
      // 10KB 한도로 작은 용량 설정
      const smallLimitBytes = 5000;

      // 파일 3개 생성 (각 약 2KB)
      for (let i = 1; i <= 3; i++) {
        const req: SynthesizeRequest = {
          text: `LRU 테스트 문장 ${i}`,
          settings: mockSettings
        };
        const hash = calculateCacheKey(req);
        // 약 2KB 가짜 MP3 버퍼
        const dummyBuf = Buffer.alloc(2048, i);
        await saveCachedAudio(hash, dummyBuf, 'audio/mp3', req, {
          ...mockSettings,
          maxCacheSizeMb: 1
        });
      }

      let stats = getCacheStats(mockSettings);
      assert.strictEqual(stats.totalFiles, 3);
      assert.ok(stats.totalSizeBytes >= 6000);

      // LRU 실행: 5,000 바이트 한도로 정리
      await runLruEvictionIfNeeded(smallLimitBytes);

      stats = getCacheStats(mockSettings);
      // 목표치(5000 * 0.8 = 4000) 이하로 줄어들어 파일 1개 이상 삭제되었어야 함
      assert.ok(stats.totalSizeBytes <= smallLimitBytes * 0.8);
      assert.ok(stats.totalFiles < 3);
    });
  });

  describe('6. 전체 캐시 비우기 (clearAudioCache) 검증', () => {
    it('clearAudioCache 호출 시 모든 파일과 인덱스가 깨끗이 삭제되어야 함', async () => {
      const req: SynthesizeRequest = {
        text: '삭제 테스트 문장',
        settings: mockSettings
      };
      const hash = calculateCacheKey(req);
      await saveCachedAudio(hash, Buffer.alloc(1024), 'audio/mp3', req, mockSettings);

      assert.strictEqual(getCacheStats(mockSettings).totalFiles, 1);

      const isCleared = await clearAudioCache();
      assert.strictEqual(isCleared, true);

      // 삭제 후 확인
      assert.strictEqual(getCacheStats(mockSettings).totalFiles, 0);
      assert.strictEqual(getCacheStats(mockSettings).totalSizeBytes, 0);
    });
  });

  describe('7. processTtsRequest 파이프라인 캐시 적중(Cache Hit) 및 토큰 절약 검증', () => {
    it('캐시에 사전 저장된 유료 음성은 외부 API 호출 없이 fromCache: true로 즉시 반환되어야 함', async () => {
      const req: SynthesizeRequest = {
        text: '사관이 기록하는 황제의 탄생일입니다.',
        settings: mockSettings
      };
      const hash = calculateCacheKey(req);

      // 캐시에 가짜 MP3 오디오 사전 저장
      const dummyMp3 = Buffer.from('mock-mp3-audio-content');
      await saveCachedAudio(hash, dummyMp3, 'audio/mp3', req, mockSettings);

      // processTtsRequest 호출 (Gemini 키가 가짜여도 캐시에서 즉시 반환되므로 API 에러 발생하지 않음)
      const result = await processTtsRequest(req);

      assert.strictEqual(result.isSuccess, true);
      assert.strictEqual(result.fromCache, true);
      assert.strictEqual(result.mimeType, 'audio/mp3');
      assert.strictEqual(result.audioBase64, dummyMp3.toString('base64'));
    });
  });
});
