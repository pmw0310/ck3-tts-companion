import { contextBridge, ipcRenderer } from 'electron';
import type {
  AppInfo,
  AppSettings,
  Ck3EventMessage,
  ElectronApiBridge,
  ExecutionSoundEvent,
  SynthesizeRequest,
  SynthesizeResult,
  UpdateCheckResult
} from '@/shared/types';

/**
 * 렌더러 프로세스에서 안전하게 접근 가능한 Electron API 브릿지 객체
 */
const electronApi: ElectronApiBridge = {
  getLogPath: async (): Promise<string | null> => {
    return await ipcRenderer.invoke('ck3:get-log-path');
  },

  selectCustomLogPath: async (): Promise<string | null> => {
    return await ipcRenderer.invoke('ck3:select-custom-log-path');
  },

  getSettings: async (): Promise<AppSettings> => {
    return await ipcRenderer.invoke('ck3:get-settings');
  },

  saveSettings: async (newSettings: AppSettings): Promise<boolean> => {
    return await ipcRenderer.invoke('ck3:save-settings', newSettings);
  },

  synthesizeSpeech: async (
    request: SynthesizeRequest
  ): Promise<SynthesizeResult> => {
    return await ipcRenderer.invoke('ck3:synthesize-speech', request);
  },

  getAppInfo: async (): Promise<AppInfo> => {
    return await ipcRenderer.invoke('ck3:get-app-info');
  },

  checkForUpdates: async (): Promise<UpdateCheckResult> => {
    return await ipcRenderer.invoke('ck3:check-update');
  },

  openExternal: async (url: string): Promise<boolean> => {
    return await ipcRenderer.invoke('ck3:open-external', url);
  },

  getCacheStats: async () => {
    return await ipcRenderer.invoke('ck3:get-cache-stats');
  },

  clearCache: async (): Promise<boolean> => {
    return await ipcRenderer.invoke('ck3:clear-cache');
  },

  openCacheDir: async (): Promise<boolean> => {
    return await ipcRenderer.invoke('ck3:open-cache-dir');
  },

  onEventDetected: (
    callback: (event: Ck3EventMessage) => void
  ): (() => void) => {
    const listener = (
      _ipcEvent: Electron.IpcRendererEvent,
      eventData: Ck3EventMessage
    ): void => {
      callback(eventData);
    };

    ipcRenderer.on('ck3:event-detected', listener);
    return () => {
      ipcRenderer.removeListener('ck3:event-detected', listener);
    };
  },

  onExecutionSound: (
    callback: (event: ExecutionSoundEvent) => void
  ): (() => void) => {
    const listener = (
      _ipcEvent: Electron.IpcRendererEvent,
      eventData: ExecutionSoundEvent
    ): void => {
      callback(eventData);
    };

    ipcRenderer.on('ck3:execution-sound', listener);
    return () => {
      ipcRenderer.removeListener('ck3:execution-sound', listener);
    };
  },

  onStopSpeech: (callback: () => void): (() => void) => {
    const listener = (): void => {
      callback();
    };

    ipcRenderer.on('ck3:stop-speech', listener);
    return () => {
      ipcRenderer.removeListener('ck3:stop-speech', listener);
    };
  },

  onLogStatusChange: (
    callback: (isWatching: boolean, path: string | null) => void
  ): (() => void) => {
    const listener = (
      _ipcEvent: Electron.IpcRendererEvent,
      isWatching: boolean,
      path: string | null
    ): void => {
      callback(isWatching, path);
    };

    ipcRenderer.on('ck3:log-status', listener);
    return () => {
      ipcRenderer.removeListener('ck3:log-status', listener);
    };
  },

  onToggleSpeech: (callback: () => void): (() => void) => {
    const listener = (): void => {
      callback();
    };

    ipcRenderer.on('ck3:toggle-speech', listener);
    return () => {
      ipcRenderer.removeListener('ck3:toggle-speech', listener);
    };
  }
};


// 렌더러 window 객체에 electronAPI 노출
contextBridge.exposeInMainWorld('electronAPI', electronApi);
