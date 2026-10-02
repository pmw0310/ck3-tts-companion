import type { ElectronApiBridge } from '@/shared/types';

declare global {
  interface Window {
    readonly electronAPI: ElectronApiBridge;
  }
}

export {};
