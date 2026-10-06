import { GoogleGenAI } from '@google/genai';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import type {
  AppSettings,
  SynthesizeRequest,
  SynthesizeResult
} from '@/shared/types';
import {
  calculateCacheKey,
  getCachedAudio,
  isCacheableProvider,
  saveCachedAudio
} from '@/main/audioCacheService';

/**
 * 24kHz 16비트 모노 PCM 데이터에 표준 RIFF WAV 헤더(44바이트)를 덧붙여 브라우저 재생 가능한 WAV 버퍼를 생성합니다.
 * @param pcmData - 원본 PCM 오디오 버퍼
 * @param sampleRate - 오디오 샘플 레이트 (기본값: 24000Hz)
 * @returns 44바이트 헤더가 포함된 WAV 버퍼
 */
export const wrapPcmWithWavHeader = (
  pcmData: Buffer,
  sampleRate = 24000
): Buffer => {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmData.length;
  const header = Buffer.alloc(44);

  // RIFF 청크 식별자
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);

  // fmt 서브 청크
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // 서브 청크 크기
  header.writeUInt16LE(1, 20); // 오디오 포맷 (1 = PCM)
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);

  // data 서브 청크
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmData]);
};

/**
 * Microsoft Edge TTS를 활용하여 한국어 음성을 합성합니다.
 * 장시간 실행 시 리소스 누수(소켓 고갈)를 방지하기 위해 완료/오류 시 반드시 tts.close()를 호출하며,
 * 네트워크 지연이나 응답 정체 시 영구 대기(hang)를 방지하기 위해 안전 타임아웃 가드를 적용합니다.
 * @param text - 읽을 텍스트
 * @param settings - 앱 음성 설정
 * @param options - 타임아웃 등 추가 실행 옵션
 * @returns MP3 Base64 데이터 및 MIME 타입
 */
export const synthesizeWithEdgeTts = async (
  text: string,
  settings: AppSettings,
  options?: { timeoutMs?: number }
): Promise<{ audioBase64: string; mimeType: string }> => {
  const timeoutMs = options?.timeoutMs ?? 15000;
  const tts = new MsEdgeTTS();

  try {
    await tts.setMetadata(
      settings.edgeVoice,
      OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3
    );

    const streamResult = tts.toStream(text, {
      rate: settings.speechRate,
      volume: settings.speechVolume
    });

    const readable = streamResult.audioStream;
    const chunks: Buffer[] = [];

    return await new Promise<{ audioBase64: string; mimeType: string }>(
      (resolve, reject) => {
        let isSettled = false;

        const cleanup = (): void => {
          if (timeoutTimer) {
            clearTimeout(timeoutTimer);
          }
          try {
            tts.close();
          } catch (closeErr: unknown) {
            console.warn('⚠️ [Edge-TTS] 소켓 close 정리 중 경고:', closeErr);
          }
        };

        const timeoutTimer = setTimeout(() => {
          if (isSettled) return;
          isSettled = true;
          cleanup();
          try {
            readable.destroy();
          } catch {
            // 안전 무시
          }
          reject(new Error(`Edge-TTS 합성 시간 초과 (${timeoutMs}ms 타임아웃)`));
        }, timeoutMs);

        readable.on('data', (chunk: unknown) => {
          if (Buffer.isBuffer(chunk)) {
            chunks.push(chunk);
          }
        });

        readable.on('end', () => {
          if (isSettled) return;
          isSettled = true;
          cleanup();
          const fullBuffer = Buffer.concat(chunks);
          resolve({
            audioBase64: fullBuffer.toString('base64'),
            mimeType: 'audio/mp3'
          });
        });

        readable.on('error', (err: unknown) => {
          if (isSettled) return;
          isSettled = true;
          cleanup();
          const errorMsg =
            err instanceof Error ? err.message : 'Edge-TTS 스트림 중 오류 발생';
          reject(new Error(errorMsg));
        });
      }
    );
  } catch (error: unknown) {
    try {
      tts.close();
    } catch {
      // 안전 무시
    }
    throw error;
  }
};

/**
 * Google Gemini 3.8 전용 TTS 모델을 사용하여 감정이 실린 오디오를 생성합니다.
 * @param text - 낭독할 이벤트 텍스트
/**
 * Gemini TTS의 중세 역사극 몰입도를 높이기 위해 톤 디렉션 태그를 결합합니다.
 * 인위적인 <short pause> 태그를 제거하여 문맥에 맞는 자연스러운 실제 사람의 호흡으로 발화하도록 합니다.
 * @param text - 원본 낭독 텍스트
 * @param prompt - 사용자가 선택한 어조 지침
 * @returns 감정 연기 태그가 가미된 텍스트
 */
const enrichTextForGeminiMedievalImmersion = (text: string, prompt?: string): string => {
  let enriched = text.trim();

  // 어조 프롬프트에 맞는 첫머리 Director Tag 결정
  const promptLower = (prompt ?? '').toLowerCase();
  let directorTag = '[solemn]';

  if (
    promptLower.includes('trailer') ||
    promptLower.includes('트레일러') ||
    promptLower.includes('kitsuragi') ||
    promptLower.includes('지적')
  ) {
    directorTag = '[calm and measured, dry gravitas]';
  } else if (promptLower.includes('warrior') || promptLower.includes('knight') || promptLower.includes('기사')) {
    directorTag = '[grave resolve]';
  } else if (promptLower.includes('spymaster') || promptLower.includes('schemer') || promptLower.includes('모략')) {
    directorTag = '[whispering]';
  } else if (promptLower.includes('clergy') || promptLower.includes('holy') || promptLower.includes('사제')) {
    directorTag = '[reverent]';
  } else if (promptLower.includes('majesty') || promptLower.includes('emperor') || promptLower.includes('황제')) {
    directorTag = '[regal and imposing]';
  }

  // 첫머리에 태그가 아직 없으면 주입
  if (!enriched.startsWith('[')) {
    enriched = `${directorTag} ${enriched}`;
  }

  return enriched;
};

/**
 * Google GenAI SDK를 사용하여 텍스트를 음성(WAV/PCM)으로 합성합니다.
 * @param text - 합성할 텍스트
 * @param settings - 사용자 앱 설정
 * @returns base64 인코딩된 오디오 데이터 및 MIME 타입
 */
export const synthesizeWithGemini = async (
  text: string,
  settings: AppSettings
): Promise<{ audioBase64: string; mimeType: string }> => {
  const apiKey = settings.geminiApiKey?.trim();
  if (!apiKey) {
    throw new Error(
      'Gemini API 키가 설정되지 않았습니다. 설정 화면에서 API 키를 입력해 주세요.'
    );
  }

  const ai = new GoogleGenAI({ apiKey });
  let model = settings.geminiModel || 'gemini-3.8-flash-tts';

  // TTS 전용 모델(예: gemini-3.8-flash-tts 등 -tts 모델)은 Developer Instruction을 지원하지 않으므로 전송 제외
  const isDedicatedTtsModel = model.toLowerCase().includes('tts');
  const userPrompt = settings.geminiSystemPrompt?.trim();
  const effectiveSystemPrompt =
    !isDedicatedTtsModel && userPrompt && userPrompt.length > 0
      ? userPrompt
      : undefined;

  const baseConfig: Record<string, unknown> = {
    responseModalities: ['AUDIO'],
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName: settings.geminiVoice || 'Charon'
        }
      }
    }
  };

  if (effectiveSystemPrompt) {
    baseConfig.systemInstruction = effectiveSystemPrompt;
  }

  // Gemini TTS 모델의 스타일 및 연기 디렉션을 전달하기 위해 speechMetadata.style 활용
  const enrichedText = enrichTextForGeminiMedievalImmersion(text, userPrompt);
  const userPart: Record<string, unknown> = { text: enrichedText };
  if (userPrompt && userPrompt.length > 0) {
    userPart.speechMetadata = { style: userPrompt };
  }

  let response;
  try {
    response = await ai.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [userPart]
        }
      ],
      config: baseConfig
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);

    // 1) Flash-Lite 모델 일일 100회 쿼터 초과 시 표준 Flash 모델로 자동 승격 재시도
    if (
      model === 'gemini-3.8-flash-lite-tts' &&
      (errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('RESOURCE_EXHAUSTED'))
    ) {
      console.info(
        'ℹ️ [TTS Service] Flash-Lite 일일 쿼터 초과 감지, 표준 Flash 모델(gemini-3.8-flash-tts)로 자동 승격 재시도합니다.'
      );
      model = 'gemini-3.8-flash-tts';
      response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [userPart]
          }
        ],
        config: baseConfig
      });
    }
    // 2) Developer instruction 또는 speechMetadata 미지원 에러인 경우 파라미터를 정리하고 안전하게 재시도
    else if (
      (errMsg.includes('Developer instruction') && baseConfig.systemInstruction) ||
      errMsg.includes('speechMetadata') ||
      errMsg.includes('tag') ||
      errMsg.includes('pause')
    ) {
      delete baseConfig.systemInstruction;
      response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [{ text }]
          }
        ],
        config: baseConfig
      });
    } else {
      throw error;
    }
  }

  const candidate = response.candidates?.[0];
  const audioPart = candidate?.content?.parts?.find(
    (part) => typeof part.inlineData?.data === 'string'
  );

  const base64Data = audioPart?.inlineData?.data;
  const mimeType = audioPart?.inlineData?.mimeType ?? 'audio/wav';

  if (!base64Data) {
    throw new Error(
      'Gemini 모델로부터 오디오 데이터를 수신하지 못했습니다. (텍스트 답변만 반환됨)'
    );
  }

  const rawBuffer = Buffer.from(base64Data, 'base64');

  // 만약 반환된 오디오가 헤더 없는 PCM 형식인 경우 WAV 헤더 추가
  if (mimeType.includes('pcm')) {
    const wavBuffer = wrapPcmWithWavHeader(rawBuffer, 24000);
    return {
      audioBase64: wavBuffer.toString('base64'),
      mimeType: 'audio/wav'
    };
  }

  return {
    audioBase64: base64Data,
    mimeType
  };
};

/**
 * 에러 메시지 내에 API Key 등 민감한 자격증명이 평문 노출되지 않도록 마스킹합니다.
 * @param message - 원본 에러 메시지
 * @param sensitiveKey - 마스킹할 API 키
 * @returns 안전하게 마스킹된 에러 메시지
 */
export const maskApiKeyInMessage = (message: string, sensitiveKey?: string): string => {
  if (!sensitiveKey || sensitiveKey.trim().length < 5) {
    return message;
  }
  return message.replaceAll(sensitiveKey.trim(), '***API_KEY_PROTECTED***');
};

/**
 * 백분율 형식의 속도 문자열(예: '+10%', '-20%')을 OpenAI Audio API의 speed 배수(0.25~4.0)로 변환합니다.
 * @param speechRate - 속도 백분율 문자열
 * @returns OpenAI speed 배율 (기본값: 1.0)
 */
export const convertSpeechRateToOpenAiSpeed = (speechRate?: string): number => {
  if (!speechRate) {
    return 1.0;
  }
  const numericRate = parseInt(speechRate.replace('%', ''), 10);
  if (isNaN(numericRate)) {
    return 1.0;
  }
  const speed = 1.0 + numericRate / 100;
  return Math.min(Math.max(Number(speed.toFixed(2)), 0.25), 4.0);
};

/**
 * OpenAI Audio Speech API를 사용하여 텍스트를 고품질 음성(MP3)으로 합성합니다.
 * @param text - 합성할 이벤트 텍스트
 * @param settings - 사용자 앱 설정
 * @returns base64 인코딩된 오디오 데이터 및 MIME 타입
 */
export const synthesizeWithOpenAi = async (
  text: string,
  settings: AppSettings
): Promise<{ audioBase64: string; mimeType: string }> => {
  const apiKey = settings.openaiApiKey?.trim();
  if (!apiKey) {
    throw new Error(
      'OpenAI API 키가 설정되지 않았습니다. 설정 화면에서 API 키를 입력해 주세요.'
    );
  }

  const model = settings.openaiModel || 'tts-1';
  const voice = settings.openaiVoice || 'onyx';
  const speed = convertSpeechRateToOpenAiSpeed(settings.speechRate);

  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      input: text,
      voice,
      response_format: 'mp3',
      speed
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API 오류 (상태 코드: ${response.status}): ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return {
    audioBase64: buffer.toString('base64'),
    mimeType: 'audio/mp3'
  };
};

/**
 * ElevenLabs API를 사용하여 텍스트를 세계 최고 품질의 음성(MP3)으로 합성합니다.
 * @param text - 합성할 이벤트 텍스트
 * @param settings - 사용자 앱 설정
 * @returns base64 인코딩된 오디오 데이터 및 MIME 타입
 */
export const synthesizeWithElevenLabs = async (
  text: string,
  settings: AppSettings
): Promise<{ audioBase64: string; mimeType: string }> => {
  const apiKey = settings.elevenLabsApiKey?.trim();
  if (!apiKey) {
    throw new Error(
      'ElevenLabs API 키가 설정되지 않았습니다. 설정 화면에서 API 키를 입력해 주세요.'
    );
  }

  const voiceId = settings.elevenLabsVoiceId?.trim() || 'JBFqnCBsd6RMkjVDRZzb';
  const modelId = settings.elevenLabsModel || 'eleven_multilingual_v2';
  const stability = typeof settings.elevenLabsStability === 'number' ? settings.elevenLabsStability : 0.5;
  const similarityBoost = typeof settings.elevenLabsSimilarity === 'number' ? settings.elevenLabsSimilarity : 0.75;

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg'
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: {
        stability,
        similarity_boost: similarityBoost,
        use_speaker_boost: true
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs API 오류 (상태 코드: ${response.status}): ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return {
    audioBase64: buffer.toString('base64'),
    mimeType: 'audio/mp3'
  };
};

/**
 * 활성화된 설정에 따라 적합한 TTS 엔진을 호출하여 오디오 데이터를 생성합니다.
 * 만약 Gemini, OpenAI 또는 ElevenLabs TTS 호출 실패(할당량 초과, 인증 오류, 네트워크 오류 등)가 발생하면 기본 Edge-TTS로 안전하게 자동 폴백합니다.
 * @param request - 합성 요청 객체
 * @returns 합성 결과 객체 (폴백 시 isFallback 및 fallbackReason 포함)
 */
export const processTtsRequest = async (
  request: SynthesizeRequest
): Promise<SynthesizeResult> => {
  const { text, settings: rawSettings, voiceOverride, promptOverride } = request;

  if (!text || text.trim().length === 0) {
    return {
      isSuccess: false,
      errorMessage: '낭독할 텍스트가 비어 있습니다.'
    };
  }

  // 세그먼트별 개별 음성/프롬프트 오버라이드가 요청된 경우 병합
  const settings: AppSettings = {
    ...rawSettings,
    ...(voiceOverride
      ? rawSettings.provider === 'gemini'
        ? { geminiVoice: voiceOverride as AppSettings['geminiVoice'] }
        : rawSettings.provider === 'openai'
          ? { openaiVoice: voiceOverride as AppSettings['openaiVoice'] }
          : rawSettings.provider === 'elevenlabs'
            ? { elevenLabsVoiceId: voiceOverride }
            : { edgeVoice: voiceOverride as AppSettings['edgeVoice'] }
      : {}),
    ...(promptOverride ? { geminiSystemPrompt: promptOverride } : {})
  };

  const effectiveRequest: SynthesizeRequest = {
    text,
    settings,
    voiceOverride,
    promptOverride
  };

  // 0. 로컬 오디오 캐시 우선 탐색 (토큰 소모 0 및 0ms 즉시 재생)
  // 단, 무료인 Edge-TTS는 사용자의 요청에 따라 캐싱하지 않음 (유료 AI 엔진만 캐싱)
  let cacheKey: string | null = null;
  if (settings.isCacheEnabled && isCacheableProvider(settings.provider)) {
    cacheKey = calculateCacheKey(effectiveRequest);
    const cachedResult = await getCachedAudio(cacheKey);
    if (cachedResult) {
      console.info(
        `⚡ [TTS Cache Hit] 캐시 적중 (${cacheKey.slice(0, 8)}...): 외부 API 호출을 생략합니다.`
      );
      return cachedResult;
    }
  }

  // 1. ElevenLabs TTS 엔진
  if (settings.provider === 'elevenlabs') {
    try {
      const result = await synthesizeWithElevenLabs(text, settings);

      // 성공 시 백그라운드 캐시 비동기 저장
      if (cacheKey && result.audioBase64) {
        const audioBuf = Buffer.from(result.audioBase64, 'base64');
        saveCachedAudio(cacheKey, audioBuf, result.mimeType, effectiveRequest, settings).catch(
          (err: unknown) => console.warn('⚠️ [AudioCache] ElevenLabs 캐시 저장 실패:', err)
        );
      }

      return {
        isSuccess: true,
        audioBase64: result.audioBase64,
        mimeType: result.mimeType
      };
    } catch (elevenError: unknown) {
      const rawErrorMsg =
        elevenError instanceof Error ? elevenError.message : '알 수 없는 ElevenLabs TTS 오류';
      const maskedError = maskApiKeyInMessage(rawErrorMsg, settings.elevenLabsApiKey);
      console.warn(
        '⚠️ [TTS Service]: ElevenLabs 합성 실패(할당량/키 오류 등), 기본 Edge-TTS로 자동 대체합니다:',
        maskedError
      );

      try {
        const fallbackResult = await synthesizeWithEdgeTts(text, settings);
        console.log('✅ [TTS Service]: ElevenLabs 오류 후 기본 Edge-TTS 자동 대체 재생 성공');
        return {
          isSuccess: true,
          audioBase64: fallbackResult.audioBase64,
          mimeType: fallbackResult.mimeType,
          isFallback: true,
          fallbackReason: maskedError
        };
      } catch (fallbackError: unknown) {
        const rawFallbackMsg =
          fallbackError instanceof Error ? fallbackError.message : 'Edge-TTS 폴백 실패';
        console.error('❌ [TTS Service Error]: Edge-TTS 폴백도 실패함:', rawFallbackMsg);
        return {
          isSuccess: false,
          errorMessage: `ElevenLabs 실패 (${maskedError}) 후 Edge-TTS 대체 합성 실패: ${rawFallbackMsg}`
        };
      }
    }
  }

  // 2. OpenAI TTS 엔진
  if (settings.provider === 'openai') {
    try {
      const result = await synthesizeWithOpenAi(text, settings);

      // 성공 시 백그라운드 캐시 비동기 저장
      if (cacheKey && result.audioBase64) {
        const audioBuf = Buffer.from(result.audioBase64, 'base64');
        saveCachedAudio(cacheKey, audioBuf, result.mimeType, effectiveRequest, settings).catch(
          (err: unknown) => console.warn('⚠️ [AudioCache] OpenAI 캐시 저장 실패:', err)
        );
      }

      return {
        isSuccess: true,
        audioBase64: result.audioBase64,
        mimeType: result.mimeType
      };
    } catch (openaiError: unknown) {
      const rawErrorMsg =
        openaiError instanceof Error ? openaiError.message : '알 수 없는 OpenAI TTS 오류';
      const maskedError = maskApiKeyInMessage(rawErrorMsg, settings.openaiApiKey);
      console.warn(
        '⚠️ [TTS Service]: OpenAI 합성 실패(할당량/키 오류 등), 기본 Edge-TTS로 자동 대체합니다:',
        maskedError
      );

      try {
        const fallbackResult = await synthesizeWithEdgeTts(text, settings);
        console.log('✅ [TTS Service]: OpenAI 오류 후 기본 Edge-TTS 자동 대체 재생 성공');
        return {
          isSuccess: true,
          audioBase64: fallbackResult.audioBase64,
          mimeType: fallbackResult.mimeType,
          isFallback: true,
          fallbackReason: maskedError
        };
      } catch (fallbackError: unknown) {
        const rawFallbackMsg =
          fallbackError instanceof Error ? fallbackError.message : 'Edge-TTS 폴백 실패';
        console.error('❌ [TTS Service Error]: Edge-TTS 폴백도 실패함:', rawFallbackMsg);
        return {
          isSuccess: false,
          errorMessage: `OpenAI 실패 (${maskedError}) 후 Edge-TTS 대체 합성 실패: ${rawFallbackMsg}`
        };
      }
    }
  }

  // 3. Google Gemini TTS 엔진
  if (settings.provider === 'gemini') {
    try {
      const result = await synthesizeWithGemini(text, settings);

      // 성공 시 백그라운드 캐시 비동기 저장 (WAV -> MP3 변환 포함)
      if (cacheKey && result.audioBase64) {
        const audioBuf = Buffer.from(result.audioBase64, 'base64');
        saveCachedAudio(cacheKey, audioBuf, result.mimeType, effectiveRequest, settings).catch(
          (err: unknown) => console.warn('⚠️ [AudioCache] Gemini 캐시 저장 실패:', err)
        );
      }

      return {
        isSuccess: true,
        audioBase64: result.audioBase64,
        mimeType: result.mimeType
      };
    } catch (geminiError: unknown) {
      const rawErrorMsg =
        geminiError instanceof Error ? geminiError.message : '알 수 없는 Gemini TTS 오류';
      const maskedError = maskApiKeyInMessage(rawErrorMsg, settings.geminiApiKey);
      console.warn(
        '⚠️ [TTS Service]: Gemini 합성 실패(할당량 초과 등), 기본 Edge-TTS로 자동 대체합니다:',
        maskedError
      );

      try {
        // 기본 Edge-TTS로 자동 폴백
        const fallbackResult = await synthesizeWithEdgeTts(text, settings);
        console.log('✅ [TTS Service]: 기본 Edge-TTS 자동 대체 재생 성공');
        return {
          isSuccess: true,
          audioBase64: fallbackResult.audioBase64,
          mimeType: fallbackResult.mimeType,
          isFallback: true,
          fallbackReason: maskedError
        };
      } catch (fallbackError: unknown) {
        const rawFallbackMsg =
          fallbackError instanceof Error ? fallbackError.message : 'Edge-TTS 폴백 실패';
        console.error('❌ [TTS Service Error]: Edge-TTS 폴백도 실패함:', rawFallbackMsg);
        return {
          isSuccess: false,
          errorMessage: `Gemini 실패 (${maskedError}) 후 Edge-TTS 대체 합성 실패: ${rawFallbackMsg}`
        };
      }
    }
  }

  // 기본값: Edge-TTS
  try {
    const result = await synthesizeWithEdgeTts(text, settings);
    return {
      isSuccess: true,
      audioBase64: result.audioBase64,
      mimeType: result.mimeType
    };
  } catch (error: unknown) {
    const rawErrorMsg =
      error instanceof Error ? error.message : '알 수 없는 Edge-TTS 변환 오류';
    console.error('❌ [TTS Service Error]:', rawErrorMsg);
    return {
      isSuccess: false,
      errorMessage: rawErrorMsg
    };
  }
};
