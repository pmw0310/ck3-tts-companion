import type {
  AppSettings,
  Ck3EventMessage,
  EdgeVoiceName,
  GeminiModelName,
  GeminiVoiceName,
  SynthesizeResult,
  TtsProviderType
} from '@/shared/types';
import { splitIntoPlaybackChunks } from '@/shared/sentenceSplitter';
import { shouldPlayEvent } from '@/shared/eventDeduplicator';

/** Gemini 어조 프리셋 레코드 */
const GEMINI_TONE_PRESETS: Record<string, string> = {
  trailer:
    'A calm, intellectual, deep, and slightly dry gravelly baritone with a weary yet dignified delivery, reminiscent of the Crusader Kings trailer narrator and Kim Kitsuragi. Speak in a composed, measured, and deadpan solemnity with quiet authority. Do not shout, do not sound cheerful or melodramatic. Deliver every line with dry gravitas and philosophical composure. 차분하고 냉철하며 묵직한 중저음의 지적인 어조로 낭독하라.',
  narrator:
    'A solemn, deep, and majestic medieval court chronicler reciting the annals of history. Speak in a grave, resonant, and measured cadence with deep historical gravitas. Do not sound modern or cheerful; deliver every word with historical weight and quiet reverence. 진중하고 장엄한 중세 사관의 목소리로 낭독하라.',
  warrior:
    'A battle-hardened crusader knight commander and veteran warrior. Heavy, firm, commanding, and resolute delivery with deep authority forged in iron and blood. 거칠고 단호하며 묵직한 백전노장의 목소리로 읽어라.',
  schemer:
    'A sinister, cunning, and low-voiced royal spymaster whispering in candlelit chambers. Low, secretive, chilling, and conspiratorial tone with tense pauses. 낮고 은밀하며 서늘한 궁정 모략가의 어조로 읽어라.',
  clergy:
    'A devout and venerable medieval archbishop reciting holy scripture and Latin blessings. Reverent, transcendent, peaceful, and deeply devout. 성스럽고 경건한 대주교의 기도문 낭독 어조로 읽어라.',
  emperor:
    'An awe-inspiring sovereign monarch proclaiming a royal edict from the high throne. Regal, commanding, grand, and commanding absolute respect. 위엄 있고 당당한 제왕의 칙령 낭독 어조로 읽어라.'
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
    geminiVoice: 'Charon',
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
const ttsStatusIndicator = document.getElementById('tts-status-indicator') as HTMLDivElement;
const ttsStatusText = document.getElementById('tts-status-text') as HTMLSpanElement;

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

/** TTS UI 낭독/합성 상태 타입 */
type TtsUiStatus = 'idle' | 'synthesizing' | 'playing' | 'error';

/**
 * TTS 음성 합성 및 재생 상태를 메인 카드 UI(스피너, 상태 텍스트, 비주얼라이저, 버튼)에 동기화합니다.
 * @param status - 변경할 상태 ('idle' | 'synthesizing' | 'playing' | 'error')
 * @param detailText - 상태 보조 안내 문구 (선택적)
 */
const setTtsUiState = (status: TtsUiStatus, detailText?: string): void => {
  state.isPlaying = status === 'playing';

  ttsStatusIndicator.classList.remove(
    'status-idle',
    'status-synthesizing',
    'status-playing',
    'status-error'
  );
  audioVisualizer.classList.remove(
    'visualizer-idle',
    'visualizer-synthesizing',
    'visualizer-playing'
  );

  switch (status) {
    case 'synthesizing': {
      ttsStatusIndicator.classList.add('status-synthesizing');
      const defaultText =
        state.settings.provider === 'gemini'
          ? 'Gemini AI 음성 생성 중...'
          : '음성 합성 중...';
      ttsStatusText.textContent = detailText ?? defaultText;
      audioVisualizer.classList.add('visualizer-synthesizing');
      btnStopAudio.disabled = false; // 통신 중에도 중지(취소) 가능!
      btnReplay.disabled = true;
      break;
    }

    case 'playing': {
      ttsStatusIndicator.classList.add('status-playing');
      ttsStatusText.textContent = detailText ?? '낭독 중';
      audioVisualizer.classList.add('visualizer-playing');
      btnStopAudio.disabled = false;
      btnReplay.disabled = true;
      break;
    }

    case 'error': {
      ttsStatusIndicator.classList.add('status-error');
      ttsStatusText.textContent = detailText ?? '오류 발생';
      audioVisualizer.classList.add('visualizer-idle');
      btnStopAudio.disabled = true;
      btnReplay.disabled = state.currentEvent === null;
      break;
    }

    case 'idle':
    default: {
      ttsStatusIndicator.classList.add('status-idle');
      ttsStatusText.textContent = '대기 중';
      audioVisualizer.classList.add('visualizer-idle');
      btnStopAudio.disabled = true;
      btnReplay.disabled = state.currentEvent === null;
      break;
    }
  }
};

/**
 * 하위 호환성을 위해 오디오 재생 시작 상태를 UI에 반영합니다.
 */
const setAudioPlayingState = (isPlaying: boolean): void => {
  setTtsUiState(isPlaying ? 'playing' : 'idle');
};

/**
 * 사용자 설정의 speechRate(예: '+20%', '-10%')를 HTML Audio 엘리먼트의 playbackRate로 실시간 동기화합니다.
 */
const syncAudioPlaybackRate = (): void => {
  const rateStr = state.settings.speechRate ?? '+0%';
  const parsedPercent = parseInt(rateStr.replace('%', ''), 10);
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
 * @param type - 알림 종류 ('info' | 'error' | 'warning')
 */
const showToast = (
  message: string,
  type: 'info' | 'error' | 'warning' = 'info'
): void => {
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
let lastEventDetectedTime = 0;
let isQueueActive = false;
let lastFallbackToastTime = 0;

/** 대체 TTS 엔진 폴백 알림 토스트 표시 쿨다운 (6초) */
const FALLBACK_TOAST_COOLDOWN_MS = 6000;

/**
 * Gemini 음성 합성 오류 사유를 분석하여 사용자가 즉시 조치할 수 있는 안내 문구를 생성합니다.
 * @param reason - 원시 오류 메시지
 * @returns 사용자 친화적인 요약 사유
 */
const formatFallbackReason = (reason?: string): string => {
  if (!reason) return '오류 발생';
  if (reason.includes('API_KEY_INVALID') || reason.includes('API key not valid')) {
    return 'API 키 무효/오류';
  }
  if (reason.includes('RESOURCE_EXHAUSTED') || reason.includes('429')) {
    if (reason.includes('FreeTier') || reason.includes('DEFAULT_TIER') || reason.includes('free tier')) {
      return '무료 프로젝트 키로 인식됨 (AI Studio 결제 프로젝트 연결 확인 필요)';
    }
    return '일시적 요청 속도 제한 (429 Rate Limit)';
  }
  if (reason.includes('PERMISSION_DENIED') || reason.includes('403')) {
    return '결제 계정/권한 확인 필요 (403)';
  }
  return reason.length > 60 ? `${reason.slice(0, 60)}...` : reason;
};

/**
 * Gemini 음성 합성 실패 시 Edge-TTS 자동 대체 재생 안내 토스트를 표시합니다.
 * @param result - 음성 합성 결과 객체
 */
const notifyFallbackIfNeeded = (result: SynthesizeResult): void => {
  if (result.isFallback) {
    const now = Date.now();
    if (now - lastFallbackToastTime > FALLBACK_TOAST_COOLDOWN_MS) {
      lastFallbackToastTime = now;
      const reasonText = formatFallbackReason(result.fallbackReason);
      showToast(
        `⚠️ Gemini 호출 실패 [${reasonText}]로 인해 Edge-TTS로 대체 재생되었습니다.`,
        'warning'
      );
    }
  }
};

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
  setTtsUiState('idle');
};

/**
 * 텍스트 음성 합성을 최적 크기의 청크로 분할하여 첫 구절을 1초 내에 즉각 낭독(Fast-Start)하고,
 * 나머지 구절은 백그라운드 사전 합성(Prefetch Queue)으로 매끄럽게 이어 재생합니다.
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
  isQueueActive = false;

  // 2. 합성 시작 UI 상태 즉각 반영 (스피너 표시, 중지 버튼 활성화)
  setTtsUiState('synthesizing');

  // 3. TTS 엔진 특성에 맞춘 최적 크기 청크 분할 (Gemini: 1~1.5초 즉시 재생 청크 + 묶음 청크)
  const chunks = splitIntoPlaybackChunks(textToRead, state.settings.provider);
  if (chunks.length === 0) {
    setTtsUiState('idle');
    return;
  }

  // 4. 단일 청크인 경우:
  if (chunks.length === 1) {
    try {
      const result = await window.electronAPI.synthesizeSpeech({
        text: chunks[0]!,
        settings: state.settings
      });

      if (currentRequestId !== activeSpeechRequestId) {
        return;
      }

      if (!result.isSuccess || !result.audioBase64) {
        setTtsUiState('error', '합성 실패');
        showToast(`[음성 합성 실패] ${result.errorMessage ?? '알 수 없는 오류'}`, 'error');
        return;
      }

      notifyFallbackIfNeeded(result);

      const mime = result.mimeType ?? (state.settings.provider === 'gemini' ? 'audio/wav' : 'audio/mp3');
      audioPlayer.src = `data:${mime};base64,${result.audioBase64}`;
      syncAudioPlaybackRate();
      await audioPlayer.play();
      setTtsUiState('playing');
    } catch (error: unknown) {
      if (currentRequestId === activeSpeechRequestId) {
        const errorMsg = error instanceof Error ? error.message : '오디오 재생 실패';
        console.error('❌ [Audio Playback Error]:', errorMsg);
        setTtsUiState('error');
      }
    }
    return;
  }

  // 5. 다중 청크: 모든 청크를 백그라운드로 즉시 요청(Prefetch Queue)하되, 첫 번째 청크 도착 즉시 재생!
  isQueueActive = true;
  const prefetchQueue = chunks.map((chunk) =>
    window.electronAPI.synthesizeSpeech({
      text: chunk,
      settings: state.settings
    })
  );

  const playQueueIndex = async (index: number): Promise<void> => {
    if (index >= prefetchQueue.length) {
      isQueueActive = false;
      setTtsUiState('idle');
      return;
    }

    const task = prefetchQueue[index];
    if (!task) {
      isQueueActive = false;
      setTtsUiState('idle');
      return;
    }

    try {
      const result = await task;
      if (currentRequestId !== activeSpeechRequestId) {
        return;
      }

      if (!result.isSuccess || !result.audioBase64) {
        console.warn(`⚠️ [TTS Queue] 구절 ${index + 1} 합성 실패:`, result.errorMessage);
        // 실패 시 다음 구절로 안전하게 건너뛰어 계속 재생
        await playQueueIndex(index + 1);
        return;
      }

      notifyFallbackIfNeeded(result);

      const mime = result.mimeType ?? (state.settings.provider === 'gemini' ? 'audio/wav' : 'audio/mp3');
      audioPlayer.src = `data:${mime};base64,${result.audioBase64}`;
      syncAudioPlaybackRate();
      await audioPlayer.play();
      setTtsUiState('playing');

      // 이번 구절이 끝나면 다음 구절 즉각 연속 재생
      const handleEnded = async (): Promise<void> => {
        audioPlayer.removeEventListener('ended', handleEnded);
        if (currentRequestId === activeSpeechRequestId) {
          await playQueueIndex(index + 1);
        }
      };

      audioPlayer.addEventListener('ended', handleEnded, { once: true });
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
      lastStoppedTime
    },
    now
  );

  if (!shouldPlay) {
    console.info('ℹ️ [Event Deduplicator] 중복 또는 재생 중인 동일 이벤트 무시됨:', event.title);
    return;
  }

  state.currentEvent = event;

  // 최신 히스토리와 동일한 내용이 연달아 중복 적재되지 않도록 방어
  if (state.history.length === 0 || state.history[0]?.content !== event.content) {
    state.history.unshift(event);
    if (state.history.length > 20) {
      state.history.pop();
    }
    renderHistoryList();
  }

  currentEventTitle.textContent = event.title ?? '새로운 사건 발생';
  currentEventContent.textContent = event.content;
  currentEventContent.classList.remove('placeholder-text');
  btnReplay.disabled = false;

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
      setTtsUiState('idle');
    }
  });
  audioPlayer.addEventListener('pause', () => {
    if (!isQueueActive && !state.isPlaying) {
      setTtsUiState('idle');
    }
  });

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

  // 설정 모달 열기/닫기 제어
  /**
   * 설정 모달 창을 화면에서 닫습니다.
   */
  const closeSettingsModal = (): void => {
    settingsModal.classList.add('modal-hidden');
  };

  btnOpenSettings.addEventListener('click', () => {
    syncSettingsForm();
    settingsModal.classList.remove('modal-hidden');
  });

  // 닫기 버튼 클릭 시 모달 닫기
  btnCloseSettings.addEventListener('click', (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    closeSettingsModal();
  });

  // 모달 바깥 어두운 배경(Backdrop) 클릭 시 닫기
  settingsModal.addEventListener('click', (event: MouseEvent) => {
    if (event.target === settingsModal) {
      closeSettingsModal();
    }
  });

  // ESC 키 입력 시 모달 닫기
  window.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Escape' && !settingsModal.classList.contains('modal-hidden')) {
      closeSettingsModal();
    }
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
        notifyFallbackIfNeeded(result);
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
      closeSettingsModal();
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
    // 결투 등 연속 이벤트 전환 시, 새 이벤트가 들어온 직후(300ms 이내)에 뒤늦게 도착한 이전 창의 잔여 STOP 신호는 무시
    if (Date.now() - lastEventDetectedTime < 300) {
      console.info('ℹ️ [Audio] 새 이벤트 직후 유입된 이전 창의 잔여 STOP 신호 무시');
      return;
    }
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
