import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 풀스크린 서사 이벤트 창(fullscreen_event.gui) TTS 연동 무결성 검증
 */
test('풀스크린 서사 이벤트 창(fullscreen_event.gui) TTS 연동 무결성 검증', async (t) => {
  const filePath = path.resolve(process.cwd(), 'ck3-mod/gui/event_windows/fullscreen_event.gui');
  assert.ok(fs.existsSync(filePath), 'fullscreen_event.gui 파일이 ck3-mod에 존재해야 합니다.');

  const content = fs.readFileSync(filePath, 'utf-8');

  await t.test('1. [중괄호 쌍 무결성] 열린 중괄호와 닫힌 중괄호의 개수가 정확히 일치해야 함', () => {
    let openCount = 0;
    let closeCount = 0;
    for (const char of content) {
      if (char === '{') openCount++;
      if (char === '}') closeCount++;
    }
    assert.equal(openCount, closeCount, `중괄호 열림(${openCount})과 닫힘(${closeCount}) 개수가 일치해야 합니다.`);
  });

  await t.test('2. [실시간 자동 낭독 연동] _show 상태에 trigger_on_create = yes 및 ##CK3_TTS##가 구현되어 있고 fade_in 상태에도 연결되어 있어야 함', () => {
    assert.match(
      content,
      /state\s*=\s*\{[\s\S]*?name\s*=\s*_show[\s\S]*?trigger_on_create\s*=\s*yes[\s\S]*?##CK3_TTS##/,
      '풀스크린 이벤트가 생성될 때(trigger_on_create = yes) 실시간으로 ##CK3_TTS## 자동 낭독이 트리거되어야 합니다.'
    );
    assert.match(
      content,
      /name\s*=\s*"fade_in"[\s\S]*?##CK3_TTS##/,
      'C++ 엔진이 직접 호출하는 fade_in 상태에도 ##CK3_TTS## 자동 낭독이 연결되어 있어야 합니다.'
    );
    assert.match(
      content,
      /EventWindowData\.GetTitle[\s\S]*?EventWindowData\.GetDescription/,
      '제목과 설명이 결합되어 TTS로 전달되어야 합니다.'
    );
    // 문법 에러 방지
    assert.ok(
      !content.includes("HasPortraitCharacter('left_portrait').IsFemale"),
      'HasPortraitCharacter에 .IsFemale을 호출하는 문법 에러가 없어야 합니다.'
    );
    assert.match(
      content,
      /GetPortraitCharacter\('left_portrait'\)\.IsFemale/,
      '올바른 GetPortraitCharacter 메소드로 캐릭터 성별을 판별해야 합니다.'
    );
  });

  await t.test('3. [오디오 즉시 중단 연동] _hide 상태에서 ##CK3_TTS_STOP##이 호출되어 창이 닫힐 때 이전 음성이 즉시 멈추어야 함', () => {
    assert.match(
      content,
      /state\s*=\s*\{[\s\S]*?name\s*=\s*_hide[\s\S]*?##CK3_TTS_STOP##/,
      '선택지 클릭 또는 창이 닫힐 때(_hide) 이전 음성 즉시 중단(##CK3_TTS_STOP##)이 트리거되어야 합니다.'
    );
  });

  await t.test('4. [수동 낭독 버튼 및 단축키] title 옆에 tts_speak_button 및 F 단축키가 바인딩되어 있어야 함', () => {
    assert.match(
      content,
      /button_round\s*=\s*\{[\s\S]*?name\s*=\s*"tts_speak_button"/,
      'title 옆에 tts_speak_button이 배치되어야 합니다.'
    );
    assert.match(
      content,
      /shortcut\s*=\s*"army_split_half"/,
      'F 단축키가 바인딩되어 있어야 합니다.'
    );
    assert.match(
      content,
      /##CK3_TTS_FORCE##/,
      '버튼 클릭 시 강제 재낭독(FORCE)이 실행되어야 합니다.'
    );
  });
});
