import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * CK3 토너먼트 및 액티비티 이벤트 창 TTS 연동 무결성 검증 테스트
 * 1. window_activity.gui의 activity_event_widget_base (정규 토너먼트 이벤트 창)
 * 2. window_activity_locale.gui의 widget_activity_locale_fullscreen_event (토너먼트 중대 순간/결승 풀스크린 이벤트 창)
 */
test('CK3 토너먼트 이벤트 창 TTS 연동 무결성 검증', async (t) => {
  const modGuiDir = path.resolve('ck3-mod/gui');
  const activityGuiPath = path.join(modGuiDir, 'window_activity.gui');
  const localeGuiPath = path.join(modGuiDir, 'window_activity_locale.gui');

  await t.test('1. window_activity.gui의 activity_event_widget_base에 수동 낭독 스피커 버튼 및 F 단축키가 온전히 구현되어 있어야 함', () => {
    assert.ok(fs.existsSync(activityGuiPath), 'window_activity.gui 파일이 존재해야 합니다.');
    const content = fs.readFileSync(activityGuiPath, 'utf8');

    // activity_event_widget_base 블록 추출
    const baseWidgetIndex = content.indexOf('type activity_event_widget_base = widget');
    assert.ok(baseWidgetIndex !== -1, 'activity_event_widget_base 타입이 정의되어 있어야 합니다.');
    const nextTypeIndex = content.indexOf('type container_tenet_doctrine_conclusion', baseWidgetIndex);
    const baseContent = content.slice(baseWidgetIndex, nextTypeIndex !== -1 ? nextTypeIndex : undefined);

    // 대형 활동 수동 전용 정책(Option A): 복합 창 충돌 및 연쇄 팝업 피로도 방지를 위해 자동 낭독 제거
    assert.strictEqual(
      baseContent.includes('tts_activity_event_auto_play'),
      false,
      'activity_event_widget_base에 자동 낭독 state가 없어야 합니다 (수동 전용 정책).'
    );

    // ##CK3_TTS_STOP## 창 닫힘 오디오 중단 state 확인 (콘솔 락 방지를 위해 배제됨)
    assert.ok(
      !baseContent.includes('##CK3_TTS_STOP##'),
      'activity_event_widget_base에 콘솔 락을 유발하는 ##CK3_TTS_STOP##이 없어야 합니다.'
    );

    // tts_speak_button 수동 낭독 버튼 및 F 단축키 확인
    assert.ok(
      baseContent.includes('name = "tts_speak_button"'),
      'activity_event_widget_base에 tts_speak_button 버튼이 존재해야 합니다.'
    );
    assert.ok(
      baseContent.includes('shortcut = "army_split_half"'),
      'activity_event_widget_base에 F 단축키가 연결되어 있어야 합니다.'
    );
    assert.ok(
      baseContent.includes('##CK3_TTS_FORCE##'),
      'activity_event_widget_base의 스피커 버튼에 ##CK3_TTS_FORCE##가 연결되어 있어야 합니다.'
    );
  });

  await t.test('2. window_activity_locale.gui가 모드에 존재하고 풀스크린 이벤트 위젯에 TTS가 구현되어 있어야 함', () => {
    assert.ok(fs.existsSync(localeGuiPath), 'window_activity_locale.gui 파일이 모드에 존재해야 합니다.');
    const content = fs.readFileSync(localeGuiPath, 'utf8');

    // 중괄호 쌍 일치 검증
    let openCount = 0;
    let closeCount = 0;
    for (const char of content) {
      if (char === '{') openCount++;
      if (char === '}') closeCount++;
    }
    assert.equal(openCount, closeCount, `중괄호 열림(${openCount})과 닫힘(${closeCount}) 개수가 일치해야 합니다.`);

    // widget_activity_locale_fullscreen_event 블록 추출
    const fullscreenIndex = content.indexOf('type widget_activity_locale_fullscreen_event = widget');
    assert.ok(fullscreenIndex !== -1, 'widget_activity_locale_fullscreen_event 타입이 정의되어 있어야 합니다.');
    const fsContent = content.slice(fullscreenIndex, fullscreenIndex + 25000);

    assert.ok(
      fsContent.includes('##CK3_TTS##'),
      'widget_activity_locale_fullscreen_event에 ##CK3_TTS## 자동 낭독 state가 구현되어 있어야 합니다.'
    );
    assert.ok(
      fsContent.includes('name = "tts_speak_button"'),
      'widget_activity_locale_fullscreen_event에 tts_speak_button 버튼이 존재해야 합니다.'
    );
  });

  await t.test('3. 크래시 방어 검증: 위험한 trigger_on_create가 없어야 하고 activity_new_event_shown이 구현되어 있어야 함', () => {
    const activityContent = fs.readFileSync(activityGuiPath, 'utf8');
    const localeContent = fs.readFileSync(localeGuiPath, 'utf8');

    // 1) activity_event_widget_base 내 TTS state에 크래시를 유발하는 trigger_on_create가 없어야 함
    const baseWidgetIndex = activityContent.indexOf('type activity_event_widget_base = widget');
    const baseContent = activityContent.slice(baseWidgetIndex, baseWidgetIndex + 15000);
    const ttsStateIndex = baseContent.indexOf('name = activity_new_event_shown');
    assert.ok(ttsStateIndex !== -1, '바닐라 표준 이벤트 진입 state인 activity_new_event_shown이 존재해야 합니다.');
    const ttsStateBlock = baseContent.slice(ttsStateIndex, ttsStateIndex + 300);

    assert.ok(
      !ttsStateBlock.includes('trigger_on_create = yes'),
      '데이터 널 포인터 크래시를 유발하는 trigger_on_create = yes가 TTS state에 없어야 합니다.'
    );

    // 2) widget_activity_locale_regular_event가 activity_event_widget_base를 올바르게 상속해야 함
    assert.ok(
      localeContent.includes('type widget_activity_locale_regular_event = activity_event_widget_base'),
      'widget_activity_locale_regular_event가 activity_event_widget_base를 상속해야 합니다.'
    );
  });
});
