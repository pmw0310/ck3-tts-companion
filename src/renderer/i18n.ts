/**
 * @file i18n.ts
 * @description 한국어 및 영어 다국어 사전 및 DOM 번역 관리자
 */

/** 지원하는 UI 언어 로케일 타입 */
export type SupportedLocale = "ko" | "en";

/** 번역 키 정의 타입 */
export type TranslationKey = keyof typeof TRANSLATIONS.ko;

/** 번역 딕셔너리 정의 */
export const TRANSLATIONS = {
   ko: {
      // 헤더 및 브랜딩
      "header.title": "CK3 TTS COMPANION",
      "header.subtitle": "실시간 인게임 나레이션 보이스 엔진",
      "header.authorPrefix": "제작:",
      "header.versionTitle": "현재 애플리케이션 버전",
      "header.modVersionTitle": "CK3 게임 모드 버전 동기화 상태",
      "header.modChecking": "모드 확인 중...",
      "header.settingsBtnTitle": "설정",

      // 신규 버전 알림 배너
      "banner.update.title": "새로운 버전이 출시되었습니다!",
      "banner.update.desc": "최신 업데이트를 확인해 보세요.",
      "banner.update.downloadBtn": "⬇️ 원클릭 자동 업데이트",
      "banner.update.restartBtn": "🚀 재시작하여 업데이트 적용",
      "banner.update.openDmgBtn": "📦 DMG 열고 업데이트 적용",
      "banner.update.downloading": "다운로드 중...",

      // 모드 동기화 배너
      "banner.mod.title": "CK3 모드 버전 동기화 필요",
      "banner.mod.desc": "설치된 모드와 프로그램 버전이 다릅니다.",
      "banner.mod.syncBtn": "🔄 모드 지금 동기화",

      // 메인 사건 낭독 카드
      "card.currentTag": "현재 낭독 중인 사건",
      "card.statusIdle": "대기 중",
      "card.statusSynthesizing": "합성 중...",
      "card.statusSpeaking": "낭독 중",
      "card.placeholderTitle": "이벤트 대기 중...",
      "card.placeholderContent":
         "크루세이더 킹즈 3를 실행하고 이벤트를 발생시키면 이곳에 실시간으로 지문이 표시되고 음성으로 낭독됩니다.",
      "card.btnReplay": "🔄 다시 낭독",
      "card.btnStop": "⏹️ 중지",
      "card.chkAutoPlay": "이벤트 자동 낭독",

      // 히스토리
      "history.title": "최근 사건 기록 (History)",
      "history.clearBtn": "기록 지우기",
      "history.empty": "아직 감지된 이벤트가 없습니다.",

      // 푸터
      "footer.shortcutTip": "단축키: Ctrl/Cmd + Shift + S (낭독 일시중지/재개)",

      // 모달 네비게이션
      "modal.title": "설정",
      "modal.tab.voice": "🎙️ 음성 및 AI 엔진",
      "modal.tab.audioDrama": "🎭 오디오 드라마",
      "modal.tab.system": "📁 게임 연동 & 시스템",
      "modal.tab.cache": "⚡ 캐시",

      // 1. 음성 및 AI 엔진 탭
      "voice.engineSelectLabel": "AI 음성 엔진 선택",
      "voice.engine.system.title": "시스템 (로컬 TTS)",
      "voice.engine.system.desc":
         "오프라인 · 100% 로컬 / 차단 없음 / 즉시 재생",
      "voice.engine.edge.title": "Edge-TTS",
      "voice.engine.edge.desc": "무료 · 설정 없이 즉시 사용 가능한 초고속 낭독",
      "voice.engine.gemini.title": "Gemini 3.8 Flash",
      "voice.engine.gemini.desc": "유료 · 어조 지침 기반 스튜디오급 감정 연출",
      "voice.engine.openai.title": "OpenAI TTS",
      "voice.engine.openai.desc": "유료 · 묵직한 바리톤 onyx 사관 & 서사극",
      "voice.engine.elevenlabs.title": "ElevenLabs",
      "voice.engine.elevenlabs.desc": "유료 · 압도적 감정 연기력 & 글로벌 1위",

      "voice.system.voiceLabel": "기본 시스템 목소리",
      "voice.system.hint":
         "⚡ 100% 오프라인 무지연 동작: Fast-Start 첫 문장 즉시 발화 및 로컬 캐시(0ms)가 적용됩니다. (로컬 TTS는 오디오 드라마 모드를 지원하지 않습니다)",
      "voice.edge.voiceLabel": "기본 사관/지문 목소리",
      "voice.gemini.modelLabel": "Gemini 3.8 모델 버전",
      "voice.gemini.keyLabel": "Google AI Studio API 키",
      "voice.gemini.getKeyLink": "[키 발급받기 ↗]",
      "voice.gemini.voiceLabel": "Gemini 보이스",
      "voice.gemini.toneLabel": "나레이터 어조 프리셋",
      "voice.gemini.customPromptLabel": "커스텀 시스템 프롬프트",
      "voice.openai.modelLabel": "OpenAI 모델 버전",
      "voice.openai.keyLabel": "OpenAI API 키",
      "voice.openai.getKeyLink": "[키 발급받기 ↗]",
      "voice.openai.voiceLabel": "OpenAI 기본 사관 보이스",
      "voice.elevenlabs.modelLabel": "ElevenLabs 모델 버전",
      "voice.elevenlabs.keyLabel": "ElevenLabs API 키",
      "voice.elevenlabs.getKeyLink": "[키 발급받기 ↗]",
      "voice.elevenlabs.voiceLabel": "ElevenLabs 기본 사관 보이스",
      "voice.elevenlabs.customVoiceLabel": "커스텀 Voice ID",
      "voice.speechRateLabel": "낭독 속도",
      "voice.testBtn": "🎙️ 현재 설정으로 목소리 테스트",

      // 2. 오디오 드라마 탭
      "drama.disabledNotice":
         "⚠️ 현재 선택된 시스템(로컬) TTS는 오디오 드라마 모드를 지원하지 않으며, 단일 나레이터 낭독으로만 작동합니다. 성별 분기 낭독을 원하시면 Edge-TTS, Gemini, OpenAI 또는 ElevenLabs 엔진을 선택해 주세요.",
      "drama.title": "🎭 오디오 드라마 모드 (성별 및 지문/대사 분기)",
      "drama.desc":
         "지문(상황 묘사)은 사관 목소리로, 따옴표 대사는 말하는 인물의 성별 목소리로 실감 나게 교차 낭독합니다.",
      "drama.maleVoiceLabel": "남성 인물 목소리",
      "drama.femaleVoiceLabel": "여성 인물 목소리",
      "drama.executionTitle": "⚔️ 죄수 처형 효과음 (Execution Sound FX)",
      "drama.executionDesc":
         "인게임 처형 집행 시 사형 방식 및 죄수 성별(남/녀)에 맞춘 고음질 처형 효과음을 실시간으로 재생합니다.",
      "drama.executionVolumeLabel": "처형 효과음 볼륨",

      // 3. 게임 연동 & 시스템 탭
      "system.modLabel": "연동 CK3 모드 (패러독스 런처)",
      "system.modTitle": "CK3 Event Voice Reader (TTS Companion)",
      "system.modSubtext": "런처 모드 플레이셋에서 본 모드를 활성화해 주세요.",
      "system.btnSyncMod": "🔄 모드 파일 동기화",
      "system.softwareInfoLabel": "소프트웨어 정보 & 업데이트",
      "system.currentVersionLabel": "현재 버전:",
      "system.authorLabel": "제작자:",
      "system.btnCheckUpdate": "🔄 최신 버전 확인",
      "system.btnOpenRepo": "🌐 GitHub 저장소 ↗",
      "system.btnOpenWorkshop": "🎮 Steam 창작마당 ↗",

      // 4. 캐시 탭
      "cache.title": "⚡ 로컬 오디오 캐시",
      "cache.desc":
         "동일한 이벤트 낭독 시 외부 API 호출 없이 로컬 오디오에서 즉시 재생합니다.",
      "cache.maxSizeLabel": "최대 캐시 용량",
      "cache.statusLabel": "캐시 현황",
      "cache.statFiles": "저장된 오디오",
      "cache.statHits": "캐시 즉시 재생",
      "cache.statSize": "디스크 점유 용량",
      "cache.unitFiles": "{count}개",
      "cache.unitHits": "{count}회",
      "cache.btnRefresh": "🔄 통계 새로고침",
      "cache.btnOpenDir": "📂 캐시 폴더 열기",
      "cache.btnClear": "🗑️ 캐시 전체 비우기",

      // 모달 푸터
      "modal.btnSave": "설정 저장 및 적용",

      // 토스트 및 동적 알림
      "toast.saved": "✅ 설정이 안전하게 저장 및 적용되었습니다.",
      "toast.saveError": "❌ 설정 저장 중 오류가 발생했습니다.",
      "toast.syncing": "🔄 최신 모드 파일을 게임 폴더로 동기화하는 중...",
      "toast.syncSuccess":
         "✅ CK3 모드 동기화 완료! (복사 {copied}개, 정리 {removed}개)",
      "toast.syncUpToDate": "✅ 이미 최신 모드 파일이 설치되어 있습니다.",
      "toast.syncError": "❌ 모드 동기화 중 오류가 발생했습니다.",
      "toast.downloadStart": "📥 {name} 다운로드를 시작합니다...",
      "toast.downloadSuccessWin":
         "🎉 다운로드가 완료되었습니다! 버튼을 눌러 새 버전을 실행하세요.",
      "toast.downloadSuccessMac":
         "🎉 다운로드가 완료되었습니다! 버튼을 눌러 DMG를 열어주세요.",
      "toast.downloadFailed": "❌ 다운로드 실패: {error}",
      "toast.installFailed":
         "❌ 업데이트 파일 실행에 실패했습니다. 수동으로 다운로드해 주세요.",
      "toast.cacheRefreshed": "🔄 캐시 통계가 새로고침되었습니다.",
      "toast.cacheOpenError": "❌ 캐시 폴더 열기에 실패했습니다.",
      "toast.cacheCleared": "🗑️ 로컬 오디오 캐시가 깨끗이 비워졌습니다.",
      "toast.cacheClearError": "❌ 캐시 비우기에 실패했습니다.",
      "toast.speechStopped": "⏹️ 낭독을 중단했습니다.",
      "toast.speechReplaying": "▶️ 사건을 다시 낭독합니다.",
      "toast.testSpeechDone": "✅ 테스트 음성 재생 완료",
      "toast.testSpeechFailed": "❌ 테스트 음성 생성 실패: {error}",
      "toast.noUpdate": "✅ 현재 최신 버전({version})을 사용 중입니다.",
   },
   en: {
      // Header & Branding
      "header.title": "CK3 TTS COMPANION",
      "header.subtitle": "Real-time In-game Narration Voice Engine",
      "header.authorPrefix": "Created by",
      "header.versionTitle": "Current Application Version",
      "header.modVersionTitle": "CK3 Game Mod Sync Status",
      "header.modChecking": "Checking Mod...",
      "header.settingsBtnTitle": "Settings",

      // New Version Banner
      "banner.update.title": "A new version is available!",
      "banner.update.desc": "Check out the latest features and fixes.",
      "banner.update.downloadBtn": "⬇️ One-Click Auto Update",
      "banner.update.restartBtn": "🚀 Restart & Apply Update",
      "banner.update.openDmgBtn": "📦 Open DMG & Install",
      "banner.update.downloading": "Downloading...",

      // Mod Sync Banner
      "banner.mod.title": "CK3 Mod Version Sync Required",
      "banner.mod.desc":
         "Installed mod version differs from the companion app.",
      "banner.mod.syncBtn": "🔄 Sync Mod Now",

      // Main Narration Card
      "card.currentTag": "CURRENT EVENT NARRATION",
      "card.statusIdle": "Idle",
      "card.statusSynthesizing": "Synthesizing...",
      "card.statusSpeaking": "Speaking",
      "card.placeholderTitle": "Waiting for events...",
      "card.placeholderContent":
         "Launch Crusader Kings 3 and trigger an event. Its narration will be displayed here and read aloud in real time.",
      "card.btnReplay": "🔄 Replay",
      "card.btnStop": "⏹️ Stop",
      "card.chkAutoPlay": "Auto-read Events",

      // History
      "history.title": "Recent Events (History)",
      "history.clearBtn": "Clear History",
      "history.empty": "No events detected yet.",

      // Footer
      "footer.shortcutTip":
         "Shortcut: Ctrl/Cmd + Shift + S (Pause/Resume Speech)",

      // Modal Nav Tabs
      "modal.title": "Settings",
      "modal.tab.voice": "🎙️ Voice & AI Engine",
      "modal.tab.audioDrama": "🎭 Audio Drama",
      "modal.tab.system": "📁 Game & System",
      "modal.tab.cache": "⚡ Cache",

      // 1. Voice & AI Engine Tab
      "voice.engineSelectLabel": "Select AI Voice Engine",
      "voice.engine.system.title": "System (Local TTS)",
      "voice.engine.system.desc":
         "Offline · 100% Local / Zero Bans / Instant Playback",
      "voice.engine.edge.title": "Edge-TTS",
      "voice.engine.edge.desc":
         "Free · Blazing-fast narration without configuration",
      "voice.engine.gemini.title": "Gemini 3.8 Flash",
      "voice.engine.gemini.desc":
         "Paid · Studio-grade emotional acting via prompt guides",
      "voice.engine.openai.title": "OpenAI TTS",
      "voice.engine.openai.desc":
         "Paid · Deep baritone onyx chronicler & epic drama",
      "voice.engine.elevenlabs.title": "ElevenLabs",
      "voice.engine.elevenlabs.desc":
         "Paid · Unmatched emotional acting & industry leader",

      "voice.system.voiceLabel": "Default System Voice",
      "voice.system.hint":
         "⚡ 100% Offline Zero-Latency: Fast-Start immediate speech & local cache (0ms). (System TTS does not support Audio Drama mode)",
      "voice.edge.voiceLabel": "Default Chronicler/Narrator Voice",
      "voice.gemini.modelLabel": "Gemini 3.8 Model Version",
      "voice.gemini.keyLabel": "Google AI Studio API Key",
      "voice.gemini.getKeyLink": "[Get API Key ↗]",
      "voice.gemini.voiceLabel": "Gemini Voice",
      "voice.gemini.toneLabel": "Narrator Tone Preset",
      "voice.gemini.customPromptLabel": "Custom System Prompt",
      "voice.openai.modelLabel": "OpenAI Model Version",
      "voice.openai.keyLabel": "OpenAI API Key",
      "voice.openai.getKeyLink": "[Get API Key ↗]",
      "voice.openai.voiceLabel": "OpenAI Chronicler Voice",
      "voice.elevenlabs.modelLabel": "ElevenLabs Model Version",
      "voice.elevenlabs.keyLabel": "ElevenLabs API Key",
      "voice.elevenlabs.getKeyLink": "[Get API Key ↗]",
      "voice.elevenlabs.voiceLabel": "ElevenLabs Chronicler Voice",
      "voice.elevenlabs.customVoiceLabel": "Custom Voice ID",
      "voice.speechRateLabel": "Speech Rate",
      "voice.testBtn": "🎙️ Test Voice with Current Settings",

      // 2. Audio Drama Tab
      "drama.disabledNotice":
         "⚠️ System (Local) TTS does not support Audio Drama mode and operates with a single narrator voice. For character gender branching, please choose Edge-TTS, Gemini, OpenAI, or ElevenLabs.",
      "drama.title": "🎭 Audio Drama Mode (Gender & Dialogue Branching)",
      "drama.desc":
         "Narrates descriptions in a chronicler voice, and quoted dialogue in realistic male/female character voices.",
      "drama.maleVoiceLabel": "Male Character Voice",
      "drama.femaleVoiceLabel": "Female Character Voice",
      "drama.executionTitle": "⚔️ Execution Sound FX",
      "drama.executionDesc":
         "Plays high-fidelity execution sound effects matched to method and prisoner gender in real time.",
      "drama.executionVolumeLabel": "Execution Sound Volume",

      // 3. Game & System Tab
      "system.modLabel": "Linked CK3 Mod (Paradox Launcher)",
      "system.modTitle": "CK3 Event Voice Reader (TTS Companion)",
      "system.modSubtext":
         "Please ensure this mod is enabled in your Paradox Launcher playset.",
      "system.btnSyncMod": "🔄 Sync Mod Files",
      "system.softwareInfoLabel": "Software Info & Updates",
      "system.currentVersionLabel": "Current Version:",
      "system.authorLabel": "Author:",
      "system.btnCheckUpdate": "🔄 Check for Updates",
      "system.btnOpenRepo": "🌐 GitHub Repository ↗",
      "system.btnOpenWorkshop": "🎮 Steam Workshop ↗",

      // 4. Cache Tab
      "cache.title": "⚡ Local Audio Cache",
      "cache.desc":
         "Replays identical events instantly from local disk without calling external APIs.",
      "cache.maxSizeLabel": "Max Cache Size",
      "cache.statusLabel": "Cache Status",
      "cache.statFiles": "Cached Audio Files",
      "cache.statHits": "Cache Hits",
      "cache.statSize": "Disk Usage",
      "cache.unitFiles": "{count}",
      "cache.unitHits": "{count}",
      "cache.btnRefresh": "🔄 Refresh Stats",
      "cache.btnOpenDir": "📂 Open Cache Folder",
      "cache.btnClear": "🗑️ Clear All Cache",

      // Modal Footer
      "modal.btnSave": "Save & Apply Settings",

      // Toasts & Notifications
      "toast.saved": "✅ Settings saved and applied successfully.",
      "toast.saveError": "❌ Failed to save settings.",
      "toast.syncing": "🔄 Syncing latest mod files to game folder...",
      "toast.syncSuccess":
         "✅ CK3 mod synced! (Copied: {copied}, Removed: {removed})",
      "toast.syncUpToDate": "✅ Mod files are already up-to-date.",
      "toast.syncError": "❌ An error occurred during mod sync.",
      "toast.downloadStart": "📥 Starting download for {name}...",
      "toast.downloadSuccessWin":
         "🎉 Download complete! Click the button to launch the new version.",
      "toast.downloadSuccessMac":
         "🎉 Download complete! Click the button to open the DMG.",
      "toast.downloadFailed": "❌ Download failed: {error}",
      "toast.installFailed":
         "❌ Failed to launch update file. Please download manually.",
      "toast.cacheRefreshed": "🔄 Cache stats refreshed.",
      "toast.cacheOpenError": "❌ Failed to open cache folder.",
      "toast.cacheCleared": "🗑️ Local audio cache cleared completely.",
      "toast.cacheClearError": "❌ Failed to clear cache.",
      "toast.speechStopped": "⏹️ Narration playback stopped.",
      "toast.speechReplaying": "▶️ Replaying event narration.",
      "toast.testSpeechDone": "✅ Test voice playback completed.",
      "toast.testSpeechFailed": "❌ Test voice generation failed: {error}",
      "toast.noUpdate":
         "✅ You are already using the latest version ({version}).",
   },
} as const;

/** 현재 적용된 활성 로케일 (기본: ko) */
let activeLocale: SupportedLocale = "ko";

/**
 * 현재 활성화된 로케일을 반환합니다.
 * @returns 현재 로케일 ('ko' | 'en')
 */
export const getCurrentLocale = (): SupportedLocale => activeLocale;

/**
 * 번역 문자열을 조회하고 파라미터를 치환합니다.
 * @param key - 번역 키
 * @param params - 치환할 동적 매개변수 맵
 * @returns 번역된 문자열
 */
export const t = (
   key: TranslationKey,
   params?: Record<string, string | number>,
): string => {
   const dict = TRANSLATIONS[activeLocale] || TRANSLATIONS.ko;
   const rawText: string = dict[key] ?? TRANSLATIONS.ko[key] ?? key;

   if (!params) {
      return rawText;
   }

   let formatted = rawText;
   for (const [paramKey, paramVal] of Object.entries(params)) {
      formatted = formatted.replace(
         new RegExp(`\\{${paramKey}\\}`, "g"),
         String(paramVal),
      );
   }
   return formatted;
};

/**
 * 애플리케이션 언어를 설정하고 DOM 전체 번역을 적용합니다.
 * @param locale - 적용할 로케일
 */
export const setLanguage = (locale: SupportedLocale): void => {
   activeLocale = locale;
   if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
   }
   if (typeof localStorage !== "undefined") {
      try {
         localStorage.setItem("ck3_tts_lang", locale);
      } catch {
         // LocalStorage 접근 불가 환경 무시
      }
   }
   applyTranslations();
};

/**
 * DOM에 선언된 data-i18n 속성들을 스캔하여 텍스트 및 속성을 일괄 갱신합니다.
 */
export const applyTranslations = (): void => {
   if (typeof document === "undefined") {
      return;
   }
   // 1. data-i18n 텍스트 치환
   const textElements = document.querySelectorAll<HTMLElement>("[data-i18n]");
   textElements.forEach((el) => {
      const key = el.getAttribute("data-i18n") as TranslationKey | null;
      if (
         key &&
         (TRANSLATIONS[activeLocale] as Record<string, string>)?.[key]
      ) {
         el.textContent = t(key);
      }
   });

   // 2. data-i18n-placeholder 속성 치환
   const placeholderElements = document.querySelectorAll<
      HTMLInputElement | HTMLTextAreaElement
   >("[data-i18n-placeholder]");
   placeholderElements.forEach((el) => {
      const key = el.getAttribute(
         "data-i18n-placeholder",
      ) as TranslationKey | null;
      if (
         key &&
         (TRANSLATIONS[activeLocale] as Record<string, string>)?.[key]
      ) {
         el.placeholder = t(key);
      }
   });

   // 3. data-i18n-title 속성 치환
   const titleElements =
      document.querySelectorAll<HTMLElement>("[data-i18n-title]");
   titleElements.forEach((el) => {
      const key = el.getAttribute("data-i18n-title") as TranslationKey | null;
      if (
         key &&
         (TRANSLATIONS[activeLocale] as Record<string, string>)?.[key]
      ) {
         el.title = t(key);
      }
   });

   // 4. data-i18n-aria-label 속성 치환
   const ariaElements = document.querySelectorAll<HTMLElement>(
      "[data-i18n-aria-label]",
   );
   ariaElements.forEach((el) => {
      const key = el.getAttribute(
         "data-i18n-aria-label",
      ) as TranslationKey | null;
      if (
         key &&
         (TRANSLATIONS[activeLocale] as Record<string, string>)?.[key]
      ) {
         el.setAttribute("aria-label", t(key));
      }
   });

   // 5. 언어 전환 스위치 UI 활성 클래스 업데이트
   const koBtn = document.getElementById("btn-lang-ko");
   const enBtn = document.getElementById("btn-lang-en");
   if (koBtn && enBtn) {
      if (activeLocale === "ko") {
         koBtn.classList.add("active");
         enBtn.classList.remove("active");
      } else {
         koBtn.classList.remove("active");
         enBtn.classList.add("active");
      }
   }
};
