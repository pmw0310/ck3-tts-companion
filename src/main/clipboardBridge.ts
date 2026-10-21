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
  // 이미지/서식만 바뀐 경우도 감지하도록 형식 목록을 서명에 포함하고, 대용량 외부 텍스트 복사 시 메모리 할당을 막기 위해 길이와 앞/뒤 슬라이스만 서명으로 구성
  readSignature: () => {
    const text = clipboard.readText();
    const preview = text.length <= 256 ? text : `${text.slice(0, 128)}...${text.slice(-128)}`;
    return `${clipboard.availableFormats().join('|')}\n${text.length}:${preview}`;
  },
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
