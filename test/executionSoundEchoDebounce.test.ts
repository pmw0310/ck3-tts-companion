import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractExecutionSoundsFromChunk,
  startWatchingLogFile
} from '@/main/logWatcher';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('⚔️ 처형 효과음 C++ 3중 콘솔 에코 및 후속 이벤트 오발화 결함 재현 테스트', () => {
  it('1. CK3 엔진의 콘솔 3중 에코 로그 청크에서 처형 사운드가 3번 중복 추출되는 결함 확인', () => {
    // 실제 CK3 엔진 로그 복제 (console.cpp:1164, jomini_effect_impl.cpp:450, console.cpp:1193)
    const realEngineEchoChunk = `
[10:33:31][D][console.cpp:1164]: Running console command: effect debug_log = "##CK3_EXECUTION## 처형|||GENDER:M##"
[10:33:31][D][jomini_effect_impl.cpp:450]: file: effect console command line: 1: ##CK3_EXECUTION## 처형|||GENDER:M##
[10:33:31][D][console.cpp:1193]: console_success: Executing effect script "debug_log = "##CK3_EXECUTION## 처형|||GENDER:M##" "
`;

    // 디바운스/에코 필터링이 없을 경우 3개가 추출되어 3번 중복 발화됨
    const rawEvents = extractExecutionSoundsFromChunk(realEngineEchoChunk);
    // 현재 코드에서는 3개가 추출됨 (결함 고립)
    assert.equal(rawEvents.length, 3, '에코 필터가 없으면 3중 에코로 인해 3번 감지됨');
  });

  it('2. startWatchingLogFile에서 처형 직후 4초 뒤 튜토리얼 팝업 시 이전 처형 효과음이 재발화되지 않아야 함', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ck3-echo-test-'));
    const logPath = path.join(tempDir, 'debug.log');
    fs.writeFileSync(logPath, '');

    const triggeredSounds: string[] = [];
    const triggeredEvents: string[] = [];

    const watcher = startWatchingLogFile(
      logPath,
      (ev) => {
        triggeredEvents.push(ev.title ?? '');
      },
      undefined,
      undefined,
      (snd) => {
        triggeredSounds.push(`${snd.type}_${snd.gender}`);
      }
    );

    try {
      // 1) 10:33:31 시점: 처형 3중 에코 중 1차/2차 기록
      const chunk1 = `[10:33:31][D][console.cpp:1164]: Running console command: effect debug_log = "##CK3_EXECUTION## 처형|||GENDER:M##"\n[10:33:31][D][jomini_effect_impl.cpp:450]: file: effect console command line: 1: ##CK3_EXECUTION## 처형|||GENDER:M##\n`;
      fs.appendFileSync(logPath, chunk1);

      // 파일 변경 감지 대기 (500ms)
      await new Promise((resolve) => setTimeout(resolve, 500));

      // 처형 효과음은 정확히 1번만 격발되어야 함 (3중 에코 중복 차단)
      assert.equal(triggeredSounds.length, 1, '1차 처형 시 효과음은 정확히 1회만 발화되어야 함');

      // 2) 10:33:35 시점: 4초 뒤 지연 플러시된 3차 에코와 함께 튜토리얼 "백과사전" 팝업 유입
      const chunk2 = `[10:33:35][D][console.cpp:1193]: console_success: Executing effect script "debug_log = "##CK3_EXECUTION## 처형|||GENDER:M##" "\n[10:33:35][D][console.cpp:1164]: Running console command: effect debug_log = "##CK3_TTS## 백과사전|||튜토리얼 본문입니다.##CK3_TTS_END##"\n`;
      fs.appendFileSync(logPath, chunk2);

      // 파일 변경 감지 대기 (500ms)
      await new Promise((resolve) => setTimeout(resolve, 500));

      // 튜토리얼 이벤트는 정상 감지되어야 함
      assert.equal(triggeredEvents.length, 1, '튜토리얼 이벤트는 정상적으로 1회 감지되어야 함');
      assert.equal(triggeredEvents[0], '백과사전');

      // 하지만 튜토리얼 팝업 시 처형 사운드가 또 발화되어서는 안 됨! (총 카운트 여전히 1회 유지)
      assert.equal(
        triggeredSounds.length,
        1,
        '후속 튜토리얼 팝업 시 이전 처형 효과음이 다시 발화되지 않아야 함 (결함 방어)'
      );
    } finally {
      await watcher.stop();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
