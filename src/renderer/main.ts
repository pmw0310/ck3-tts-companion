import type {
  AppSettings,
  Ck3EventMessage,
  EdgeVoiceName,
  GeminiModelName,
  GeminiVoiceName,
  TtsProviderType
} from '@/shared/types';
import { splitIntoSentences } from '@/shared/sentenceSplitter';

/** Gemini 어조 프리셋 레코드 */
const GEMINI_TONE_PRESETS: Record<string, string> = {
  narrator:
    '너는 크루세이더 킹즈 3의 장엄하고 비장한 중세 궁정 나레이터다. 주어진 중세 역사 사건 텍스트를 감정을 듬뿍 실어 진중하고 몰입감 넘치게 읽어라.',
  warrior:
    '너는 수많은 전장을 누빈 백전노장의 성전 기사다. 거칠고 단호하며 묵직한 군인의 목소리로 사건을 전하라.',
  schemer:
    '너는 왕의 귀에 비밀을 속삭이는 음흉하고 냉철한 궁정 모략가다. 낮고 은밀하며 긴장감 넘치는 목소리로 낭독하라.'
};

/** 테스트용 샘플 중세 나레이션 문장 */
const SAMPLE_TEST_TEXT =
  '폐하, 국경 지대에서 가신들이 비밀리에 반란을 모의하고 있다는 밀서가 당도하였습니다. 신속한 결단이 필요하옵니다.';

/** 렌더러 애플리케이션 상태 */
type RendererState = {
  settings: AppSettings;
  currentEvent: Ck3EventMessage | null;
  history: Ck3EventMessage[];
  isPlaying: boolean;
};

const state: RendererState = {
  settings: {
    provider: 'edge',
    edgeVoice: 'ko-KR-SunHiNeural',
    geminiApiKey: '',
    geminiModel: 'gemini-3.8-flash-tts',
    geminiVoice: 'Aoede',
    geminiSystemPrompt: GEMINI_TONE_PRESETS.narrator ?? '',
    speechRate: '+0%',
    speechVolume: '+0%',
    customLogPath: null,
    isAutoPlayEnabled: true
  },
  currentEvent: null,
  history: [],
  isPlaying: false
};

// DOM 엘리먼트 캐싱
const logStatusBadge = document.getElementById('log-status-badge') as HTMLDivElement;
const logStatusText = document.getElementById('log-status-text') as HTMLSpanElement;
const logPathDisplay = document.getElementById('log-path-display') as HTMLSpanElement;
const providerBadge = document.getElementById('provider-badge') as HTMLSpanElement;
const audioVisualizer = document.getElementById('audio-visualizer') as HTMLDivElement;

const currentEventTitle = document.getElementById('current-event-title') as HTMLHeadingElement;
const currentEventContent = document.getElementById('current-event-content') as HTMLDivElement;
const historyList = document.getElementById('history-list') as HTMLDivElement;

const btnReplay = document.getElementById('btn-replay') as HTMLButtonElement;
const btnStopAudio = document.getElementById('btn-stop-audio') as HTMLButtonElement;
const btnClearHistory = document.getElementById('btn-clear-history') as HTMLButtonElement;
const chkAutoPlay = document.getElementById('chk-auto-play') as HTMLInputElement;

const btnOpenSettings = document.getElementById('btn-open-settings') as HTMLButtonElement;
const btnCloseSettings = document.getElementById('btn-close-settings') as HTMLButtonElement;
const btnSaveSettings = document.getElementById('btn-save-settings') as HTMLButtonElement;
const btnTestSpeech = document.getElementById('btn-test-speech') as HTMLButtonElement;
const btnBrowseLog = document.getElementById('btn-browse-log') as HTMLButtonElement;
const settingsModal = document.getElementById('settings-modal') as HTMLDivElement;

const audioPlayer = document.getElementById('tts-audio-player') as HTMLAudioElement;

// 설정 폼 엘리먼트
const edgeOptionsGroup = document.getElementById('edge-options') as HTMLDivElement;
const geminiOptionsGroup = document.getElementById('gemini-options') as HTMLDivElement;
const selectEdgeVoice = document.getElementById('select-edge-voice') as HTMLSelectElement;
const rangeSpeechRate = document.getElementById('range-speech-rate') as HTMLInputElement;
const speechRateDisplay = document.getElementById('speech-rate-display') as HTMLSpanElement;

const selectGeminiModel = document.getElementById('select-gemini-model') as HTMLSelectElement;
const inputGeminiKey = document.getElementById('input-gemini-key') as HTMLInputElement;
const selectGeminiVoice = document.getElementById('select-gemini-voice') as HTMLSelectElement;
const selectGeminiTone = document.getElementById('select-gemini-tone') as HTMLSelectElement;
const customPromptWrapper = document.getElementById('custom-prompt-wrapper') as HTMLDivElement;
const textareaGeminiPrompt = document.getElementById('textarea-gemini-prompt') as HTMLTextAreaElement;
const inputCustomLogPath = document.getElementById('input-custom-log-path') as HTMLInputElement;

/**
 * 오디오 재생 시작 상태를 UI에 반영합니다.
 */
const setAudioPlayingState = (isPlaying: boolean): void => {
  state.isPlaying = isPlaying;
  if (isPlaying) {
    audioVisualizer.classList.remove('visualizer-idle');
    audioVisualizer.classList.add('visualizer-playing');
    btnStopAudio.disabled = false;
  } else {
    audioVisualizer.classList.remove('visualizer-playing');
    audioVisualizer.classList.add('visualizer-idle');
    btnStopAudio.disabled = true;
  }
};

/**
 * 사용자에게 일관된 테마의 인앱 토스트 알림을 표시합니다.
 * @param message - 표시할 안내 문구
 * @param type - 알림 종류 ('info' | 'error')
 */
const showToast = (message: string, type: 'info' | 'error' = 'info'): void => {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 3200);
};

let activeSpeechRequestId = 0;
let lastAutoSpokenText = '';
let lastAutoSpokenTime = 0;
let lastStoppedText = '';
let lastStoppedTime = 0;
let isQueueActive = false;

/**
 * 진행 중인 모든 음성 재생 및 비동기 합성을 즉시 중단하고 오디오 자원을 해제합니다.
 */
const stopAudio = (): void => {
  activeSpeechRequestId++;
  isQueueActive = false;
  audioPlayer.pause();
  audioPlayer.currentTime = 0;
  audioPlayer.src = '';
  lastStoppedText = state.currentEvent?.content ?? '';
  lastStoppedTime = Date.now();
  setAudioPlayingState(false);
};

/**
 * 텍스트 음성 합성을 문장 단위로 분할하여 첫 문장을 0.3초 내에 즉각 재생하고,
 * 나머지 문장은 백그라운드 사전 합성(Prefetch)으로 대기열을 이어달립니다.
 * @param textToRead - 낭독할 전체 텍스트
 */
const speakText = async (textToRead: string): Promise<void> => {
  if (!textToRead || textToRead.trim().length === 0) {
    return;
  }

  // 새로운 낭독 시퀀스 ID 발급 (이전 진행 중인 모든 합성/재생 무효화)
  const currentRequestId = ++activeSpeechRequestId;

  // 1. 기존 재생 중이던 오디오 즉시 완전 음소거 및 초기화
  audioPlayer.pause();
  audioPlayer.currentTime = 0;
  audioPlayer.src = '';
  setAudioPlayingState(false);

  const sentences = splitIntoSentences(textToRead);
  if (sentences.length === 0) {
    return;
  }

  // 2. 단일 문장이면 즉시 단일 합성 및 재생
  if (sentences.length === 1) {
    const singleSentence = sentences[0];
    if (!singleSentence) {
      return;
    }

    try {
      const result = await window.electronAPI.synthesizeSpeech({
        text: singleSentence,
        settings: state.settings
      });

      if (currentRequestId !== activeSpeechRequestId) {
        return;
      }

      if (!result.isSuccess || !result.audioBase64) {
        showToast(`[음성 합성 실패] ${result.errorMessage ?? '알 수 없는 오류'}`, 'error');
        return;
      }

      const mime = result.mimeType ?? 'audio/mp3';
      audioPlayer.src = `data:${mime};base64,${result.audioBase64}`;
      await audioPlayer.play();
      setAudioPlayingState(true);
    } catch (error: unknown) {
      if (currentRequestId === activeSpeechRequestId) {
        const errorMsg = error instanceof Error ? error.message : '오디오 재생 실패';
        console.error('❌ [Audio Playback Error]:', errorMsg);
        setAudioPlayingState(false);
      }
    }
    return;
  }

  // 3. 다중 문장: 모든 문장을 병렬로 사전 합성(Prefetch) 시작하되, 첫 문장 완성 즉시 재생!
  isQueueActive = true;
  const prefetchQueue = sentences.map((sentence) =>
    window.electronAPI.synthesizeSpeech({
      text: sentence,
      settings: state.settings
    })
  );

  const playQueueIndex = async (index: number): Promise<void> => {
    if (index >= prefetchQueue.length) {
      isQueueActive = false;
      setAudioPlayingState(false);
      return;
    }

    const task = prefetchQueue[index];
    if (!task) {
      return;
    }

    try {
      const result = await task;
      if (currentRequestId !== activeSpeechRequestId) {
        return;
      }

      if (!result.isSuccess || !result.audioBase64) {
        console.warn(`⚠️ [TTS Queue] 문장 ${index + 1} 합성 실패:`, result.errorMessage);
        // 실패 시 다음 문장으로 건너뛰어 계속 재생
        await playQueueIndex(index + 1);
        return;
      }

      const mime = result.mimeType ?? 'audio/mp3';
      audioPlayer.src = `data:${mime};base64,${result.audioBase64}`;
      await audioPlayer.play();
      setAudioPlayingState(true);

      // 이번 문장이 끝나면 다음 문장 즉각 연속 재생
      const handleEnded = async (): Promise<void> => {
        audioPlayer.removeEventListener('ended', handleEnded);
        if (currentRequestId === activeSpeechRequestId) {
          await playQueueIndex(index + 1);
        }
      };

      audioPlayer.addEventListener('ended', handleEnded, { once: true });
    } catch (error: unknown) {
      if (currentRequestId === activeSpeechRequestId) {
        console.warn(`[TTS Queue] 문장 ${index + 1} 재생 오류:`, error);
        await playQueueIndex(index + 1);
      }
    }
  };

  // 0번(첫 번째 문장)부터 즉각 릴레이 재생 시작!
  await playQueueIndex(0);
};

/**
 * 히스토리 목록 UI를 다시 렌더링합니다.
 */
const renderHistoryList = (): void => {
  if (state.history.length === 0) {
    historyList.innerHTML = `
      <div class="empty-history">
        <span class="empty-icon">📜</span>
        <span class="empty-text">아직 기록된 사건이 없습니다. 게임 중 이벤트가 발생하면 이곳에 기록됩니다.</span>
      </div>
    `;
    return;
  }

  historyList.innerHTML = '';
  for (const item of state.history) {
    const itemEl = document.createElement('div');
    itemEl.className = 'history-item';

    const infoEl = document.createElement('div');
    infoEl.className = 'history-info';

    const headerRow = document.createElement('div');
    headerRow.className = 'history-header-row';

    const titleEl = document.createElement('span');
    titleEl.className = 'history-title';
    titleEl.textContent = item.title ?? '크루세이더 킹즈 3 사건';

    const timeEl = document.createElement('span');
    timeEl.className = 'history-time';
    const dateObj = new Date(item.timestamp);
    timeEl.textContent = `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;

    headerRow.appendChild(titleEl);
    headerRow.appendChild(timeEl);

    const snippetEl = document.createElement('div');
    snippetEl.className = 'history-snippet';
    snippetEl.textContent = item.content;

    infoEl.appendChild(headerRow);
    infoEl.appendChild(snippetEl);

    const playBtn = document.createElement('button');
    playBtn.className = 'btn btn-sm btn-secondary history-play-btn';
    playBtn.innerHTML = '<span>▶</span> 낭독';
    playBtn.title = '이 사건 다시 낭독하기';
    playBtn.addEventListener('click', () => {
      currentEventTitle.textContent = item.title ?? '크루세이더 킹즈 3 사건';
      currentEventContent.textContent = item.content;
      currentEventContent.classList.remove('placeholder-text');
      btnReplay.disabled = false;
      speakText(item.content);
    });

    itemEl.appendChild(infoEl);
    itemEl.appendChild(playBtn);
    historyList.appendChild(itemEl);
  }
};

/**
 * 새로운 CK3 이벤트를 화면에 표시하고 필요 시 자동 낭독을 시작합니다.
 * @param event - 감지된 이벤트 데이터
 */
const handleNewEvent = (event: Ck3EventMessage): void => {
  const now = Date.now();

  // 1. 창 닫기(Stop)가 발생한 직후 5초 이내에 방금 닫힌 동일 이벤트가 다시 들어오면 완전 차단
  if (event.content === lastStoppedText && now - lastStoppedTime < 5000) {
    return;
  }

  // 2. 직전에 자동 낭독한 이벤트와 완전히 같고 5초 이내면 무시
  if (event.content === lastAutoSpokenText && now - lastAutoSpokenTime < 5000) {
    return;
  }

  state.currentEvent = event;
  state.history.unshift(event);
  if (state.history.length > 20) {
    state.history.pop();
  }

  currentEventTitle.textContent = event.title ?? '새로운 사건 발생';
  currentEventContent.textContent = event.content;
  currentEventContent.classList.remove('placeholder-text');
  btnReplay.disabled = false;

  renderHistoryList();

  if (state.settings.isAutoPlayEnabled) {
    lastAutoSpokenText = event.content;
    lastAutoSpokenTime = now;
    speakText(event.content);
  }
};

/**
 * 모달 설정 UI의 폼 필드들을 현재 상태 값으로 채웁니다.
 */
const syncSettingsForm = (): void => {
  const currentProvider = state.settings.provider;

  // 탭 버튼 활성화 상태
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach((btn) => {
    const engine = btn.getAttribute('data-engine');
    if (engine === currentProvider) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  if (currentProvider === 'gemini') {
    edgeOptionsGroup.classList.add('option-hidden');
    geminiOptionsGroup.classList.remove('option-hidden');
    providerBadge.textContent = 'Gemini 3.8 Flash TTS';
  } else {
    edgeOptionsGroup.classList.remove('option-hidden');
    geminiOptionsGroup.classList.add('option-hidden');
    providerBadge.textContent = 'Edge-TTS';
  }

  selectEdgeVoice.value = state.settings.edgeVoice;
  const numericRate = parseInt(state.settings.speechRate.replace('%', ''), 10) || 0;
  rangeSpeechRate.value = numericRate.toString();
  speechRateDisplay.textContent = state.settings.speechRate;

  selectGeminiModel.value = state.settings.geminiModel;
  inputGeminiKey.value = state.settings.geminiApiKey;
  selectGeminiVoice.value = state.settings.geminiVoice;

  // 어조 프리셋 매칭
  const currentPrompt = state.settings.geminiSystemPrompt;
  let matchedTone = 'custom';
  for (const [key, prompt] of Object.entries(GEMINI_TONE_PRESETS)) {
    if (prompt === currentPrompt) {
      matchedTone = key;
      break;
    }
  }

  selectGeminiTone.value = matchedTone;
  if (matchedTone === 'custom') {
    customPromptWrapper.classList.remove('option-hidden');
    textareaGeminiPrompt.value = currentPrompt;
  } else {
    customPromptWrapper.classList.add('option-hidden');
    textareaGeminiPrompt.value = GEMINI_TONE_PRESETS[matchedTone] ?? '';
  }

  inputCustomLogPath.value = state.settings.customLogPath ?? '';
  chkAutoPlay.checked = state.settings.isAutoPlayEnabled;
};

/**
 * 렌더러 이벤트 리스너를 바인딩합니다.
 */
const bindEventListeners = (): void => {
  // 오디오 플레이어 완료/에러 이벤트
  audioPlayer.addEventListener('ended', () => {
    if (!isQueueActive) {
      setAudioPlayingState(false);
    }
  });
  audioPlayer.addEventListener('pause', () => setAudioPlayingState(false));

  // 재낭독 및 중지
  btnReplay.addEventListener('click', () => {
    if (state.currentEvent) {
      speakText(state.currentEvent.content);
    }
  });

  btnStopAudio.addEventListener('click', () => {
    stopAudio();
  });

  chkAutoPlay.addEventListener('change', () => {
    state.settings = { ...state.settings, isAutoPlayEnabled: chkAutoPlay.checked };
    window.electronAPI.saveSettings(state.settings);
  });

  btnClearHistory.addEventListener('click', () => {
    state.history = [];
    renderHistoryList();
  });

  // 모달 열기/닫기
  btnOpenSettings.addEventListener('click', () => {
    syncSettingsForm();
    settingsModal.classList.remove('modal-hidden');
  });

  btnCloseSettings.addEventListener('click', () => {
    settingsModal.classList.add('modal-hidden');
  });

  // 엔진 탭 전환
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const selected = btn.getAttribute('data-engine') as TtsProviderType;
      state.settings = { ...state.settings, provider: selected };
      syncSettingsForm();
    });
  });

  // 속도 슬라이더 변경
  rangeSpeechRate.addEventListener('input', () => {
    const val = parseInt(rangeSpeechRate.value, 10);
    const formatted = val >= 0 ? `+${val}%` : `${val}%`;
    speechRateDisplay.textContent = formatted;
  });

  // 어조 프리셋 변경
  selectGeminiTone.addEventListener('change', () => {
    const selected = selectGeminiTone.value;
    if (selected === 'custom') {
      customPromptWrapper.classList.remove('option-hidden');
    } else {
      customPromptWrapper.classList.add('option-hidden');
      textareaGeminiPrompt.value = GEMINI_TONE_PRESETS[selected] ?? '';
    }
  });

  // 커스텀 로그 파일 찾기
  btnBrowseLog.addEventListener('click', async () => {
    const selected = await window.electronAPI.selectCustomLogPath();
    if (selected) {
      inputCustomLogPath.value = selected;
    }
  });

  // 목소리 테스트 버튼
  btnTestSpeech.addEventListener('click', async () => {
    const val = parseInt(rangeSpeechRate.value, 10);
    const speechRate = val >= 0 ? `+${val}%` : `${val}%`;

    let systemPrompt = textareaGeminiPrompt.value;
    if (selectGeminiTone.value !== 'custom') {
      systemPrompt = GEMINI_TONE_PRESETS[selectGeminiTone.value] ?? systemPrompt;
    }

    const tempSettings: AppSettings = {
      ...state.settings,
      edgeVoice: selectEdgeVoice.value as EdgeVoiceName,
      speechRate,
      geminiApiKey: inputGeminiKey.value.trim(),
      geminiModel: (selectGeminiModel.value as GeminiModelName) ?? 'gemini-3.8-flash-tts',
      geminiVoice: selectGeminiVoice.value as GeminiVoiceName,
      geminiSystemPrompt: systemPrompt
    };

    btnTestSpeech.disabled = true;
    btnTestSpeech.textContent = '합성 중...';

    try {
      const result = await window.electronAPI.synthesizeSpeech({
        text: SAMPLE_TEST_TEXT,
        settings: tempSettings
      });

      if (result.isSuccess && result.audioBase64) {
        audioPlayer.src = `data:${result.mimeType ?? 'audio/mp3'};base64,${result.audioBase64}`;
        await audioPlayer.play();
        setAudioPlayingState(true);
      } else {
        showToast(`[테스트 실패] ${result.errorMessage ?? '오류 발생'}`, 'error');
      }
    } finally {
      btnTestSpeech.disabled = false;
      btnTestSpeech.textContent = '🎙️ 현재 설정으로 목소리 테스트';
    }
  });

  // 설정 저장
  btnSaveSettings.addEventListener('click', async () => {
    const val = parseInt(rangeSpeechRate.value, 10);
    const speechRate = val >= 0 ? `+${val}%` : `${val}%`;

    let systemPrompt = textareaGeminiPrompt.value;
    if (selectGeminiTone.value !== 'custom') {
      systemPrompt = GEMINI_TONE_PRESETS[selectGeminiTone.value] ?? systemPrompt;
    }

    const updatedSettings: AppSettings = {
      ...state.settings,
      edgeVoice: selectEdgeVoice.value as EdgeVoiceName,
      speechRate,
      geminiApiKey: inputGeminiKey.value.trim(),
      geminiModel: (selectGeminiModel.value as GeminiModelName) ?? 'gemini-3.8-flash-tts',
      geminiVoice: selectGeminiVoice.value as GeminiVoiceName,
      geminiSystemPrompt: systemPrompt,
      customLogPath: inputCustomLogPath.value.trim() || null
    };

    const isSaved = await window.electronAPI.saveSettings(updatedSettings);
    if (isSaved) {
      state.settings = updatedSettings;
      syncSettingsForm();
      settingsModal.classList.add('modal-hidden');
      showToast('✅ 설정이 안전하게 저장 및 적용되었습니다.', 'info');
    } else {
      showToast('❌ 설정 저장에 실패했습니다. 입력값을 확인해 주세요.', 'error');
    }
  });
};

/**
 * 애플리케이션 초기화 루틴
 */
const initializeApp = async (): Promise<void> => {
  bindEventListeners();

  // 기존 설정 로드
  state.settings = await window.electronAPI.getSettings();
  syncSettingsForm();

  // 초기 경로 표시 및 감시 상태 활성화
  const initialPath = await window.electronAPI.getLogPath();
  if (initialPath) {
    logStatusBadge.className = 'status-badge status-active';
    logStatusText.textContent = 'CK3 로그 감시 중';
    logPathDisplay.textContent = initialPath;
    logPathDisplay.title = initialPath;
  }

  // 실시간 로그 감시 상태 이벤트 구독
  window.electronAPI.onLogStatusChange((isWatching: boolean, filePath: string | null) => {
    if (isWatching && filePath) {
      logStatusBadge.className = 'status-badge status-active';
      logStatusText.textContent = 'CK3 로그 감시 중';
      logPathDisplay.textContent = filePath;
      logPathDisplay.title = filePath;
    } else {
      logStatusBadge.className = 'status-badge status-waiting';
      logStatusText.textContent = '게임 연결 대기 중';
    }
  });

  // 실시간 CK3 이벤트 수신 구독
  window.electronAPI.onEventDetected((event: Ck3EventMessage) => {
    handleNewEvent(event);
  });

  // 인게임 창 닫힘 신호 수신 시 즉시 오디오 완전 중단
  window.electronAPI.onStopSpeech(() => {
    stopAudio();
  });

  // 전역 단축키 수신 시 낭독 토글 (일시중지 또는 현재 사건 낭독)
  window.electronAPI.onToggleSpeech(() => {
    if (state.isPlaying) {
      stopAudio();
      showToast('⏹️ 낭독을 중단했습니다.', 'info');
    } else if (state.currentEvent?.content) {
      showToast('▶️ 사건을 다시 낭독합니다.', 'info');
      speakText(state.currentEvent.content).catch((err: unknown) => {
        console.error('❌ [Audio Playback Error]:', err);
      });
    }
  });
};

// 시작
window.addEventListener('DOMContentLoaded', () => {
  initializeApp().catch(console.error);
});
