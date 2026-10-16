import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { startWatchingLogFile } from '@/main/logWatcher';
import type { ClipboardBridge } from '@/main/logWatcher';
import { extractCk3EventsFromChunk } from '@/main/textSanitizer';
import { isTextFragmentOf, shouldPlayEvent } from '@/shared/eventDeduplicator';
import type { Ck3EventMessage } from '@/shared/types';

/**
 * 지정된 밀리초만큼 대기합니다.
 * @param ms - 대기 시간 (밀리초)
 * @returns 대기 완료 Promise
 */
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('큰따옴표 대사 포함 이벤트 본문 절단 및 중복 전송 결함 재현 테스트', () => {
  const fullContent =
    '잠을 자려고 내 방으로 가고 있는데 창문 하나가 바스락거렸다. 바람 소리겠지 하고 지나치려는데, 그 바람이 말을 하기 시작했다. "임마, 나의 아기새! 문을 열어요! 나예요, 렌하르트!"화들짝 놀라 덧문을 밀어젖혔다. 하, 이것 봐라? 사람 하나가 벽을 타고 공주 임마의 창문까지 기어 올라와 있었다! 그게 나의 경쟁자이자 봉신인 백작 렌하르트일 줄이야!';
  const truncatedContent =
    '잠을 자려고 내 방으로 가고 있는데 창문 하나가 바스락거렸다. 바람 소리겠지 하고 지나치려는데, 그 바람이 말을 하기 시작했다.';
  const eventTitle = '궁정에 똬리 튼 뱀';

  it('1. [결함 재현 1] debug.log에 닫는 태그(END) 없이 잘린 단독 청크는 extractCk3EventsFromChunk에서 유효한 이벤트로 방출되지 않아야 한다', () => {
    // C++ 콘솔 파서가 큰따옴표에서 잘라버려 END 태그가 아예 없는 debug.log 청크
    const brokenDebugChunk = `[14:21:05][I][jomini_effect_impl.cpp:450]: file: effect console command line: 3: ##CK3_TTS## ${eventTitle}|||${truncatedContent}\n`;

    const extracted = extractCk3EventsFromChunk(brokenDebugChunk);

    // 현재 버그: recoverEventsFromErrorLog가 청크 끝에서 END 태그가 없어도 isCollecting을 플러시하여 1개를 반환함!
    assert.equal(
      extracted.length,
      0,
      `닫는 태그가 없는 미완성 청크는 추출되지 않아야 하지만 ${extracted.length}개가 추출되었습니다.`
    );
  });

  it('2. [결함 재현 2] 클립보드로 온전한 전체 본문 수신 직후 debug.log에서 잘린 파편이 들어올 때 중복 발화 및 덮어쓰기가 차단되어야 한다', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ck3-quote-dupe-'));
    const debugLogPath = path.join(tmpDir, 'debug.log');
    const errorLogPath = path.join(tmpDir, 'error.log');
    fs.writeFileSync(debugLogPath, '', 'utf8');
    fs.writeFileSync(errorLogPath, '', 'utf8');

    let currentClipboardText = '';
    const mockClipboardBridge: ClipboardBridge<string> = {
      readText: () => currentClipboardText,
      readSignature: () => currentClipboardText,
      takeSnapshot: () => currentClipboardText,
      restoreSnapshot: (snap) => {
        currentClipboardText = snap ?? '';
      }
    };

    const receivedEvents: Ck3EventMessage[] = [];
    const watcher = startWatchingLogFile(
      debugLogPath,
      (ev) => receivedEvents.push(ev),
      undefined,
      undefined,
      undefined,
      mockClipboardBridge,
      50 // 빠른 폴링
    );

    try {
      await wait(100);

      // 1) 클립보드 채널로 온전한 전체 이벤트가 먼저 유입됨 (CopyStringToClipboard 동작 모사)
      currentClipboardText = `##CK3_TTS## ${eventTitle}|||${fullContent}|||GENDER:M##CK3_TTS_END##`;
      await wait(150);

      assert.equal(receivedEvents.length, 1, '클립보드 원문이 먼저 정상 수신되어야 함');
      assert.equal(receivedEvents[0]?.content, fullContent, '온전한 전체 본문이어야 함');

      // 2) 직후 C++ 콘솔 파서의 큰따옴표 절단으로 인해 debug.log에 잘린 미완성 파편이 기록되고, error.log에 파서 에러가 기록됨
      fs.appendFileSync(
        debugLogPath,
        `[14:21:05][I][jomini_effect_impl.cpp:450]: file: effect console command line: 3: ##CK3_TTS## ${eventTitle}|||${truncatedContent}\n\n`,
        'utf8'
      );
      fs.appendFileSync(
        errorLogPath,
        `[14:21:05][E][pdx_persistent_reader.cpp:216]: Error: "Unknown effect: 임마,, near line: 3\nUnknown effect: 나의, near line: 3" in file: "effect console command" near line: 3\n`,
        'utf8'
      );
      // ERROR_LOG_DEFER_MS (600ms) + 버퍼 처리 시간 대기
      await wait(850);

      // 현재 버그: 잘린 파편이 교차 결합 후 지연 방출되어 receivedEvents.length가 2가 됨!
      assert.equal(
        receivedEvents.length,
        1,
        `온전한 본문 수신 후 잘린 파편이 중복 방출되어 총 ${receivedEvents.length}개가 되었습니다.`
      );
      assert.equal(
        receivedEvents[0]?.content,
        fullContent,
        '온전한 전체 본문이 보존되어야 함'
      );
    } finally {
      await watcher.stop();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('3. [결함 재현 3] shouldPlayEvent는 온전한 본문이 이미 재생/표시 중일 때 하위 파편(Subset) 유입을 차단해야 한다', () => {
    const fullEvent: Ck3EventMessage = {
      id: 'event-1',
      title: eventTitle,
      content: fullContent,
      rawText: '',
      timestamp: Date.now()
    };

    const truncatedEvent: Ck3EventMessage = {
      id: 'event-2',
      title: eventTitle,
      content: truncatedContent,
      rawText: '',
      timestamp: Date.now() + 500
    };

    const state = {
      isPlaying: true,
      currentEvent: fullEvent,
      lastAutoSpokenText: fullContent,
      lastAutoSpokenTime: Date.now(),
      lastStoppedText: '',
      lastStoppedTime: 0
    };

    const shouldPlay = shouldPlayEvent(truncatedEvent, state, Date.now() + 500);

    assert.equal(
      shouldPlay,
      false,
      '온전한 본문이 재생 중일 때 잘린 하위 파편의 재낭독은 차단되어야 합니다.'
    );
  });

  it('4. isTextFragmentOf 및 승격(더 긴 본문) 허용 무결성 검증', () => {
    // 1) 잘린 본문은 온전한 본문의 하위 파편이어야 함
    assert.equal(isTextFragmentOf(truncatedContent, fullContent), true);
    // 2) 온전한 본문은 잘린 본문의 하위 파편이 아니어야 함 (길이가 더 김)
    assert.equal(isTextFragmentOf(fullContent, truncatedContent), false);
    // 3) 완전히 다른 본문은 파편이 아니어야 함
    assert.equal(isTextFragmentOf('전혀 다른 이벤트 본문입니다.', fullContent), false);

    // 4) 짧은 파편이 먼저 들어온 상태에서 온전한 긴 본문이 들어왔을 때 shouldPlayEvent는 이를 허용해야 함
    const truncatedEvent: Ck3EventMessage = {
      id: 'event-1',
      title: eventTitle,
      content: truncatedContent,
      rawText: '',
      timestamp: Date.now()
    };
    const fullEvent: Ck3EventMessage = {
      id: 'event-2',
      title: eventTitle,
      content: fullContent,
      rawText: '',
      timestamp: Date.now() + 500
    };
    const state = {
      isPlaying: true,
      currentEvent: truncatedEvent,
      lastAutoSpokenText: truncatedContent,
      lastAutoSpokenTime: Date.now(),
      lastStoppedText: '',
      lastStoppedTime: 0
    };

    const shouldPlay = shouldPlayEvent(fullEvent, state, Date.now() + 500);
    assert.equal(shouldPlay, true, '짧은 파편에서 온전한 본문으로의 승격은 허용되어야 합니다.');
  });
});
