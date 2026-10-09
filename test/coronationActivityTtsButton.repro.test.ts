import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 대관식 등 CK3 활동(Activity) 창의 TTS 수동 낭독 버튼 DataContext 무결성 검증
 */
test('대관식 및 활동 창(window_activity.gui) TTS 버튼 DataContext 결함 재현 및 검증', async (t) => {
  const activityGuiPath = path.resolve(process.cwd(), 'ck3-mod/gui/window_activity.gui');
  assert.ok(fs.existsSync(activityGuiPath), 'window_activity.gui 파일이 존재해야 합니다.');

  const content = fs.readFileSync(activityGuiPath, 'utf-8');

  await t.test('1. [결함 재현 1] 메인 이벤트 본문 위젯(activity_event_widget) 내부에 TTS 수동 낭독 버튼이 존재해야 함', () => {
    // activity_event_widget 타입 정의 블록 추출
    const widgetTypeMatch = content.match(/type\s+activity_event_widget\s*=\s*margin_widget\s*\{([\s\S]*?)\n\ttype\s+activity_event_widget_base/);
    assert.ok(widgetTypeMatch, 'type activity_event_widget 정의 블록을 찾을 수 있어야 합니다.');

    const widgetBody = widgetTypeMatch[1]!;
    const hasTtsButtonInMainWidget = widgetBody.includes('name = "tts_speak_button"');
    assert.ok(
      hasTtsButtonInMainWidget,
      '대관식 등 활동 이벤트 본문 창(activity_event_widget) 내부에 tts_speak_button이 반드시 존재해야 합니다.'
    );
  });

  await t.test('2. [디자인 정합성] 상단 헤더(activity_event_titles)에는 중복 버튼이 없고 타이틀 텍스트만 깨끗하게 유지되어야 함', () => {
    const titlesFlowMatch = content.match(/flowcontainer\s*=\s*\{[\s\S]*?name\s*=\s*"activity_event_titles"([\s\S]*?)\n\t\t\}/);
    assert.ok(titlesFlowMatch, 'activity_event_titles 블록을 찾을 수 있어야 합니다.');

    const titlesBody = titlesFlowMatch[1]!;

    const hasButtonInHeader = titlesBody.includes('tts_speak_button');
    assert.ok(
      !hasButtonInHeader,
      '상단 헤더(activity_event_titles)에는 타이틀을 가리는 중복 스피커 버튼이 없어야 합니다.'
    );
  });

  await t.test('3. [레이아웃 정합성] TTS 버튼이 장례식/활동 초상화(우측)와 겹치지 않도록 상단 좌측(top|left)에 배치되어야 함', () => {
    const widgetTypeMatch = content.match(/type\s+activity_event_widget\s*=\s*margin_widget\s*\{([\s\S]*?)\n\ttype\s+activity_event_widget_base/);
    assert.ok(widgetTypeMatch);
    const widgetBody = widgetTypeMatch[1]!;

    // 상단 좌측 여백 배치 및 최상위 레이어 검증
    assert.match(
      widgetBody,
      /button_round\s*=\s*\{[\s\S]*?name\s*=\s*"tts_speak_button"[\s\S]*?parentanchor\s*=\s*top\|left[\s\S]*?position\s*=\s*\{\s*35\s+65\s*\}/,
      'TTS 버튼이 상단 좌측(top|left, 35 65)에 배치되어야 합니다.'
    );

    // Z-Index 가림 방지: button_round가 main_characters 및 event_window_background_widget보다 뒤(더 나중에)에 선언되어야 함
    const bgIndex = widgetBody.indexOf('event_window_background_widget');
    const btnIndex = widgetBody.indexOf('name = "tts_speak_button"');
    assert.ok(
      btnIndex > bgIndex,
      'TTS 버튼이 배경 위젯보다 뒤에 선언되어 배경이나 인물 초상화에 가려지지 않아야 합니다.'
    );

    // 지문 텍스트 영역(text_and_options) 내부에는 tts_speak_button이 없어야 함
    const textAndOptionsMatch = widgetBody.match(/hbox\s*=\s*\{[\s\S]*?name\s*=\s*"text_and_options"([\s\S]*?)name\s*=\s*"option_area"/);
    assert.ok(textAndOptionsMatch, 'text_and_options 블록을 찾을 수 있어야 합니다.');
    assert.ok(
      !textAndOptionsMatch[1]!.includes('tts_speak_button'),
      '화면 중앙의 인물들을 가리지 않도록 지문 텍스트 영역에는 스피커 버튼이 없어야 합니다.'
    );
  });

  await t.test('4. [안내 라벨 및 툴팁] 대형 이벤트 자동 TTS 미지원 및 수동 낭독(F키) 안내 라벨이 로컬라이제이션 키로 존재해야 함', () => {
    assert.match(
      content,
      /flowcontainer\s*=\s*\{[\s\S]*?name\s*=\s*"tts_speak_notice"[\s\S]*?text\s*=\s*"TTS_ACTIVITY_NOTICE_NO_AUTOPLAY"[\s\S]*?text\s*=\s*"TTS_ACTIVITY_NOTICE_MANUAL_SPEAK"/,
      '대형 이벤트 자동 낭독 미지원 및 수동 낭독 안내 텍스트 라벨이 로컬라이제이션 키로 선언되어 있어야 합니다.'
    );
    assert.match(
      content,
      /tooltip\s*=\s*"TTS_ACTIVITY_EVENT_TOOLTIP"/,
      '활동 이벤트 tooltip이 로컬라이제이션 키로 바인딩되어 있어야 합니다.'
    );

    // 로컬라이제이션 파일에 해당 키들이 정상 등록되어 있는지 교차 검증
    const korLocPath = path.resolve(process.cwd(), 'ck3-mod/localization/korean/replace/debug_cleanup_l_korean.yml');
    const engLocPath = path.resolve(process.cwd(), 'ck3-mod/localization/english/replace/debug_cleanup_l_english.yml');
    assert.ok(fs.existsSync(korLocPath), '한국어 로컬라이제이션 파일이 존재해야 합니다.');
    assert.ok(fs.existsSync(engLocPath), '영어 로컬라이제이션 파일이 존재해야 합니다.');

    const korLoc = fs.readFileSync(korLocPath, 'utf-8');
    const engLoc = fs.readFileSync(engLocPath, 'utf-8');

    for (const key of ['TTS_ACTIVITY_EVENT_TOOLTIP', 'TTS_ACTIVITY_NOTICE_NO_AUTOPLAY', 'TTS_ACTIVITY_NOTICE_MANUAL_SPEAK']) {
      assert.ok(korLoc.includes(`${key}:0 `), `한국어 로컬라이제이션에 ${key}:0 키가 정의되어 있어야 합니다.`);
      assert.ok(engLoc.includes(`${key}:0 `), `영어 로컬라이제이션에 ${key}:0 키가 정의되어 있어야 합니다.`);
    }
  });
});

