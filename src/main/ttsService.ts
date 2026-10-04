import { GoogleGenAI } from '@google/genai';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import type {
  AppSettings,
  SynthesizeRequest,
  SynthesizeResult
} from '@/shared/types';

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
 * @param text - 읽을 텍스트
 * @param settings - 앱 음성 설정
 * @returns MP3 Base64 데이터 및 MIME 타입
 */
export const synthesizeWithEdgeTts = async (
  text: string,
  settings: AppSettings
): Promise<{ audioBase64: string; mimeType: string }> => {
  const tts = new MsEdgeTTS();
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

  return new Promise<{ audioBase64: string; mimeType: string }>(
    (resolve, reject) => {
      readable.on('data', (chunk: unknown) => {
        if (Buffer.isBuffer(chunk)) {
          chunks.push(chunk);
        }
      });

      readable.on('end', () => {
        const fullBuffer = Buffer.concat(chunks);
        resolve({
          audioBase64: fullBuffer.toString('base64'),
          mimeType: 'audio/mp3'
        });
      });

      readable.on('error', (err: unknown) => {
        const errorMsg =
          err instanceof Error ? err.message : 'Edge-TTS 스트림 중 오류 발생';
        reject(new Error(errorMsg));
      });
    }
  );
};

/**
 * Google Gemini 3.8 전용 TTS 모델을 사용하여 감정이 실린 오디오를 생성합니다.
 * @param text - 낭독할 이벤트 텍스트
/**
 * Gemini TTS의 중세 역사극 몰입도를 극대화하기 위해 자연스러운 문장 간 호흡 태그(<short pause>)와 톤 디렉션 태그를 결합합니다.
 * @param text - 원본 낭독 텍스트
 * @param prompt - 사용자가 선택한 어조 지침
 * @returns 호흡 태그와 감정 연기 태그가 가미된 텍스트
 */
const enrichTextForGeminiMedievalImmersion = (text: string, prompt?: string): string => {
  let enriched = text.trim();

  // 1. 문장 마침표/물음표/느낌표 뒤에 자연스러운 호흡(<short pause>) 배치
  enriched = enriched.replace(/([.!?])\s+/g, '$1 <short pause> ');

  // 2. 어조 프롬프트에 맞는 첫머리 Director Tag 결정
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
  const model = settings.geminiModel || 'gemini-3.8-flash-tts';

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
    // Developer instruction 또는 speechMetadata 미지원 에러인 경우 파라미터를 정리하고 안전하게 재시도
    if (
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
const maskApiKeyInMessage = (message: string, sensitiveKey?: string): string => {
  if (!sensitiveKey || sensitiveKey.trim().length < 5) {
    return message;
  }
  return message.replaceAll(sensitiveKey.trim(), '***API_KEY_PROTECTED***');
};

/**
 * 활성화된 설정에 따라 적합한 TTS 엔진을 호출하여 오디오 데이터를 생성합니다.
 * 만약 Gemini TTS 호출 실패(할당량 초과 429, 네트워크 오류 등)가 발생하면 기본 Edge-TTS로 안전하게 자동 폴백합니다.
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
        : { edgeVoice: voiceOverride as AppSettings['edgeVoice'] }
      : {}),
    ...(promptOverride ? { geminiSystemPrompt: promptOverride } : {})
  };

  if (settings.provider === 'gemini') {
    try {
      const result = await synthesizeWithGemini(text, settings);
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
