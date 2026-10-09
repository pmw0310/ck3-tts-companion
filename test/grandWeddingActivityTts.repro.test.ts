import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 대규모 결혼식(Grand Wedding) 및 대형 활동 이벤트 수동 낭독(스피커 버튼 및 F키) 전용 무결성 검증
 * - 정책(Option A): 연쇄 팝업, 긴 지문 피로도 및 엔진 엣지 누락 방지를 위해
 *   활동 창(window_activity.gui)은 자동 낭독을 배제하고 100% 수동(F 단축키 및 황금 스피커 버튼)으로 전환
 * - 검증:
 *   1) activity_event_widget에 자동 낭독(tts_activity_event_auto_play)이 제거되고 수동 스피커 버튼이 존재해야 함
 *   2) activity_event_widget_base에 자동 낭독이 제거되고 수동 스피커 버튼이 존재해야 함
 *   3) 수동 스피커 버튼에 F 단축키(army_split_half) 및 ##CK3_TTS_FORCE##가 바인딩되어 있어야 함
 *   4) 전체 GUI 중괄호 쌍이 100% 일치해야 함
 */
test('대규모 결혼식 및 활동 이벤트 수동 낭독 전용 정책 무결성 검증 (Option A)', async (t) => {
  const activityGuiPath = path.resolve(process.cwd(), 'ck3-mod/gui/window_activity.gui');
  assert.ok(fs.existsSync(activityGuiPath), 'window_activity.gui 파일이 존재해야 합니다.');
  const content = fs.readFileSync(activityGuiPath, 'utf-8');

  await t.test('1. activity_event_widget에서 자동 낭독 state가 제거되고 수동 스피커 버튼이 존재해야 한다', () => {
    const widgetMatch = content.match(/type\s+activity_event_widget\s*=\s*margin_widget\s*\{([\s\S]*?)type\s+activity_event_widget_base/);
    assert.ok(widgetMatch, 'activity_event_widget 정의가 존재해야 합니다.');
    const block = widgetMatch[1];

    assert.strictEqual(
      block.includes('tts_activity_event_auto_play'),
      false,
      'activity_event_widget에 자동 낭독 state(tts_activity_event_auto_play)가 없어야 합니다.'
    );
    assert.ok(
      block.includes('name = "tts_speak_button"'),
      'activity_event_widget에 수동 낭독 버튼(tts_speak_button)이 존재해야 합니다.'
    );
    assert.ok(
      block.includes('shortcut = "army_split_half"'),
      'activity_event_widget에 F 단축키(army_split_half)가 구현되어 있어야 합니다.'
    );
    assert.ok(
      block.includes('##CK3_TTS_FORCE##'),
      'activity_event_widget에 강제 재낭독(FORCE) 신호가 연결되어 있어야 합니다.'
    );
  });

  await t.test('2. activity_event_widget_base에서 자동 낭독 state가 제거되고 수동 스피커 버튼이 존재해야 한다', () => {
    const widgetMatch = content.match(/type\s+activity_event_widget_base\s*=\s*widget\s*\{([\s\S]*?)type\s+container_tenet_doctrine_conclusion/);
    assert.ok(widgetMatch, 'activity_event_widget_base 정의가 존재해야 합니다.');
    const block = widgetMatch[1];

    assert.strictEqual(
      block.includes('tts_activity_event_auto_play'),
      false,
      'activity_event_widget_base에 자동 낭독 state가 없어야 합니다.'
    );
    assert.ok(
      block.includes('name = "tts_speak_button"'),
      'activity_event_widget_base에 수동 낭독 버튼이 존재해야 합니다.'
    );
    assert.ok(
      block.includes('shortcut = "army_split_half"'),
      'activity_event_widget_base에 F 단축키가 구현되어 있어야 합니다.'
    );
    assert.ok(
      block.includes('##CK3_TTS_FORCE##'),
      'activity_event_widget_base에 FORCE 신호가 연결되어 있어야 합니다.'
    );
  });

  await t.test('3. window_activity.gui의 중괄호 쌍이 100% 일치해야 한다', () => {
    let openCount = 0;
    let closeCount = 0;
    for (const char of content) {
      if (char === '{') openCount++;
      if (char === '}') closeCount++;
    }
    assert.strictEqual(openCount, closeCount, `중괄호 쌍 불일치: 열림(${openCount}) != 닫힘(${closeCount})`);
  });
});
