import { app, BrowserWindow, ipcMain, dialog, globalShortcut } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { resolveCk3LogPath } from '@/main/pathResolver';
import { startWatchingLogFile, type LogWatcherHandle } from '@/main/logWatcher';
import { processTtsRequest } from '@/main/ttsService';
import type {
  AppSettings,
  Ck3EventMessage,
  SynthesizeRequest,
  SynthesizeResult
} from '@/shared/types';

/** 애플리케이션 기본 설정 값 */
const DEFAULT_APP_SETTINGS: AppSettings = {
  provider: 'edge',
  edgeVoice: 'ko-KR-SunHiNeural',
  geminiApiKey: '',
  geminiModel: 'gemini-3.8-flash-tts',
  geminiVoice: 'Charon',
  geminiSystemPrompt:
    'A solemn, deep, and majestic medieval court chronicler reciting the annals of history. Speak in a grave, resonant, and measured cadence with deep historical gravitas. Do not sound modern or cheerful; deliver every word with historical weight and quiet reverence. 진중하고 장엄한 중세 사관의 목소리로 낭독하라.',
  speechRate: '+0%',
  speechVolume: '+0%',
  customLogPath: null,
  isAutoPlayEnabled: true
};

let mainWindow: BrowserWindow | null = null;
let watcherHandle: LogWatcherHandle | null = null;
let currentSettings: AppSettings = { ...DEFAULT_APP_SETTINGS };

/**
 * 전달받은 데이터가 유효한 AppSettings 형태인지 검증합니다.
 * @param data - 검증할 설정 데이터
 * @returns 유효한 설정 여부
 */
const isValidAppSettings = (data: unknown): data is AppSettings => {
  if (!data || typeof data !== 'object') {
    return false;
  }
  const candidate = data as Record<string, unknown>;
  const validProviders = ['edge', 'gemini', 'system'];
  return (
    typeof candidate.provider === 'string' &&
    validProviders.includes(candidate.provider) &&
    typeof candidate.edgeVoice === 'string' &&
    typeof candidate.isAutoPlayEnabled === 'boolean'
  );
};

/**
 * 렌더러 창이 정상 활성화 상태인지 검증한 후 안전하게 IPC 단방향 이벤트를 전송합니다.
 * @param channel - IPC 이벤트 채널명
 * @param args - 전달할 인자 목록
 */
const sendToRenderer = (channel: string, ...args: unknown[]): void => {
  if (
    mainWindow &&
    !mainWindow.isDestroyed() &&
    !mainWindow.webContents.isDestroyed()
  ) {
    mainWindow.webContents.send(channel, ...args);
  }
};

/**
 * 사용자 설정 저장 파일 경로를 반환합니다.
 * @returns settings.json 파일의 절대 경로
 */
const getSettingsFilePath = (): string => {
  return path.join(app.getPath('userData'), 'ck3-tts-settings.json');
};

/**
 * 디스크에서 저장된 설정을 불러옵니다.
 * @returns 저장된 설정 객체
 */
const loadStoredSettings = (): AppSettings => {
  const filePath = getSettingsFilePath();
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(data) as Partial<AppSettings>;
      return { ...DEFAULT_APP_SETTINGS, ...parsed };
    }
  } catch (error: unknown) {
    console.warn('⚠️ [Settings] 설정 불러오기 실패, 기본값 사용:', error);
  }
  return { ...DEFAULT_APP_SETTINGS };
};

/**
 * 현재 설정을 디스크에 영구 저장합니다.
 * @param settings - 저장할 설정 객체
 */
const persistSettings = (settings: AppSettings): void => {
  const filePath = getSettingsFilePath();
  try {
    fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf-8');
    currentSettings = settings;
    console.info('ℹ️ [Settings] 설정 영구 저장 완료');
  } catch (error: unknown) {
    console.error('❌ [Settings] 설정 저장 실패:', error);
  }
};

/**
 * 로그 파일 감시자를 초기화하거나 경로 변경 시 재시작합니다.
 */
const restartWatcher = (): void => {
  if (watcherHandle) {
    watcherHandle.stop().catch((err: unknown) => {
      console.error('❌ [Watcher] 이전 감시자 중지 오류:', err);
    });
    watcherHandle = null;
  }

  const targetPath = resolveCk3LogPath(currentSettings.customLogPath);
  if (!targetPath) {
    console.warn('⚠️ [Watcher] 유효한 CK3 debug.log 경로를 찾을 수 없습니다.');
    sendToRenderer('ck3:log-status', false, null);
    return;
  }

  watcherHandle = startWatchingLogFile(
    targetPath,
    (event: Ck3EventMessage) => {
      sendToRenderer('ck3:event-detected', event);
    },
    (isWatching: boolean, filePath: string) => {
      sendToRenderer('ck3:log-status', isWatching, filePath);
    },
    () => {
      sendToRenderer('ck3:stop-speech');
    }
  );
};

/**
 * 애플리케이션 아이콘 파일의 절대 경로를 탐색하여 반환합니다.
 * @returns icon.png 파일의 절대 경로
 */
const getAppIconPath = (): string => {
  const candidates = [
    path.join(__dirname, '../../resources/icon.png'),
    path.join(__dirname, '../resources/icon.png'),
    path.join(process.cwd(), 'resources/icon.png')
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return path.join(__dirname, '../../resources/icon.png');
};

/**
 * Electron 메인 브라우저 창을 생성합니다.
 */
const createMainWindow = (): void => {
  const iconPath = getAppIconPath();
  mainWindow = new BrowserWindow({
    width: 780,
    height: 620,
    minWidth: 600,
    minHeight: 460,
    title: 'CK3 TTS Companion',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    backgroundColor: '#0c0f17',
    titleBarStyle: 'hiddenInset',
    vibrancy: 'under-window',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true
    }
  });

  // HMR 개발 서버 또는 빌드 파일 로드
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // 렌더러 창 로딩 완료 시 현재 로그 감시 상태를 즉시 동기화
  mainWindow.webContents.on('did-finish-load', () => {
    const targetPath = resolveCk3LogPath(currentSettings.customLogPath);
    const isWatching = watcherHandle !== null && targetPath !== null;
    sendToRenderer('ck3:log-status', isWatching, targetPath);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

/**
 * IPC 핸들러 및 전역 단축키를 등록합니다.
 */
const initializeIpcAndShortcuts = (): void => {
  // 현재 로그 경로 조회
  ipcMain.handle('ck3:get-log-path', () => {
    return resolveCk3LogPath(currentSettings.customLogPath);
  });

  // 커스텀 로그 파일 선택 다이얼로그
  ipcMain.handle('ck3:select-custom-log-path', async () => {
    if (!mainWindow) {
      return null;
    }
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'CK3 debug.log 파일 선택',
      properties: ['openFile'],
      filters: [{ name: 'Log Files', extensions: ['log', 'txt'] }]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const selectedPath = result.filePaths[0] ?? null;
    if (selectedPath) {
      currentSettings = { ...currentSettings, customLogPath: selectedPath };
      persistSettings(currentSettings);
      restartWatcher();
    }
    return selectedPath;
  });

  // 설정 조회
  ipcMain.handle('ck3:get-settings', () => {
    return currentSettings;
  });

  // 설정 저장
  ipcMain.handle('ck3:save-settings', (_event, newSettings: unknown) => {
    if (!isValidAppSettings(newSettings)) {
      console.warn('⚠️ [Settings] 유효하지 않은 설정 저장 시도 차단됨');
      return false;
    }
    persistSettings(newSettings);
    restartWatcher();
    return true;
  });

  // TTS 합성 요청 처리
  ipcMain.handle(
    'ck3:synthesize-speech',
    async (_event, request: SynthesizeRequest): Promise<SynthesizeResult> => {
      return await processTtsRequest(request);
    }
  );

  // 전역 단축키 등록 (Windows: Ctrl+Shift+S / macOS: Cmd+Shift+S)
  const toggleKey = 'CommandOrControl+Shift+S';
  const isRegistered = globalShortcut.register(toggleKey, () => {
    sendToRenderer('ck3:toggle-speech');
  });

  if (!isRegistered) {
    console.warn(`⚠️ [Shortcut] ${toggleKey} 단축키 등록 실패`);
  }
};

// Electron 앱 라이프사이클 이벤트
app.setName('CK3 TTS Companion');

app.whenReady().then(() => {
  currentSettings = loadStoredSettings();

  // macOS Dock 아이콘 및 프로세스 명칭 명시적 설정
  if (process.platform === 'darwin' && app.dock) {
    const iconPath = getAppIconPath();
    if (fs.existsSync(iconPath)) {
      try {
        app.dock.setIcon(iconPath);
      } catch (dockError: unknown) {
        console.warn('⚠️ [App] Dock 아이콘 적용 실패:', dockError);
      }
    }
  }

  initializeIpcAndShortcuts();
  createMainWindow();
  restartWatcher();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (watcherHandle) {
    watcherHandle.stop().catch((err: unknown) => {
      console.error('❌ [Watcher] 종료 실패:', err);
    });
  }
});
