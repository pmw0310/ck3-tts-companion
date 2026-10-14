import type { SynthesizeResult, TtsProviderType } from '@/shared/types';

/**
 * TTS 제공자 식별자를 사용자 친화적인 한국어/공식 명칭으로 매핑합니다.
 */
const providerToDisplayName: Record<TtsProviderType, string> = {
  edge: 'Edge-TTS',
  system: '시스템(로컬) TTS',
  gemini: 'Gemini TTS',
  openai: 'OpenAI TTS',
  elevenlabs: 'ElevenLabs TTS'
};

/**
 * TTS 제공자 식별자에 대응하는 화면 표시명을 반환합니다.
 * @param provider - TTS 엔진 식별자
 * @returns 사용자 친화적인 엔진 명칭
 */
export const getTtsProviderDisplayName = (provider?: TtsProviderType): string => {
  if (!provider) {
    return 'TTS';
  }
  return providerToDisplayName[provider] ?? 'TTS';
};

/**
 * TTS 음성 합성 오류 사유를 실패한 엔진 종류에 맞춰 사용자가 즉시 이해할 수 있는 요약 문구로 정제합니다.
 * @param reason - 원시 오류 메시지
 * @param fromProvider - 원래 합성을 시도했던 TTS 엔진 식별자
 * @returns 사용자 친화적인 요약 사유 문자열
 */
export const formatFallbackReason = (
  reason?: string,
  fromProvider?: TtsProviderType
): string => {
  if (!reason) {
    return '연결 오류';
  }

  // 2차 폴백 꼬리표('(로컬 시스템 TTS 대체)')가 붙어 있으면 사유 본문만 남기도록 제거
  const cleanedReason = reason.replace(/\s*\(로컬 시스템 TTS 대체\)\s*$/g, '').trim();

  const isEdgeError =
    fromProvider === 'edge' ||
    cleanedReason.includes('Edge-TTS') ||
    cleanedReason.includes('Edge TTS') ||
    cleanedReason.includes('speech.platform.bing.com');

  if (isEdgeError) {
    if (cleanedReason.includes('403') || cleanedReason.includes('Forbidden')) {
      return '서버 연결 거부 (403 Forbidden)';
    }
    if (
      cleanedReason.includes('ENOTFOUND') ||
      cleanedReason.includes('DNS') ||
      cleanedReason.includes('접속 실패')
    ) {
      return '서버 접속 실패 (네트워크/DNS 확인)';
    }
    if (cleanedReason.includes('타임아웃') || cleanedReason.includes('시간 초과') || cleanedReason.includes('timeout')) {
      return '서버 응답 시간 초과';
    }
    return cleanedReason.length > 55 ? `${cleanedReason.slice(0, 55)}...` : cleanedReason;
  }

  // 클라우드 유료 AI 엔진(Gemini, OpenAI, ElevenLabs) 오류 사유 분류
  if (
    cleanedReason.includes('API_KEY_INVALID') ||
    cleanedReason.includes('API key not valid') ||
    cleanedReason.includes('키가 설정되지 않았습니다') ||
    cleanedReason.includes('401') ||
    cleanedReason.includes('Unauthorized')
  ) {
    return 'API 키 미설정 또는 무효';
  }

  if (cleanedReason.includes('RESOURCE_EXHAUSTED') || cleanedReason.includes('429')) {
    if (
      cleanedReason.includes('FreeTier') ||
      cleanedReason.includes('DEFAULT_TIER') ||
      cleanedReason.includes('free tier')
    ) {
      return '무료 프로젝트 키로 인식됨 (AI Studio 결제 프로젝트 연결 확인 필요)';
    }
    return '일시적 요청 속도 제한 (429 Rate Limit)';
  }

  if (cleanedReason.includes('PERMISSION_DENIED') || cleanedReason.includes('403')) {
    return '결제 계정/권한 확인 필요 (403)';
  }

  if (
    cleanedReason.includes('ENOTFOUND') ||
    cleanedReason.includes('fetch failed') ||
    cleanedReason.includes('network')
  ) {
    return '네트워크 연결 실패';
  }

  return cleanedReason.length > 60 ? `${cleanedReason.slice(0, 60)}...` : cleanedReason;
};

/**
 * TTS 폴백 발생 시 실제 실패한 원본 엔진과 대체 재생된 엔진을 정확히 반영한 토스트 알림 문구를 생성합니다.
 * @param result - TTS 합성 결과 객체
 * @param currentProvider - 현재 설정에 선택된 기본 TTS 엔진 식별자
 * @returns 사용자에게 표시할 폴백 토스트 메시지
 */
export const buildFallbackToastMessage = (
  result: SynthesizeResult,
  currentProvider?: TtsProviderType
): string => {
  const fromProvider: TtsProviderType =
    result.fallbackFromProvider ?? currentProvider ?? 'edge';

  const inferredToProvider: TtsProviderType =
    result.fallbackToProvider ??
    (fromProvider === 'edge' || result.fallbackReason?.includes('로컬 시스템 TTS 대체')
      ? 'system'
      : 'edge');

  const fromName = getTtsProviderDisplayName(fromProvider);
  const toName = getTtsProviderDisplayName(inferredToProvider);
  const reasonText = formatFallbackReason(result.fallbackReason, fromProvider);

  return `⚠️ ${fromName} 연결 실패 [${reasonText}]로 인해 ${toName}로 대체 재생되었습니다.`;
};

