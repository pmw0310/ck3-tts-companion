import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extractCk3EventsFromChunk, sanitizeCk3Text } from '@/main/textSanitizer';
import { startWatchingLogFile } from '@/main/logWatcher';
import type { ClipboardBridge } from '@/main/logWatcher';
import type { Ck3EventMessage } from '@/shared/types';

/**
 * 인게임 큰따옴표 이벤트('부상: 치료할 시간') 발생 시
 * 콘솔 명령이 잘려 error.log의 Unknown effect 파편이 스티칭되면서
 * 'Error: "상처를 할 되었습니다...' 가 낭독되는 결함 재현 테스트
 */
describe('부상: 치료할 시간 error.log 파편 스티칭 및 Error 접두사 유출 결함 재현', () => {
  const stitchedChunk = `##CK3_TTS## 부상: 치료할 시간|||
[10:20:00][E][pdx_persistent_reader.cpp:216]: Error: "Unknown effect: 상처를, near line: 1
Unknown effect: 할, near line: 1
Unknown effect: 되었습니다., near line: 1
Unknown effect: 치료로도, near line: 3
Unknown effect: 것, near line: 3
Unknown effect: 선택은, near line: 3
Unknown effect: 영주님의, near line: 3
Unknown effect: 그녀는, near line: 3
Unknown effect: 얼굴을, near line: 3
Unknown effect: 찡그리며, near line: 3
Unknown effect: 말했다., near line: 3
Unknown effect: 즐거운, near line: 5
Unknown effect: 아닐, near line: 5
Unknown effect: |||GENDER:F##CK3_TTS_END##" in file: "effect console command" near line: 5
`;

  it('1. sanitizeCk3Text는 "Error: \\"" 또는 "ERROR:" 에러 접두사를 본문에서 완벽히 제거해야 한다', () => {
    const rawWithPrefix = 'Error: "상처를 치료할 시간이 되었습니다.';
    const cleaned = sanitizeCk3Text(rawWithPrefix);
    assert.strictEqual(
      cleaned.startsWith('Error:'),
      false,
      `'Error:' 접두사가 남아있어서는 안 됨. 실제 결과: "${cleaned}"`
    );
    assert.strictEqual(
      cleaned.startsWith('Error: "'),
      false,
      `'Error: "' 접두사가 남아있어서는 안 됨. 실제 결과: "${cleaned}"`
    );
  });

  it('2. 스티칭된 로그 청크 추출 시 본문에 Error: " 가 유출되지 않아야 한다', () => {
    const events = extractCk3EventsFromChunk(stitchedChunk);
    assert.strictEqual(events.length, 1, '이벤트가 1건 추출되어야 함');
    const event = events[0];
    assert.ok(event, '이벤트 객체가 존재해야 함');
    assert.strictEqual(event.title, '부상: 치료할 시간');
    assert.strictEqual(
      event.content.includes('Error:'),
      false,
      `본문에 'Error:' 가 포함되어서는 안 됨. 실제 본문: "${event.content}"`
    );
    assert.strictEqual(
      event.content.startsWith('"'),
      false,
      `본문 시작에 닫히지 않은 따옴표 잔여물이 있어서는 안 됨. 실제 본문: "${event.content}"`
    );
  });

  it('3. error.log 스티칭 파편이 발생하더라도 클립보드 원문이 도착하면 파편은 폐기되고 원문만 1건 방출되어야 한다', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ck3-heal-'));
    const debugLogPath = path.join(tempDir, 'debug.log');
    const errorLogPath = path.join(tempDir, 'error.log');
    fs.writeFileSync(debugLogPath, '');
    fs.writeFileSync(errorLogPath, '');

    type FakeState = { readonly kind: 'text'; readonly text: string };
    let clipboardState: FakeState = { kind: 'text', text: '' };
    const clipboardBridge: ClipboardBridge<FakeState> = {
      readText: () => clipboardState.text,
      readSignature: () => `text\n${clipboardState.text}`,
      takeSnapshot: () => ({ ...clipboardState }),
      restoreSnapshot: (snap) => {
        clipboardState = snap ?? { kind: 'text', text: '' };
      }
    };

    const received: Ck3EventMessage[] = [];
    const handle = startWatchingLogFile(
      debugLogPath,
      (event) => received.push(event),
      undefined,
      undefined,
      undefined,
      clipboardBridge,
      20
    );

    try {
      // 1) debug.log에 미완성 태그 쓰임
      fs.appendFileSync(debugLogPath, '[10:20:00][I][jomini_effect_impl.cpp:450]: ##CK3_TTS## 부상: 치료할 시간|||\n');

      // 2) 거의 동시에 error.log에 파편이 쓰임
      const errorContent = `[10:20:00][E][pdx_persistent_reader.cpp:216]: Error: "Unknown effect: 상처를, near line: 1
Unknown effect: 할, near line: 1
Unknown effect: 되었습니다., near line: 1
Unknown effect: 치료로도, near line: 3
Unknown effect: |||GENDER:F##CK3_TTS_END##" in file: "effect console command" near line: 3
`;
      fs.appendFileSync(errorLogPath, errorContent);

      // 3) 클립보드 채널로 게임 원문이 거의 동시에 도착 (인게임 원문 대사)
      const fullOriginPayload =
        '##CK3_TTS## 부상: 치료할 시간|||"상처를 치료할 시간이 되었습니다. 치료로도 즐거운 일은 아닐 것입니다." 그녀는 얼굴을 찡그리며 말했다. "영주님의 선택은..."|||GENDER:F##CK3_TTS_END##';
      clipboardState = { kind: 'text', text: fullOriginPayload };

      // 800ms 동안 이벤트 수신 대기 (지연 타이머 600ms 이상)
      await new Promise((resolve) => setTimeout(resolve, 800));

      // 검증:
      // - 깨진 error.log 파편 이벤트가 방출되지 않아야 함
      // - 온전한 클립보드 원문 이벤트만 1건 방출되어야 함
      assert.strictEqual(received.length, 1, `오직 온전한 원문 1건만 방출되어야 함 (현재 ${received.length}건: ${received.map((r) => r.content).join(' / ')})`);
      assert.ok(
        received[0]?.content.includes('즐거운 일은 아닐 것입니다'),
        `온전한 원문 문장이 보존되어야 함. 실제 본문: "${received[0]?.content}"`
      );
      assert.strictEqual(
        received[0]?.content.includes('Error:'),
        false,
        `본문에 Error: 가 절대 유출되지 않아야 함. 실제 본문: "${received[0]?.content}"`
      );
    } finally {
      await handle.stop();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
