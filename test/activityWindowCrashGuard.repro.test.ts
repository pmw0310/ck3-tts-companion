import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * CK3 활동 이벤트 창(window_activity.gui) 비동기 크래시 방어 및 수동 낭독 전용(Option A) 무결성 검증
 * - 최상위 및 activity_new_event_shown에서 PdxGuiTriggerAllAnimations('activity_event_appear')를 호출할 때
 *   임의로 선언된 state = { name = activity_event_appear }에 비동기 콜백이 등록되어
 *   이벤트 창 닫힘 시 CEventWindowData Use-After-Free(SIGSEGV) 크래시를 유발하는 결함 방어
 * - 수동 전용 정책(Option A): 연쇄 팝업 및 창 상주 시 발생하는 자동 낭독 오작동/피로도를 차단하고
 *   수동 낭독(스피커 버튼 및 F 단축키)을 통해서만 안전하게 발화
 */
test('CK3 활동 이벤트 창(window_activity.gui) 비동기 크래시 방어 및 수동 낭독 정책 무결성 검증', async (t) => {
  const filePath = path.resolve(process.cwd(), 'ck3-mod/gui/window_activity.gui');
  assert.ok(fs.existsSync(filePath), 'window_activity.gui 파일이 존재해야 합니다.');

  const content = fs.readFileSync(filePath, 'utf-8');

  await t.test('1. activity_event_widget 내부에 위험한 activity_event_appear state가 없어야 한다', () => {
    const widgetMatch = content.match(/type\s+activity_event_widget\s*=\s*margin_widget\s*\{([\s\S]*?)event_window_background_widget/);
    assert.ok(widgetMatch, 'activity_event_widget 블록이 존재해야 합니다.');
    const widgetBlock = widgetMatch[1];

    const hasDangerousAppearState = /state\s*=\s*\{\s*name\s*=\s*activity_event_appear[\s\S]*?ExecuteConsoleCommand/g.test(widgetBlock);
    assert.strictEqual(
      hasDangerousAppearState,
      false,
      'activity_event_widget에 비동기 애니메이션 이름인 activity_event_appear state를 통한 ConsoleCommand가 없어야 합니다.'
    );
  });

  await t.test('2. activity_event_widget에서 자동 낭독이 제거되고 수동 스피커 버튼 및 F 단축키가 존재해야 한다', () => {
    const widgetMatch = content.match(/type\s+activity_event_widget\s*=\s*margin_widget\s*\{([\s\S]*?)type\s+activity_event_widget_base/);
    assert.ok(widgetMatch, 'activity_event_widget 블록이 존재해야 합니다.');
    const widgetBlock = widgetMatch[1];

    assert.strictEqual(
      widgetBlock.includes('tts_activity_event_auto_play'),
      false,
      '활동 창에는 연쇄 팝업 피로도 방지를 위해 자동 낭독 state가 없어야 합니다.'
    );

    assert.ok(
      widgetBlock.includes('name = "tts_speak_button"'),
      '수동 낭독 버튼(tts_speak_button)이 존재해야 합니다.'
    );

    assert.ok(
      widgetBlock.includes('shortcut = "army_split_half"'),
      'F 단축키가 구현되어 있어야 합니다.'
    );

    assert.ok(
      widgetBlock.includes('##CK3_TTS_FORCE##'),
      '강제 재낭독(FORCE) 신호가 연결되어 있어야 합니다.'
    );
  });

  await t.test('3. GUI 파일 전체 중괄호({, }) 쌍이 100% 일치해야 한다', () => {
    let openCount = 0;
    let closeCount = 0;
    for (const char of content) {
      if (char === '{') openCount++;
      if (char === '}') closeCount++;
    }
    assert.strictEqual(openCount, closeCount, `중괄호 쌍 불일치: 열림(${openCount}) != 닫힘(${closeCount})`);
  });
});
