import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { extractCk3EventsFromChunk } from '@/main/textSanitizer';

/**
 * 🏛️ 전설 연대기(Legend Chronicle) TTS 미작동 및 본문 내 큰따옴표 파편 결함 재현 테스트
 */
test('전설 연대기(Legend Chronicle) TTS 미작동 및 따옴표 결함 재현', async (t) => {
  // 실제 사용자가 겪은 "백조의 기사" 전설 연대기 데이터
  const legendTitle = '백조의 기사';
  const legendPart1 =
    '망치 운반자의 대장 카트린(은)는 충직한 추종자들과 함께 곳곳을 떠돌며 악당들과 싸우고 위험에 빠진 이들을 구했다. ' +
    '어느 날 아침, 안개 낀 숲에 들어간 그녀는 도움을 청하는 소리를 들었다. 그리고 언제나처럼 이번에도 그 외침을 무시하지 않았다. ' +
    '아리따운 여인이 사악한 기사에게 위협받고 있었다. 카트린(은)는 결투를 벌여 상대를 물리쳤고, 피가 고인 웅덩이 속에서 새하얀 swan(이)가 탄생했다. ' +
    '그녀가 여인에게 남긴 말은 다음과 같다. "제 이름은 묻지 마십시오. 그건 제가 드릴 수 있는 게 아닙니다."';

  await t.test('1. [GUI 검증] window_legend_chronicle.gui에 주인공 유효성 안전 가드(IsValid)가 구현되어 있어야 함', () => {
    const guiPath = path.resolve('ck3-mod/gui/window_legend_chronicle.gui');
    assert.ok(fs.existsSync(guiPath), 'window_legend_chronicle.gui 파일이 존재해야 합니다.');
    const content = fs.readFileSync(guiPath, 'utf8');

    // 주인공(Legend.GetProtagonist)이 유효하지 않은 경우에도 CDataSystem Null Object 접근 크래시 없이
    // '##CK3_TTS_END##'로 안전하게 종결되도록 IsValid 가드가 감싸져 있어야 함
    const hasProtagonistGuard = content.includes(
      "Select_CString( Legend.GetProtagonist.IsValid, Select_CString( Legend.GetProtagonist.IsFemale, '|||GENDER:F##CK3_TTS_END##\\\"', '|||GENDER:M##CK3_TTS_END##\\\"' ), '##CK3_TTS_END##\\\"' )"
    );

    assert.ok(
      hasProtagonistGuard,
      'window_legend_chronicle.gui의 성별 판별식에 Legend.GetProtagonist.IsValid 가드가 구현되어 있어야 합니다.'
    );
  });

  await t.test('2. [결함 재현] 본문 속 큰따옴표로 인해 debug.log 앞부분과 error.log 뒷부분으로 쪼개졌을 때 온전한 이벤트로 복원되어야 함', () => {
    // 1) debug.log에 기록된 앞부분 (따옴표에서 조기 종료되어 END 태그 없음)
    const truncatedDebugChunk = `[22:00:00][I][jomini_effect_impl.cpp:92]: ##CK3_TTS_FORCE## ${legendTitle}|||${legendPart1}`;

    // 2) error.log에 기록된 뒷부분 (Unknown effect로 쪼개진 대사 조각들)
    const errorLogChunk = `[22:00:01][E][pdx_persistent_reader.cpp:216]: Error: "Unknown effect: 제, near line: 1" in file: "effect console command" near line: 1
Unknown effect: 이름은, near line: 1
Unknown effect: 묻지, near line: 1
Unknown effect: 마십시오., near line: 1
Unknown effect: 그건, near line: 1
Unknown effect: 제가, near line: 1
Unknown effect: 드릴, near line: 1
Unknown effect: 수, near line: 1
Unknown effect: 있는, near line: 1
Unknown effect: 게, near line: 1
Unknown effect: 아닙니다."|||GENDER:F##CK3_TTS_END##, near line: 1" in file: "effect console command" near line: 1`;

    // 단독으로는 debug 로그에서 0개 추출됨 (END 태그 누락으로 Drop)
    const debugEvents = extractCk3EventsFromChunk(truncatedDebugChunk);
    assert.equal(debugEvents.length, 0, 'debug 로그 단독으로는 END가 없어 추출되지 않음');

    // error 로그 단독으로도 복원 파서가 "in file: effect console command"에 걸려 0개로 실패하거나 불완전함
    const errorEvents = extractCk3EventsFromChunk(errorLogChunk);
    assert.equal(errorEvents.length, 0, 'error 로그 단독으로는 0개 추출');

    // [요구사항]: errorLogChunk와 truncatedDebugChunk가 결합되거나,
    // 또는 error.log 청크 내에 쪼개진 토큰들이 온전하게 복원되어 전체 텍스트가 정상 추출되어야 함!
    const combinedLogChunk = `${truncatedDebugChunk}\n${errorLogChunk}`;
    const recoveredEvents = extractCk3EventsFromChunk(combinedLogChunk);

    assert.equal(recoveredEvents.length, 1, '쪼개진 청크들이 결합되어 1개의 온전한 이벤트로 복원되어야 합니다.');
    assert.equal(recoveredEvents[0]?.title, '백조의 기사', '제목이 올바르게 복원되어야 합니다.');
    assert.ok(
      recoveredEvents[0]?.content.includes('망치 운반자의 대장 카트린'),
      '본문 앞부분이 포함되어야 합니다.'
    );
    assert.ok(
      recoveredEvents[0]?.content.includes('제 이름은 묻지 마십시오'),
      '따옴표 안의 인용 대사가 본문에 온전히 복원되어야 합니다.'
    );
    assert.equal(recoveredEvents[0]?.speakerGender, 'female', '성별이 여성으로 판별되어야 합니다.');
  });

  await t.test('3. [통합 검증] startWatchingLogFile에서 debug.log와 error.log의 시간차 유입 시 교차 결합으로 정상 발화되어야 함', async () => {
    const { startWatchingLogFile } = await import('@/main/logWatcher');
    const os = await import('node:os');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ck3-legend-test-'));
    const tempDebugLog = path.join(tempDir, 'debug.log');
    const tempErrorLog = path.join(tempDir, 'error.log');

    fs.writeFileSync(tempDebugLog, '', 'utf8');
    fs.writeFileSync(tempErrorLog, '', 'utf8');

    const receivedEvents: Array<{ title?: string; content: string; speakerGender?: string }> = [];

    const watcher = startWatchingLogFile(
      tempDebugLog,
      (event) => {
        receivedEvents.push(event);
      },
      undefined,
      undefined,
      undefined,
      undefined, // clipboardBridge
      50 // clipboardPollMs
    );

    try {
      // 1) debug.log에 큰따옴표로 끊겨 END가 없는 앞부분 기록
      const truncatedDebugChunk = `[22:00:00][I][jomini_effect_impl.cpp:92]: ##CK3_TTS_FORCE## ${legendTitle}|||${legendPart1}\n`;
      fs.appendFileSync(tempDebugLog, truncatedDebugChunk, 'utf8');

      // 파일 변경 반영 대기 (150ms)
      await new Promise((resolve) => setTimeout(resolve, 150));
      assert.equal(receivedEvents.length, 0, 'debug.log 단독 유입 시에는 END가 없어 아직 발화되지 않아야 함');

      // 2) error.log에 따옴표 뒷부분 파편 기록
      const errorLogChunk = `[22:00:01][E][pdx_persistent_reader.cpp:216]: Error: "Unknown effect: 제, near line: 1" in file: "effect console command" near line: 1
Unknown effect: 이름은, near line: 1
Unknown effect: 묻지, near line: 1
Unknown effect: 마십시오., near line: 1
Unknown effect: 그건, near line: 1
Unknown effect: 제가, near line: 1
Unknown effect: 드릴, near line: 1
Unknown effect: 수, near line: 1
Unknown effect: 있는, near line: 1
Unknown effect: 게, near line: 1
Unknown effect: 아닙니다."|||GENDER:F##CK3_TTS_END##, near line: 1" in file: "effect console command" near line: 1\n`;
      fs.appendFileSync(tempErrorLog, errorLogChunk, 'utf8');

      // error.log 디퍼 시간(600ms) + 버퍼 처리 대기 (800ms)
      await new Promise((resolve) => setTimeout(resolve, 800));

      assert.equal(receivedEvents.length, 1, '교차 결합을 통해 1개의 완전한 이벤트가 방출되어야 함');
      assert.equal(receivedEvents[0]?.title, '백조의 기사');
      assert.ok(receivedEvents[0]?.content.includes('망치 운반자의 대장 카트린'));
      assert.ok(receivedEvents[0]?.content.includes('제 이름은 묻지 마십시오'));
      assert.equal(receivedEvents[0]?.speakerGender, 'female');
    } finally {
      await watcher.stop();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

