import test from 'node:test';
import assert from 'node:assert/strict';
import { initAudioVisualizer } from '@/renderer/audioVisualizer';

/**
 * 초경량 Web Audio API 기반 오디오 파형(비주얼라이저) 제어 무결성 검증
 */
test('초경량 Web Audio API 기반 실시간 오디오 파형 시각화 검증', async (t) => {
  // 브라우저 DOM 및 Web Audio API 가상 모킹 환경 구축
  let isResumed = false;
  let cancelledFrameId: number | null = null;
  let requestedCallback: FrameRequestCallback | null = null;
  let createdFftSize = 0;

  class MockAnalyser {
    fftSize = 2048;
    smoothingTimeConstant = 0.8;
    minDecibels = -100;
    maxDecibels = -30;
    frequencyBinCount = 32;

    getByteFrequencyData(array: Uint8Array<ArrayBuffer>): void {
      createdFftSize = this.fftSize;
      // 가상 주파수 데이터 채우기 (음성 신호 모의)
      for (let i = 0; i < array.length; i++) {
        array[i] = 120 + i * 4;
      }
    }

    connect(): void {}
  }

  class MockAudioSource {
    connect(): void {}
  }

  class MockAudioContext {
    state: AudioContextState = 'suspended';
    destination = {};

    createAnalyser(): AnalyserNode {
      return new MockAnalyser() as unknown as AnalyserNode;
    }

    createMediaElementSource(): MediaElementAudioSourceNode {
      return new MockAudioSource() as unknown as MediaElementAudioSourceNode;
    }

    async resume(): Promise<void> {
      this.state = 'running';
      isResumed = true;
    }
  }

  // 전역 window 및 Web Audio API 가상 바인딩
  (global as unknown as { window: unknown }).window = {
    AudioContext: MockAudioContext
  };

  (global as unknown as { requestAnimationFrame: unknown }).requestAnimationFrame = (
    callback: FrameRequestCallback
  ): number => {
    requestedCallback = callback;
    return 101;
  };

  (global as unknown as { cancelAnimationFrame: unknown }).cancelAnimationFrame = (
    id: number
  ): void => {
    cancelledFrameId = id;
  };

  // 5개 막대 Mock 엘리먼트 생성
  const mockBars = Array.from({ length: 5 }, () => ({
    style: { transform: '' }
  }));

  const mockContainer = {
    querySelectorAll: (selector: string) => {
      if (selector === '.bar') {
        return mockBars;
      }
      return [];
    }
  } as unknown as HTMLElement;

  const eventListeners = new Map<string, () => void>();
  const mockAudioEl = {
    paused: false,
    ended: false,
    addEventListener: (event: string, handler: () => void) => {
      eventListeners.set(event, handler);
    }
  } as unknown as HTMLAudioElement;

  await t.test('1. initAudioVisualizer 초기화 및 컨트롤러 반환 검증', () => {
    const controller = initAudioVisualizer(mockAudioEl, mockContainer);
    assert.ok(typeof controller.start === 'function', 'start 함수가 존재해야 합니다.');
    assert.ok(typeof controller.stop === 'function', 'stop 함수가 존재해야 합니다.');
    assert.ok(
      typeof controller.resumeAudioContext === 'function',
      'resumeAudioContext 함수가 존재해야 합니다.'
    );
  });

  await t.test('2. start() 가동 시 초경량 fftSize=64 설정 및 scaleY 적용 검증', async () => {
    const controller = initAudioVisualizer(mockAudioEl, mockContainer);
    controller.start();

    // 1) AudioContext suspended 자동 해제 검증
    await controller.resumeAudioContext();
    assert.equal(isResumed, true, 'AudioContext가 resume되어야 합니다.');

    // 2) rAF 콜백 1회 실행하여 막대 transform 검증
    assert.ok(requestedCallback !== null, 'requestAnimationFrame이 요청되어야 합니다.');
    requestedCallback!(performance.now());

    assert.equal(createdFftSize, 64, 'CPU 절전을 위해 fftSize가 64로 최소화되어야 합니다.');

    for (let i = 0; i < mockBars.length; i++) {
      const transform = mockBars[i].style.transform;
      assert.ok(
        transform.startsWith('scaleY('),
        `막대 ${i + 1}에 scaleY 스타일이 적용되어야 합니다: ${transform}`
      );
    }
  });

  await t.test('3. stop() 호출 시 rAF 루프 중단 및 막대 transform 리셋 검증', () => {
    const controller = initAudioVisualizer(mockAudioEl, mockContainer);
    controller.stop();

    assert.equal(cancelledFrameId, 101, '진행 중인 rAF 루프가 cancel되어야 합니다.');
    for (const bar of mockBars) {
      assert.equal(bar.style.transform, '', '정지 시 막대의 transform이 초기화되어야 합니다.');
    }
  });

  await t.test('4. HTMLAudioElement 이벤트(play, pause, ended) 연동 검증', () => {
    assert.ok(eventListeners.has('play'), 'play 이벤트 리스너가 등록되어야 합니다.');
    assert.ok(eventListeners.has('pause'), 'pause 이벤트 리스너가 등록되어야 합니다.');
    assert.ok(eventListeners.has('ended'), 'ended 이벤트 리스너가 등록되어야 합니다.');

    // pause 발생 시 transform 리셋 검증
    mockBars[0].style.transform = 'scaleY(0.7)';
    eventListeners.get('pause')!();
    assert.equal(mockBars[0].style.transform, '', 'pause 시 막대 스타일이 초기화되어야 합니다.');
  });
});
