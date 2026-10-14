import { describe, it } from 'node:test';
import assert from 'node:assert';
import { formatTtsErrorMessage } from '@/main/ttsService';
import {
  buildFallbackToastMessage,
  formatFallbackReason
} from '@/shared/fallbackMessageFormatter';

/**
 * Edge-TTS 403 Forbidden 및 폴백 알림 토스트 메시지 변환 로직의
 * 무결성을 검증합니다.
 */
describe('Edge-TTS 403 Forbidden 에러 핸들링 및 폴백 토스트 문구 검증', () => {
  it('1. Unexpected server response: 403 에러 발생 시 원인 및 Gemini 대체 권장 안내 메시지를 반환해야 한다', () => {
    const rawError = 'Edge TTS WebSocket error: Unexpected server response: 403';
    const formatted = formatTtsErrorMessage(rawError);

    assert.ok(
      formatted.includes('Microsoft Edge-TTS 서비스 일시 차단'),
      '차단 안내 문구가 포함되어야 합니다.'
    );
    assert.ok(
      formatted.includes('Gemini TTS') || formatted.includes('무료 API'),
      'Gemini TTS 등 대체 권장 안내가 포함되어야 합니다.'
    );
  });

  it('2. ENOTFOUND 에러는 인터넷 및 DNS 점검 안내를 반환해야 한다', () => {
    const rawError = 'getaddrinfo ENOTFOUND speech.platform.bing.com';
    const formatted = formatTtsErrorMessage(rawError);

    assert.ok(
      formatted.includes('인터넷 연결 또는 DNS 설정'),
      '인터넷/DNS 안내 문구가 포함되어야 합니다.'
    );
  });

  it('3. Edge-TTS 연결 실패 시 시스템(로컬) TTS로 대체 재생되었다는 정확한 토스트 문구를 생성해야 한다', () => {
    const toast = buildFallbackToastMessage(
      {
        isSuccess: true,
        isFallback: true,
        fallbackFromProvider: 'edge',
        fallbackToProvider: 'system',
        fallbackReason: formatTtsErrorMessage(
          'Edge TTS WebSocket error: Unexpected server response: 403'
        )
      },
      'edge'
    );

    assert.strictEqual(
      toast,
      '⚠️ Edge-TTS 연결 실패 [서버 연결 거부 (403 Forbidden)]로 인해 시스템(로컬) TTS로 대체 재생되었습니다.'
    );
    assert.ok(!toast.includes('Gemini'), 'Edge-TTS 실패 시 Gemini 문구가 나오면 안 됩니다.');
    assert.ok(!toast.includes('Edge-TTS로 대체'), 'Edge-TTS 실패 시 자기 자신으로 대체되었다고 나오면 안 됩니다.');
  });

  it('4. 클라우드 유료 엔진(Gemini/OpenAI/ElevenLabs) 실패 시 1차(Edge-TTS) 및 2차(시스템 로컬 TTS) 대체 문구를 정확히 구분해야 한다', () => {
    const geminiToEdge = buildFallbackToastMessage(
      {
        isSuccess: true,
        isFallback: true,
        fallbackFromProvider: 'gemini',
        fallbackToProvider: 'edge',
        fallbackReason: 'API_KEY_INVALID: API key not valid'
      },
      'gemini'
    );
    assert.strictEqual(
      geminiToEdge,
      '⚠️ Gemini TTS 연결 실패 [API 키 미설정 또는 무효]로 인해 Edge-TTS로 대체 재생되었습니다.'
    );

    const openaiToSystem = buildFallbackToastMessage(
      {
        isSuccess: true,
        isFallback: true,
        fallbackFromProvider: 'openai',
        fallbackToProvider: 'system',
        fallbackReason: 'OpenAI API 오류 (상태 코드: 429): Rate limit (로컬 시스템 TTS 대체)'
      },
      'openai'
    );
    assert.strictEqual(
      openaiToSystem,
      '⚠️ OpenAI TTS 연결 실패 [일시적 요청 속도 제한 (429 Rate Limit)]로 인해 시스템(로컬) TTS로 대체 재생되었습니다.'
    );

    assert.strictEqual(
      formatFallbackReason('getaddrinfo ENOTFOUND speech.platform.bing.com', 'edge'),
      '서버 접속 실패 (네트워크/DNS 확인)'
    );
  });
});

