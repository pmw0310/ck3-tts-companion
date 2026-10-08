import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { startWatchingLogFile } from '@/main/logWatcher';
import type { Ck3EventMessage } from '@/shared/types';

describe('logWatcher 순수 STOP 신호 유입 시 activeReadStreams 데드락 및 후속 이벤트 영구 침묵 결함 재현', () => {
  const tempDir = path.resolve(__dirname, '../temp_test_stop_deadlock');
  const tempLogPath = path.join(tempDir, 'debug.log');

  it('순수 STOP 신호 유입 후 창이 닫힌 뒤 새 이벤트가 들어왔을 때 정상적으로 수신되어야 한다', async () => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    fs.writeFileSync(tempLogPath, '', 'utf-8');

    let stopCalledCount = 0;
    const receivedEvents: Ck3EventMessage[] = [];

    const handle = startWatchingLogFile(
      tempLogPath,
      (event) => {
        receivedEvents.push(event);
      },
      undefined,
      () => {
        stopCalledCount++;
      }
    );

    try {
      // 1. 순수 STOP 신호 쓰기 (창 닫힘)
      fs.appendFileSync(
        tempLogPath,
        '[21:05:00][D][console.cpp:1164]: Running console command: effect debug_log = "##CK3_TTS_STOP##"\n'
      );

      // chokidar 폴링 대기 (350ms)
      await new Promise((resolve) => setTimeout(resolve, 350));
      assert.strictEqual(stopCalledCount, 1, 'STOP 콜백이 1회 호출되어야 합니다.');

      // 2. 그 다음 새 이벤트 쓰기 (이전 창 닫힌 후 새 사건 발생)
      fs.appendFileSync(
        tempLogPath,
        '[21:05:02][D][console.cpp:1164]: Running console command: effect debug_log = "##CK3_TTS## 후속 사건|||새로운 후속 사건 본문##CK3_TTS_END##"\n'
      );

      // chokidar 폴링 및 처리 대기 (600ms)
      await new Promise((resolve) => setTimeout(resolve, 600));

      // [핵심 검증]: activeReadStreams가 해제되지 않는 데드락이 있으면 후속 이벤트가 0개로 실패(Red)해야 함!
      assert.strictEqual(
        receivedEvents.length,
        1,
        'STOP 이후 유입된 후속 이벤트가 데드락 없이 정상 수신되어야 합니다.'
      );
      assert.strictEqual(receivedEvents[0]?.title, '후속 사건');
    } finally {
      await handle.stop();
      if (fs.existsSync(tempLogPath)) {
        fs.unlinkSync(tempLogPath);
      }
      if (fs.existsSync(tempDir)) {
        fs.rmdirSync(tempDir);
      }
    }
  });
});
