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

  const royalContent = fs.readFileSync(royalCourtGuiPath, 'utf-8');
  const courtContent = fs.readFileSync(courtGuiPath, 'utf-8');

  await t.test('1. [실시간 자동 낭독 연동] window_court_events.gui의 widget_court_event에 EventWindowViewInsert.HasOpenEvent 기반 자동 낭독이 구현되어 있어야 함', () => {
    assert.match(
      courtContent,
      /state\s*=\s*\{[\s\S]*?name\s*=\s*tts_court_event_auto_play[\s\S]*?trigger_when\s*=\s*"\[EventWindowViewInsert\.HasOpenEvent\]"[\s\S]*?##CK3_TTS##/,
      '탄원인이 화면에 나타날 때(EventWindowViewInsert.HasOpenEvent) 실시간으로 ##CK3_TTS## 자동 낭독이 트리거되어야 합니다.'
    );
    assert.match(
      courtContent,
      /EventWindowData\.GetTitle[\s\S]*?EventWindowData\.GetDescription/,
      '제목과 설명이 결합되어 TTS로 전달되어야 합니다.'
    );
    // 문법 에러 방지: HasPortraitCharacter 뒤에 .IsFemale이 오지 않고 GetPortraitCharacter가 사용되어야 함
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

  await t.test('2. [오디오 즉시 중단 연동] window_court_events.gui에서 Not(EventWindowViewInsert.HasOpenEvent) 상태에서 ##CK3_TTS_STOP##이 호출되어 선택지 클릭 시 이전 음성이 즉시 멈추어야 함', () => {
    assert.match(
      courtContent,
      /state\s*=\s*\{[\s\S]*?name\s*=\s*tts_court_event_auto_stop[\s\S]*?trigger_when\s*=\s*"\[Not\(EventWindowViewInsert\.HasOpenEvent\)\]"[\s\S]*?##CK3_TTS_STOP##/,
      '탄원인 선택지 클릭 또는 창이 닫힐 때(Not HasOpenEvent) 이전 음성 즉시 중단(##CK3_TTS_STOP##)이 트리거되어야 합니다.'
    );
  });

  await t.test('3. [수동 낭독 버튼] window_court_events.gui 우측 상단 tts_speak_button 및 F 단축키 연동 확인', () => {
    assert.match(
      courtContent,
      /button_round\s*=\s*\{[\s\S]*?name\s*=\s*"tts_speak_button"[\s\S]*?parentanchor\s*=\s*top\|right[\s\S]*?position\s*=\s*\{\s*-25\s+15\s*\}/,
      '우측 상단 모서리에 tts_speak_button이 배치되어야 합니다.'
    );
    assert.match(
      courtContent,
      /shortcut\s*=\s*"army_split_half"/,
      'F 단축키가 바인딩되어 있어야 합니다.'
    );
    assert.match(
      courtContent,
      /##CK3_TTS_FORCE##/,
      '버튼 클릭 시 강제 재낭독(FORCE)이 실행되어야 합니다.'
    );
  });

  await t.test('4. [크래시 방어] button_eventoption 내부에 중복 콘솔 명령어가 없어야 함 (FlushDestroyList 크래시 방어)', () => {
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
});
