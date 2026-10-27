/** 지원하는 운영체제 플랫폼 */
export type SupportedPlatform = 'darwin' | 'win32' | 'linux';

/** TTS 엔진 제공자 구분 */
export type TtsProviderType = 'edge' | 'gemini' | 'openai' | 'elevenlabs' | 'system';

/** 지원하는 Gemini 음성 모델 프리셋 */
export type GeminiVoiceName = 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Aoede' | 'Algenib';

/** 지원하는 Gemini 3.8 전용 TTS 모델 식별자 */
export type GeminiModelName =
  | 'gemini-3.8-flash-tts'
  | 'gemini-3.8-flash-lite-tts';

/** 지원하는 OpenAI 음성 프리셋 */
export type OpenAiVoiceName =
  | 'onyx'
  | 'fable'
  | 'alloy'
  | 'echo'
  | 'nova'
  | 'shimmer';

/** 지원하는 OpenAI 음성 합성 모델 식별자 */
export type OpenAiModelName =
  | 'tts-1'
  | 'tts-1-hd';

/** 지원하는 ElevenLabs 음성 합성 모델 식별자 */
export type ElevenLabsModelName =
  | 'eleven_multilingual_v2'
  | 'eleven_turbo_v2_5'
  | 'eleven_flash_v2_5';

/** Edge-TTS 음성 프리셋 (한국어 및 영어) */
export type EdgeVoiceName =
  | 'ko-KR-SunHiNeural'
  | 'ko-KR-InJoonNeural'
  | 'ko-KR-HyunsuNeural'
  | 'en-US-GuyNeural'
  | 'en-US-JennyNeural'
  | 'en-US-ChristopherNeural'
  | 'en-GB-RyanNeural'
  | 'en-GB-SoniaNeural';

/** 지원하는 시스템(로컬 OS) 내장 음성 식별자 */
export type SystemVoiceName =
  | 'default'
  | 'Yuna'
  | 'Reed'
  | 'Eddy'
  | 'Flo'
  | 'Grandma'
  | 'Grandpa'
  | 'Rocko'
  | 'Sandy'
  | 'Shelley'
  | 'Microsoft Heami'
  | (string & {});

/** 화자 성별 구분 타입 */
export type SpeakerGender = 'male' | 'female' | 'narrator';

/** 지원하는 처형 사운드 유형 */
export type ExecutionSoundType =
  | 'beheading'
  | 'burning'
  | 'sacrifice'
  | 'kennel'
  | 'hanging'
  | 'devour'
  | 'public'
  | 'generic';

/** 감지된 처형 효과음 이벤트 */
export type ExecutionSoundEvent = {
  readonly type: ExecutionSoundType;
  readonly gender: 'male' | 'female';
  readonly rawName: string;
  readonly timestamp: number;
  readonly logTimestamp?: string;
  readonly isConsoleEcho?: boolean;
};

/**
 * CK3 이벤트 유형
 * - letter: 편지(발신자 단일 보이스), war_results: 전쟁 결과창(동일 본문 연속 전쟁 허용), character/default: 일반
 */
export type Ck3EventType = 'letter' | 'character' | 'war_results' | 'legend_chronicle' | 'default';

/** 감지된 CK3 게임 이벤트 데이터 */
export type Ck3EventMessage = {
  readonly id: string;
  readonly timestamp: number;
  readonly title?: string;
  readonly content: string;
  readonly rawText: string;
  readonly isForceReplay?: boolean;
  readonly speakerGender?: SpeakerGender;
  readonly eventType?: Ck3EventType;
};


/** 애플리케이션 전체 설정 인터페이스 */
export type AppSettings = {
  readonly provider: TtsProviderType;
  readonly edgeVoice: EdgeVoiceName;
  readonly geminiApiKey: string;
  readonly geminiModel: GeminiModelName;
  readonly geminiVoice: GeminiVoiceName;
  readonly geminiSystemPrompt: string;
  readonly openaiApiKey: string;
  readonly openaiModel: OpenAiModelName;
  readonly openaiVoice: OpenAiVoiceName;
  readonly elevenLabsApiKey: string;
  readonly elevenLabsModel: ElevenLabsModelName;
  readonly elevenLabsVoiceId: string;
  readonly elevenLabsVoiceMale: string;
  readonly elevenLabsVoiceFemale: string;
  readonly elevenLabsStability: number;
  readonly elevenLabsSimilarity: number;
  readonly speechRate: string; // 예: '+0%', '+10%'
  readonly speechVolume: string; // 예: '+0%'
  readonly customLogPath: string | null;
  readonly isAutoPlayEnabled: boolean;
  readonly isAudioDramaEnabled: boolean;
  readonly edgeVoiceMale: EdgeVoiceName;
  readonly edgeVoiceFemale: EdgeVoiceName;
  readonly geminiVoiceMale: GeminiVoiceName;
  readonly geminiVoiceFemale: GeminiVoiceName;
  readonly openaiVoiceMale: OpenAiVoiceName;
  readonly openaiVoiceFemale: OpenAiVoiceName;
  readonly systemVoice: SystemVoiceName;
  readonly isCacheEnabled: boolean;
  readonly maxCacheSizeMb: number;
  readonly isExecutionSoundEnabled: boolean;
  readonly executionSoundVolume: number;
  readonly appLanguage?: 'ko' | 'en';
};

/** TTS 합성 요청 매개변수 */
export type SynthesizeRequest = {
  readonly text: string;
  readonly settings: AppSettings;
  readonly voiceOverride?: string;
  readonly promptOverride?: string;
};

/** TTS 합성 결과 인터페이스 */
export type SynthesizeResult = {
  readonly isSuccess: boolean;
  readonly audioBase64?: string;
  readonly mimeType?: string;
  readonly errorMessage?: string;
  readonly isFallback?: boolean;
  readonly fallbackReason?: string;
  readonly fallbackFromProvider?: TtsProviderType;
  readonly fallbackToProvider?: TtsProviderType;
  readonly fromCache?: boolean;
};

/** 로컬 오디오 캐시 통계 인터페이스 */
export type CacheStats = {
  readonly totalFiles: number;
  readonly totalSizeBytes: number;
  readonly maxSizeBytes: number;
  readonly hitCount: number;
  readonly savedTokensEstimate: number;
  readonly cacheDirPath: string;
};

/** 애플리케이션 정보 인터페이스 */
export type AppInfo = {
  readonly version: string;
  readonly author: string;
  readonly productName: string;
  readonly repoUrl: string;
};

/** 릴리스 파일 에셋 메타데이터 */
export type UpdateAssetInfo = {
  readonly name: string;
  readonly downloadUrl: string;
  readonly sizeBytes: number;
  readonly platform: 'win32' | 'darwin' | 'unknown';
  readonly arch?: string;
};

/** 실시간 다운로드 진행률 정보 */
export type UpdateDownloadProgress = {
  readonly totalBytes: number;
  readonly downloadedBytes: number;
  readonly percent: number;
  readonly speedBytesPerSec: number;
};

/** GitHub 릴리스 업데이트 검사 결과 인터페이스 */
export type UpdateCheckResult = {
  readonly hasUpdate: boolean;
  readonly currentVersion: string;
  readonly latestVersion: string;
  readonly releaseUrl: string;
  readonly releaseTitle?: string;
  readonly releaseNotes?: string;
  readonly publishedAt?: string;
  readonly matchedAsset?: UpdateAssetInfo;
  readonly errorMessage?: string;
};

/** CK3 모드 버전 검사 상태 인터페이스 */
export type ModVersionStatus = {
  readonly isInstalled: boolean;
  readonly isSynced: boolean;
  readonly appVersion: string;
  readonly installedVersion: string | null;
  readonly targetModDir: string;
  readonly sourceModDir: string;
  readonly errorMessage?: string;
};

/** CK3 모드 파일 동기화 결과 인터페이스 */
export type ModSyncResult = {
  readonly isSuccess: boolean;
  readonly copiedFilesCount: number;
  readonly removedFilesCount: number;
  readonly targetModDir: string;
  readonly syncedVersion: string;
  readonly errorMessage?: string;
};

/** 렌더러와 메인 간의 IPC API 정의 */
export type ElectronApiBridge = {
  readonly getLogPath: () => Promise<string | null>;
  readonly getSettings: () => Promise<AppSettings>;
  readonly saveSettings: (newSettings: AppSettings) => Promise<boolean>;
  readonly synthesizeSpeech: (request: SynthesizeRequest) => Promise<SynthesizeResult>;
  readonly onEventDetected: (callback: (event: Ck3EventMessage) => void) => () => void;
  readonly onExecutionSound: (callback: (event: ExecutionSoundEvent) => void) => () => void;
  readonly onStopSpeech: (callback: () => void) => () => void;
  readonly onLogStatusChange: (callback: (isWatching: boolean, path: string | null) => void) => () => void;
  readonly onToggleSpeech: (callback: () => void) => () => void;
  readonly selectCustomLogPath: () => Promise<string | null>;
  readonly getAppInfo: () => Promise<AppInfo>;
  readonly checkForUpdates: () => Promise<UpdateCheckResult>;
  readonly openExternal: (url: string) => Promise<boolean>;
  readonly getCacheStats: () => Promise<CacheStats>;
  readonly clearCache: () => Promise<boolean>;
  readonly openCacheDir: () => Promise<boolean>;
  readonly getModVersionStatus: () => Promise<ModVersionStatus>;
  readonly syncModFiles: () => Promise<ModSyncResult>;
  readonly startDownloadUpdate: (
    downloadUrl: string
  ) => Promise<{ isSuccess: boolean; filePath?: string; errorMessage?: string }>;
  readonly installAndRestartUpdate: (downloadedFilePath: string) => Promise<boolean>;
  readonly onUpdateDownloadProgress: (
    callback: (progress: UpdateDownloadProgress) => void
  ) => () => void;
};

