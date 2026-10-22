import type {
   AppInfo,
   AppSettings,
   CacheStats,
   Ck3EventMessage,
   Ck3EventType,
   EdgeVoiceName,
   ElevenLabsModelName,
   ExecutionSoundEvent,
   GeminiModelName,
   GeminiVoiceName,
   OpenAiModelName,
   OpenAiVoiceName,
   SpeakerGender,
   SynthesizeResult,
   SystemVoiceName,
   TtsProviderType,
   UpdateCheckResult,
   UpdateDownloadProgress,
} from "@/shared/types";
import { splitIntoPlaybackChunks } from "@/shared/sentenceSplitter";
import { splitNarrativeAndDialogue } from "@/shared/narrativeDialogueSplitter";
import { isTextFragmentOf, shouldPlayEvent } from "@/shared/eventDeduplicator";
import { buildFallbackToastMessage } from "@/shared/fallbackMessageFormatter";
import { initAudioVisualizer } from "@/renderer/audioVisualizer";
import { playExecutionSound } from "@/renderer/executionSoundManager";
import {
   t,
   setLanguage,
   getCurrentLocale,
   type SupportedLocale,
} from "@/renderer/i18n";

// macOS 환경 감지 시 네이티브 신호등(트래픽 라이트) 버튼 안전 여백 클래스 즉시 부여
if (
   typeof navigator !== "undefined" &&
   (navigator.userAgent.includes("Mac") || navigator.platform.includes("Mac"))
) {
   document.documentElement.classList.add("platform-darwin");
   if (document.body) {
      document.body.classList.add("platform-darwin");
   } else {
      window.addEventListener("DOMContentLoaded", () => {
         document.body.classList.add("platform-darwin");
      });
   }
}

/** Gemini 어조 프리셋 레코드 */
const GEMINI_TONE_PRESETS: Record<string, string> = {
   trailer:
      "A calm, intellectual, deep, and slightly dry gravelly baritone with a weary yet dignified delivery, reminiscent of the Crusader Kings trailer narrator and Kim Kitsuragi. Speak in a composed, measured, and deadpan solemnity with quiet authority. Do not shout, do not sound cheerful or melodramatic. Deliver every line with dry gravitas and philosophical composure. 차분하고 냉철하며 묵직한 중저음의 지적인 어조로 낭독하라.",
   narrator:
      "A solemn, deep, and majestic medieval court chronicler reciting the annals of history. Speak in a grave, resonant, and measured cadence with deep historical gravitas. Do not sound modern or cheerful; deliver every word with historical weight and quiet reverence. 진중하고 장엄한 중세 사관의 목소리로 낭독하라.",
   warrior:
      "A battle-hardened crusader knight commander and veteran warrior. Heavy, firm, commanding, and resolute delivery with deep authority forged in iron and blood. 거칠고 단호하며 묵직한 백전노장의 목소리로 읽어라.",
   schemer:
      "A sinister, cunning, and low-voiced royal spymaster whispering in candlelit chambers. Low, secretive, chilling, and conspiratorial tone with tense pauses. 낮고 은밀하며 서늘한 궁정 모략가의 어조로 읽어라.",
   clergy:
      "A devout and venerable medieval archbishop reciting holy scripture and Latin blessings. Reverent, transcendent, peaceful, and deeply devout. 성스럽고 경건한 대주교의 기도문 낭독 어조로 읽어라.",
   emperor:
      "An awe-inspiring sovereign monarch proclaiming a royal edict from the high throne. Regal, commanding, grand, and commanding absolute respect. 위엄 있고 당당한 제왕의 칙령 낭독 어조로 읽어라.",
};

/** 테스트용 샘플 중세 나레이션 문장 (한국어 및 영어) */
const SAMPLE_TEST_TEXT_KO =
   "폐하, 국경 지대에서 가신들이 비밀리에 반란을 모의하고 있다는 밀서가 당도하였습니다. 신속한 결단이 필요하옵니다.";
const SAMPLE_TEST_TEXT_EN =
   "Sire, a secret message has arrived revealing that your vassals are covertly plotting a rebellion on the border. A swift decision is required.";
const getSampleTestText = (): string =>
   getCurrentLocale() === "en" ? SAMPLE_TEST_TEXT_EN : SAMPLE_TEST_TEXT_KO;

/** 렌더러 애플리케이션 상태 */
type RendererState = {
   settings: AppSettings;
   currentEvent: Ck3EventMessage | null;
   history: Ck3EventMessage[];
   isPlaying: boolean;
};

const state: RendererState = {
   settings: {
      provider: "edge",
      edgeVoice: "ko-KR-SunHiNeural",
      geminiApiKey: "",
      geminiModel: "gemini-3.8-flash-tts",
      geminiVoice: "Charon",
      geminiSystemPrompt: GEMINI_TONE_PRESETS.narrator ?? "",
      speechRate: "+0%",
      speechVolume: "+0%",
      customLogPath: null,
      isAutoPlayEnabled: true,
      isAudioDramaEnabled: true,
      edgeVoiceMale: "ko-KR-InJoonNeural",
      edgeVoiceFemale: "ko-KR-SunHiNeural",
      geminiVoiceMale: "Charon",
      geminiVoiceFemale: "Kore",
      openaiApiKey: "",
      openaiModel: "tts-1",
      openaiVoice: "onyx",
      openaiVoiceMale: "onyx",
      openaiVoiceFemale: "nova",
      elevenLabsApiKey: "",
      elevenLabsModel: "eleven_multilingual_v2",
      elevenLabsVoiceId: "JBFqnCBsd6RMkjVDRZzb",
      elevenLabsVoiceMale: "JBFqnCBsd6RMkjVDRZzb",
      elevenLabsVoiceFemale: "Xb7hH8MSUJpSbSDYk0k2",
      systemVoice: "default",
      elevenLabsStability: 0.5,
      elevenLabsSimilarity: 0.75,
      isCacheEnabled: true,
      maxCacheSizeMb: 500,
      isExecutionSoundEnabled: true,
      executionSoundVolume: 0.8,
      appLanguage: "ko",
   },
   currentEvent: null,
   history: [],
   isPlaying: false,
};

// DOM 엘리먼트 캐싱
const providerBadge = document.getElementById(
   "provider-badge",
) as HTMLSpanElement;
const audioVisualizer = document.getElementById(
   "audio-visualizer",
) as HTMLDivElement;
const ttsStatusIndicator = document.getElementById(
   "tts-status-indicator",
) as HTMLDivElement;
const ttsStatusText = document.getElementById(
   "tts-status-text",
) as HTMLSpanElement;

const currentEventTitle = document.getElementById(
   "current-event-title",
) as HTMLHeadingElement;
const currentEventContent = document.getElementById(
   "current-event-content",
) as HTMLDivElement;
const historyList = document.getElementById("history-list") as HTMLDivElement;

const btnReplay = document.getElementById("btn-replay") as HTMLButtonElement;
const btnStopAudio = document.getElementById(
   "btn-stop-audio",
) as HTMLButtonElement;
const btnClearHistory = document.getElementById(
   "btn-clear-history",
) as HTMLButtonElement;
const chkAutoPlay = document.getElementById(
   "chk-auto-play",
) as HTMLInputElement;

const btnOpenSettings = document.getElementById(
   "btn-open-settings",
) as HTMLButtonElement;
const btnCloseSettings = document.getElementById(
   "btn-close-settings",
) as HTMLButtonElement;
const btnSaveSettings = document.getElementById(
   "btn-save-settings",
) as HTMLButtonElement;
const btnTestSpeech = document.getElementById(
   "btn-test-speech",
) as HTMLButtonElement;
const settingsModal = document.getElementById(
   "settings-modal",
) as HTMLDivElement;

const audioPlayer = document.getElementById(
   "tts-audio-player",
) as HTMLAudioElement;
// 헤드셋 0dBFS 피크 디지털 클리핑 및 진동판 과부하(퍽 소리) 방지를 위한 마진 확보
audioPlayer.volume = 0.92;

/** 현재 재생 중인 오디오 Blob URL 메모리 참조 */
let currentAudioBlobUrl: string | null = null;
/** 오디오 재생 ended 이벤트 누락 방지 안전 가드 타이머 */
let currentPlaybackSafetyTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Base64 인코딩된 오디오 데이터를 브라우저 메모리 Blob URL로 변환합니다.
 * 거대한 data URL의 파싱 지연(100~200ms) 및 메인 스레드 GC 버벅임을 제거합니다.
 * @param base64 - Base64 오디오 문자열
 * @param mimeType - 오디오 MIME 타입
 * @returns 브라우저 Blob URL
 */
const base64ToBlobUrl = (base64: string, mimeType: string): string => {
   const binaryString = atob(base64);
   const len = binaryString.length;
   const bytes = new Uint8Array(len);
   for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
   }
   const blob = new Blob([bytes], { type: mimeType });
   return URL.createObjectURL(blob);
};

// 실시간 오디오 파형(비주얼라이저) 제어 컨트롤러 초기화 (초경량 Web Audio API 연동)
const visualizerController = initAudioVisualizer(audioPlayer, audioVisualizer);

// 설정 폼 엘리먼트
const edgeOptionsGroup = document.getElementById(
   "edge-options",
) as HTMLDivElement;
const geminiOptionsGroup = document.getElementById(
   "gemini-options",
) as HTMLDivElement;
const selectEdgeVoice = document.getElementById(
   "select-edge-voice",
) as HTMLSelectElement;
const rangeSpeechRate = document.getElementById(
   "range-speech-rate",
) as HTMLInputElement;
const speechRateDisplay = document.getElementById(
   "speech-rate-display",
) as HTMLSpanElement;

const selectGeminiModel = document.getElementById(
   "select-gemini-model",
) as HTMLSelectElement;
const inputGeminiKey = document.getElementById(
   "input-gemini-key",
) as HTMLInputElement;
const selectGeminiVoice = document.getElementById(
   "select-gemini-voice",
) as HTMLSelectElement;
const selectGeminiTone = document.getElementById(
   "select-gemini-tone",
) as HTMLSelectElement;
const customPromptWrapper = document.getElementById(
   "custom-prompt-wrapper",
) as HTMLDivElement;
const textareaGeminiPrompt = document.getElementById(
   "textarea-gemini-prompt",
) as HTMLTextAreaElement;

// OpenAI 설정 폼 엘리먼트
const openaiOptionsGroup = document.getElementById(
   "openai-options",
) as HTMLDivElement;
const selectOpenaiModel = document.getElementById(
   "select-openai-model",
) as HTMLSelectElement;
const inputOpenaiKey = document.getElementById(
   "input-openai-key",
) as HTMLInputElement;
const selectOpenaiVoice = document.getElementById(
   "select-openai-voice",
) as HTMLSelectElement;

// ElevenLabs 설정 폼 엘리먼트
const elevenlabsOptionsGroup = document.getElementById(
   "elevenlabs-options",
) as HTMLDivElement;
const selectElevenlabsModel = document.getElementById(
   "select-elevenlabs-model",
) as HTMLSelectElement;
const inputElevenlabsKey = document.getElementById(
   "input-elevenlabs-key",
) as HTMLInputElement;
const selectElevenlabsVoicePreset = document.getElementById(
   "select-elevenlabs-voice-preset",
) as HTMLSelectElement;
const elevenlabsCustomVoiceRow = document.getElementById(
   "elevenlabs-custom-voice-row",
) as HTMLDivElement;
const inputElevenlabsVoiceId = document.getElementById(
   "input-elevenlabs-voice-id",
) as HTMLInputElement;

// System TTS 설정 폼 엘리먼트
const systemOptionsGroup = document.getElementById(
   "system-options",
) as HTMLDivElement;
const selectSystemVoice = document.getElementById(
   "select-system-voice",
) as HTMLSelectElement;
const systemAudioDramaNotice = document.getElementById(
   "system-audio-drama-disabled-notice",
) as HTMLDivElement;
const audioDramaSettingBox = document.querySelector(
   ".audio-drama-setting-box",
) as HTMLDivElement;

// 오디오 드라마 모드 엘리먼트
const chkAudioDrama = document.getElementById(
   "chk-audio-drama",
) as HTMLInputElement;
const edgeGenderVoicesGroup = document.getElementById(
   "edge-gender-voices",
) as HTMLDivElement;
const selectEdgeVoiceMale = document.getElementById(
   "select-edge-voice-male",
) as HTMLSelectElement;
const selectEdgeVoiceFemale = document.getElementById(
   "select-edge-voice-female",
) as HTMLSelectElement;
const geminiGenderVoicesGroup = document.getElementById(
   "gemini-gender-voices",
) as HTMLDivElement;
const selectGeminiVoiceMale = document.getElementById(
   "select-gemini-voice-male",
) as HTMLSelectElement;
const selectGeminiVoiceFemale = document.getElementById(
   "select-gemini-voice-female",
) as HTMLSelectElement;
const openaiGenderVoicesGroup = document.getElementById(
   "openai-gender-voices",
) as HTMLDivElement;
const selectOpenaiVoiceMale = document.getElementById(
   "select-openai-voice-male",
) as HTMLSelectElement;
const selectOpenaiVoiceFemale = document.getElementById(
   "select-openai-voice-female",
) as HTMLSelectElement;
const elevenlabsGenderVoicesGroup = document.getElementById(
   "elevenlabs-gender-voices",
) as HTMLDivElement;
const selectElevenlabsVoiceMale = document.getElementById(
   "select-elevenlabs-voice-male",
) as HTMLSelectElement;
const selectElevenlabsVoiceFemale = document.getElementById(
   "select-elevenlabs-voice-female",
) as HTMLSelectElement;

// 처형 효과음 엘리먼트
const chkExecutionSound = document.getElementById(
   "chk-execution-sound",
) as HTMLInputElement;
const rangeExecutionVolume = document.getElementById(
   "range-execution-volume",
) as HTMLInputElement;
const executionVolumeDisplay = document.getElementById(
   "execution-volume-display",
) as HTMLSpanElement;
const executionVolumeWrapper = document.getElementById(
   "execution-volume-wrapper",
) as HTMLDivElement;

// 버전 및 제작자 정보 표시 엘리먼트
const appVersionBadge = document.getElementById(
   "app-version-badge",
) as HTMLSpanElement;
const appAuthorTag = document.getElementById(
   "app-author-tag",
) as HTMLSpanElement;
const modalAppVersion = document.getElementById(
   "modal-app-version",
) as HTMLElement;
const modalAppAuthor = document.getElementById(
   "modal-app-author",
) as HTMLElement;

// 신규 버전 알림 배너 엘리먼트
const updateBanner = document.getElementById(
   "update-notification-banner",
) as HTMLElement;
const updateBannerTitle = document.getElementById(
   "update-banner-title",
) as HTMLElement;
const updateBannerDesc = document.getElementById(
   "update-banner-desc",
) as HTMLElement;
const btnUpdateDownload = document.getElementById(
   "btn-update-download",
) as HTMLButtonElement;
const btnUpdateDismiss = document.getElementById(
   "btn-update-dismiss",
) as HTMLButtonElement;
const updateProgressContainer = document.getElementById(
   "update-progress-container",
) as HTMLDivElement;
const updateProgressBar = document.getElementById(
   "update-progress-bar",
) as HTMLDivElement;
const updateProgressText = document.getElementById(
   "update-progress-text",
) as HTMLSpanElement;
const updateProgressPercent = document.getElementById(
   "update-progress-percent",
) as HTMLSpanElement;

// CK3 모드 동기화 상태 및 배너 엘리먼트
const modVersionBadge = document.getElementById(
   "mod-version-badge",
) as HTMLSpanElement;
const modSyncBanner = document.getElementById("mod-sync-banner") as HTMLElement;
const modBannerTitle = document.getElementById(
   "mod-banner-title",
) as HTMLElement;
const modBannerDesc = document.getElementById("mod-banner-desc") as HTMLElement;
const btnSyncMod = document.getElementById("btn-sync-mod") as HTMLButtonElement;
const modalModStatusText = document.getElementById(
   "modal-mod-status-text",
) as HTMLElement;
const modalModSubtext = document.getElementById(
   "modal-mod-subtext",
) as HTMLElement;
const btnModalSyncMod = document.getElementById(
   "btn-modal-sync-mod",
) as HTMLButtonElement;

// 모달 내 수동 업데이트 및 저장소 바로가기 엘리먼트
const btnManualCheckUpdate = document.getElementById(
   "btn-manual-check-update",
) as HTMLButtonElement;
const btnOpenRepo = document.getElementById(
   "btn-open-repo",
) as HTMLButtonElement;
const btnOpenWorkshop = document.getElementById(
   "btn-open-workshop",
) as HTMLButtonElement;
const manualUpdateStatus = document.getElementById(
   "manual-update-status",
) as HTMLSpanElement;

// 로컬 오디오 캐시 설정 및 대시보드 엘리먼트
const chkCacheEnabled = document.getElementById(
   "chk-cache-enabled",
) as HTMLInputElement;
const rangeCacheSize = document.getElementById(
   "range-cache-size",
) as HTMLInputElement;
const cacheSizeDisplay = document.getElementById(
   "cache-size-display",
) as HTMLSpanElement;
const cacheStatFiles = document.getElementById(
   "cache-stat-files",
) as HTMLSpanElement;
const cacheStatHits = document.getElementById(
   "cache-stat-hits",
) as HTMLSpanElement;
const cacheStatSize = document.getElementById(
   "cache-stat-size",
) as HTMLSpanElement;
const cacheUsageBar = document.getElementById(
   "cache-usage-bar",
) as HTMLDivElement;
const cacheUsageText = document.getElementById(
   "cache-usage-text",
) as HTMLSpanElement;
const cacheDirPreview = document.getElementById(
   "cache-dir-preview",
) as HTMLSpanElement;

const btnRefreshCacheStats = document.getElementById(
   "btn-refresh-cache-stats",
) as HTMLButtonElement;
const btnOpenCacheDir = document.getElementById(
   "btn-open-cache-dir",
) as HTMLButtonElement;
const btnClearCache = document.getElementById(
   "btn-clear-cache",
) as HTMLButtonElement;

/** 최근 메인 프로세스로부터 수신한 캐시 통계 상태 보관 */
let lastKnownCacheStats: CacheStats | null = null;

/**
 * 슬라이더의 현재 값에 따라 채워진 황금색 트랙의 비율(--fill-percent)을 실시간으로 업데이트합니다.
 * @param slider - 대상 input[type="range"] 엘리먼트
 */
const updateSliderFillTrack = (slider: HTMLInputElement): void => {
   const min = parseFloat(slider.min) || 0;
   const max = parseFloat(slider.max) || 100;
   const val = parseFloat(slider.value) || 0;
   const percent =
      max > min
         ? Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100))
         : 0;
   slider.style.setProperty("--fill-percent", `${percent}%`);
};

/**
 * 캐시 용량(MB) 변경 시 하단 프로그레스 바와 사용량 텍스트를 실시간으로 동기화합니다.
 * @param maxMb - 동기화할 최대 캐시 용량 (MB 단위)
 */
const syncCacheUsageDisplay = (maxMb: number): void => {
   if (cacheSizeDisplay) {
      cacheSizeDisplay.textContent = `${maxMb} MB`;
   }
   const currentBytes = lastKnownCacheStats?.totalSizeBytes ?? 0;
   const currentMb = (currentBytes / 1024 / 1024).toFixed(1);
   const maxBytes = maxMb * 1024 * 1024;

   // 실제 정밀 사용률(%) 계산
   const rawPercent = maxBytes > 0 ? (currentBytes / maxBytes) * 100 : 0;
   // 1% 미만의 미세 사용량일 경우 소수점 1자리(예: 0.2%) 표기, 그 외에는 정수 표기
   const displayPercent =
      rawPercent > 0 && rawPercent < 1
         ? rawPercent.toFixed(1)
         : Math.round(rawPercent);
   const clampedPercent = Math.min(Math.max(0, Math.round(rawPercent)), 100);

   if (cacheUsageBar) {
      // 0보다 큰 캐시 데이터가 있을 때 최소 시각 폭 보장
      cacheUsageBar.style.width = `${clampedPercent}%`;

      if (currentBytes > 0) {
         cacheUsageBar.classList.add("has-data");
      } else {
         cacheUsageBar.classList.remove("has-data");
      }

      // 캐시 용량 점유율에 따른 시각적 경고/위험 색상 전환
      if (rawPercent >= 90) {
         cacheUsageBar.classList.add("is-danger");
         cacheUsageBar.classList.remove("is-warning");
      } else if (rawPercent >= 75) {
         cacheUsageBar.classList.add("is-warning");
         cacheUsageBar.classList.remove("is-danger");
      } else {
         cacheUsageBar.classList.remove("is-warning", "is-danger");
      }
   }

   if (cacheUsageText) {
      cacheUsageText.textContent = `${currentMb} MB / ${maxMb} MB (${displayPercent}%)`;
   }
   if (rangeCacheSize) {
      updateSliderFillTrack(rangeCacheSize);
   }
};

/**
 * 메인 프로세스로부터 로컬 오디오 캐시 통계를 조회하여 UI를 최신화합니다.
 */
const updateCacheStatsUi = async (): Promise<void> => {
   try {
      const stats = await window.electronAPI.getCacheStats();
      lastKnownCacheStats = stats;
      if (cacheStatFiles) {
         cacheStatFiles.textContent = t("cache.unitFiles", {
            count: stats.totalFiles.toLocaleString(),
         });
      }
      if (cacheStatHits) {
         cacheStatHits.textContent = t("cache.unitHits", {
            count: stats.hitCount.toLocaleString(),
         });
      }

      const currentMb = (stats.totalSizeBytes / 1024 / 1024).toFixed(1);
      if (cacheStatSize) {
         cacheStatSize.textContent = `${currentMb} MB`;
      }

      // 슬라이더의 현재 입력값 기준으로 하단 진행률 동기화 (설정 저장 전 슬라이더 조작 상태 보존)
      const currentSliderMb = rangeCacheSize
         ? parseInt(rangeCacheSize.value, 10) || 500
         : Math.round(stats.maxSizeBytes / 1024 / 1024);
      syncCacheUsageDisplay(currentSliderMb);

      if (cacheDirPreview && stats.cacheDirPath) {
         cacheDirPreview.textContent = stats.cacheDirPath;
         cacheDirPreview.title = stats.cacheDirPath;
      }
   } catch (err: unknown) {
      console.warn("⚠️ [AudioCache] 캐시 통계 조회 실패:", err);
   }
};

/** 애플리케이션 메타데이터 상태 */
let currentAppInfo: AppInfo = {
   version: "1.4.0",
   author: "BlackOlf",
   productName: "CK3 TTS Companion",
   repoUrl: "https://github.com/pmw0310/ck3-tts-companion",
};

/** 최신 버전 검사 결과 캐시 */
let latestUpdateResult: UpdateCheckResult | null = null;

/** TTS UI 낭독/합성 상태 타입 */
type TtsUiStatus = "idle" | "synthesizing" | "playing" | "error";

/**
 * TTS 음성 합성 및 재생 상태를 메인 카드 UI(스피너, 상태 텍스트, 비주얼라이저, 버튼)에 동기화합니다.
 * @param status - 변경할 상태 ('idle' | 'synthesizing' | 'playing' | 'error')
 * @param detailText - 상태 보조 안내 문구 (선택적)
 */
const setTtsUiState = (status: TtsUiStatus, detailText?: string): void => {
   state.isPlaying = status === "playing";

   ttsStatusIndicator.classList.remove(
      "status-idle",
      "status-synthesizing",
      "status-playing",
      "status-error",
   );
   audioVisualizer.classList.remove(
      "visualizer-idle",
      "visualizer-synthesizing",
      "visualizer-playing",
   );

   const isEn = getCurrentLocale() === "en";

   switch (status) {
      case "synthesizing": {
         ttsStatusIndicator.classList.add("status-synthesizing");
         const defaultText =
            state.settings.provider === "gemini"
               ? isEn
                  ? "Generating Gemini AI voice..."
                  : "Gemini AI 음성 생성 중..."
               : state.settings.provider === "openai"
                 ? isEn
                    ? "Generating OpenAI voice..."
                    : "OpenAI 고음질 음성 생성 중..."
                 : state.settings.provider === "elevenlabs"
                   ? isEn
                      ? "Generating ElevenLabs voice..."
                      : "ElevenLabs 프리미엄 음성 생성 중..."
                   : isEn
                     ? "Synthesizing speech..."
                     : "음성 합성 중...";
         ttsStatusText.textContent = detailText ?? defaultText;
         audioVisualizer.classList.add("visualizer-synthesizing");
         btnStopAudio.disabled = false; // 통신 중에도 중지(취소) 가능!
         btnReplay.disabled = true;
         visualizerController.stop();
         break;
      }

      case "playing": {
         ttsStatusIndicator.classList.add("status-playing");
         ttsStatusText.textContent =
            detailText ?? (isEn ? "Speaking" : "낭독 중");
         audioVisualizer.classList.add("visualizer-playing");
         btnStopAudio.disabled = false;
         btnReplay.disabled = true;
         visualizerController.start();
         break;
      }

      case "error": {
         ttsStatusIndicator.classList.add("status-error");
         ttsStatusText.textContent =
            detailText ?? (isEn ? "Error" : "오류 발생");
         audioVisualizer.classList.add("visualizer-idle");
         btnStopAudio.disabled = true;
         btnReplay.disabled = state.currentEvent === null;
         visualizerController.stop();
         break;
      }

      case "idle":
      default: {
         ttsStatusIndicator.classList.add("status-idle");
         ttsStatusText.textContent = isEn ? "Idle" : "대기 중";
         audioVisualizer.classList.add("visualizer-idle");
         btnStopAudio.disabled = true;
         btnReplay.disabled = state.currentEvent === null;
         visualizerController.stop();
         break;
      }
   }
};

/**
 * 하위 호환성을 위해 오디오 재생 시작 상태를 UI에 반영합니다.
 */
const setAudioPlayingState = (isPlaying: boolean): void => {
   setTtsUiState(isPlaying ? "playing" : "idle");
};

/**
 * 사용자 설정의 speechRate(예: '+20%', '-10%')를 HTML Audio 엘리먼트의 playbackRate로 실시간 동기화합니다.
 */
const syncAudioPlaybackRate = (): void => {
   const rateStr = state.settings.speechRate ?? "+0%";
   const parsedPercent = parseInt(rateStr.replace("%", ""), 10);
   if (!Number.isNaN(parsedPercent)) {
      const factor = Math.max(0.5, Math.min(2.0, 1 + parsedPercent / 100));
      audioPlayer.playbackRate = factor;
   } else {
      audioPlayer.playbackRate = 1.0;
   }
};

/**
 * 사용자에게 일관된 테마의 인앱 토스트 알림을 표시합니다.
 * @param message - 표시할 안내 문구
 * @param type - 알림 종류 ('info' | 'error' | 'warning' | 'success')
 */
const showToast = (
   message: string,
   type: "info" | "error" | "warning" | "success" = "info",
): void => {
   let container = document.getElementById("toast-container");
   if (!container) {
      container = document.createElement("div");
      container.id = "toast-container";
      container.className = "toast-container";
      document.body.appendChild(container);
   }

   const toast = document.createElement("div");
   toast.className = `toast toast-${type}`;
   toast.textContent = message;
   container.appendChild(toast);

   setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(-10px)";
      setTimeout(() => {
         toast.remove();
      }, 300);
   }, 3200);
};

let activeSpeechRequestId = 0;
let lastAutoSpokenText = "";
let lastAutoSpokenTime = 0;
let lastStoppedText = "";
let lastStoppedTime = 0;
let lastEventDetectedTime = 0;
let isQueueActive = false;

/**
 * 애플리케이션 버전 및 제작자 정보를 UI 각 영역에 동기화하여 표시합니다.
 * @param info - 애플리케이션 메타 정보
 */
const applyAppInfoToUi = (info: AppInfo): void => {
   if (appVersionBadge) {
      appVersionBadge.textContent = `v${info.version}`;
   }
   if (appAuthorTag) {
      appAuthorTag.textContent = info.author;
   }
   if (modalAppVersion) {
      modalAppVersion.textContent = `v${info.version}`;
   }
   if (modalAppAuthor) {
      modalAppAuthor.textContent = info.author;
   }
};

/**
 * 상단 업데이트 알림 배너를 화면에 표시합니다.
 * @param result - 업데이트 검사 결과
 */
const displayUpdateBanner = (result: UpdateCheckResult): void => {
   if (!updateBanner) {
      return;
   }
   latestUpdateResult = result;
   const isEn = getCurrentLocale() === "en";
   if (updateBannerTitle) {
      updateBannerTitle.textContent = isEn
         ? `🚀 A new version (${result.releaseTitle ?? `v${result.latestVersion}`}) is available!`
         : `🚀 새로운 버전(${result.releaseTitle ?? `v${result.latestVersion}`})이 출시되었습니다!`;
   }
   if (updateBannerDesc) {
      updateBannerDesc.textContent = isEn
         ? `Current version v${result.currentVersion} → Latest version v${result.latestVersion}`
         : `현재 버전 v${result.currentVersion} → 최신 버전 v${result.latestVersion}`;
   }
   updateBanner.classList.remove("banner-hidden");
};

/**
 * 상단 업데이트 알림 배너를 숨깁니다.
 */
const hideUpdateBanner = (): void => {
   if (updateBanner) {
      updateBanner.classList.add("banner-hidden");
   }
};

/**
 * GitHub 최신 버전을 확인하고 결과를 UI에 반영합니다.
 * @param isManual - 사용자가 직접 버튼을 클릭해 호출했는지 여부
 */
const checkAppUpdates = async (isManual = false): Promise<void> => {
   const isEn = getCurrentLocale() === "en";

   if (isManual && manualUpdateStatus) {
      manualUpdateStatus.className = "update-status-msg";
      manualUpdateStatus.textContent = isEn ? "Checking..." : "확인 중...";
      btnManualCheckUpdate.disabled = true;
   }

   try {
      const result = await window.electronAPI.checkForUpdates();
      latestUpdateResult = result;

      if (result.hasUpdate) {
         displayUpdateBanner(result);
         if (isManual) {
            if (manualUpdateStatus) {
               manualUpdateStatus.className = "update-status-msg status-new";
               manualUpdateStatus.textContent = isEn
                  ? `🎉 New v${result.latestVersion} available`
                  : `🎉 최신 v${result.latestVersion} 출시됨`;
            }
            showToast(
               isEn
                  ? `🎉 A new version v${result.latestVersion} is available!`
                  : `🎉 새로운 버전 v${result.latestVersion}이 출시되었습니다!`,
               "info",
            );
         }
      } else if (result.errorMessage) {
         if (isManual) {
            if (manualUpdateStatus) {
               manualUpdateStatus.className = "update-status-msg status-error";
               manualUpdateStatus.textContent = isEn
                  ? "Check failed (Network error)"
                  : "확인 실패 (네트워크 연결 확인)";
            }
            showToast(
               isEn
                  ? `⚠️ Update check failed: ${result.errorMessage}`
                  : `⚠️ 업데이트 확인 실패: ${result.errorMessage}`,
               "warning",
            );
         }
      } else {
         hideUpdateBanner();
         if (isManual) {
            if (manualUpdateStatus) {
               manualUpdateStatus.className =
                  "update-status-msg status-success";
               manualUpdateStatus.textContent = isEn
                  ? `✅ Latest version (v${result.currentVersion}) in use`
                  : `✅ 최신 버전(v${result.currentVersion}) 사용 중`;
            }
            showToast(
               isEn
                  ? `✅ You are using the latest version (v${result.currentVersion}).`
                  : `✅ 현재 최신 버전(v${result.currentVersion})을 사용하고 계십니다.`,
               "info",
            );
         }
      }
   } catch (error: unknown) {
      console.warn("⚠️ [UpdateCheck] 버전 검사 오류:", error);
      if (isManual && manualUpdateStatus) {
         manualUpdateStatus.className = "update-status-msg status-error";
         manualUpdateStatus.textContent = isEn
            ? "Network error occurred"
            : "네트워크 오류 발생";
      }
   } finally {
      if (isManual) {
         btnManualCheckUpdate.disabled = false;
      }
   }
};

/**
 * CK3 모드 버전 및 동기화 상태를 확인하고 헤더 뱃지/알림 배너를 갱신합니다.
 * @param isManual - 사용자가 수동으로 동기화를 검사했는지 여부
 */
const checkModSyncStatus = async (isManual = false): Promise<void> => {
   if (!modVersionBadge) {
      return;
   }

   try {
      const status = await window.electronAPI.getModVersionStatus();

      const isEn = getCurrentLocale() === "en";

      if (!status.isInstalled) {
         // 모드 미설치 상태
         modVersionBadge.className = "version-badge mod-badge-missing";
         modVersionBadge.textContent = isEn
            ? "Mod Not Installed"
            : "모드 미설치";
         modVersionBadge.title = isEn
            ? "CK3 mod directory not detected. Click to install."
            : "CK3 모드 폴더가 감지되지 않았습니다. 원클릭으로 설치할 수 있습니다.";

         if (modSyncBanner) {
            modSyncBanner.classList.remove("banner-hidden");
            if (modBannerTitle) {
               modBannerTitle.textContent = isEn
                  ? "CK3 Mod Is Not Installed"
                  : "CK3 모드가 설치되지 않았습니다";
            }
            if (modBannerDesc) {
               modBannerDesc.textContent = isEn
                  ? "Click to automatically install into game mod folder."
                  : "원클릭으로 게임 모드 폴더에 자동 설치합니다.";
            }
         }
         if (modalModStatusText) {
            modalModStatusText.textContent = isEn
               ? "⚪ Game Mod Not Installed"
               : "⚪ 게임 모드 미설치";
         }
         if (modalModSubtext) {
            modalModSubtext.textContent = isEn
               ? "Click [Install Mod Now] below to install the bridge mod."
               : "아래 [모드 설치하기] 버튼을 눌러 모드를 설치해 주세요.";
         }
         if (btnSyncMod) {
            btnSyncMod.disabled = false;
            btnSyncMod.textContent = isEn
               ? "🚀 Install Mod Now"
               : "🚀 모드 지금 설치";
         }
         if (btnModalSyncMod) {
            btnModalSyncMod.disabled = false;
            btnModalSyncMod.textContent = isEn
               ? "🚀 Install Mod"
               : "🚀 모드 설치하기";
            btnModalSyncMod.title = isEn
               ? "Installs the latest mod files to game folder."
               : "게임 모드 폴더에 최신 모드를 설치합니다.";
         }
      } else if (!status.isSynced) {
         // 버전 불일치 상태
         modVersionBadge.className = "version-badge mod-badge-warning";
         modVersionBadge.textContent = isEn
            ? `Mod v${status.installedVersion ?? "?"} (Sync Required)`
            : `모드 v${status.installedVersion ?? "미상"} (동기화 필요)`;
         modVersionBadge.title = isEn
            ? `Installed mod (v${status.installedVersion}) differs from app (v${status.appVersion}).`
            : `설치된 모드(v${status.installedVersion})와 프로그램(v${status.appVersion}) 버전이 다릅니다.`;

         if (modSyncBanner) {
            modSyncBanner.classList.remove("banner-hidden");
            if (modBannerTitle) {
               modBannerTitle.textContent = isEn
                  ? "CK3 Mod Sync Required"
                  : "CK3 모드 버전 동기화 필요";
            }
            if (modBannerDesc) {
               modBannerDesc.textContent = isEn
                  ? `Installed: v${status.installedVersion ?? "?"} ➔ App: v${status.appVersion}`
                  : `설치된 모드: v${status.installedVersion ?? "미상"} ➔ 프로그램: v${status.appVersion}`;
            }
         }
         if (modalModStatusText) {
            modalModStatusText.textContent = isEn
               ? `⚠️ Version Mismatch (Installed: v${status.installedVersion} / Latest: v${status.appVersion})`
               : `⚠️ 버전 불일치 (설치: v${status.installedVersion} / 최신: v${status.appVersion})`;
         }
         if (modalModSubtext) {
            modalModSubtext.textContent = isEn
               ? "Sync to the latest version for seamless GUI compatibility."
               : "최신 모드로 동기화하여 완벽한 GUI 호환성을 유지하세요.";
         }
         if (btnSyncMod) {
            btnSyncMod.disabled = false;
            btnSyncMod.textContent = isEn
               ? "🔄 Sync Mod Now"
               : "🔄 모드 지금 동기화";
         }
         if (btnModalSyncMod) {
            btnModalSyncMod.disabled = false;
            btnModalSyncMod.textContent = isEn
               ? "🔄 Sync Mod Files"
               : "🔄 모드 파일 동기화";
            btnModalSyncMod.title = isEn
               ? "Overwrites with latest mod files."
               : "최신 모드 파일로 덮어씁니다.";
         }
      } else {
         // 정상 동기화 상태 (최신 버전 일치)
         modVersionBadge.className = "version-badge mod-badge-synced";
         modVersionBadge.textContent = isEn
            ? `Mod v${status.installedVersion} Synced`
            : `모드 v${status.installedVersion} 동기화됨`;
         modVersionBadge.title = isEn
            ? "Game mod is up to date and fully synced."
            : "게임 모드가 최신 버전으로 정상 동기화되어 있습니다.";

         if (modSyncBanner) {
            modSyncBanner.classList.add("banner-hidden");
         }
         if (modalModStatusText) {
            modalModStatusText.textContent = isEn
               ? `✅ Game Mod v${status.installedVersion} Synced`
               : `✅ 게임 모드 v${status.installedVersion} 동기화 완료`;
         }
         if (modalModSubtext) {
            modalModSubtext.textContent = isEn
               ? "Please ensure this mod is enabled in your Paradox Launcher playset."
               : "런처 모드 플레이셋에서 본 모드를 활성화해 주세요.";
         }
         if (btnSyncMod) {
            btnSyncMod.disabled = true;
         }
         if (btnModalSyncMod) {
            btnModalSyncMod.disabled = true;
            btnModalSyncMod.textContent = isEn
               ? "✅ Up to Date"
               : "✅ 최신 상태 유지됨";
            btnModalSyncMod.title = isEn
               ? "Latest mod is already installed."
               : "현재 게임에 최신 모드가 설치되어 있습니다.";
         }
         if (isManual) {
            showToast(
               isEn
                  ? `✅ Mod is already up-to-date (v${status.installedVersion}).`
                  : `✅ 모드가 최신 버전(v${status.installedVersion})과 일치합니다.`,
               "info",
            );
         }
      }
   } catch (error: unknown) {
      console.warn("⚠️ [ModSync] 모드 상태 조회 실패:", error);
   }
};

/**
 * 최신 CK3 모드 파일들을 게임 폴더로 동기화합니다.
 */
const handleSyncModFiles = async (): Promise<void> => {
   const isEn = getCurrentLocale() === "en";
   if (btnSyncMod) {
      btnSyncMod.disabled = true;
      btnSyncMod.textContent = isEn ? "⏳ Syncing..." : "⏳ 동기화 중...";
   }
   if (btnModalSyncMod) {
      btnModalSyncMod.disabled = true;
      btnModalSyncMod.textContent = isEn ? "⏳ Syncing..." : "⏳ 동기화 중...";
   }

   try {
      showToast(t("toast.syncing"), "info");
      const result = await window.electronAPI.syncModFiles();

      if (result.isSuccess) {
         showToast(
            t("toast.syncSuccess", {
               copied: result.copiedFilesCount,
               removed: result.removedFilesCount,
            }),
            "success",
         );
         await checkModSyncStatus(false);
      } else {
         showToast(
            isEn
               ? `❌ Mod sync failed: ${result.errorMessage ?? "Unknown error"}`
               : `❌ 모드 동기화 실패: ${result.errorMessage ?? "알 수 없는 오류"}`,
            "warning",
         );
      }
   } catch (error: unknown) {
      console.error("❌ [ModSync] 동기화 실행 오류:", error);
      showToast(t("toast.syncError"), "warning");
   } finally {
      if (btnSyncMod) {
         btnSyncMod.disabled = false;
         btnSyncMod.textContent = isEn
            ? "🔄 Sync Mod Now"
            : "🔄 모드 지금 동기화";
      }
      if (btnModalSyncMod) {
         btnModalSyncMod.disabled = false;
         btnModalSyncMod.textContent = isEn
            ? "🔄 Sync Mod Files"
            : "🔄 모드 파일 동기화";
      }
   }
};
let lastFallbackToastTime = 0;

/** 대체 TTS 엔진 폴백 알림 토스트 표시 쿨다운 (6초) */
const FALLBACK_TOAST_COOLDOWN_MS = 6000;

/**
 * TTS 음성 합성 실패로 인해 대체 엔진으로 폴백된 경우,
 * 실제 실패한 원본 엔진과 대체된 대상 엔진(Edge-TTS 또는 시스템 로컬 TTS)을 정확히 안내하는 토스트를 표시합니다.
 * @param result - 음성 합성 결과 객체
 * @param requestedProvider - 요청 시점에 선택된 TTS 엔진 식별자
 */
const notifyFallbackIfNeeded = (
   result: SynthesizeResult,
   requestedProvider?: TtsProviderType,
): void => {
   if (result.isFallback) {
      const now = Date.now();
      if (now - lastFallbackToastTime > FALLBACK_TOAST_COOLDOWN_MS) {
         lastFallbackToastTime = now;
         const toastMessage = buildFallbackToastMessage(
            result,
            requestedProvider ?? state.settings.provider,
         );
         showToast(toastMessage, "warning");
      }
   }
};

/**
 * 진행 중인 모든 음성 재생 및 비동기 합성을 즉시 중단하고 오디오 자원을 해제합니다.
 */
const stopAudio = (): void => {
   activeSpeechRequestId++;
   isQueueActive = false;
   if (currentPlaybackSafetyTimer) {
      clearTimeout(currentPlaybackSafetyTimer);
      currentPlaybackSafetyTimer = null;
   }
   visualizerController.stop();
   audioPlayer.volume = 0; // 정지 시 급격한 파형 단절(퍽 소리) 방지
   audioPlayer.pause();
   audioPlayer.currentTime = 0;
   audioPlayer.volume = 0.92;
   audioPlayer.src = "";
   if (currentAudioBlobUrl) {
      URL.revokeObjectURL(currentAudioBlobUrl);
      currentAudioBlobUrl = null;
   }
   lastStoppedText = state.currentEvent?.content ?? "";
   lastStoppedTime = Date.now();
   setTtsUiState("idle");
};

/**
 * 주어진 성별과 세그먼트 타입(지문/대화문)에 따른 최적 음성 모델 및 어조 프롬프트를 결정합니다.
 * @param type - 세그먼트 구분 ('narration' | 'dialogue')
 * @param gender - 화자 성별 ('male' | 'female' | 'narrator')
 * @returns 오버라이드할 음성 식별자 및 어조 지침
 */
const resolveVoiceAndPromptForSegment = (
   type: "narration" | "dialogue",
   gender?: SpeakerGender,
): { voiceOverride?: string; promptOverride?: string } => {
   const provider = state.settings.provider;

   // 1. 지문(나레이션)이거나 성별이 narrator/미지정인 경우 -> 사관 나레이터 음성
   if (type === "narration" || gender === "narrator" || !gender) {
      let voiceOverride: string = state.settings.edgeVoice;
      if (provider === "gemini") {
         voiceOverride = state.settings.geminiVoice;
      } else if (provider === "openai") {
         voiceOverride = state.settings.openaiVoice || "onyx";
      } else if (provider === "elevenlabs") {
         voiceOverride =
            state.settings.elevenLabsVoiceId || "JBFqnCBsd6RMkjVDRZzb";
      }
      return {
         voiceOverride,
         promptOverride: GEMINI_TONE_PRESETS.narrator,
      };
   }

   // 2. 여성 등장인물 대사인 경우
   if (gender === "female") {
      let femaleVoice: string =
         state.settings.edgeVoiceFemale || "ko-KR-SunHiNeural";
      if (provider === "gemini") {
         femaleVoice = state.settings.geminiVoiceFemale || "Kore";
      } else if (provider === "openai") {
         femaleVoice = state.settings.openaiVoiceFemale || "nova";
      } else if (provider === "elevenlabs") {
         femaleVoice =
            state.settings.elevenLabsVoiceFemale || "Xb7hH8MSUJpSbSDYk0k2";
      }
      return {
         voiceOverride: femaleVoice,
         promptOverride:
            "A regal, expressive, and dignified noble lady or queen speaking with emotion and royal composure. 품격 있고 감정이 실린 중세 귀족 여성의 어조로 대사를 말하라.",
      };
   }

   // 3. 남성 등장인물 대사인 경우 (male)
   let maleVoice: string = state.settings.edgeVoiceMale || "ko-KR-InJoonNeural";
   if (provider === "gemini") {
      maleVoice = state.settings.geminiVoiceMale || "Charon";
   } else if (provider === "openai") {
      maleVoice = state.settings.openaiVoiceMale || "onyx";
   } else if (provider === "elevenlabs") {
      maleVoice = state.settings.elevenLabsVoiceMale || "JBFqnCBsd6RMkjVDRZzb";
   }
   return {
      voiceOverride: maleVoice,
      promptOverride:
         "A resolute, commanding, and proud medieval lord, commander, or king speaking with deep authority. 위엄 있고 단호한 중세 남성 영주/기사의 어조로 대사를 말하라.",
   };
};

/**
 * 텍스트 음성 합성을 최적 크기의 청크/세그먼트로 분할하여 첫 구절을 1초 내에 즉각 낭독(Fast-Start)하고,
 * 나머지 구절은 백그라운드 사전 합성(Prefetch Queue)으로 매끄럽게 이어 재생합니다.
 * - 일반 이벤트: 오디오 드라마 모드 활성화 시 지문(사관)과 인물 대사(남/여)를 교차 재생
 * - 편지 이벤트(letter): 발신자 1인이 작성한 독백 서신이므로 발신자(남/여) 단일 목소리로 편지 전체를 완독
 * @param textToRead - 낭독할 전체 텍스트
 * @param speakerGender - 이벤트 메인 화자 성별 ('male' | 'female' | 'narrator')
 * @param eventType - 이벤트 유형 ('letter' | 'character' | 'default')
 */
const speakText = async (
   textToRead: string,
   speakerGender?: SpeakerGender,
   eventType?: Ck3EventType,
): Promise<void> => {
   if (!textToRead || textToRead.trim().length === 0) {
      return;
   }

   // 새로운 낭독 시퀀스 ID 발급 (이전 진행 중인 모든 합성/재생 무효화)
   const currentRequestId = ++activeSpeechRequestId;

   // 1. 기존 재생 중이던 오디오 즉시 완전 음소거 및 초기화
   audioPlayer.pause();
   audioPlayer.currentTime = 0;
   audioPlayer.src = "";
   isQueueActive = false;

   // 2. 합성 시작 UI 상태 즉각 반영 (스피너 표시, 중지 버튼 활성화)
   setTtsUiState("synthesizing");

   // 3. 재생 아이템(텍스트, 음성, 프롬프트) 목록 구성
   type PlaybackItem = {
      text: string;
      voiceOverride?: string;
      promptOverride?: string;
   };

   let playbackItems: PlaybackItem[] = [];

   // [편지 이벤트 예외 처리]: 편지는 발신자 1인의 독백 서신이므로, 지문/대사 교차 분기 없이 발신자 단일 보이스로 전체 완독
   if (eventType === "letter") {
      const letterVoiceInfo = resolveVoiceAndPromptForSegment(
         "dialogue",
         speakerGender,
      );
      const chunks = splitIntoPlaybackChunks(
         textToRead,
         state.settings.provider,
      );
      playbackItems = chunks.map((chunk) => ({
         text: chunk,
         voiceOverride: letterVoiceInfo.voiceOverride,
         promptOverride: letterVoiceInfo.promptOverride,
      }));
   }
   // [일반 이벤트 - 오디오 드라마 모드]: 본문 내 지문(나레이션)과 따옴표 대사를 분리하여 각각 사관 및 인물 목소리 매핑
   // 단, 시스템(로컬) TTS는 사용자의 요구에 따라 오디오 드라마 모드를 배제하고 단일 나레이터로 낭독
   else if (
      state.settings.isAudioDramaEnabled &&
      state.settings.provider !== "system"
   ) {
      const segments = splitNarrativeAndDialogue(textToRead, speakerGender);
      if (segments.length > 0) {
         for (const seg of segments) {
            const { voiceOverride, promptOverride } =
               resolveVoiceAndPromptForSegment(seg.type, seg.speakerGender);

            // 지문이 여러 문장으로 길 경우 초기 1초 재생 레이턴시를 위해 서브 청킹 적용
            if (seg.type === "narration" && seg.text.length > 80) {
               const subChunks = splitIntoPlaybackChunks(
                  seg.text,
                  state.settings.provider,
               );
               for (const chunk of subChunks) {
                  playbackItems.push({
                     text: chunk,
                     voiceOverride,
                     promptOverride,
                  });
               }
            } else {
               playbackItems.push({
                  text: seg.text,
                  voiceOverride,
                  promptOverride,
               });
            }
         }
      }
   }

   // [일반 단일 모드]: 오디오 드라마 모드가 비활성화되었거나 세그먼트가 없는 경우 기본 사관 나레이터 보이스 단일 적용
   if (playbackItems.length === 0) {
      const chunks = splitIntoPlaybackChunks(
         textToRead,
         state.settings.provider,
      );
      const { voiceOverride, promptOverride } = resolveVoiceAndPromptForSegment(
         "narration",
         "narrator",
      );
      playbackItems = chunks.map((chunk) => ({
         text: chunk,
         voiceOverride,
         promptOverride,
      }));
   }

   if (playbackItems.length === 0) {
      setTtsUiState("idle");
      return;
   }

   // 4. 동시성 제어 프리페치 파이프라인 (JIT Sequential Pipeline)
   // Gemini API의 경우 동시 요청(Burst Request) 시 429 Rate Limit(동시성 제한)이 발동하므로,
   // 첫 청크(index 0)만 즉각 요청하여 빠른 재생(Fast-Start)을 시작하고,
   // 청크가 재생되는 동안 다음 청크(index + 1)를 1개씩 순차적으로 미리 요청하여 동시성을 항상 1로 유지합니다.
   isQueueActive = true;
   const prefetchTasks: Array<Promise<SynthesizeResult> | null> = new Array(
      playbackItems.length,
   ).fill(null);

   const startFetchChunk = (idx: number): Promise<SynthesizeResult> => {
      if (idx >= playbackItems.length) {
         return Promise.resolve({
            isSuccess: false,
            errorMessage: "청크 인덱스 초과",
         });
      }
      if (prefetchTasks[idx]) {
         return prefetchTasks[idx]!;
      }
      const item = playbackItems[idx]!;
      const task = window.electronAPI.synthesizeSpeech({
         text: item.text,
         settings: state.settings,
         voiceOverride: item.voiceOverride,
         promptOverride: item.promptOverride,
      });
      prefetchTasks[idx] = task;
      return task;
   };

   // 첫 번째 청크 즉시 단일 요청 (빠른 1초 Fast-Start)
   startFetchChunk(0);

   // Edge-TTS 및 시스템 로컬 TTS의 경우 클라우드 동시성 제한이 없으므로 다음 청크도 미리 선행 요청(Pre-warm)
   if (
      (state.settings.provider === "edge" ||
         state.settings.provider === "system") &&
      playbackItems.length > 1
   ) {
      startFetchChunk(1);
   }

   // 5. 청크 순차 재생 및 재생 중 다음 청크 백그라운드 선행 합성(JIT 바통 터치)
   const playQueueIndex = async (
      index: number,
      consecutiveFailures = 0,
   ): Promise<void> => {
      if (index >= playbackItems.length || consecutiveFailures >= 3) {
         if (consecutiveFailures >= 3) {
            console.warn(
               "⚠️ [TTS Queue] 3회 연속 합성 실패로 큐 재생을 안전하게 중단합니다.",
            );
         }
         isQueueActive = false;
         setTtsUiState("idle");
         return;
      }

      const task = startFetchChunk(index);

      try {
         const result = await task;
         if (currentRequestId !== activeSpeechRequestId) {
            return;
         }

         if (!result.isSuccess || !result.audioBase64) {
            console.warn(
               `⚠️ [TTS Queue] 구절 ${index + 1} 합성 실패:`,
               result.errorMessage,
            );
            // 실패 시 다음 구절로 안전하게 건너뛰어 계속 재생 (연속 실패 카운트 증가)
            await playQueueIndex(index + 1, consecutiveFailures + 1);
            return;
         }

         notifyFallbackIfNeeded(result);

         const mime =
            result.mimeType ??
            (state.settings.provider === "gemini" ? "audio/wav" : "audio/mp3");
         const blobUrl = base64ToBlobUrl(result.audioBase64, mime);

         // 이전 Blob URL 메모리 안전하게 해제
         if (currentAudioBlobUrl) {
            URL.revokeObjectURL(currentAudioBlobUrl);
         }
         currentAudioBlobUrl = blobUrl;

         audioPlayer.src = blobUrl;
         syncAudioPlaybackRate();
         await visualizerController.resumeAudioContext();
         await audioPlayer.play();
         setTtsUiState(
            "playing",
            result.fromCache ? "⚡ 로컬 캐시 즉시 낭독" : undefined,
         );

         // [핵심 최적화]: 현재 청크 재생이 시작되었으므로, 다음 청크(index + 1)를 1개만 미리 요청!
         // 재생 시간(보통 4~8초) 동안 다음 청크가 조용히 완성되므로 청크 간 간격 없이 즉각 이어집니다.
         if (index + 1 < playbackItems.length) {
            startFetchChunk(index + 1);
         }

         // 이번 구절이 끝나면 다음 구절 즉각 연속 재생 (ended, error, 안전 가드 타이머 3중 방어)
         let isNextTriggered = false;
         const clearSafetyTimer = (): void => {
            if (currentPlaybackSafetyTimer) {
               clearTimeout(currentPlaybackSafetyTimer);
               currentPlaybackSafetyTimer = null;
            }
         };

         const handleNext = async (): Promise<void> => {
            if (isNextTriggered) return;
            isNextTriggered = true;
            clearSafetyTimer();
            audioPlayer.removeEventListener("ended", handleNext);
            audioPlayer.removeEventListener("error", handleNext);
            if (currentRequestId === activeSpeechRequestId) {
               await playQueueIndex(index + 1);
            }
         };

         audioPlayer.addEventListener("ended", handleNext, { once: true });
         audioPlayer.addEventListener("error", handleNext, { once: true });

         // 오디오 길이(초) 기반 또는 기본 12초 안전 가드 타이머 (Chromium 백그라운드 지연 또는 이벤트 누락 시 영구 고착 방지)
         const expectedDurationSec =
            Number.isFinite(audioPlayer.duration) && audioPlayer.duration > 0
               ? audioPlayer.duration
               : 6;
         const safetyTimeoutMs = Math.max(
            8000,
            Math.ceil(expectedDurationSec * 1500) + 3000,
         );
         currentPlaybackSafetyTimer = setTimeout(() => {
            console.warn(
               `⚠️ [TTS Queue] 구절 ${index + 1} 완료 이벤트 지연 감지(${safetyTimeoutMs}ms), 안전 타이머로 다음 단계 진행`,
            );
            handleNext().catch(() => {});
         }, safetyTimeoutMs);
      } catch (error: unknown) {
         if (currentRequestId === activeSpeechRequestId) {
            console.warn(`[TTS Queue] 구절 ${index + 1} 재생 오류:`, error);
            await playQueueIndex(index + 1);
         }
      }
   };

   await playQueueIndex(0);
};

/**
 * 히스토리 목록 UI를 다시 렌더링합니다.
 */
const renderHistoryList = (): void => {
   const isEn = getCurrentLocale() === "en";
   if (state.history.length === 0) {
      const emptyText = isEn
         ? "No events recorded yet. In-game events will appear here in real time."
         : "아직 기록된 사건이 없습니다. 게임 중 이벤트가 발생하면 이곳에 기록됩니다.";
      historyList.innerHTML = `
      <div class="empty-history">
        <span class="empty-icon">📜</span>
        <span class="empty-text">${emptyText}</span>
      </div>
    `;
      return;
   }

   historyList.innerHTML = "";
   for (const item of state.history) {
      const itemEl = document.createElement("div");
      itemEl.className = "history-item";

      const infoEl = document.createElement("div");
      infoEl.className = "history-info";

      const headerRow = document.createElement("div");
      headerRow.className = "history-header-row";

      const isEn = getCurrentLocale() === "en";
      const defaultTitle = isEn ? "Event" : "이벤트";

      const titleEl = document.createElement("span");
      titleEl.className = "history-title";
      titleEl.textContent =
         item.title && item.title.trim().length > 0 ? item.title : defaultTitle;

      const timeEl = document.createElement("span");
      timeEl.className = "history-time";
      const dateObj = new Date(item.timestamp);
      timeEl.textContent = `${String(dateObj.getHours()).padStart(2, "0")}:${String(dateObj.getMinutes()).padStart(2, "0")}`;

      headerRow.appendChild(titleEl);
      headerRow.appendChild(timeEl);

      const snippetEl = document.createElement("div");
      snippetEl.className = "history-snippet";
      snippetEl.textContent = item.content;

      infoEl.appendChild(headerRow);
      infoEl.appendChild(snippetEl);

      const playBtn = document.createElement("button");
      playBtn.className = "btn btn-sm btn-secondary history-play-btn";
      playBtn.innerHTML = isEn ? "<span>▶</span> Read" : "<span>▶</span> 낭독";
      playBtn.title = isEn ? "Read this event again" : "이 사건 다시 낭독하기";
      playBtn.addEventListener("click", () => {
         state.currentEvent = item;
         currentEventTitle.textContent =
            item.title && item.title.trim().length > 0
               ? item.title
               : defaultTitle;
         currentEventContent.textContent = item.content;
         currentEventContent.classList.remove("placeholder-text");
         btnReplay.disabled = false;
         speakText(item.content, item.speakerGender, item.eventType);
      });

      itemEl.appendChild(infoEl);
      itemEl.appendChild(playBtn);
      historyList.appendChild(itemEl);
   }
};

/**
 * 렌더러 화면 자막 및 TTS 처리를 위해 메타데이터 마커 및 파이프 기호를 완전히 정제합니다.
 * @param text - 원본 텍스트
 * @returns 화면 표시 및 재생용 순수 텍스트
 */
const sanitizeDisplayText = (text: string): string => {
   if (!text) {
      return "";
   }
   return text
      .replace(/(?:\|{1,3}\s*)?GENDER:[A-Za-z_]+(?:\b|(?=["'\s]))/gi, "")
      .replace(/\s*\|{2,}\s*/g, " ")
      .replace(/\s*\|\s*$/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
};

/**
 * 새로운 CK3 이벤트를 화면에 표시하고 필요 시 자동 낭독을 시작합니다.
 * @param rawEvent - 감지된 이벤트 원본 데이터
 */
const handleNewEvent = (rawEvent: Ck3EventMessage): void => {
   const event: Ck3EventMessage = {
      ...rawEvent,
      title: sanitizeDisplayText(rawEvent.title ?? ""),
      content: sanitizeDisplayText(rawEvent.content ?? ""),
   };

   const now = Date.now();
   lastEventDetectedTime = now;

   // 이벤트 중복 및 재진입 방어 검사 (현재 재생 중 동일 이벤트, 60초 쿨다운, 닫힌 창 방어)
   const shouldPlay = shouldPlayEvent(
      event,
      {
         isPlaying: state.isPlaying,
         currentEvent: state.currentEvent,
         lastAutoSpokenText,
         lastAutoSpokenTime,
         lastStoppedText,
         lastStoppedTime,
      },
      now,
   );

   if (!shouldPlay) {
      console.info(
         "ℹ️ [Event Deduplicator] 중복 또는 재생 중인 동일 이벤트 무시됨:",
         event.title,
      );
      return;
   }

   state.currentEvent = event;

   // 최신 히스토리와 동일한 내용이 연달아 중복 적재되지 않도록 방어하고,
   // 짧은 파편 유입 후 온전한 원본이 도착한 경우 히스토리 항목을 인플레이스 승격(Upgrade)
   const latestHistory = state.history[0];
   const isRecentSameEvent =
      latestHistory &&
      now - latestHistory.timestamp < 10000 &&
      (latestHistory.content === event.content ||
         isTextFragmentOf(latestHistory.content, event.content) ||
         isTextFragmentOf(event.content, latestHistory.content));

   if (isRecentSameEvent) {
      if (event.content.length > latestHistory.content.length) {
         // 기존 짧은 파편을 온전한 상위 원문으로 인플레이스 대체
         state.history[0] = event;
         renderHistoryList();
      }
   } else {
      state.history.unshift(event);
      if (state.history.length > 20) {
         state.history.pop();
      }
      renderHistoryList();
   }

   currentEventTitle.textContent = event.title ?? "새로운 사건 발생";
   currentEventContent.textContent = event.content;
   currentEventContent.classList.remove("placeholder-text");
   btnReplay.disabled = false;

   if (state.settings.isAutoPlayEnabled) {
      lastAutoSpokenText = event.content;
      lastAutoSpokenTime = now;
      speakText(event.content, event.speakerGender, event.eventType);
   }
};

/**
 * 모달 설정 UI의 폼 필드들을 현재 상태 값으로 채웁니다.
 */
const syncSettingsForm = (): void => {
   const currentProvider = state.settings.provider;

   // 엔진 카드 활성화 상태 동기화
   const engineCards = document.querySelectorAll(".engine-card");
   engineCards.forEach((card) => {
      const engine = card.getAttribute("data-engine");
      card.classList.toggle("active", engine === currentProvider);
   });

   // 엔진별 세부 설정 및 성별 보이스 그룹 토글
   if (currentProvider === "system") {
      edgeOptionsGroup.classList.add("option-hidden");
      geminiOptionsGroup.classList.add("option-hidden");
      openaiOptionsGroup.classList.add("option-hidden");
      elevenlabsOptionsGroup.classList.add("option-hidden");
      systemOptionsGroup.classList.remove("option-hidden");

      edgeGenderVoicesGroup.classList.add("option-hidden");
      geminiGenderVoicesGroup.classList.add("option-hidden");
      openaiGenderVoicesGroup.classList.add("option-hidden");
      elevenlabsGenderVoicesGroup.classList.add("option-hidden");

      systemAudioDramaNotice.classList.remove("option-hidden");
      audioDramaSettingBox.classList.add("is-disabled");
      chkAudioDrama.disabled = true;

      providerBadge.textContent = `시스템 로컬 TTS (${state.settings.systemVoice || "기본"})`;
   } else {
      systemOptionsGroup.classList.add("option-hidden");
      systemAudioDramaNotice.classList.add("option-hidden");
      audioDramaSettingBox.classList.remove("is-disabled");
      chkAudioDrama.disabled = false;

      if (currentProvider === "gemini") {
         edgeOptionsGroup.classList.add("option-hidden");
         geminiOptionsGroup.classList.remove("option-hidden");
         openaiOptionsGroup.classList.add("option-hidden");
         elevenlabsOptionsGroup.classList.add("option-hidden");

         edgeGenderVoicesGroup.classList.add("option-hidden");
         geminiGenderVoicesGroup.classList.remove("option-hidden");
         openaiGenderVoicesGroup.classList.add("option-hidden");
         elevenlabsGenderVoicesGroup.classList.add("option-hidden");
         providerBadge.textContent = "Gemini 3.8 Flash TTS";
      } else if (currentProvider === "openai") {
         edgeOptionsGroup.classList.add("option-hidden");
         geminiOptionsGroup.classList.add("option-hidden");
         openaiOptionsGroup.classList.remove("option-hidden");
         elevenlabsOptionsGroup.classList.add("option-hidden");

         edgeGenderVoicesGroup.classList.add("option-hidden");
         geminiGenderVoicesGroup.classList.add("option-hidden");
         openaiGenderVoicesGroup.classList.remove("option-hidden");
         elevenlabsGenderVoicesGroup.classList.add("option-hidden");
         providerBadge.textContent = `OpenAI TTS (${state.settings.openaiVoice || "onyx"})`;
      } else if (currentProvider === "elevenlabs") {
         edgeOptionsGroup.classList.add("option-hidden");
         geminiOptionsGroup.classList.add("option-hidden");
         openaiOptionsGroup.classList.add("option-hidden");
         elevenlabsOptionsGroup.classList.remove("option-hidden");

         edgeGenderVoicesGroup.classList.add("option-hidden");
         geminiGenderVoicesGroup.classList.add("option-hidden");
         openaiGenderVoicesGroup.classList.add("option-hidden");
         elevenlabsGenderVoicesGroup.classList.remove("option-hidden");
         providerBadge.textContent = "ElevenLabs 다국어 v2";
      } else {
         edgeOptionsGroup.classList.remove("option-hidden");
         geminiOptionsGroup.classList.add("option-hidden");
         openaiOptionsGroup.classList.add("option-hidden");
         elevenlabsOptionsGroup.classList.add("option-hidden");

         edgeGenderVoicesGroup.classList.remove("option-hidden");
         geminiGenderVoicesGroup.classList.add("option-hidden");
         openaiGenderVoicesGroup.classList.add("option-hidden");
         elevenlabsGenderVoicesGroup.classList.add("option-hidden");
         providerBadge.textContent = "Edge-TTS";
      }
   }

   selectSystemVoice.value = state.settings.systemVoice || "default";
   chkAudioDrama.checked = state.settings.isAudioDramaEnabled;
   selectEdgeVoiceMale.value = state.settings.edgeVoiceMale;
   selectEdgeVoiceFemale.value = state.settings.edgeVoiceFemale;
   selectGeminiVoiceMale.value = state.settings.geminiVoiceMale;
   selectGeminiVoiceFemale.value = state.settings.geminiVoiceFemale;
   selectOpenaiVoiceMale.value = state.settings.openaiVoiceMale || "onyx";
   selectOpenaiVoiceFemale.value = state.settings.openaiVoiceFemale || "nova";
   selectElevenlabsVoiceMale.value =
      state.settings.elevenLabsVoiceMale || "JBFqnCBsd6RMkjVDRZzb";
   selectElevenlabsVoiceFemale.value =
      state.settings.elevenLabsVoiceFemale || "Xb7hH8MSUJpSbSDYk0k2";

   if (chkExecutionSound) {
      chkExecutionSound.checked =
         state.settings.isExecutionSoundEnabled ?? true;
   }
   if (rangeExecutionVolume) {
      const execVolumePercent = Math.round(
         (state.settings.executionSoundVolume ?? 0.8) * 100,
      );
      rangeExecutionVolume.value = execVolumePercent.toString();
      if (executionVolumeDisplay) {
         executionVolumeDisplay.textContent = `${execVolumePercent}%`;
      }
      updateSliderFillTrack(rangeExecutionVolume);
      if (executionVolumeWrapper) {
         executionVolumeWrapper.style.opacity =
            (state.settings.isExecutionSoundEnabled ?? true) ? "1" : "0.4";
         executionVolumeWrapper.style.pointerEvents =
            (state.settings.isExecutionSoundEnabled ?? true) ? "auto" : "none";
      }
   }

   selectEdgeVoice.value = state.settings.edgeVoice;
   const numericRate =
      parseInt(state.settings.speechRate.replace("%", ""), 10) || 0;
   rangeSpeechRate.value = numericRate.toString();
   speechRateDisplay.textContent = state.settings.speechRate;

   selectGeminiModel.value = state.settings.geminiModel;
   inputGeminiKey.value = state.settings.geminiApiKey;
   selectGeminiVoice.value = state.settings.geminiVoice;

   selectOpenaiModel.value = state.settings.openaiModel || "tts-1";
   inputOpenaiKey.value = state.settings.openaiApiKey || "";
   selectOpenaiVoice.value = state.settings.openaiVoice || "onyx";

   selectElevenlabsModel.value =
      state.settings.elevenLabsModel || "eleven_multilingual_v2";
   inputElevenlabsKey.value = state.settings.elevenLabsApiKey || "";
   const currentVoiceId =
      state.settings.elevenLabsVoiceId || "JBFqnCBsd6RMkjVDRZzb";
   const knownPresets = [
      "JBFqnCBsd6RMkjVDRZzb",
      "pNInz6obpgDQGcFmaJgB",
      "Xb7hH8MSUJpSbSDYk0k2",
      "pFZP5JQG7iQjIQuC4Bku",
   ];
   if (knownPresets.includes(currentVoiceId)) {
      selectElevenlabsVoicePreset.value = currentVoiceId;
      elevenlabsCustomVoiceRow.classList.add("option-hidden");
      inputElevenlabsVoiceId.value = "";
   } else {
      selectElevenlabsVoicePreset.value = "custom";
      elevenlabsCustomVoiceRow.classList.remove("option-hidden");
      inputElevenlabsVoiceId.value = currentVoiceId;
   }

   // 어조 프리셋 매칭
   const currentPrompt = state.settings.geminiSystemPrompt;
   let matchedTone = "custom";
   for (const [key, prompt] of Object.entries(GEMINI_TONE_PRESETS)) {
      if (prompt === currentPrompt) {
         matchedTone = key;
         break;
      }
   }

   selectGeminiTone.value = matchedTone;
   if (matchedTone === "custom") {
      customPromptWrapper.classList.remove("option-hidden");
      textareaGeminiPrompt.value = currentPrompt;
   } else {
      customPromptWrapper.classList.add("option-hidden");
      textareaGeminiPrompt.value = GEMINI_TONE_PRESETS[matchedTone] ?? "";
   }

   chkAutoPlay.checked = state.settings.isAutoPlayEnabled;

   if (rangeSpeechRate) {
      updateSliderFillTrack(rangeSpeechRate);
   }

   // 로컬 오디오 캐시 설정 동기화
   if (chkCacheEnabled) {
      chkCacheEnabled.checked = state.settings.isCacheEnabled ?? true;
   }
   if (rangeCacheSize) {
      const sizeMb = state.settings.maxCacheSizeMb ?? 500;
      rangeCacheSize.value = sizeMb.toString();
      syncCacheUsageDisplay(sizeMb);
      updateSliderFillTrack(rangeCacheSize);
   }
};

/**
 * 렌더러 이벤트 리스너를 바인딩합니다.
 */
const bindEventListeners = (): void => {
   // 오디오 플레이어 완료/에러 이벤트
   audioPlayer.addEventListener("ended", () => {
      if (!isQueueActive) {
         setTtsUiState("idle");
      }
   });
   audioPlayer.addEventListener("pause", () => {
      if (!isQueueActive && !state.isPlaying) {
         setTtsUiState("idle");
      }
   });

   // 재낭독 및 중지
   btnReplay.addEventListener("click", () => {
      if (state.currentEvent) {
         speakText(
            state.currentEvent.content,
            state.currentEvent.speakerGender,
            state.currentEvent.eventType,
         );
      }
   });

   btnStopAudio.addEventListener("click", () => {
      stopAudio();
   });

   chkAutoPlay.addEventListener("change", () => {
      state.settings = {
         ...state.settings,
         isAutoPlayEnabled: chkAutoPlay.checked,
      };
      window.electronAPI.saveSettings(state.settings);
   });

   btnClearHistory.addEventListener("click", () => {
      state.history = [];
      renderHistoryList();
   });

   // 설정 모달 열기/닫기 제어
   /**
    * 설정 모달 창을 화면에서 닫습니다.
    */
   const closeSettingsModal = (): void => {
      settingsModal.classList.add("modal-hidden");
   };

   btnOpenSettings.addEventListener("click", () => {
      syncSettingsForm();
      updateCacheStatsUi().catch(() => {});
      checkModSyncStatus(false).catch(() => {});
      settingsModal.classList.remove("modal-hidden");
   });

   // 닫기 버튼 클릭 시 모달 닫기
   btnCloseSettings.addEventListener("click", (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      closeSettingsModal();
   });

   // 모달 바깥 어두운 배경(Backdrop) 클릭 시 닫기
   settingsModal.addEventListener("click", (event: MouseEvent) => {
      if (event.target === settingsModal) {
         closeSettingsModal();
      }
   });

   // ESC 키 입력 시 모달 닫기
   window.addEventListener("keydown", (event: KeyboardEvent) => {
      if (
         event.key === "Escape" &&
         !settingsModal.classList.contains("modal-hidden")
      ) {
         closeSettingsModal();
      }
   });

   // 상위 모달 탭 전환 이벤트 바인딩
   const modalTabBtns = document.querySelectorAll(".modal-tab-btn");
   const modalTabPanels = document.querySelectorAll(".modal-tab-panel");
   modalTabBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
         const targetTab = btn.getAttribute("data-tab");
         modalTabBtns.forEach((b) => b.classList.toggle("active", b === btn));
         modalTabPanels.forEach((panel) => {
            const panelId = `tab-panel-${targetTab}`;
            panel.classList.toggle("active", panel.id === panelId);
         });
      });
   });

   // AI 엔진 선택 카드 클릭 이벤트 바인딩
   const engineCards = document.querySelectorAll(".engine-card");
   engineCards.forEach((card) => {
      card.addEventListener("click", () => {
         const selected = card.getAttribute("data-engine") as TtsProviderType;
         if (selected) {
            state.settings = { ...state.settings, provider: selected };
            syncSettingsForm();
         }
      });
   });

   // 속도 슬라이더 변경
   rangeSpeechRate.addEventListener("input", () => {
      const val = parseInt(rangeSpeechRate.value, 10);
      const formatted = val >= 0 ? `+${val}%` : `${val}%`;
      speechRateDisplay.textContent = formatted;
      updateSliderFillTrack(rangeSpeechRate);
   });

   // 어조 프리셋 변경
   selectGeminiTone.addEventListener("change", () => {
      const selected = selectGeminiTone.value;
      if (selected === "custom") {
         customPromptWrapper.classList.remove("option-hidden");
      } else {
         customPromptWrapper.classList.add("option-hidden");
         textareaGeminiPrompt.value = GEMINI_TONE_PRESETS[selected] ?? "";
      }
   });

   // ElevenLabs 보이스 프리셋 변경
   selectElevenlabsVoicePreset.addEventListener("change", () => {
      const selected = selectElevenlabsVoicePreset.value;
      if (selected === "custom") {
         elevenlabsCustomVoiceRow.classList.remove("option-hidden");
      } else {
         elevenlabsCustomVoiceRow.classList.add("option-hidden");
      }
   });

   // 목소리 테스트 버튼
   btnTestSpeech.addEventListener("click", async () => {
      const val = parseInt(rangeSpeechRate.value, 10);
      const speechRate = val >= 0 ? `+${val}%` : `${val}%`;

      let systemPrompt = textareaGeminiPrompt.value;
      if (selectGeminiTone.value !== "custom") {
         systemPrompt =
            GEMINI_TONE_PRESETS[selectGeminiTone.value] ?? systemPrompt;
      }

      const elevenLabsVoiceId =
         selectElevenlabsVoicePreset.value === "custom"
            ? inputElevenlabsVoiceId.value.trim() || "JBFqnCBsd6RMkjVDRZzb"
            : selectElevenlabsVoicePreset.value;

      const tempSettings: AppSettings = {
         ...state.settings,
         edgeVoice: selectEdgeVoice.value as EdgeVoiceName,
         edgeVoiceMale: selectEdgeVoiceMale.value as EdgeVoiceName,
         edgeVoiceFemale: selectEdgeVoiceFemale.value as EdgeVoiceName,
         speechRate,
         geminiApiKey: inputGeminiKey.value.trim(),
         geminiModel:
            (selectGeminiModel.value as GeminiModelName) ??
            "gemini-3.8-flash-tts",
         geminiVoice: selectGeminiVoice.value as GeminiVoiceName,
         geminiVoiceMale: selectGeminiVoiceMale.value as GeminiVoiceName,
         geminiVoiceFemale: selectGeminiVoiceFemale.value as GeminiVoiceName,
         geminiSystemPrompt: systemPrompt,
         openaiApiKey: inputOpenaiKey.value.trim(),
         openaiModel: (selectOpenaiModel.value as OpenAiModelName) || "tts-1",
         openaiVoice: (selectOpenaiVoice.value as OpenAiVoiceName) || "onyx",
         openaiVoiceMale:
            (selectOpenaiVoiceMale.value as OpenAiVoiceName) || "onyx",
         openaiVoiceFemale:
            (selectOpenaiVoiceFemale.value as OpenAiVoiceName) || "nova",
         elevenLabsApiKey: inputElevenlabsKey.value.trim(),
         elevenLabsModel:
            (selectElevenlabsModel.value as ElevenLabsModelName) ||
            "eleven_multilingual_v2",
         elevenLabsVoiceId,
         elevenLabsVoiceMale:
            selectElevenlabsVoiceMale.value || "JBFqnCBsd6RMkjVDRZzb",
         elevenLabsVoiceFemale:
            selectElevenlabsVoiceFemale.value || "Xb7hH8MSUJpSbSDYk0k2",
         systemVoice: (selectSystemVoice.value as SystemVoiceName) || "default",
         isAudioDramaEnabled: chkAudioDrama.checked,
      };

      const isEn = getCurrentLocale() === "en";
      btnTestSpeech.disabled = true;
      btnTestSpeech.textContent = isEn ? "Synthesizing..." : "합성 중...";

      try {
         const result = await window.electronAPI.synthesizeSpeech({
            text: getSampleTestText(),
            settings: tempSettings,
         });

         if (result.isSuccess && result.audioBase64) {
            notifyFallbackIfNeeded(result, tempSettings.provider);
            const mime = result.mimeType ?? "audio/mp3";
            const blobUrl = base64ToBlobUrl(result.audioBase64, mime);
            if (currentAudioBlobUrl) {
               URL.revokeObjectURL(currentAudioBlobUrl);
            }
            currentAudioBlobUrl = blobUrl;
            audioPlayer.src = blobUrl;
            await visualizerController.resumeAudioContext();
            await audioPlayer.play();
            setAudioPlayingState(true);
         } else {
            showToast(
               isEn
                  ? `[Test Failed] ${result.errorMessage ?? "An error occurred"}`
                  : `[테스트 실패] ${result.errorMessage ?? "오류 발생"}`,
               "error",
            );
         }
      } finally {
         btnTestSpeech.disabled = false;
         btnTestSpeech.textContent = t("voice.testBtn");
      }
   });

   // 오디오 드라마 모드 토글 즉시 반영
   chkAudioDrama.addEventListener("change", () => {
      if (state.settings.provider === "system") {
         chkAudioDrama.checked = false;
         showToast(
            "⚠️ 시스템(로컬) TTS는 오디오 드라마 모드를 지원하지 않습니다.",
            "warning",
         );
         return;
      }
      state.settings = {
         ...state.settings,
         isAudioDramaEnabled: chkAudioDrama.checked,
      };
      window.electronAPI.saveSettings(state.settings);
      showToast(
         chkAudioDrama.checked
            ? "🎭 오디오 드라마 모드(지문/대사 교차 낭독)가 활성화되었습니다."
            : "🎙️ 일반 단일 보이스 모드로 전환되었습니다.",
         "info",
      );
   });

   // 로컬 캐시 활성화 토글 즉시 반영
   chkCacheEnabled?.addEventListener("change", (e: Event) => {
      const isChecked = (e.target as HTMLInputElement)?.checked ?? false;
      state.settings = { ...state.settings, isCacheEnabled: isChecked };
      window.electronAPI.saveSettings(state.settings);
      showToast(
         isChecked
            ? "⚡ 로컬 오디오 캐싱이 활성화되었습니다."
            : "⏸️ 로컬 오디오 캐싱이 일시 중지되었습니다.",
         "info",
      );
   });

   // 설정 저장
   btnSaveSettings.addEventListener("click", async () => {
      const val = parseInt(rangeSpeechRate.value, 10);
      const speechRate = val >= 0 ? `+${val}%` : `${val}%`;

      let systemPrompt = textareaGeminiPrompt.value;
      if (selectGeminiTone.value !== "custom") {
         systemPrompt =
            GEMINI_TONE_PRESETS[selectGeminiTone.value] ?? systemPrompt;
      }

      const elevenLabsVoiceId =
         selectElevenlabsVoicePreset.value === "custom"
            ? inputElevenlabsVoiceId.value.trim() || "JBFqnCBsd6RMkjVDRZzb"
            : selectElevenlabsVoicePreset.value;

      const updatedSettings: AppSettings = {
         ...state.settings,
         edgeVoice: selectEdgeVoice.value as EdgeVoiceName,
         edgeVoiceMale: selectEdgeVoiceMale.value as EdgeVoiceName,
         edgeVoiceFemale: selectEdgeVoiceFemale.value as EdgeVoiceName,
         speechRate,
         geminiApiKey: inputGeminiKey.value.trim(),
         geminiModel:
            (selectGeminiModel.value as GeminiModelName) ??
            "gemini-3.8-flash-tts",
         geminiVoice: selectGeminiVoice.value as GeminiVoiceName,
         geminiVoiceMale: selectGeminiVoiceMale.value as GeminiVoiceName,
         geminiVoiceFemale: selectGeminiVoiceFemale.value as GeminiVoiceName,
         geminiSystemPrompt: systemPrompt,
         openaiApiKey: inputOpenaiKey.value.trim(),
         openaiModel: (selectOpenaiModel.value as OpenAiModelName) || "tts-1",
         openaiVoice: (selectOpenaiVoice.value as OpenAiVoiceName) || "onyx",
         openaiVoiceMale:
            (selectOpenaiVoiceMale.value as OpenAiVoiceName) || "onyx",
         openaiVoiceFemale:
            (selectOpenaiVoiceFemale.value as OpenAiVoiceName) || "nova",
         elevenLabsApiKey: inputElevenlabsKey.value.trim(),
         elevenLabsModel:
            (selectElevenlabsModel.value as ElevenLabsModelName) ||
            "eleven_multilingual_v2",
         elevenLabsVoiceId,
         elevenLabsVoiceMale:
            selectElevenlabsVoiceMale.value || "JBFqnCBsd6RMkjVDRZzb",
         elevenLabsVoiceFemale:
            selectElevenlabsVoiceFemale.value || "Xb7hH8MSUJpSbSDYk0k2",
         systemVoice: (selectSystemVoice.value as SystemVoiceName) || "default",
         customLogPath: state.settings.customLogPath,
         isAudioDramaEnabled: chkAudioDrama.checked,
         isCacheEnabled: chkCacheEnabled ? chkCacheEnabled.checked : true,
         maxCacheSizeMb: rangeCacheSize
            ? parseInt(rangeCacheSize.value, 10) || 500
            : 500,
         isExecutionSoundEnabled: chkExecutionSound
            ? chkExecutionSound.checked
            : true,
         executionSoundVolume: rangeExecutionVolume
            ? (parseInt(rangeExecutionVolume.value, 10) || 80) / 100
            : 0.8,
         appLanguage: getCurrentLocale(),
      };

      const isSaved = await window.electronAPI.saveSettings(updatedSettings);
      if (isSaved) {
         state.settings = updatedSettings;
         syncSettingsForm();
         closeSettingsModal();
         showToast(t("toast.saved"), "info");
      } else {
         showToast(t("toast.saveError"), "error");
      }
   });

   let downloadedUpdateFilePath: string | null = null;
   let isDownloadingUpdate = false;

   // 실시간 다운로드 진행률 이벤트 수신 구독
   window.electronAPI.onUpdateDownloadProgress(
      (progress: UpdateDownloadProgress) => {
         if (updateProgressBar) {
            updateProgressBar.style.width = `${progress.percent}%`;
         }
         if (updateProgressPercent) {
            updateProgressPercent.textContent = `${progress.percent}%`;
         }
         if (updateProgressText) {
            const mbCurrent = (
               progress.downloadedBytes /
               (1024 * 1024)
            ).toFixed(1);
            const mbTotal = (progress.totalBytes / (1024 * 1024)).toFixed(1);
            const speedMb = (progress.speedBytesPerSec / (1024 * 1024)).toFixed(
               1,
            );
            updateProgressText.textContent = `다운로드 중... ${mbCurrent}MB / ${mbTotal}MB (${speedMb}MB/s)`;
         }
      },
   );

   // 상단 업데이트 배너 스마트 인앱 다운로드 및 설치 액션 버튼 클릭
   btnUpdateDownload?.addEventListener("click", async () => {
      const isEn = getCurrentLocale() === "en";

      // 1. 이미 다운로드가 완료된 상태라면 -> 즉시 설치/재실행
      if (downloadedUpdateFilePath) {
         btnUpdateDownload.disabled = true;
         btnUpdateDownload.textContent = isEn
            ? "🚀 Applying Update..."
            : "🚀 업데이트 적용 중...";
         const isSuccess = await window.electronAPI.installAndRestartUpdate(
            downloadedUpdateFilePath,
         );
         if (!isSuccess) {
            showToast(t("toast.installFailed"), "warning");
            btnUpdateDownload.disabled = false;
            btnUpdateDownload.textContent = isEn
               ? "📦 Open Installer Again"
               : "📦 설치 파일 다시 열기";
         }
         return;
      }

      // 2. 다운로드할 에셋이 존재하는 경우 -> 인앱 다운로드 시작
      const asset = latestUpdateResult?.matchedAsset;
      if (asset && asset.downloadUrl) {
         if (isDownloadingUpdate) {
            return;
         }
         isDownloadingUpdate = true;
         btnUpdateDownload.disabled = true;
         btnUpdateDownload.textContent = isEn
            ? "⏳ Downloading..."
            : "⏳ 다운로드 중...";
         if (updateProgressContainer) {
            updateProgressContainer.classList.remove("option-hidden");
         }

         showToast(t("toast.downloadStart", { name: asset.name }), "info");
         const result = await window.electronAPI.startDownloadUpdate(
            asset.downloadUrl,
         );

         isDownloadingUpdate = false;
         if (result.isSuccess && result.filePath) {
            downloadedUpdateFilePath = result.filePath;
            btnUpdateDownload.disabled = false;
            if (updateProgressText) {
               updateProgressText.textContent = isEn
                  ? "✅ Download Complete!"
                  : "✅ 다운로드 완료!";
            }

            const isWindows = navigator.userAgent.includes("Windows");
            if (isWindows) {
               btnUpdateDownload.textContent = isEn
                  ? "🚀 Restart & Apply"
                  : "🚀 지금 적용 및 재시작";
               btnUpdateDownload.title = isEn
                  ? "Launches new version and exits."
                  : "새 버전 프로세스를 실행하고 현재 앱을 종료합니다.";
               showToast(t("toast.downloadSuccessWin"), "success");
            } else {
               btnUpdateDownload.textContent = isEn
                  ? "📦 Open DMG Installer"
                  : "📦 최신 설치 파일 열기";
               btnUpdateDownload.title = isEn
                  ? "Opens latest DMG to drag to Applications."
                  : "최신 DMG 설치 파일을 열어 Applications로 교체합니다.";
               showToast(t("toast.downloadSuccessMac"), "success");
            }
         } else {
            btnUpdateDownload.disabled = false;
            btnUpdateDownload.textContent = isEn
               ? "⬇️ One-Click Auto Update"
               : "⬇️ 원클릭 자동 업데이트";
            showToast(
               t("toast.downloadFailed", {
                  error:
                     result.errorMessage ??
                     (isEn ? "Unknown error" : "알 수 없는 오류"),
               }),
               "warning",
            );
         }
         return;
      }

      // 3. 에셋이 매칭되지 않은 경우 (Linux 등) -> 브라우저 릴리스 페이지 열기
      const targetUrl =
         latestUpdateResult?.releaseUrl ?? currentAppInfo.repoUrl;
      await window.electronAPI.openExternal(targetUrl);
   });

   // 상단 업데이트 배너 닫기 버튼 클릭
   btnUpdateDismiss?.addEventListener("click", () => {
      hideUpdateBanner();
   });

   // 설정 모달 내 수동 최신 버전 확인 버튼 클릭
   btnManualCheckUpdate?.addEventListener("click", async () => {
      await checkAppUpdates(true);
   });

   // 설정 모달 내 GitHub 저장소 바로가기 버튼 클릭
   btnOpenRepo?.addEventListener("click", async () => {
      await window.electronAPI.openExternal(currentAppInfo.repoUrl);
   });

   // 설정 모달 내 Steam 창작마당 바로가기 버튼 클릭
   btnOpenWorkshop?.addEventListener("click", async () => {
      await window.electronAPI.openExternal("https://steamcommunity.com/sharedfiles/filedetails/?id=3824371603");
   });

   // 상단 알림 배너 및 설정 모달 내 CK3 모드 파일 동기화 버튼 클릭
   btnSyncMod?.addEventListener("click", async () => {
      await handleSyncModFiles();
   });
   btnModalSyncMod?.addEventListener("click", async () => {
      await handleSyncModFiles();
   });

   // 캐시 용량 슬라이더 입력 시 표시 텍스트 및 하단 현황판 실시간 연동
   rangeCacheSize?.addEventListener("input", (e: Event) => {
      const target = e.target as HTMLInputElement;
      const newMaxMb = parseInt(target?.value ?? "500", 10) || 500;
      syncCacheUsageDisplay(newMaxMb);
      if (target) {
         updateSliderFillTrack(target);
      }
   });

   // 처형 효과음 볼륨 슬라이더 입력 시 표시 텍스트 및 트랙 연동
   rangeExecutionVolume?.addEventListener("input", (e: Event) => {
      const target = e.target as HTMLInputElement;
      const vol = parseInt(target?.value ?? "80", 10) || 80;
      if (executionVolumeDisplay) {
         executionVolumeDisplay.textContent = `${vol}%`;
      }
      if (target) {
         updateSliderFillTrack(target);
      }
   });

   // 처형 효과음 토글 체크박스 변경 시 볼륨 컨트롤 활성/비활성 스타일 토글
   chkExecutionSound?.addEventListener("change", () => {
      if (executionVolumeWrapper) {
         executionVolumeWrapper.style.opacity = chkExecutionSound.checked
            ? "1"
            : "0.4";
         executionVolumeWrapper.style.pointerEvents = chkExecutionSound.checked
            ? "auto"
            : "none";
      }
   });

   // 캐시 통계 새로고침 버튼
   btnRefreshCacheStats?.addEventListener("click", async () => {
      await updateCacheStatsUi();
      showToast("🔄 캐시 통계가 새로고침되었습니다.", "info");
   });

   // 캐시 폴더 열기 버튼
   btnOpenCacheDir?.addEventListener("click", async () => {
      const isOpened = await window.electronAPI.openCacheDir();
      if (!isOpened) {
         showToast("❌ 캐시 폴더 열기에 실패했습니다.", "error");
      }
   });

   // 캐시 전체 비우기 버튼
   btnClearCache?.addEventListener("click", async () => {
      const confirmMsg =
         getCurrentLocale() === "en"
            ? "Are you sure you want to delete all cached audio files?\nIdentical events will require fresh synthesis."
            : "정말로 저장된 모든 로컬 오디오 캐시를 삭제하시겠습니까?\n삭제 후 동일한 이벤트는 외부 API를 다시 호출하여 생성하게 됩니다.";
      const confirmed = confirm(confirmMsg);
      if (!confirmed) {
         return;
      }
      const isCleared = await window.electronAPI.clearCache();
      if (isCleared) {
         await updateCacheStatsUi();
         showToast(t("toast.cacheCleared"), "info");
      } else {
         showToast(t("toast.cacheClearError"), "error");
      }
   });

   // 언어 전환 버튼 리스너 (KO / EN)
   const btnLangKo = document.getElementById("btn-lang-ko");
   const btnLangEn = document.getElementById("btn-lang-en");

   const handleLanguageChange = async (
      targetLang: SupportedLocale,
   ): Promise<void> => {
      if (getCurrentLocale() === targetLang) {
         return;
      }
      setLanguage(targetLang);
      state.settings = { ...state.settings, appLanguage: targetLang };
      await window.electronAPI.saveSettings(state.settings);
      checkModSyncStatus(false).catch(console.error);
      updateCacheStatsUi().catch(console.error);
      renderHistoryList();
      if (currentAppInfo) {
         applyAppInfoToUi(currentAppInfo);
      }
   };

   btnLangKo?.addEventListener("click", () => {
      handleLanguageChange("ko").catch(console.error);
   });
   btnLangEn?.addEventListener("click", () => {
      handleLanguageChange("en").catch(console.error);
   });
};

/**
 * 애플리케이션 초기화 루틴
 */
const initializeApp = async (): Promise<void> => {
   // macOS 환경 감지 시 네이티브 신호등(트래픽 라이트) 버튼 안전 여백 클래스 부여
   if (
      navigator.userAgent.includes("Mac") ||
      navigator.platform.includes("Mac")
   ) {
      document.body.classList.add("platform-darwin");
   }

   bindEventListeners();

   // 모든 슬라이더 초기 트랙 게이지 채우기 반영
   document
      .querySelectorAll<HTMLInputElement>('input[type="range"]')
      .forEach((slider) => {
         updateSliderFillTrack(slider);
      });

   // 앱 버전 및 제작자 정보 로드 및 UI 렌더링
   try {
      currentAppInfo = await window.electronAPI.getAppInfo();
      applyAppInfoToUi(currentAppInfo);
   } catch (err: unknown) {
      console.warn("⚠️ [AppInfo] 정보 조회 실패, 기본값 유지:", err);
   }

   // 기존 설정 로드
   state.settings = await window.electronAPI.getSettings();

   // 언어 설정 복원 및 UI 전체 번역 적용
   const savedLang =
      (localStorage.getItem("ck3_tts_lang") as SupportedLocale | null) ??
      state.settings.appLanguage ??
      "ko";
   setLanguage(savedLang);

   syncSettingsForm();

   // 비동기 백그라운드 자동 업데이트 확인 실행 (앱 시작 시점)
   checkAppUpdates(false).catch((err: unknown) => {
      console.warn("⚠️ [UpdateCheck] 백그라운드 업데이트 확인 실패:", err);
   });

   // CK3 게임 모드 버전 동기화 상태 검사 실행 (앱 시작 시점)
   checkModSyncStatus(false).catch((err: unknown) => {
      console.warn("⚠️ [ModSync] 모드 버전 상태 확인 실패:", err);
   });

   // 실시간 CK3 이벤트 수신 구독
   window.electronAPI.onEventDetected((event: Ck3EventMessage) => {
      handleNewEvent(event);
   });

   // 실시간 CK3 처형 효과음 이벤트 수신 구독
   window.electronAPI.onExecutionSound((event: ExecutionSoundEvent) => {
      if (state.settings.isExecutionSoundEnabled) {
         const volume = state.settings.executionSoundVolume ?? 0.8;
         playExecutionSound(event, volume);
      } else {
         console.info(
            "ℹ️ [ExecutionSound] 처형 효과음 비활성화 상태이므로 재생 건너뜀",
         );
      }
   });

   // 화면에 이미 렌더링되어 있을 수 있는 잔류 마커 즉시 소거
   if (currentEventContent.textContent) {
      currentEventContent.textContent = sanitizeDisplayText(
         currentEventContent.textContent,
      );
   }

   // 인게임 창 닫힘 신호 수신 시 즉시 오디오 완전 중단
   window.electronAPI.onStopSpeech(() => {
      // 결투 등 연속 이벤트 전환 시, 새 이벤트가 들어온 직후(300ms 이내)에 뒤늦게 도착한 이전 창의 잔여 STOP 신호는 무시
      if (Date.now() - lastEventDetectedTime < 300) {
         console.info(
            "ℹ️ [Audio] 새 이벤트 직후 유입된 이전 창의 잔여 STOP 신호 무시",
         );
         return;
      }
      stopAudio();
   });

   // 전역 단축키 수신 시 낭독 토글 (일시중지 또는 현재 사건 낭독)
   window.electronAPI.onToggleSpeech(() => {
      if (state.isPlaying) {
         stopAudio();
         showToast("⏹️ 낭독을 중단했습니다.", "info");
      } else if (state.currentEvent?.content) {
         showToast("▶️ 사건을 다시 낭독합니다.", "info");
         speakText(
            state.currentEvent.content,
            state.currentEvent.speakerGender,
            state.currentEvent.eventType,
         ).catch((err: unknown) => {
            console.error("❌ [Audio Playback Error]:", err);
         });
      }
   });
};

// 시작
window.addEventListener("DOMContentLoaded", () => {
   initializeApp().catch(console.error);
});
