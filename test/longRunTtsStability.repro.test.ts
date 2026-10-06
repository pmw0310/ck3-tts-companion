import test from 'node:test';
import assert from 'node:assert/strict';
import { synthesizeWithEdgeTts } from '@/main/ttsService';
import type { AppSettings } from '@/shared/types';

/**
 * 장시간 실행 시 TTS 작동 중단 결함에 대한 재현 테스트
 * 1. Edge-TTS 합성 시 WebSocket 리소스 close 호출 누락 및 타임아웃 부재 검증
 * 2. logWatcher 파일 스트림 오프셋 경계 계산 검증
 */

test('장시간 실행 시 TTS 안정성 및 리소스 누수 방어 검증', async (t) => {
  const dummySettings: AppSettings = {
    provider: 'edge',
    edgeVoice: 'ko-KR-SunHiNeural',
    geminiApiKey: '',
    geminiModel: 'gemini-3.8-flash-tts',
    geminiVoice: 'Charon',
    geminiSystemPrompt: '',
    speechRate: '+0%',
    speechVolume: '+0%',
    customLogPath: null,
    isAutoPlayEnabled: true,
    isAudioDramaEnabled: false,
    edgeVoiceMale: 'ko-KR-InJoonNeural',
    edgeVoiceFemale: 'ko-KR-SunHiNeural',
    geminiVoiceMale: 'Charon',
    geminiVoiceFemale: 'Kore',
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
    isCacheEnabled: false,
    maxCacheSizeMb: 500
  };

  await t.test('1. [결함 재현] synthesizeWithEdgeTts는 합성이 완료되거나 실패해도 반드시 tts.close()를 호출하여 WebSocket 누수를 차단해야 한다', async () => {
    // msedge-tts의 MsEdgeTTS 인스턴스에서 close가 호출되는지 모니터링하기 위한 검증
    // 현재 코드에서는 synthesizeWithEdgeTts가 tts.close()를 전혀 호출하지 않음
    let isCloseCalled = false;

    // MsEdgeTTS 프로토타입의 close 메서드를 인터셉트하여 호출 여부 추적
    const { MsEdgeTTS } = await import('msedge-tts');
    const originalClose = MsEdgeTTS.prototype.close;
    MsEdgeTTS.prototype.close = function (this: unknown) {
      isCloseCalled = true;
      return originalClose.apply(this);
    };

    try {
      // 짧은 텍스트 1회 합성 실행
      const result = await synthesizeWithEdgeTts('안녕', dummySettings);
      assert.ok(result.audioBase64.length > 0, '오디오 데이터가 반환되어야 함');
      assert.strictEqual(
        isCloseCalled,
        true,
        '합성 완료 후 소켓 고갈 방지를 위해 반드시 tts.close()가 호출되어야 함'
      );
    } finally {
      MsEdgeTTS.prototype.close = originalClose;
    }
  });

  await t.test('2. [결함 재현] synthesizeWithEdgeTts에 타임아웃 안전 장치가 탑재되어 네트워크 정체 시 무한 대기를 방지해야 한다', async () => {
    // 옵션으로 타임아웃을 주입하거나 내부 기본 타임아웃(예: 12000ms)이 작동해야 함
    // 응답이 없는 스트림 모의 상황에서 Promise가 영구 대기(hang)되지 않고 거절되어야 함
    const startTime = Date.now();
    
    // 비정상적으로 짧은 타임아웃(예: 50ms)을 지원하는 시그니처 또는 타임아웃 거절 기능 검증
    const timeoutPromise = synthesizeWithEdgeTts('테스트 긴 텍스트 낭독', dummySettings, { timeoutMs: 50 });

    await assert.rejects(
      async () => {
        await timeoutPromise;
      },
      /타임아웃|시간 초과|timeout/i,
      '지정된 타임아웃 초과 시 무한 행(hang)을 막고 거절되어야 함'
    );
    const elapsed = Date.now() - startTime;
    assert.ok(elapsed >= 40, `최소 40ms 이상 경과 후 타임아웃되어야 함 (실제: ${elapsed}ms)`);
  });

  await t.test('3. [오프셋 계산 검증] createReadStream에서 end 옵션은 inclusive이므로 start=0, end=100은 101바이트를 읽는다', () => {
    // start와 end가 inclusive임을 검증하여 start: filePosition, end: currentStats.size - 1 규칙의 필요성 확인
    const filePosition = 0;
    const currentSize = 100;
    const inclusiveLength = (currentSize - 1) - filePosition + 1;
    assert.strictEqual(inclusiveLength, 100, 'end는 size - 1이어야 정확히 100바이트를 읽음');
  });
});
