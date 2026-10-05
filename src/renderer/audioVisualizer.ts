/**
 * @file audioVisualizer.ts
 * @description Web Audio API (AnalyserNode)를 활용하여 재생 중인 음성 주파수를 실시간으로 분석하고
 * 5개 막대 이퀄라이저 UI에 GPU 가속 transform(scaleY)을 적용하는 초경량 실시간 비주얼라이저 모듈.
 */

/**
 * 오디오 비주얼라이저 제어 인터페이스
 */
export interface AudioVisualizerController {
  /** 비주얼라이저 실시간 애니메이션 루프를 시작합니다. */
  start: () => void;
  /** 비주얼라이저 루프를 멈추고 막대 높이를 대기 상태로 초기화합니다. */
  stop: () => void;
  /** AudioContext가 suspended 상태일 때 resume을 호출합니다. */
  resumeAudioContext: () => Promise<void>;
}

/** 5개 막대의 최소 scaleY 비율 (18px 기준 4px 높이) */
const MIN_SCALE = 0.22;
/** 5개 막대의 최대 scaleY 비율 (18px 기준 18px 높이) */
const MAX_SCALE = 1.0;

/** 음성 대역 5개 밴드에 대응하는 FFT 빈(Bin) 인덱스 매핑 (fftSize: 64 기준, bin당 약 680~750Hz) */
const FREQUENCY_BAND_BINS = [
  [1],          // 저음 (약 100~500Hz)
  [2, 3],       // 중저음 (약 500~1,100Hz)
  [4, 5],       // 중음 / 모음 포먼트 (약 1,100~1,900Hz)
  [6, 7, 8],    // 중고음 (약 1,900~3,000Hz)
  [9, 10, 11, 12] // 고음 / 치찰음 (약 3,000~4,800Hz)
];

let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let sourceNode: MediaElementAudioSourceNode | null = null;
let animationFrameId: number | null = null;
let dataArray: Uint8Array<ArrayBuffer> | null = null;
let isInitialized = false;

/**
 * 특정 주파수 빈들의 평균 진폭을 계산하여 0~1 사이로 정규화합니다.
 * @param bins - 계산할 주파수 빈 인덱스 배열
 * @param data - 전체 FFT 주파수 바이트 데이터
 * @returns 정규화된 진폭 값 (0.0 ~ 1.0)
 */
const calculateBandAverage = (bins: number[], data: Uint8Array<ArrayBuffer>): number => {
  let sum = 0;
  for (const binIndex of bins) {
    if (binIndex < data.length) {
      sum += data[binIndex];
    }
  }
  const average = sum / bins.length;
  // 한국어 및 영어 TTS 음성 감도에 맞춘 완만한 감도 증폭 (1.3배)
  return Math.min(1.0, (average / 255) * 1.3);
};

/**
 * Web Audio API를 안전하게 초기화하고 HTMLAudioElement와 5개 막대 컨테이너를 연결합니다.
 * @param audioEl - 낭독 오디오를 재생하는 HTMLAudioElement
 * @param containerEl - 5개의 .bar 엘리먼트를 포함하는 비주얼라이저 컨테이너
 * @returns 비주얼라이저 제어 컨트롤러 객체
 */
export const initAudioVisualizer = (
  audioEl: HTMLAudioElement,
  containerEl: HTMLElement
): AudioVisualizerController => {
  const barElements = Array.from(containerEl.querySelectorAll<HTMLElement>('.bar'));

  /**
   * 렌더 루프를 멈추고 막대 스타일을 기본 대기 높이로 리셋합니다.
   */
  const stop = (): void => {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    for (const bar of barElements) {
      bar.style.transform = '';
    }
  };

  /**
   * AudioContext 및 MediaElementAudioSourceNode를 1회만 안전하게 바인딩합니다.
   */
  const setupAudioGraph = (): boolean => {
    if (isInitialized) {
      return true;
    }

    try {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtxClass) {
        console.warn('⚠️ [AudioVisualizer] 브라우저가 Web Audio API를 지원하지 않습니다.');
        return false;
      }

      audioContext = new AudioCtxClass();
      analyser = audioContext.createAnalyser();

      // 초경량 FFT 설정: CPU 0.05% 미만 유지 (빈 개수: 32개)
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.78; // 자연스럽고 유기적인 바운스 감쇠
      analyser.minDecibels = -85;
      analyser.maxDecibels = -15;

      dataArray = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));

      // 단 1회만 audio element를 노드에 연결
      sourceNode = audioContext.createMediaElementSource(audioEl);
      sourceNode.connect(analyser);
      analyser.connect(audioContext.destination);

      isInitialized = true;
      console.log('✅ [AudioVisualizer] Web Audio API 그래프 연결 완료 (fftSize: 64, CPU 절전 모드)');
      return true;
    } catch (err) {
      console.error('❌ [AudioVisualizer] 오디오 그래프 초기화 실패:', err);
      return false;
    }
  };

  /**
   * AudioContext가 suspended 상태일 때 resume을 호출합니다.
   */
  const resumeAudioContext = async (): Promise<void> => {
    if (audioContext && audioContext.state === 'suspended') {
      try {
        await audioContext.resume();
      } catch (err) {
        console.warn('⚠️ [AudioVisualizer] AudioContext resume 실패:', err);
      }
    }
  };

  /**
   * requestAnimationFrame을 사용하여 매 프레임 막대 높이를 갱신합니다.
   */
  const renderLoop = (): void => {
    if (!analyser || !dataArray || audioEl.paused || audioEl.ended) {
      stop();
      return;
    }

    analyser.getByteFrequencyData(dataArray);

    for (let i = 0; i < barElements.length; i++) {
      const bar = barElements[i];
      const bins = FREQUENCY_BAND_BINS[i] ?? [i];
      const normalizedValue = calculateBandAverage(bins, dataArray);

      // 최소 scaleY(0.22) ~ 최대 scaleY(1.0) 사이로 부드럽게 매핑
      const scaleY = MIN_SCALE + normalizedValue * (MAX_SCALE - MIN_SCALE);
      bar.style.transform = `scaleY(${scaleY.toFixed(3)})`;
    }

    animationFrameId = requestAnimationFrame(renderLoop);
  };

  /**
   * 실시간 파형 애니메이션을 가동합니다.
   */
  const start = (): void => {
    if (!isInitialized) {
      const success = setupAudioGraph();
      if (!success) return;
    }

    resumeAudioContext().catch(() => {});

    if (animationFrameId === null) {
      animationFrameId = requestAnimationFrame(renderLoop);
    }
  };

  // HTMLAudioElement 이벤트에 자동 바인딩하여 안전성 보장
  audioEl.addEventListener('play', () => {
    start();
  });

  audioEl.addEventListener('pause', () => {
    stop();
  });

  audioEl.addEventListener('ended', () => {
    stop();
  });

  return {
    start,
    stop,
    resumeAudioContext
  };
};
