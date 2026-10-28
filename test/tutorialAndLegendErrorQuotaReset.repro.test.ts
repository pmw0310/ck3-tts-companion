import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startWatchingLogFile } from '@/main/logWatcher';
import { extractCk3EventsFromChunk } from '@/main/textSanitizer';
import type { Ck3EventMessage } from '@/shared/types';

/**
 * 🏛️ 튜토리얼(window_tutorial.gui) 및 전설 연대기(window_legend_chronicle.gui) TTS 먹통 결함 재현 테스트
 *
 * 근본 원인 (5 Whys RCA):
 * 1. 타 모드/스크립트 에러로 인해 게임 시작 약 5분 만에 Clausewitz 엔진의 [E](ELogLevel::Error) 100,000건 쿼터가 소진됨.
 * 2. EventWindowData가 없는 튜토리얼, 전설 연대기, 전쟁 결과, 승계, 외교 알림, 유물 툴팁 창은 오직 CloseGameView(...)
 *    ([E] 로그: unknown game view '...')에만 의존하고 있었기 때문에, 100,000건 도달 이후 모든 CloseGameView 호출이 엔진에서 폐기됨.
 * 3. CK3 내장 글로벌 훅인 [ClearErrorLog]를 CloseGameView 직전에 호출하면 비디버그/일반 모드에서도 에러 카운터(0x05C80AE8)가
 *    즉시 0으로 초기화되고 error.log가 0바이트로 비워져 CloseGameView가 100% 정상 기록됨.
 * 4. 또한 [CopyBuildVersionInfoToClipboard]와 CLIPBOARD_GAME_MODULE_VERSION_INFO 로컬라이제이션(tts_clipboard 변수)을 결합하면
 *    EventWindowData가 없는 창에서도 OS 클립보드로 원문을 직접 전송할 수 있음.
 * 5. 단, ClearErrorLog가 error.log를 0바이트로 비운 직후 이전 filePosition보다 크거나 같은 바이트가 기록되면,
 *    기존 logWatcher.ts는 liveSize < filePosition만 검사하여 오프셋 0부터 읽지 못하고 앞부분(시작 태그)을 잘라먹는 결함이 발생함.
 */
describe('튜토리얼 및 전설 연대기 [E] 100,000 쿼터 초기화(ClearErrorLog) 및 클립보드 브릿지 검증', () => {
  it('1. [LogWatcher] ClearErrorLog로 error.log가 초기화된 직후 이전 크기 이상의 새 이벤트가 기록되어도 오프셋 0부터 온전히 감지해야 한다', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ck3-quota-reset-'));
    const debugLogPath = path.join(tempDir, 'debug.log');
    const errorLogPath = path.join(tempDir, 'error.log');

    fs.writeFileSync(debugLogPath, '', 'utf-8');
    // 1차 이벤트가 이미 기록되어 filePosition이 190바이트 근처에 위치한 상태 시뮬레이션
    const firstLine = `[11:55:00][E][interface_data_hooks.cpp:613]: unknown game view '##CK3_TTS_FORCE## 첫 번째 튜토리얼|||짧은 첫 단계 설명입니다.##CK3_TTS_END##'\n`;
    fs.writeFileSync(errorLogPath, firstLine, 'utf-8');

    const receivedEvents: Ck3EventMessage[] = [];
    const handle = startWatchingLogFile(
      debugLogPath,
      (ev) => {
        receivedEvents.push(ev);
      },
      undefined,
      undefined,
      undefined,
      undefined,
      50
    );

    try {
      await new Promise((resolve) => setTimeout(resolve, 150));

      // ClearErrorLog 실행으로 error.log가 0바이트로 잘린 직후, 이전 크기(firstLine.length)보다 더 긴 2차 튜토리얼 이벤트가 오프셋 0에 기록됨
      const secondLine = `[13:12:56][E][interface_data_hooks.cpp:613]: unknown game view '##CK3_TTS_FORCE## 파벌로부터 한 몸 건사하기|||봉신들이 파벌을 결성하여 당신의 보위를 위협하고 있습니다. 공포나 호의를 통해 파벌을 와해시키십시오.##CK3_TTS_END##'\n`;
      assert.ok(
        Buffer.byteLength(secondLine, 'utf-8') > Buffer.byteLength(firstLine, 'utf-8'),
        '2차 이벤트 바이트 크기가 1차보다 커야 덮어쓰기(liveSize >= filePosition) 조건이 재현됩니다.'
      );
      fs.writeFileSync(errorLogPath, secondLine, 'utf-8');

      await new Promise((resolve) => setTimeout(resolve, 650));

      assert.strictEqual(
        receivedEvents.length,
        1,
        'error.log가 ClearErrorLog로 초기화된 후 더 긴 텍스트로 덮어써졌을 때 오프셋 0으로 리셋하여 이벤트를 추출해야 합니다.'
      );
      assert.strictEqual(receivedEvents[0]?.title, '파벌로부터 한 몸 건사하기');
      assert.ok(receivedEvents[0]?.content.includes('봉신들이 파벌을 결성하여'));
    } finally {
      await handle.stop();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('2. [Tutorial GUI] window_tutorial.gui의 수동 낭독 버튼들에 [ClearErrorLog] 및 [CopyBuildVersionInfoToClipboard]가 바인딩되고 레이아웃 경고가 없어야 한다', () => {
    const tutorialPath = path.resolve(process.cwd(), 'ck3-mod/gui/window_tutorial.gui');
    const content = fs.readFileSync(tutorialPath, 'utf-8');

    const shortcutIdx = content.indexOf('name = "tts_replay_shortcut_tutorial"');
    assert.ok(shortcutIdx !== -1, 'tts_replay_shortcut_tutorial이 존재해야 합니다.');
    const shortcutBlock = content.slice(shortcutIdx, shortcutIdx + 700);
    assert.ok(
      shortcutBlock.includes('onclick = "[ClearErrorLog]"'),
      'F 단축키 버튼에 [ClearErrorLog]가 바인딩되어 [E] 100,000 쿼터 소진을 즉시 해제해야 합니다.'
    );
    assert.ok(
      shortcutBlock.includes('onclick = "[CopyBuildVersionInfoToClipboard]"'),
      'F 단축키 버튼에 [CopyBuildVersionInfoToClipboard] 클립보드 브릿지가 바인딩되어야 합니다.'
    );

    const speakIdx = content.indexOf('name = "tts_speak_button"');
    assert.ok(speakIdx !== -1, 'tts_speak_button이 존재해야 합니다.');
    const speakBlock = content.slice(speakIdx, speakIdx + 700);
    assert.ok(
      speakBlock.includes('onclick = "[ClearErrorLog]"'),
      'tts_speak_button에 [ClearErrorLog]가 바인딩되어야 합니다.'
    );
    assert.ok(
      speakBlock.includes('onclick = "[CopyBuildVersionInfoToClipboard]"'),
      'tts_speak_button에 [CopyBuildVersionInfoToClipboard]가 바인딩되어야 합니다.'
    );

    // hbox 내부 tts_speak_label에 parentanchor = vcenter가 있으면 pdx_gui_layout.cpp:137 에러 발생
    const labelIdx = content.indexOf('name = "tts_speak_label"');
    assert.ok(labelIdx !== -1, 'tts_speak_label이 존재해야 합니다.');
    const labelBlock = content.slice(labelIdx, labelIdx + 250);
    assert.strictEqual(
      labelBlock.includes('parentanchor'),
      false,
      'hbox 내부의 tts_speak_label에는 parentanchor를 선언하지 않아야 레이아웃 에러가 발생하지 않습니다.'
    );
  });

  it('3. [Legend Chronicle GUI] window_legend_chronicle.gui의 자동/수동 낭독에 [ClearErrorLog] 및 [CopyBuildVersionInfoToClipboard]가 바인딩되어야 한다', () => {
    const legendPath = path.resolve(process.cwd(), 'ck3-mod/gui/window_legend_chronicle.gui');
    const content = fs.readFileSync(legendPath, 'utf-8');

    // _show에서 ClearErrorLog 1회 호출
    const showMatch = content.match(/state\s*=\s*\{\s*name\s*=\s*_show[\s\S]*?\n\t\}/);
    assert.ok(showMatch, '_show 블록이 존재해야 합니다.');
    assert.ok(
      showMatch[0].includes('ClearErrorLog'),
      '_show 상태에서 [ClearErrorLog]를 호출하여 챕터 자동 발화 전 에러 쿼터를 초기화해야 합니다.'
    );

    // tts_speak_button에서 ClearErrorLog 1회 호출 (챕터별 item 내부가 아닌 버튼 레벨에서 1회 호출해야 앞선 챕터 로그가 지워지지 않음)
    const speakIdx = content.indexOf('name = "tts_speak_button"');
    assert.ok(speakIdx !== -1, 'tts_speak_button이 존재해야 합니다.');
    const speakBlock = content.slice(speakIdx, speakIdx + 700);
    assert.ok(
      speakBlock.includes('onclick = "[ClearErrorLog]"'),
      'tts_speak_button 클릭 시 [ClearErrorLog]를 1회 선행 호출해야 합니다.'
    );
    assert.ok(
      content.includes('CopyBuildVersionInfoToClipboard'),
      '전설 연대기 챕터 발화 시 [CopyBuildVersionInfoToClipboard] 클립보드 브릿지가 함께 동작해야 합니다.'
    );
  });

  it('4. [Localization] 4개 replace 로컬라이제이션 파일에 CLIPBOARD_GAME_MODULE_VERSION_INFO의 tts_clipboard 브릿지가 정의되어야 한다', () => {
    const locFiles = [
      'ck3-mod/localization/korean/replace/tts_companion_l_korean.yml',
      'ck3-mod/localization/replace/korean/tts_companion_l_korean.yml',
      'ck3-mod/localization/english/replace/tts_companion_l_english.yml',
      'ck3-mod/localization/replace/english/tts_companion_l_english.yml'
    ];
    for (const relPath of locFiles) {
      const fullPath = path.resolve(process.cwd(), relPath);
      const raw = fs.readFileSync(fullPath);
      assert.strictEqual(raw[0], 0xef, `${relPath}: UTF-8 BOM 필수`);
      assert.strictEqual(raw[1], 0xbb, `${relPath}: UTF-8 BOM 필수`);
      assert.strictEqual(raw[2], 0xbf, `${relPath}: UTF-8 BOM 필수`);
      const text = raw.toString('utf-8');
      assert.ok(
        text.includes('CLIPBOARD_GAME_MODULE_VERSION_INFO') && text.includes('tts_clipboard'),
        `${relPath}에 CLIPBOARD_GAME_MODULE_VERSION_INFO(tts_clipboard) 브릿지가 포함되어야 합니다.`
      );
    }
  });

  it('5. [TextSanitizer] 튜토리얼 삽화 아이콘(\\x16ra_admin_troops_1!), 강조/키워드 서식(\\x15emphasis, \\x15TUT_KW), 복합 조사·어미 직결("행정 정부에서는", "생성할", "규범 권역상") 및 문장 끝 느낌표("권합니다!")가 왜곡 없이 정제되어야 한다', () => {
    const adminTroopsRaw =
      "[14:22:42][E][interface_data_hooks.cpp:613]: unknown game view '##CK3_TTS_FORCE## 행정 정부에서의 군사|||\u0016ra_admin_troops_1! \u0015e; \u0015TOOLTIP:GAME_CONCEPT,administrative_government 행정 정부\u0015!\u0015!에서는 군사 및 병력 관리가 다른 정부 유형과 다르게 작동합니다.\n\n자기 병력에 대한 접근과 완전한 통제권을 계속 유지하면서, 동시에 \u0015E; \u0015TOOLTIP:GAME_CONCEPT,provincial_armies 속주 부대\u0015!\u0015!에 접근할 수 있습니다.##CK3_TTS_END##'";

    const adminEvents = extractCk3EventsFromChunk(adminTroopsRaw);
    assert.strictEqual(adminEvents.length, 1);
    const adminContent = adminEvents[0]?.content ?? '';
    assert.ok(!adminContent.includes('ra_admin_troops_1'), `삽화 아이콘 식별자가 제거되어야 합니다: "${adminContent}"`);
    assert.ok(
      adminContent.startsWith('행정 정부에서는 군사 및 병력 관리가'),
      `"행정 정부 에서는"이 아닌 "행정 정부에서는"으로 시작해야 합니다: "${adminContent}"`
    );

    const rightfulLiegeSlide1Raw =
      "[14:27:05][E][interface_data_hooks.cpp:613]: unknown game view '##CK3_TTS_FORCE## 정당한 주군|||\u0015TUT 정당한 주군이 되려면, \u0015E; \u0015TOOLTIP:GAME_CONCEPT,de_jure 규범 권역\u0015!\u0015!상 봉신들보다 한 단계 높은 \u0015E; \u0015TOOLTIP:GAME_CONCEPT,title 작위\u0015!\u0015!를 보유해야 합니다.\n\n휘하에 있는 봉신이 여러분을 정당한 주군으로 여기지 \u0015emphasis 않는\u0015! 것은 아주 흔한 일입니다. 그렇더라도 잊지 말고 \u0015TUT_KW 봉신 수여\u0015! \u0015E; \u0015TOOLTIP:GAME_CONCEPT,interaction 상호작용\u0015!\u0015!을 사용해서 봉신 구조를 재편하시길 바랍니다.\u0015!##CK3_TTS_END##'";

    const slide1Events = extractCk3EventsFromChunk(rightfulLiegeSlide1Raw);
    assert.strictEqual(slide1Events.length, 1);
    const slide1Content = slide1Events[0]?.content ?? '';
    assert.ok(!/\b(?:emphasis|TUT_KW|TUT)\b/i.test(slide1Content), `서식 키워드가 남아있지 않아야 합니다: "${slide1Content}"`);
    assert.ok(slide1Content.includes('규범 권역상 봉신들보다'), `"규범 권역 상"이 아닌 "규범 권역상"이어야 합니다: "${slide1Content}"`);
    assert.ok(slide1Content.includes('여기지 않는 것은'), `"emphasis 않는"이 아닌 "여기지 않는 것은"이어야 합니다: "${slide1Content}"`);
    assert.ok(slide1Content.includes('잊지 말고 봉신 수여 상호작용을'), `"TUT_KW 봉신 수여"가 아닌 "봉신 수여 상호작용을"이어야 합니다: "${slide1Content}"`);

    const rightfulLiegeSlide2Raw =
      "[14:28:12][E][interface_data_hooks.cpp:613]: unknown game view '##CK3_TTS_FORCE## 정당한 주군|||새로운 땅을 정복하면서 여러분을 정당한 주군으로 여기지 않는 봉신이 봉역에 합류하는 경우도 종종 있습니다. 정복 계획을 적절하게 세운다면 이러한 문제를 완화할 수 있겠지요.\n\n\u0015TUT 여러분을 싫어하는 봉신들이 많아지는 상황을 모면하고 싶으시다면, 한 번에 하나의 규범 권역에서만 정복 활동을 이어가시길 바랍니다. 이를 통해 \u0015emphasis 궁극적으로\u0015! 정당한 주군이 될 수 있으니까요. 새로운 작위를 \u0015E; \u0015TOOLTIP:GAME_CONCEPT,create 생성\u0015!\u0015!할 수 있는지도 자주 확인하십시오!\n\n정복 계획을 수립함에 앞서, 지도 모드를 '규범 권역'으로 두고 세워보시길 권합니다!\u0015!##CK3_TTS_END##'";

    const slide2Events = extractCk3EventsFromChunk(rightfulLiegeSlide2Raw);
    assert.strictEqual(slide2Events.length, 1);
    const slide2Content = slide2Events[0]?.content ?? '';
    assert.strictEqual(
      slide2Content,
      "새로운 땅을 정복하면서 여러분을 정당한 주군으로 여기지 않는 봉신이 봉역에 합류하는 경우도 종종 있습니다. 정복 계획을 적절하게 세운다면 이러한 문제를 완화할 수 있겠지요. 여러분을 싫어하는 봉신들이 많아지는 상황을 모면하고 싶으시다면, 한 번에 하나의 규범 권역에서만 정복 활동을 이어가시길 바랍니다. 이를 통해 궁극적으로 정당한 주군이 될 수 있으니까요. 새로운 작위를 생성할 수 있는지도 자주 확인하십시오! 정복 계획을 수립함에 앞서, 지도 모드를 '규범 권역'으로 두고 세워보시길 권합니다!"
    );
  });
});

