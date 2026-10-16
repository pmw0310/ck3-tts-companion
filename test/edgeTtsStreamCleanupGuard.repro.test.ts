import { describe, it } from 'node:test';
import assert from 'node:assert';
import { MsEdgeTTS } from 'msedge-tts';
import { applyEdgeTtsDrmPatch } from '@/main/edgeTtsDrm';

/**
 * msedge-tts 스트림 정리(destroy) 후 뒤늦게 도착한 WebSocket 데이터
 * (_pushAudioData, _pushMetadata, TURN_END)로 인한
 * Uncaught Exception 크래시 방어 검증 테스트입니다.
 */
describe('Edge-TTS 잔여 스트림 패킷 수신 시 크래시 방어 검증', () => {
  const setupMockTts = () => {
    const tts = new MsEdgeTTS();
    const ttsAny = tts as unknown as {
      _ws: unknown;
      _send: (message: string, requestId: string) => Promise<void>;
      _rawSSMLRequest: (ssml: string) => {
        audioStream: NodeJS.ReadableStream & { destroy: () => void };
        metadataStream: NodeJS.ReadableStream & { destroy: () => void } | null;
        requestId: string;
      };
      _pushAudioData: (data: Buffer, requestId: string) => void;
      _pushMetadata: (data: Buffer, requestId: string) => void;
      _streams: Record<string, { turnEnded?: boolean; audio?: { push: (chunk: unknown) => void } }>;
    };

    // _metadataCheck 통과용 가상 WebSocket 객체 주입
    ttsAny._ws = {
      readyState: 1, // OPEN
      send: (_msg: unknown, cb?: () => void) => cb?.()
    };
    ttsAny._send = async () => {};

    return { tts, ttsAny };
  };

  it('1. audioStream.destroy()로 _streams[requestId]가 삭제된 후 _pushAudioData가 호출되어도 TypeError 없이 안전해야 한다', () => {
    applyEdgeTtsDrmPatch(MsEdgeTTS);

    const { ttsAny } = setupMockTts();

    // 가상 SSML 요청으로 스트림 생성
    const { audioStream, requestId } = ttsAny._rawSSMLRequest('<speak></speak>');
    assert.ok(ttsAny._streams[requestId], '스트림 생성 직후에는 _streams에 엔트리가 존재해야 함');

    // 타임아웃/종료 시점으로 가정하여 audioStream.destroy() 호출
    audioStream.destroy();
    assert.strictEqual(
      Object.prototype.hasOwnProperty.call(ttsAny._streams, requestId),
      false,
      'destroy() 후에는 target _streams에서 키가 삭제되어야 함'
    );

    // 삭제된 requestId로 뒤늦게 바이너리 오디오 청크가 도착한 상황 시뮬레이션
    assert.doesNotThrow(() => {
      ttsAny._pushAudioData(Buffer.from([0x00, 0x01, 0x02]), requestId);
    }, '삭제된 requestId에 대한 _pushAudioData 호출이 크래시(TypeError)를 유발하지 않아야 함');
  });

  it('2. audioStream.destroy() 후 _pushMetadata 호출 시에도 TypeError 없이 안전해야 한다', () => {
    applyEdgeTtsDrmPatch(MsEdgeTTS);

    const { ttsAny } = setupMockTts();

    const { audioStream, requestId } = ttsAny._rawSSMLRequest('<speak></speak>');
    audioStream.destroy();

    assert.doesNotThrow(() => {
      ttsAny._pushMetadata(Buffer.from('{"Metadata":[]}'), requestId);
    }, '삭제된 requestId에 대한 _pushMetadata 호출이 크래시를 유발하지 않아야 함');
  });

  it('3. audioStream.destroy() 후 ws.onmessage의 TURN_END(turnEnded = true 및 audio.push(null)) 수신 시에도 크래시하지 않아야 한다', () => {
    applyEdgeTtsDrmPatch(MsEdgeTTS);

    const { ttsAny } = setupMockTts();

    const { audioStream, requestId } = ttsAny._rawSSMLRequest('<speak></speak>');
    audioStream.destroy();

    assert.doesNotThrow(() => {
      // ws.onmessage의 TURN_END 처리 로직을 가드 없이 직접 시뮬레이션
      ttsAny._streams[requestId].turnEnded = true;
      ttsAny._streams[requestId].audio?.push(null);
    }, '삭제된 requestId에 대한 TURN_END 수신 시도가 안전해야 함');
  });

  it('4. 활성 스트림인 경우 audioStream으로 데이터 청크가 정상 유입되어야 한다 (기능 회귀 방지)', async () => {
    applyEdgeTtsDrmPatch(MsEdgeTTS);

    const { ttsAny } = setupMockTts();

    const { audioStream, requestId } = ttsAny._rawSSMLRequest('<speak></speak>');

    const chunkPromise = new Promise<Buffer>((resolve) => {
      audioStream.once('data', (chunk: Buffer) => {
        resolve(chunk);
      });
    });

    const testChunk = Buffer.from([0xaa, 0xbb, 0xcc]);
    ttsAny._pushAudioData(testChunk, requestId);

    const receivedChunk = await chunkPromise;
    assert.deepStrictEqual(receivedChunk, testChunk);

    audioStream.destroy();
  });
});

