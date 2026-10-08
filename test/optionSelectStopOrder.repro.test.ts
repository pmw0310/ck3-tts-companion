import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { startWatchingLogFile } from '@/main/logWatcher';

describe('대답(옵션) 선택 시 TTS 즉시 정지 무결성 검증 (debug-harness)', () => {
  const testLogDir = path.resolve(__dirname, '../temp_test_logs_stop_order');

  it('1. 이벤트 발생 후 대답을 클릭(STOP)했을 때 상대적 순서에 따라 onStop이 즉시 트리거되어야 한다', async () => {
    if (!fs.existsSync(testLogDir)) {
      fs.mkdirSync(testLogDir, { recursive: true });
    }
    const testLogPath = path.join(testLogDir, 'debug.log');
    fs.writeFileSync(testLogPath, '', 'utf-8');

    let stopCount = 0;
    const receivedEvents: string[] = [];

    const handle = startWatchingLogFile(
      testLogPath,
      (evt) => {
        receivedEvents.push(evt.title ?? '');
      },
      undefined,
      () => {
        stopCount++;
      }
    );

    try {
      // 1. 이벤트 팝업 로그 유입
      fs.appendFileSync(
        testLogPath,
        '[22:23:49][D][console.cpp:1164]: Running console command: effect debug_log = "##CK3_TTS## 수수께끼|||수수께끼는 노르드 문화에서 인기가 많은 오락 활동이다.##CK3_TTS_END##"\n'
      );

      await new Promise((resolve) => setTimeout(resolve, 350));
      assert.strictEqual(receivedEvents.length, 1);
      assert.strictEqual(receivedEvents[0], '수수께끼');

      // 2. 사용자가 대답(옵션)을 선택하여 STOP 발생
      fs.appendFileSync(
        testLogPath,
        '[22:23:56][D][console.cpp:1164]: Running console command: effect debug_log = "##CK3_TTS_STOP##"\n'
      );

      await new Promise((resolve) => setTimeout(resolve, 350));
      assert.strictEqual(stopCount, 1, '대답 선택 시 onStop이 정확히 1회 호출되어야 합니다.');

      // 3. 청크 내에 이전 이벤트와 STOP이 함께 묶여 유입되더라도 STOP이 뒤에 있다면 onStop이 발화되어야 함
      fs.appendFileSync(
        testLogPath,
        '[22:24:00][D][console.cpp:1164]: Running console command: effect debug_log = "##CK3_TTS## 이전 사건|||이전 사건 내용##CK3_TTS_END##"\n' +
        '[22:24:01][D][console.cpp:1164]: Running console command: effect debug_log = "##CK3_TTS_STOP##"\n'
      );

      await new Promise((resolve) => setTimeout(resolve, 350));
      assert.strictEqual(stopCount, 2, '이벤트 직후 STOP이 동일 청크에 있더라도 옵션 클릭으로 간주되어 onStop이 호출되어야 합니다.');
    } finally {
      await handle.stop();
      if (fs.existsSync(testLogPath)) {
        fs.unlinkSync(testLogPath);
      }
      if (fs.existsSync(testLogDir)) {
        fs.rmdirSync(testLogDir);
      }
    }
  });
});
