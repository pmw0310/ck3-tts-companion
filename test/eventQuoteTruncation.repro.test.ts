import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { startWatchingLogFile } from '@/main/logWatcher';
import { extractCk3EventsFromChunk } from '@/main/textSanitizer';
import type { Ck3EventMessage } from '@/shared/types';

/**
 * 지정된 밀리초만큼 대기합니다.
 * @param ms - 대기 시간 (밀리초)
 * @returns 대기 완료 Promise
 */
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('다중 인용구 및 문단 개행 포함 이벤트 본문 잘림 재현 테스트', () => {
  it('1. debug.log 끝의 단락 개행(\\n\\n)과 멀티라인 Unknown effect가 결합될 때 본문이 잘리지 않고 단일 이벤트로 복원되어야 한다', () => {
    const stitchedChunk = `[12:36:09][I][jomini_effect_impl.cpp:450]: file: effect console command line: 3: ##CK3_TTS## 금화 약간만 있다면...|||돈이 든 주머니에서 나는 소리는 놓치기 힘들다.  ONCLICK:CHARACTER,16892778  TOOLTIP:CHARACTER,16892778  L 여공작 헤드위크 ! ! !(이)가 문을 열더니 조용히 숙고하고 있었다.


[12:36:09][I][jomini_effect_impl.cpp:450]: file: effect console command line: 3: ##CK3_TTS## 금화 약간만 있다면...|||돈이 든 주머니에서 나는 소리는 놓치기 힘들다.  ONCLICK:CHARACTER,16892778  TOOLTIP:CHARACTER,16892778  L 여공작 헤드위크 ! ! !(이)가 문을 열더니 조용히 숙고하고 있었다.


Unknown effect: 주군, near line: 3
Unknown effect: 정말, near line: 3
Unknown effect: 장원입니다, near line: 3
Unknown effect: 하인들이, near line: 3
Unknown effect: 에, near line: 3
Unknown effect: 얼마나, near line: 3
Unknown effect:  헤드위크(이)가 그쪽을 가리키며 손짓했다.

, near line: 5
Unknown effect: 누릴, near line: 5
Unknown effect: 있는, near line: 5
Unknown effect: 최대한, near line: 5
Unknown effect: 저도, near line: 5
Unknown effect: 힘껏, near line: 5
Unknown effect: 돕겠습니다., near line: 5" in file: "effect console command" near line: 5`;

    const events = extractCk3EventsFromChunk(stitchedChunk);
    assert.equal(events.length, 1, '단일 이벤트로 복원되어야 합니다.');
    assert.equal(events[0]?.title, '금화 약간만 있다면...');
    assert.ok(
      events[0]?.content.includes('여공작 헤드위크가 문을 열더니 조용히 숙고하고 있었다'),
      '첫 번째 문단이 포함되어야 합니다.',
    );
    assert.ok(
      events[0]?.content.includes('주군') && events[0]?.content.includes('장원입니다'),
      '첫 번째 인용구 대사가 누락되지 않고 포함되어야 합니다.',
    );
    assert.ok(
      events[0]?.content.includes('헤드위크가 그쪽을 가리키며 손짓했다'),
      '인용구 사이의 멀티라인 서술문이 누락되지 않고 포함되어야 합니다.',
    );
    assert.ok(
      events[0]?.content.includes('최대한') && events[0]?.content.includes('돕겠습니다'),
      '마지막 인용구 대사가 누락되지 않고 포함되어야 합니다.',
    );
  });

  it('2. ##CK3_TTS_FORCE## 마커가 포함된 수동 발화 복원 시 isForceReplay가 true로 설정되고 전체 본문이 복원되어야 한다', () => {
    const forceChunk = `[12:37:04][I][jomini_effect_impl.cpp:450]: file: effect console command line: 3: ##CK3_TTS_FORCE## 금화 약간만 있다면...|||돈이 든 주머니에서 나는 소리는 놓치기 힘들다.  ONCLICK:CHARACTER,16892778  TOOLTIP:CHARACTER,16892778  L 여공작 헤드위크 ! ! !(이)가 문을 열더니 조용히 숙고하고 있었다.


Unknown effect: 주군, near line: 3
Unknown effect: 정말, near line: 3
Unknown effect: 장원입니다, near line: 3
Unknown effect: 하인들이, near line: 3
Unknown effect: 에, near line: 3
Unknown effect: 얼마나, near line: 3
Unknown effect:  헤드위크(이)가 그쪽을 가리키며 손짓했다.

, near line: 5
Unknown effect: 누릴, near line: 5
Unknown effect: 있는, near line: 5
Unknown effect: 최대한, near line: 5
Unknown effect: 저도, near line: 5
Unknown effect: 힘껏, near line: 5
Unknown effect: 돕겠습니다., near line: 5" in file: "effect console command" near line: 5`;

    const events = extractCk3EventsFromChunk(forceChunk);
    assert.equal(events.length, 1);
    assert.equal(events[0]?.isForceReplay, true, '수동 발화 시 isForceReplay가 true여야 합니다.');
    assert.ok(events[0]?.content.includes('헤드위크가 그쪽을 가리키며 손짓했다'));
    assert.ok(events[0]?.content.includes('돕겠습니다'));
  });

  it('3. logWatcher에서 debug.log(끝에 빈 줄 포함)와 error.log(멀티라인 Unknown effect 포함)를 실시간 감시할 때 잘리지 않은 전체 본문을 방출해야 한다', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ck3-quote-trunc-'));
    const debugLogPath = path.join(tmpDir, 'debug.log');
    const errorLogPath = path.join(tmpDir, 'error.log');
    fs.writeFileSync(debugLogPath, '', 'utf8');
    fs.writeFileSync(errorLogPath, '', 'utf8');

    const received: Ck3EventMessage[] = [];
    const watcher = startWatchingLogFile(debugLogPath, (ev) => received.push(ev));

    try {
      await wait(150);

      // 1) debug.log에 첫 문단 + 빈 줄 2개 기록 (인용구 시작 따옴표로 인해 종료 태그 잘림)
      fs.appendFileSync(
        debugLogPath,
        `[12:36:09][I][jomini_effect_impl.cpp:450]: file: effect console command line: 3: ##CK3_TTS## 금화 약간만 있다면...|||돈이 든 주머니에서 나는 소리는 놓치기 힘들다.  ONCLICK:CHARACTER,16892778  TOOLTIP:CHARACTER,16892778  L 여공작 헤드위크 ! ! !(이)가 문을 열더니 조용히 숙고하고 있었다.\n\n\n`,
        'utf8',
      );
      await wait(300);

      // 2) error.log에 멀티라인 Unknown effect를 포함한 후속 조각 기록
      fs.appendFileSync(
        errorLogPath,
        `[12:36:09][E][pdx_persistent_reader.cpp:216]: Error: "Unknown effect: 주군, near line: 3\nUnknown effect: 정말, near line: 3\nUnknown effect: 장원입니다, near line: 3\nUnknown effect: 하인들이, near line: 3\nUnknown effect: 에, near line: 3\nUnknown effect: 얼마나, near line: 3\nUnknown effect:  헤드위크(이)가 그쪽을 가리키며 손짓했다.\n\n, near line: 5\nUnknown effect: 누릴, near line: 5\nUnknown effect: 있는, near line: 5\nUnknown effect: 최대한, near line: 5\nUnknown effect: 저도, near line: 5\nUnknown effect: 힘껏, near line: 5\nUnknown effect: 돕겠습니다., near line: 5" in file: "effect console command" near line: 5\n`,
        'utf8',
      );
      await wait(950);

      assert.equal(received.length, 1, '정확히 1개의 결합된 이벤트가 방출되어야 합니다.');
      assert.equal(received[0]?.title, '금화 약간만 있다면...');
      assert.ok(
        received[0]?.content.includes('숙고하고 있었다') &&
          received[0]?.content.includes('장원입니다') &&
          received[0]?.content.includes('헤드위크가 그쪽을 가리키며 손짓했다') &&
          received[0]?.content.includes('돕겠습니다'),
        `실제 방출된 본문: ${received[0]?.content}`,
      );
    } finally {
      await watcher.stop();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
