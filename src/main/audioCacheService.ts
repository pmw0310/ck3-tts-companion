import { app, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import type {
  AppSettings,
  CacheStats,
  SynthesizeRequest,
  SynthesizeResult
} from '@/shared/types';

/** 캐시 인덱스에 저장되는 단일 항목 메타데이터 */
export type CacheIndexEntry = {
  readonly hash: string;
  readonly textPreview: string;
  readonly provider: string;
  readonly voice: string;
  readonly sizeBytes: number;
  readonly createdAt: number;
  lastAccessedAt: number;
  hitCount: number;
};

/** 캐시 인덱스 파일 루트 구조체 */
export type CacheIndex = {
  version: number;
  entries: Record<string, CacheIndexEntry>;
};

/** 기본 최대 캐시 용량 (500 MB) */
export const DEFAULT_MAX_CACHE_SIZE_BYTES = 500 * 1024 * 1024;

/** 기본 MP3 인코딩 비트레이트 (kbps) */
export const MP3_BITRATE_KBPS = 96;

/** 글자당 대략적인 추정 토큰 수 (한글 기준 약 1.5 토큰/글자) */
const ESTIMATED_TOKENS_PER_CHAR = 1.5;

/** 동시 파일 쓰기 경쟁 상태(Race Condition)를 방어하기 위한 인메모리 Promise 맵 */
const pendingWritesMap = new Map<string, Promise<void>>();

/** 테스트 격리용 커스텀 캐시 경로 오버라이드 */
let customCacheDirOverride: string | null = null;

/**
 * 단위 테스트 등에서 격리된 임시 캐시 디렉토리를 지정할 수 있도록 오버라이드합니다.
 * @param dirPath - 오버라이드할 디렉토리 경로 (null 지정 시 기본값으로 복원)
 */
export const setCustomCacheDirForTest = (dirPath: string | null): void => {
  customCacheDirOverride = dirPath;
};

/**
 * 캐시 루트 디렉토리 경로를 반환합니다.
 * @returns 캐시 루트 디렉토리의 절대 경로
 */
export const getAudioCacheDir = (): string => {
  if (customCacheDirOverride) {
    return customCacheDirOverride;
  }
  if (typeof app?.getPath === 'function') {
    return path.join(app.getPath('userData'), 'audio_cache');
  }
  // Node.js CLI 또는 테스트 환경일 경우 임시 디렉토리로 안전 폴백
  return path.join(os.tmpdir(), 'ck3-tts-companion-cache');
};

/**
 * 캐시 인덱스 메타데이터 파일 경로를 반환합니다.
 * @returns cache_index.json 파일의 절대 경로
 */
export const getCacheIndexPath = (): string => {
  return path.join(getAudioCacheDir(), 'cache_index.json');
};

/**
 * 해시 키에 따른 샤딩된 MP3 파일 경로를 반환합니다.
 * 대량 파일 존재 시 OS 디렉토리 탐색 성능 저하를 방지하기 위해 앞 2자리 서브디렉토리를 사용합니다.
 * @param hash - 64자리 SHA-256 해시 문자열
 * @returns MP3 파일의 절대 경로
 */
export const getShardedAudioPath = (hash: string): string => {
  const prefix = hash.slice(0, 2);
  return path.join(getAudioCacheDir(), prefix, `${hash}.mp3`);
};

/**
 * 디스크에서 캐시 인덱스 파일을 읽어옵니다. 파일이 없거나 손상된 경우 새 인덱스를 반환합니다.
 * @returns 캐시 인덱스 객체
 */
export const loadCacheIndex = (): CacheIndex => {
  const indexPath = getCacheIndexPath();
  try {
    if (fs.existsSync(indexPath)) {
      const raw = fs.readFileSync(indexPath, 'utf-8');
      const parsed = JSON.parse(raw) as unknown;
      if (
        parsed &&
        typeof parsed === 'object' &&
        'entries' in parsed &&
        typeof (parsed as CacheIndex).entries === 'object'
      ) {
        return parsed as CacheIndex;
      }
    }
  } catch (err: unknown) {
    console.warn('⚠️ [AudioCache] 캐시 인덱스 로드 실패, 새로 생성합니다:', err);
  }

  return {
    version: 1,
    entries: {}
  };
};

/**
 * 캐시 인덱스를 디스크에 원자적(비동기)으로 저장합니다.
 * @param index - 저장할 캐시 인덱스 객체
 */
export const saveCacheIndex = async (index: CacheIndex): Promise<void> => {
  const indexPath = getCacheIndexPath();
  const dirPath = path.dirname(indexPath);
  const tempPath = `${indexPath}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;

  try {
    if (!fs.existsSync(dirPath)) {
      await fs.promises.mkdir(dirPath, { recursive: true });
    }
    await fs.promises.writeFile(tempPath, JSON.stringify(index, null, 2), 'utf-8');
    await fs.promises.rename(tempPath, indexPath);
  } catch (err: unknown) {
    console.error('❌ [AudioCache] 캐시 인덱스 저장 실패:', err);
    if (fs.existsSync(tempPath)) {
      try {
        await fs.promises.unlink(tempPath);
      } catch {
        // 임시 파일 삭제 실패 무시
      }
    }
  }
};

/**
 * WAV 또는 PCM 버퍼로부터 헤더 정보를 파싱하여 PCM 데이터와 오디오 스펙을 추출합니다.
 * @param wavOrPcmBuffer - 입력 오디오 버퍼
 * @returns PCM Int16Array, 샘플 레이트, 채널 수
 */
export const extractPcmFromWavBuffer = (
  wavOrPcmBuffer: Buffer
): { samples: Int16Array; sampleRate: number; numChannels: number } => {
  // 1. 버퍼가 최소 44바이트이고 표준 RIFF WAVE 헤더로 시작하는지 검사
  const hasRiffHeader =
    wavOrPcmBuffer.length >= 44 &&
    wavOrPcmBuffer.toString('ascii', 0, 4) === 'RIFF' &&
    wavOrPcmBuffer.toString('ascii', 8, 12) === 'WAVE';

  if (!hasRiffHeader) {
    // 헤더가 없는 순수 PCM 데이터인 경우 (Gemini 기본값인 24000Hz 16비트 모노 가정)
    const samples = new Int16Array(
      wavOrPcmBuffer.buffer,
      wavOrPcmBuffer.byteOffset,
      Math.floor(wavOrPcmBuffer.byteLength / 2)
    );
    return { samples, sampleRate: 24000, numChannels: 1 };
  }

  // 2. fmt 청크 파싱
  const numChannels = wavOrPcmBuffer.readUInt16LE(22);
  const sampleRate = wavOrPcmBuffer.readUInt32LE(24);
  const bitsPerSample = wavOrPcmBuffer.readUInt16LE(34);

  // 3. 'data' 서브청크 오프셋 탐색 (확장 헤더 지원)
  let dataOffset = 36;
  let dataSize = wavOrPcmBuffer.length - 44;

  while (dataOffset < wavOrPcmBuffer.length - 8) {
    const chunkId = wavOrPcmBuffer.toString('ascii', dataOffset, dataOffset + 4);
    const chunkSize = wavOrPcmBuffer.readUInt32LE(dataOffset + 4);
    if (chunkId === 'data') {
      dataOffset += 8;
      dataSize = Math.min(chunkSize, wavOrPcmBuffer.length - dataOffset);
      break;
    }
    dataOffset += 8 + chunkSize;
  }

  if (dataOffset >= wavOrPcmBuffer.length) {
    // 청크 탐색 실패 시 기본 44바이트 헤더 사용
    dataOffset = 44;
    dataSize = wavOrPcmBuffer.length - 44;
  }

  const pcmBytes = wavOrPcmBuffer.subarray(dataOffset, dataOffset + dataSize);
  let samples: Int16Array;

  if (bitsPerSample === 16) {
    samples = new Int16Array(
      pcmBytes.buffer,
      pcmBytes.byteOffset,
      Math.floor(pcmBytes.byteLength / 2)
    );
  } else {
    // 16비트가 아닐 경우 기본 모노 Int16 변환
    samples = new Int16Array(Math.floor(pcmBytes.byteLength / 2));
    for (let i = 0; i < samples.length; i++) {
      samples[i] = pcmBytes.readInt16LE(i * 2);
    }
  }

  return {
    samples,
    sampleRate: sampleRate > 0 ? sampleRate : 24000,
    numChannels: numChannels > 0 ? numChannels : 1
  };
};

/**
 * WAV 또는 순수 PCM 오디오 버퍼를 순수 JS MP3 인코더(@breezystack/lamejs)를 사용하여 MP3 버퍼로 변환합니다.
 * @param wavOrPcmBuffer - WAV 또는 PCM 오디오 버퍼
 * @param bitrateKbps - 인코딩 비트레이트 (기본값: 96kbps)
 * @returns 인코딩된 MP3 버퍼
 */
export const convertWavToMp3 = async (
  wavOrPcmBuffer: Buffer,
  bitrateKbps = MP3_BITRATE_KBPS
): Promise<Buffer> => {
  const { samples, sampleRate, numChannels } = extractPcmFromWavBuffer(wavOrPcmBuffer);
  const { Mp3Encoder } = await import('@breezystack/lamejs');

  const encoder = new Mp3Encoder(numChannels, sampleRate, bitrateKbps);
  const mp3Chunks: Buffer[] = [];

  // 스테레오일 경우 채널 분리 처리
  if (numChannels === 2) {
    const left = new Int16Array(samples.length / 2);
    const right = new Int16Array(samples.length / 2);
    for (let i = 0; i < samples.length / 2; i++) {
      left[i] = samples[i * 2] ?? 0;
      right[i] = samples[i * 2 + 1] ?? 0;
    }
    const chunk = encoder.encodeBuffer(left, right);
    if (chunk.length > 0) {
      mp3Chunks.push(Buffer.from(chunk));
    }
  } else {
    // 모노인 경우
    const chunkSize = 1152;
    for (let i = 0; i < samples.length; i += chunkSize) {
      const sampleChunk = samples.subarray(i, i + chunkSize);
      const encoded = encoder.encodeBuffer(sampleChunk);
      if (encoded.length > 0) {
        mp3Chunks.push(Buffer.from(encoded));
      }
    }
  }

  const flushed = encoder.flush();
  if (flushed.length > 0) {
    mp3Chunks.push(Buffer.from(flushed));
  }

  return Buffer.concat(mp3Chunks);
};

/**
 * 캐싱 지원 대상 프로바이더인지 판별합니다.
 * 무료인 Edge-TTS 및 시스템 TTS는 캐싱하지 않으며, 토큰 소모가 발생하는 Gemini, OpenAI, ElevenLabs만 캐싱합니다.
 * @param provider - TTS 제공자 식별자
 * @returns 캐시 대상 여부
 */
export const isCacheableProvider = (provider?: string): boolean => {
  return provider === 'gemini' || provider === 'openai' || provider === 'elevenlabs';
};

/**
 * TTS 요청 객체로부터 보이스, 모델, 어조, 발화 속도, 텍스트를 조합하여 고유한 SHA-256 해시 키를 산출합니다.
 * @param request - TTS 합성 요청 객체
 * @returns 64자리 SHA-256 16진수 문자열
 */
export const calculateCacheKey = (request: SynthesizeRequest): string => {
  const { text, settings, voiceOverride, promptOverride } = request;

  // 음성 엔진별 유효 보이스 결정
  let effectiveVoice = voiceOverride;
  if (!effectiveVoice) {
    switch (settings.provider) {
      case 'gemini':
        effectiveVoice = settings.geminiVoice;
        break;
      case 'openai':
        effectiveVoice = settings.openaiVoice;
        break;
      case 'elevenlabs':
        effectiveVoice = settings.elevenLabsVoiceId;
        break;
      default:
        effectiveVoice = settings.edgeVoice;
        break;
    }
  }

  // 음성 엔진별 유효 모델 결정
  let effectiveModel = '';
  switch (settings.provider) {
    case 'gemini':
      effectiveModel = settings.geminiModel;
      break;
    case 'openai':
      effectiveModel = settings.openaiModel;
      break;
    case 'elevenlabs':
      effectiveModel = settings.elevenLabsModel;
      break;
    default:
      effectiveModel = 'edge-tts';
      break;
  }

  // 어조 지침 프롬프트
  const effectivePrompt =
    promptOverride ??
    (settings.provider === 'gemini' ? settings.geminiSystemPrompt : '');

  // 공백 및 줄바꿈 정규화
  const normalizedText = text.trim().replace(/\s+/g, ' ');

  const hashPayload = {
    provider: settings.provider,
    model: effectiveModel,
    voice: effectiveVoice,
    prompt: effectivePrompt,
    speechRate: settings.speechRate ?? '+0%',
    speechVolume: settings.speechVolume ?? '+0%',
    elevenLabsStability:
      settings.provider === 'elevenlabs' ? settings.elevenLabsStability : undefined,
    elevenLabsSimilarity:
      settings.provider === 'elevenlabs' ? settings.elevenLabsSimilarity : undefined,
    text: normalizedText
  };

  return crypto
    .createHash('sha256')
    .update(JSON.stringify(hashPayload))
    .digest('hex');
};

/**
 * LRU(Least Recently Used) 정책에 따라 캐시 총 용량이 한도를 초과할 때 오래된 파일부터 삭제합니다.
 * @param maxSizeBytes - 허용되는 최대 캐시 크기 (바이트)
 */
export const runLruEvictionIfNeeded = async (
  maxSizeBytes = DEFAULT_MAX_CACHE_SIZE_BYTES
): Promise<void> => {
  const index = loadCacheIndex();
  const entries = Object.values(index.entries);

  let totalSize = entries.reduce((acc, cur) => acc + cur.sizeBytes, 0);
  if (totalSize <= maxSizeBytes) {
    return;
  }

  console.info(
    `ℹ️ [AudioCache] 캐시 용량 한도 초과 (${(totalSize / 1024 / 1024).toFixed(1)}MB > ${(maxSizeBytes / 1024 / 1024).toFixed(1)}MB). LRU 정리를 시작합니다.`
  );

  // 마지막 접근 시간 기준 오름차순(가장 오래전에 접근된 순) 정렬
  entries.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);

  const targetSize = maxSizeBytes * 0.8; // 한도의 80% 수준까지 확보

  for (const entry of entries) {
    if (totalSize <= targetSize) {
      break;
    }

    const filePath = getShardedAudioPath(entry.hash);
    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
      totalSize -= entry.sizeBytes;
      delete index.entries[entry.hash];
    } catch (err: unknown) {
      console.warn(`⚠️ [AudioCache] LRU 캐시 파일 삭제 실패 (${entry.hash}):`, err);
    }
  }

  await saveCacheIndex(index);
  console.info(
    `✅ [AudioCache] LRU 정리 완료. 현재 캐시 용량: ${(totalSize / 1024 / 1024).toFixed(1)}MB`
  );
};

/**
 * 캐시에서 해당 해시 키의 오디오 데이터를 탐색하여 반환합니다.
 * @param hash - 64자리 SHA-256 해시 키
 * @returns 캐시 적중 시 SynthesizeResult, 없을 경우 null
 */
export const getCachedAudio = async (
  hash: string
): Promise<SynthesizeResult | null> => {
  // 비정상 해시 키 또는 경로 조작(Path Traversal) 공격 방어
  if (!/^[a-f0-9]{64}$/i.test(hash)) {
    return null;
  }

  const filePath = getShardedAudioPath(hash);

  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const buffer = await fs.promises.readFile(filePath);
    if (buffer.length === 0) {
      return null;
    }

    // 메타데이터 갱신 (마지막 접근 시각 및 적중 카운트)
    try {
      const index = loadCacheIndex();
      const entry = index.entries[hash];
      if (entry) {
        entry.lastAccessedAt = Date.now();
        entry.hitCount = (entry.hitCount ?? 0) + 1;
        await saveCacheIndex(index);
      }
    } catch (err: unknown) {
      console.warn('⚠️ [AudioCache] 메타데이터 갱신 오류:', err);
    }

    return {
      isSuccess: true,
      audioBase64: buffer.toString('base64'),
      mimeType: 'audio/mp3',
      fromCache: true
    };
  } catch (err: unknown) {
    console.warn(`⚠️ [AudioCache] 캐시 파일 읽기 실패 (${hash}):`, err);
    return null;
  }
};

/**
 * 현재 진행 중인 모든 백그라운드 캐시 쓰기 작업이 완료될 때까지 대기합니다.
 */
export const waitForPendingCacheWrites = async (): Promise<void> => {
  const pending = Array.from(pendingWritesMap.values());
  if (pending.length > 0) {
    await Promise.allSettled(pending);
  }
};

/**
 * 생성된 오디오 버퍼를 MP3로 변환(필요한 경우)하여 로컬 디스크 및 캐시 인덱스에 영구 저장합니다.
 * @param hash - 64자리 SHA-256 해시 키
 * @param audioBuffer - 원본 오디오 버퍼 (WAV 또는 MP3)
 * @param mimeType - 오디오 MIME 타입 ('audio/wav', 'audio/mp3' 등)
 * @param request - TTS 요청 객체
 * @param settings - 사용자 앱 설정
 */
export const saveCachedAudio = async (
  hash: string,
  audioBuffer: Buffer,
  mimeType: string,
  request: SynthesizeRequest,
  settings: AppSettings
): Promise<void> => {
  // 캐시 비활성화 상태이거나 무료 프로바이더(Edge-TTS 등)인 경우 캐싱하지 않음
  if (!settings.isCacheEnabled || !isCacheableProvider(settings.provider)) {
    return;
  }

  // 비정상 해시 키 방어
  if (!/^[a-f0-9]{64}$/i.test(hash)) {
    return;
  }

  // 동일한 파일에 동시 쓰기가 진행 중이면 기존 Promise 대기
  const ongoing = pendingWritesMap.get(hash);
  if (ongoing) {
    return ongoing;
  }

  const writePromise = (async () => {
    try {
      let mp3Buffer: Buffer;

      // 1. WAV 또는 PCM인 경우 순수 JS MP3 인코더로 변환
      if (mimeType.includes('wav') || mimeType.includes('pcm')) {
        mp3Buffer = await convertWavToMp3(audioBuffer);
      } else {
        mp3Buffer = audioBuffer;
      }

      const filePath = getShardedAudioPath(hash);
      const dirPath = path.dirname(filePath);
      const tempPath = `${filePath}.${Date.now()}.tmp`;

      // 2. 디렉토리 생성 및 원자적 파일 쓰기
      if (!fs.existsSync(dirPath)) {
        await fs.promises.mkdir(dirPath, { recursive: true });
      }

      await fs.promises.writeFile(tempPath, mp3Buffer);
      await fs.promises.rename(tempPath, filePath);

      // 3. 인덱스 업데이트
      const index = loadCacheIndex();
      const textPreview =
        request.text.length > 30 ? `${request.text.slice(0, 30)}...` : request.text;

      index.entries[hash] = {
        hash,
        textPreview,
        provider: settings.provider,
        voice: request.voiceOverride ?? settings.geminiVoice ?? settings.edgeVoice,
        sizeBytes: mp3Buffer.length,
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
        hitCount: 0
      };

      await saveCacheIndex(index);

      // 4. 용량 한도 체크 및 LRU 실행
      const maxSizeBytes = (settings.maxCacheSizeMb ?? 500) * 1024 * 1024;
      await runLruEvictionIfNeeded(maxSizeBytes);

      console.info(
        `✅ [AudioCache] 캐시 저장 완료 (${hash.slice(0, 8)}..., ${(mp3Buffer.length / 1024).toFixed(1)}KB)`
      );
    } catch (err: unknown) {
      console.error(`❌ [AudioCache] 캐시 저장 실패 (${hash}):`, err);
    } finally {
      pendingWritesMap.delete(hash);
    }
  })();

  pendingWritesMap.set(hash, writePromise);
  return writePromise;
};

/**
 * 현재 로컬 캐시 통계 정보를 산출하여 반환합니다.
 * @param settings - 사용자 앱 설정
 * @returns 캐시 통계 객체
 */
export const getCacheStats = (settings: AppSettings): CacheStats => {
  const index = loadCacheIndex();
  const entries = Object.values(index.entries);

  let totalSizeBytes = 0;
  let totalHitCount = 0;
  let totalCharsSaved = 0;

  for (const entry of entries) {
    totalSizeBytes += entry.sizeBytes;
    totalHitCount += entry.hitCount ?? 0;
    totalCharsSaved += (entry.textPreview?.length ?? 10) * (entry.hitCount ?? 0);
  }

  const savedTokensEstimate = Math.round(totalCharsSaved * ESTIMATED_TOKENS_PER_CHAR);
  const maxSizeBytes = (settings.maxCacheSizeMb ?? 500) * 1024 * 1024;

  return {
    totalFiles: entries.length,
    totalSizeBytes,
    maxSizeBytes,
    hitCount: totalHitCount,
    savedTokensEstimate,
    cacheDirPath: getAudioCacheDir()
  };
};

/**
 * 전체 오디오 캐시 디렉토리 및 인덱스 파일을 삭제하여 초기화합니다.
 * @returns 성공 여부
 */
export const clearAudioCache = async (): Promise<boolean> => {
  const cacheDir = getAudioCacheDir();
  try {
    if (fs.existsSync(cacheDir)) {
      await fs.promises.rm(cacheDir, { recursive: true, force: true });
    }
    console.info('✅ [AudioCache] 로컬 오디오 캐시 전체 삭제 완료');
    return true;
  } catch (err: unknown) {
    console.error('❌ [AudioCache] 캐시 삭제 실패:', err);
    return false;
  }
};

/**
 * 시스템 파일 관리자(Finder/탐색기)로 캐시 디렉토리를 엽니다.
 * @returns 열기 성공 여부
 */
export const openCacheDirectory = async (): Promise<boolean> => {
  const cacheDir = getAudioCacheDir();
  try {
    if (!fs.existsSync(cacheDir)) {
      await fs.promises.mkdir(cacheDir, { recursive: true });
    }
    if (typeof shell?.openPath === 'function') {
      const errorMsg = await shell.openPath(cacheDir);
      if (errorMsg) {
        console.warn('⚠️ [AudioCache] shell.openPath 실패:', errorMsg);
        return false;
      }
      return true;
    }
    return false;
  } catch (err: unknown) {
    console.error('❌ [AudioCache] 캐시 디렉토리 열기 예외 발생:', err);
    return false;
  }
};
