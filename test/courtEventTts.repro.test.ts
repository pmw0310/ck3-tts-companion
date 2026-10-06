import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 궁정 주최(Hold Court) 및 알현실 이벤트(window_royal_court.gui & window_court_events.gui) TTS 연동 무결성 검증
 */
test('궁정 이벤트 창(window_royal_court.gui & window_court_events.gui) TTS 연동 무결성 검증', async (t) => {
  const royalCourtGuiPath = path.resolve(process.cwd(), 'ck3-mod/gui/window_royal_court.gui');
  const courtGuiPath = path.resolve(process.cwd(), 'ck3-mod/gui/window_court_events.gui');

  assert.ok(fs.existsSync(royalCourtGuiPath), 'window_royal_court.gui 파일이 존재해야 합니다.');
  assert.ok(fs.existsSync(courtGuiPath), 'window_court_events.gui 파일이 존재해야 합니다.');

  const courtContent = fs.readFileSync(courtGuiPath, 'utf-8');

  await t.test('1. [데이터 스코프 및 수동 낭독 연동] header_pattern 내부에 tts_speak_button이 배치되어 모든 탄원인의 최신 데이터가 정상 바인딩되어야 함', () => {
    assert.match(
      courtContent,
      /header_pattern\s*=\s*\{[\s\S]*?name\s*=\s*"tts_speak_button"[\s\S]*?##CK3_TTS_FORCE##/,
      'header_pattern 내부에 tts_speak_button이 배치되어 court_event_data의 최신 EventWindowData를 낭독할 수 있어야 합니다.'
    );
    assert.match(
      courtContent,
      /EventWindowData\.GetTitle[\s\S]*?EventWindowData\.GetDescription/,
      '제목과 설명이 결합되어 TTS로 전달되어야 합니다.'
    );
    assert.ok(
      !courtContent.includes("HasPortraitCharacter('left_portrait').IsFemale"),
      'HasPortraitCharacter에 .IsFemale을 호출하는 문법 에러가 없어야 합니다.'
    );
    assert.match(
      courtContent,
      /GetPortraitCharacter\('left_portrait'\)\.IsFemale/,
      '올바른 GetPortraitCharacter 메소드로 캐릭터 성별을 판별해야 합니다.'
    );
  });

  await t.test('2. [버튼 잘림 방지 및 단축키 바인딩] widgetanchor = vcenter|right 및 넉넉한 안전 여백(-65 0)으로 우측 클리핑 방지 및 F 단축키 확인', () => {
    assert.match(
      courtContent,
      /flowcontainer\s*=\s*\{[\s\S]*?parentanchor\s*=\s*vcenter\|right[\s\S]*?widgetanchor\s*=\s*vcenter\|right[\s\S]*?position\s*=\s*\{\s*-65\s+0\s*\}/,
      '헤더 바 우측 안쪽으로 65px 이상 넉넉하게 정렬되어 버튼이 테두리에 전혀 잘리지 않아야 합니다.'
    );
    assert.match(
      courtContent,
      /button_round\s*=\s*\{[\s\S]*?name\s*=\s*"tts_speak_button"[\s\S]*?shortcut\s*=\s*"army_split_half"/,
      '스피커 버튼에 F 단축키(army_split_half)가 바인딩되어 있어야 합니다.'
    );
  });

  await t.test('3. [안내 라벨 및 툴팁] 궁정 TTS가 자동 재생 불가 및 수동 낭독임을 알리는 시각적 텍스트 라벨과 툴팁이 구비되어 있어야 함', () => {
    assert.match(
      courtContent,
      /text_single\s*=\s*\{[\s\S]*?text\s*=\s*"궁정 자동 재생 불가"/,
      '헤더 영역에 "궁정 자동 재생 불가" 안내 라벨이 시각적으로 노출되어야 합니다.'
    );
    assert.match(
      courtContent,
      /text_single\s*=\s*\{[\s\S]*?text\s*=\s*"수동 낭독 \(단축키: F\)"/,
      '헤더 영역에 "수동 낭독 (단축키: F)" 안내 라벨이 시각적으로 노출되어야 합니다.'
    );
    assert.match(
      courtContent,
      /(?:raw_)?tooltip\s*=\s*"(?:TTS_COURT_EVENT_TOOLTIP|TTS 이벤트 낭독[\s\S]*?궁정\(알현실\) 이벤트는)/,
      '스피커 버튼에 자동 재생 불가 및 수동 낭독 안내 툴팁이 명시되어 있어야 합니다.'
    );
  });

  await t.test('4. [크래시 및 오발화 원천 차단] 불안정한 trigger_when 자동 재생 state가 제거되어 있어야 함', () => {
    assert.ok(
      !courtContent.includes('tts_court_event_auto_play'),
      '알현실 3D 비동기 결함을 유발하는 tts_court_event_auto_play가 제거되어 있어야 합니다.'
    );
    assert.ok(
      !courtContent.includes('tts_court_event_auto_stop'),
      '미발화 결함을 유발하는 tts_court_event_auto_stop이 제거되어 있어야 합니다.'
    );
  });

  await t.test('5. [선택지 크래시 방어] button_eventoption 내부에 중복 콘솔 명령어가 없어야 함 (FlushDestroyList 크래시 방어)', () => {
    // 1) window_court_events.gui 내부 button_eventoption 블록 추출
    const optionMatch = courtContent.match(/button_eventoption\s*=\s*\{([\s\S]*?)\n\t\t\t\t\t\t\t\}/);
    assert.ok(optionMatch, 'button_eventoption 블록이 존재해야 합니다.');
    assert.ok(
      !optionMatch[1]!.includes('ExecuteConsoleCommand'),
      '선택지 버튼(button_eventoption) 내부에는 중복 콘솔 명령어가 없어야 합니다.'
    );

    // 2) shared/event_windows.gui 전역 정의 확인
    const sharedGuiPath = path.resolve(process.cwd(), 'ck3-mod/gui/shared/event_windows.gui');
    if (fs.existsSync(sharedGuiPath)) {
      const sharedContent = fs.readFileSync(sharedGuiPath, 'utf-8');
      const sharedOptionMatch = sharedContent.match(/type button_eventoption = button_event_standard[\s\S]*?onclick = "\[EventOption\.Select\]"/);
      assert.ok(sharedOptionMatch, 'shared/event_windows.gui의 button_eventoption 블록이 확인되어야 합니다.');
      assert.ok(
        !sharedOptionMatch[0]!.includes('ExecuteConsoleCommand'),
        'shared/event_windows.gui의 button_eventoption에는 크래시를 유발하는 콘솔 명령어가 없어야 합니다.'
      );
    }
  });

  await t.test('6. [엔진 레이아웃 무한 재귀 크래시 방어] flowcontainer 내부에 hbox/vbox가 직접 자식으로 없어야 함 (스택 오버플로우 방어)', () => {
    // flowcontainer 내부에 vbox 또는 hbox가 직접 들어가면 엔진 크래시가 발생하므로 검증
    const controlMatch = courtContent.match(/# CK3 TTS Companion: 궁정 수동 낭독 컨트롤[\s\S]*?name\s*=\s*"tts_speak_button"[\s\S]*?\n\t\t\t\t\t\}/);
    assert.ok(controlMatch, 'TTS 컨트롤 flowcontainer가 확인되어야 합니다.');
    assert.ok(
      !controlMatch[0].includes('vbox = {'),
      'flowcontainer의 직접 자식으로 vbox가 들어가면 C++ 엔진 무한 리사이즈 스택 오버플로우가 발생하므로 없어야 합니다.'
    );
    assert.ok(
      !controlMatch[0].includes('hbox = {'),
      'flowcontainer의 직접 자식으로 hbox가 들어가면 C++ 엔진 무한 리사이즈 스택 오버플로우가 발생하므로 없어야 합니다.'
    );
  });
});
