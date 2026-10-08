import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extractCk3EventsFromChunk, sanitizeCk3Text } from '@/main/textSanitizer';
import { startWatchingLogFile } from '@/main/logWatcher';
import type { ClipboardBridge } from '@/main/logWatcher';
import type { Ck3EventMessage } from '@/shared/types';

/**
 * 큰따옴표(라틴어 인용구 등)가 포함된 이벤트가 "1_CORINTHIANS_1_10_LATIN_GLOSS 그의 창을 빛을 것만 기분이었다." 처럼
 * 파편으로 낭독되는 결함 재현 테스트
 * - 원인: info_log = "...대사..." 콘솔 명령이 대사 속 첫 큰따옴표에서 문자열이 닫혀 원문이 잘리고,
 *   나머지 단어는 error.log의 Unknown effect로 한 단어 건너 하나씩만 남음
 * - 해결: EventWindowData.CopyStringToClipboard로 원문을 클립보드 채널에 함께 실어 보내고, 앱이 읽은 뒤 사용자 클립보드를 복구
 */

const GUI_ROOT = path.resolve(__dirname, '../ck3-mod/gui');

const FULL_PAYLOAD =
  '##CK3_TTS## 명료해지는 순간|||"Obsecro autem vos fratres per nomen Domini nostri Jesu Christi." 내 주교 자카리아가 아침 기도 시간에 말했다. 그의 말이 창을 열어 빛을 들여보낸 것만 같은 기분이었다.|||GENDER:M##CK3_TTS_END##';

const collectGuiFiles = (dir: string): string[] => {
  let results: string[] = [];
  for (const entry of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    if (fs.statSync(fullPath).isDirectory()) {
      results = results.concat(collectGuiFiles(fullPath));
    } else if (entry.endsWith('.gui')) {
      results.push(fullPath);
    }
  }
  return results;
};

/** 페이로드 소비 후 debug.log 처리 여부를 확인하기 위한 별개 이벤트 */
const SENTINEL_TITLE = '확인용 사건';
const SENTINEL_LINE = `[I][jomini_effect_impl.cpp:450]: ##CK3_TTS## ${SENTINEL_TITLE}|||평화로운 저녁이 찾아왔다.##CK3_TTS_END##`;

/** 테스트용 클립보드 폴링 주기 (ms) */
const TEST_CLIPBOARD_POLL_MS = 20;

/** 가짜 클립보드 상태 (텍스트 또는 이미지) */
type FakeClipboardState = { readonly kind: 'text' | 'image'; readonly text: string };

/**
 * 형식(텍스트/이미지)까지 흉내 내는 가짜 클립보드를 생성합니다.
 * @param initial - 초기 사용자 클립보드 상태
 * @returns 브리지, 게임 페이로드 주입 함수, 현재 상태 조회 함수
 */
const createFakeClipboard = (
  initial: FakeClipboardState
): {
  bridge: ClipboardBridge<FakeClipboardState>;
  setGamePayload: (payload: string) => void;
  current: () => FakeClipboardState;
} => {
  let state: FakeClipboardState = initial;
  return {
    bridge: {
      readText: () => state.text,
      readSignature: () => `${state.kind}\n${state.text}`,
      takeSnapshot: () => ({ ...state }),
      restoreSnapshot: (snapshot) => {
        state = snapshot ?? { kind: 'text', text: '' };
      }
    },
    setGamePayload: (payload: string) => {
      state = { kind: 'text', text: payload };
    },
    current: () => state
  };
};

/**
 * 조건이 충족될 때까지 짧은 간격으로 대기합니다. (고정 대기 대신 사용하여 테스트 속도·안정성 확보)
 * @param predicate - 충족 여부 판별 함수
 * @param timeoutMs - 최대 대기 시간 (ms)
 */
const waitFor = async (predicate: () => boolean, timeoutMs = 5000): Promise<void> => {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('⚠️ [Test] 조건 대기 시간 초과');
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

describe('따옴표 포함 이벤트 클립보드 채널 검증', () => {
  it('EventWindowData 기반 TTS 콘솔 명령마다 직전에 CopyStringToClipboard 원문 전송 라인이 있어야 한다', () => {
    const violations: string[] = [];
    for (const filePath of collectGuiFiles(GUI_ROOT)) {
      const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
      lines.forEach((line, index) => {
        if (!/ExecuteConsoleCommand/.test(line) || !/EventWindowData\./.test(line) || !/CK3_TTS(?:_FORCE)?##/.test(line)) {
          return;
        }
        const prevLine = lines[index - 1] ?? '';
        if (!/EventWindowData\.CopyStringToClipboard/.test(prevLine)) {
          violations.push(`${path.relative(GUI_ROOT, filePath)}:${index + 1}`);
        }
      });
    }
    assert.deepStrictEqual(violations, [], `클립보드 전송 누락 위치: ${violations.join(', ')}`);
  });

  it('잘린 시작 태그(END 없음)가 뒤따르는 다른 이벤트의 END와 짝지어지지 않아야 한다', () => {
    const chunk = [
      '[I][jomini_effect_impl.cpp:450]: ##CK3_TTS## 명료해지는 순간|||',
      '[I][jomini_effect_impl.cpp:450]: ##CK3_TTS## 다음 사건|||평화로운 아침이 밝았다.|||GENDER:M##CK3_TTS_END##'
    ].join('\n');
    const events = extractCk3EventsFromChunk(chunk);
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0]?.title, '다음 사건');
  });

  it('대문자 GLOSS/DB 키 잔재(1_CORINTHIANS_1_10_LATIN_GLOSS)는 정제 시 제거되어야 한다', () => {
    const cleaned = sanitizeCk3Text('1_CORINTHIANS_1_10_LATIN_GLOSS 그의 말이 창을 열었다.');
    assert.ok(!cleaned.includes('CORINTHIANS'), `정제 결과: ${cleaned}`);
  });

  it('클립보드 페이로드로 원문 전체를 낭독하고 사용자 클립보드를 복구하며, debug.log 중복은 억제해야 한다', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ck3-clip-'));
    const debugLogPath = path.join(tempDir, 'debug.log');
    fs.writeFileSync(debugLogPath, '');

    const clipboard = createFakeClipboard({ kind: 'text', text: '사용자가 복사한 텍스트' });
    const received: Ck3EventMessage[] = [];
    const handle = startWatchingLogFile(
      debugLogPath,
      (event) => received.push(event),
      undefined,
      undefined,
      undefined,
      clipboard.bridge,
      TEST_CLIPBOARD_POLL_MS
    );

    try {
      // 게임 GUI가 클립보드에 원문을 복사
      clipboard.setGamePayload(FULL_PAYLOAD);
      await waitFor(() => received.length >= 1);

      assert.strictEqual(received.length, 1, '클립보드 채널 이벤트 1건이 방출되어야 함');
      assert.ok(received[0]?.content.includes('빛을 들여보낸 것만 같은 기분이었다'), `본문: ${received[0]?.content}`);
      assert.ok(received[0]?.content.includes('자카리아'), '인용구 뒤 문장까지 온전해야 함');
      assert.deepStrictEqual(clipboard.current(), { kind: 'text', text: '사용자가 복사한 텍스트' }, '사용자 클립보드가 복구되어야 함');

      // 동일 이벤트가 (따옴표 없는 경우) debug.log로도 들어오면 채널 간 중복으로 억제.
      // 뒤따르는 별개 이벤트(SENTINEL) 도착을 확인하여 debug.log 청크가 실제로 처리되었음을 보장
      fs.appendFileSync(debugLogPath, `[I][jomini_effect_impl.cpp:450]: ${FULL_PAYLOAD}\n${SENTINEL_LINE}\n`);
      await waitFor(() => received.some((event) => event.title === SENTINEL_TITLE));
      const duplicateCount = received.filter((event) => event.content.includes('자카리아')).length;
      assert.strictEqual(duplicateCount, 1, '채널 간 중복 이벤트는 억제되어야 함');
    } finally {
      await handle.stop();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('사용자가 이미지 등 비텍스트를 복사해 둔 경우에도 페이로드 소비 후 원래 형식 그대로 복구해야 한다', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ck3-clip-img-'));
    const debugLogPath = path.join(tempDir, 'debug.log');
    fs.writeFileSync(debugLogPath, '');

    const clipboard = createFakeClipboard({ kind: 'image', text: '' });
    const received: Ck3EventMessage[] = [];
    const handle = startWatchingLogFile(
      debugLogPath,
      (event) => received.push(event),
      undefined,
      undefined,
      undefined,
      clipboard.bridge,
      TEST_CLIPBOARD_POLL_MS
    );

    try {
      clipboard.setGamePayload(FULL_PAYLOAD);
      await waitFor(() => received.length >= 1);
      assert.deepStrictEqual(clipboard.current(), { kind: 'image', text: '' }, '이미지 클립보드가 빈 텍스트로 덮이면 안 됨');
    } finally {
      await handle.stop();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
