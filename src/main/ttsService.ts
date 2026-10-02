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
 * @param settings - Gemini API 키 및 음성 설정
 * @returns WAV Base64 데이터 및 MIME 타입
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
          voiceName: settings.geminiVoice || 'Aoede'
        }
      }
    }
  };

  if (effectiveSystemPrompt) {
    baseConfig.systemInstruction = effectiveSystemPrompt;
  }

  let response;
  try {
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
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    // Developer instruction 미지원 에러인 경우 systemInstruction을 제거하고 자동 재시도
    if (errMsg.includes('Developer instruction') && baseConfig.systemInstruction) {
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
 * @param request - 합성 요청 객체
 * @returns 합성 결과 객체
 */
export const processTtsRequest = async (
  request: SynthesizeRequest
): Promise<SynthesizeResult> => {
  const { text, settings } = request;

  if (!text || text.trim().length === 0) {
    return {
      isSuccess: false,
      errorMessage: '낭독할 텍스트가 비어 있습니다.'
    };
  }

  try {
    if (settings.provider === 'gemini') {
      const result = await synthesizeWithGemini(text, settings);
      return {
        isSuccess: true,
        audioBase64: result.audioBase64,
        mimeType: result.mimeType
      };
    }

    // 기본값: Edge-TTS
    const result = await synthesizeWithEdgeTts(text, settings);
    return {
      isSuccess: true,
      audioBase64: result.audioBase64,
      mimeType: result.mimeType
    };
  } catch (error: unknown) {
    const rawErrorMsg =
      error instanceof Error ? error.message : '알 수 없는 TTS 변환 오류';
    const errorMsg = maskApiKeyInMessage(rawErrorMsg, settings.geminiApiKey);
    console.error('❌ [TTS Service Error]:', errorMsg);
    return {
      isSuccess: false,
      errorMessage: errorMsg
    };
  }
};
