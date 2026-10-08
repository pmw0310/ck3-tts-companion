import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 대규모 결혼식(Grand Wedding) 및 활동 진행 중 발생하는 이벤트의 자동 TTS 낭독 무결성 검증
 * - 결함: C++ 엔진이 활동 도중 이벤트를 띄울 때 activity_new_event_shown 애니메이션을 호출하지 않거나,
 *   이미 열려 있는 창에서 HasOpenEvent가 계속 true로 유지되어 trigger_when이 격발되지 않아 자동 낭독이 침묵하는 현상
 * - 검증:
 *   1) window_activity.gui의 activity_event_widget에 tts_last_activity_event_desc 기반 실시간 변경 감지 state가 존재해야 함
 *   2) window_activity.gui의 activity_event_widget_base에 tts_last_activity_event_desc 기반 실시간 변경 감지 state가 존재해야 함
 *   3) _hide 및 창 닫힘 시점에 tts_last_activity_event_desc 변수가 정상 초기화(Clear)되어야 함
 *   4) 전체 GUI 중괄호 쌍이 100% 일치해야 함
 */
test('대규모 결혼식 및 활동 이벤트 실시간 변경 감지 자동 TTS 무결성 검증 (debug-harness)', async (t) => {
  const activityGuiPath = path.resolve(process.cwd(), 'ck3-mod/gui/window_activity.gui');
  assert.ok(fs.existsSync(activityGuiPath), 'window_activity.gui 파일이 존재해야 합니다.');
  const content = fs.readFileSync(activityGuiPath, 'utf-8');

  await t.test('1. activity_event_widget에 이벤트 설명 변경을 감지하는 trigger_when state가 존재해야 한다', () => {
    const widgetMatch = content.match(/type\s+activity_event_widget\s*=\s*margin_widget\s*\{([\s\S]*?)event_window_background_widget/);
    assert.ok(widgetMatch, 'activity_event_widget 정의가 존재해야 합니다.');
    const block = widgetMatch[1];

    assert.ok(
      block.includes('tts_last_activity_event_desc'),
      'activity_event_widget에 tts_last_activity_event_desc 변수 기반 변경 감지가 구현되어 있어야 합니다.'
    );
    assert.ok(
      block.includes('EventWindowData.GetDescription'),
      '이벤트 본문(GetDescription)의 유효성 및 변경 여부를 검사해야 합니다.'
    );
  });

  await t.test('2. activity_event_widget_base에 이벤트 설명 변경을 감지하는 trigger_when state가 존재해야 한다', () => {
    const widgetMatch = content.match(/type\s+activity_event_widget_base\s*=\s*widget\s*\{([\s\S]*?)vbox\s*=\s*\{\s*name\s*=\s*"event_window"/);
    assert.ok(widgetMatch, 'activity_event_widget_base 정의가 존재해야 합니다.');
    const block = widgetMatch[1];

    assert.ok(
      block.includes('tts_last_activity_event_desc'),
      'activity_event_widget_base에 tts_last_activity_event_desc 변수 기반 변경 감지가 구현되어 있어야 합니다.'
    );
  });

  await t.test('3. 창 닫힘(_hide) 시점에 tts_last_activity_event_desc 변수가 안전하게 초기화되어야 한다', () => {
    assert.ok(
      content.includes("GetVariableSystem.Clear('tts_last_activity_event_desc')") ||
      content.includes("GetVariableSystem.Clear( 'tts_last_activity_event_desc' )"),
      '창 닫힘 시점에 tts_last_activity_event_desc 변수를 Clear해야 합니다.'
    );
  });

  await t.test('4. window_activity.gui의 중괄호 쌍이 100% 일치해야 한다', () => {
    let openCount = 0;
    let closeCount = 0;
    for (const char of content) {
      if (char === '{') openCount++;
      if (char === '}') closeCount++;
    }
    assert.strictEqual(openCount, closeCount, `중괄호 쌍 불일치: 열림(${openCount}) != 닫힘(${closeCount})`);
  });
});
