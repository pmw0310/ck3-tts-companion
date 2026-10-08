import { clipboard, nativeImage } from 'electron';
import type { NativeImage } from 'electron';
import type { ClipboardBridge } from '@/main/logWatcher';

/**
 * 사용자 클립보드 전체 상태 스냅샷
 * (텍스트/HTML/RTF/이미지를 함께 보관하여 모드 페이로드 소비 후 손실 없이 복구)
 */
export type ElectronClipboardSnapshot = {
  readonly text: string;
  readonly html: string;
  readonly rtf: string;
  readonly image: NativeImage | null;
};

/**
 * 스냅샷이 실질적으로 비어 있는지 판별합니다.
 * @param snapshot - 클립보드 스냅샷
 * @returns 텍스트/서식/이미지가 모두 없으면 true
 */
const isEmptySnapshot = (snapshot: ElectronClipboardSnapshot): boolean =>
  snapshot.text.length === 0 && snapshot.html.length === 0 && snapshot.rtf.length === 0 && snapshot.image === null;

/**
 * Electron clipboard 모듈 기반 클립보드 채널 브리지를 생성합니다.
 * @returns logWatcher에 주입할 클립보드 브리지
 */
export const createElectronClipboardBridge = (): ClipboardBridge<ElectronClipboardSnapshot> => ({
  readText: () => clipboard.readText(),
  // 이미지/서식만 바뀐 경우도 감지하도록 형식 목록을 서명에 포함 (이미지 바이트는 비용 때문에 제외)
  readSignature: () => `${clipboard.availableFormats().join('|')}\n${clipboard.readText()}`,
  takeSnapshot: () => {
    const image = clipboard.readImage();
    return {
      text: clipboard.readText(),
      html: clipboard.readHTML(),
      rtf: clipboard.readRTF(),
      image: image.isEmpty() ? null : nativeImage.createFromBuffer(image.toPNG())
    };
  },
  restoreSnapshot: (snapshot) => {
    if (!snapshot || isEmptySnapshot(snapshot)) {
      clipboard.clear();
      return;
    }
    // 여러 형식을 한 번에 기록해야 앞서 쓴 형식이 덮이지 않음
    clipboard.write({
      ...(snapshot.text ? { text: snapshot.text } : {}),
      ...(snapshot.html ? { html: snapshot.html } : {}),
      ...(snapshot.rtf ? { rtf: snapshot.rtf } : {}),
      ...(snapshot.image ? { image: snapshot.image } : {})
    });
  }
});
