import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * CK3 활동 이벤트 창(window_activity.gui) 크래시 방어 및 데이터 바인딩 완료 후 자동 낭독 무결성 검증
 * - 최상위 및 activity_new_event_shown에서 PdxGuiTriggerAllAnimations('activity_event_appear')를 호출할 때
 *   임의로 선언된 state = { name = activity_event_appear }에 비동기 콜백이 등록되어
 *   이벤트 창 닫힘 시 CEventWindowData Use-After-Free(SIGSEGV) 크래시를 유발하는 결함 방어
 * - activity_new_event_shown 즉시 호출 시 빈 문자열(|||)이 출력되지 않고,
 *   next = tts_activity_event_auto_play 상태 전이를 통해 데이터 바인딩(HasOpenEvent) 완료 후 안전하게 낭독 격발
 */
test('CK3 활동 이벤트 창(window_activity.gui) 비동기 크래시 방어 및 자동 낭독 무결성 검증', async (t) => {
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

  await t.test('2. activity_new_event_shown이 next = tts_activity_event_auto_play로 전이되고 HasOpenEvent 가드가 있어야 한다', () => {
    const widgetMatch = content.match(/type\s+activity_event_widget\s*=\s*margin_widget\s*\{([\s\S]*?)event_window_background_widget/);
    assert.ok(widgetMatch, 'activity_event_widget 블록이 존재해야 합니다.');
    const widgetBlock = widgetMatch[1];

    assert.ok(
      widgetBlock.includes('next = tts_activity_event_auto_play'),
      'activity_new_event_shown은 애니메이션 격발 후 tts_activity_event_auto_play로 상태를 전이해야 합니다.'
    );

    assert.ok(
      widgetBlock.includes('name = tts_activity_event_auto_play'),
      'tts_activity_event_auto_play state가 정의되어 있어야 합니다.'
    );

    assert.ok(
      widgetBlock.includes('trigger_when = "[EventWindowViewInsert.HasOpenEvent]"'),
      'tts_activity_event_auto_play는 EventWindowViewInsert.HasOpenEvent 가드를 통해 데이터 유효 시에만 격발되어야 합니다.'
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
