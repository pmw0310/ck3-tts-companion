import { describe, it } from 'node:test';
import assert from 'node:assert';
import { formatTtsErrorMessage } from '@/main/ttsService';

/**
 * Edge-TTS 403 Forbidden 및 비공식 API 차단에 대한
 * 친절한 사용자 안내 메시지 변환 로직 무결성을 검증합니다.
 */
describe('Edge-TTS 403 Forbidden 에러 핸들링 검증', () => {
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
});
