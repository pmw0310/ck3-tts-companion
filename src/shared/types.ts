/** 지원하는 운영체제 플랫폼 */
export type SupportedPlatform = 'darwin' | 'win32' | 'linux';

/** TTS 엔진 제공자 구분 */
export type TtsProviderType = 'edge' | 'gemini' | 'system';

/** 지원하는 Gemini 음성 모델 프리셋 */
export type GeminiVoiceName = 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Aoede' | 'Algenib';

/** 지원하는 Gemini 3.8 전용 TTS 모델 식별자 */
export type GeminiModelName =
  | 'gemini-3.8-flash-tts'
  | 'gemini-3.8-flash-lite-tts';

/** Edge-TTS 한국어 음성 프리셋 */
export type EdgeVoiceName =
  | 'ko-KR-SunHiNeural'
  | 'ko-KR-InJoonNeural'
  | 'ko-KR-HyunsuNeural';

/** 화자 성별 구분 타입 */
export type SpeakerGender = 'male' | 'female' | 'narrator';

/** 감지된 CK3 게임 이벤트 데이터 */
export type Ck3EventMessage = {
  readonly id: string;
  readonly timestamp: number;
  readonly title?: string;
  readonly content: string;
  readonly rawText: string;
  readonly isForceReplay?: boolean;
  readonly speakerGender?: SpeakerGender;
  readonly eventType?: 'letter' | 'character' | 'default';
};


/** 애플리케이션 전체 설정 인터페이스 */
export type AppSettings = {
  readonly provider: TtsProviderType;
  readonly edgeVoice: EdgeVoiceName;
  readonly geminiApiKey: string;
  readonly geminiModel: GeminiModelName;
  readonly geminiVoice: GeminiVoiceName;
  readonly geminiSystemPrompt: string;
  readonly speechRate: string; // 예: '+0%', '+10%'
  readonly speechVolume: string; // 예: '+0%'
  readonly customLogPath: string | null;
  readonly isAutoPlayEnabled: boolean;
  readonly isAudioDramaEnabled: boolean;
  readonly edgeVoiceMale: EdgeVoiceName;
  readonly edgeVoiceFemale: EdgeVoiceName;
  readonly geminiVoiceMale: GeminiVoiceName;
  readonly geminiVoiceFemale: GeminiVoiceName;
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
};

/** 애플리케이션 정보 인터페이스 */
export type AppInfo = {
  readonly version: string;
  readonly author: string;
  readonly productName: string;
  readonly repoUrl: string;
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
  readonly errorMessage?: string;
};

/** 렌더러와 메인 간의 IPC API 정의 */
export type ElectronApiBridge = {
  readonly getLogPath: () => Promise<string | null>;
  readonly getSettings: () => Promise<AppSettings>;
  readonly saveSettings: (newSettings: AppSettings) => Promise<boolean>;
  readonly synthesizeSpeech: (request: SynthesizeRequest) => Promise<SynthesizeResult>;
  readonly onEventDetected: (callback: (event: Ck3EventMessage) => void) => () => void;
  readonly onStopSpeech: (callback: () => void) => () => void;
  readonly onLogStatusChange: (callback: (isWatching: boolean, path: string | null) => void) => () => void;
  readonly onToggleSpeech: (callback: () => void) => () => void;
  readonly selectCustomLogPath: () => Promise<string | null>;
  readonly getAppInfo: () => Promise<AppInfo>;
  readonly checkForUpdates: () => Promise<UpdateCheckResult>;
  readonly openExternal: (url: string) => Promise<boolean>;
};

