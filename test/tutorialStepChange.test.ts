import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 튜토리얼 창 궁정/유물 툴팁형 수동 낭독(F 단축키/스피커 버튼) 전용 정책 및 안내 라벨 무결성 검증
 */
test('튜토리얼 창 수동 낭독 전용(자동 재생 배제) 및 안내 라벨·F 단축키 검증', async (t) => {
  const filePath = path.resolve(process.cwd(), 'ck3-mod/gui/window_tutorial.gui');
  assert.ok(fs.existsSync(filePath), 'window_tutorial.gui 파일이 존재해야 합니다.');

  const content = fs.readFileSync(filePath, 'utf-8');

  await t.test('1. [자동 재생 배제] 튜토리얼 창에 자동 감지기 및 스텝 전환 자동 낭독기가 없어야 함 (궁정형 수동 전용)', () => {
    assert.strictEqual(
      content.includes('name = "tts_tutorial_step_detector"'),
      false,
      '자동 감지기(tts_tutorial_step_detector)는 사용자 요청(자동 재생 배제)에 따라 제거되어야 합니다.'
    );
    assert.strictEqual(
      content.includes('name = "tts_tutorial_deferred_auto_tracker"'),
      false,
      '스텝 전환 자동 낭독기(tts_tutorial_deferred_auto_tracker)는 제거되어야 합니다.'
    );
  });

  await t.test('2. [수동 낭독 전용] 스피커 버튼 및 F 단축키에 다이렉트 CloseGameView 발화가 바인딩되어 있어야 함', () => {
    assert.ok(content.includes('name = "tts_speak_button"'), 'tts_speak_button이 존재해야 합니다.');
    assert.ok(content.includes('name = "tts_replay_shortcut_tutorial"'), 'tts_replay_shortcut_tutorial이 존재해야 합니다.');

    const speakIndex = content.indexOf('name = "tts_speak_button"');
    const speakBlock = content.slice(speakIndex, speakIndex + 400);
    assert.ok(
      speakBlock.includes("CloseGameView(Concatenate('##CK3_TTS_FORCE## '"),
      '스피커 버튼 클릭 시 다이렉트로 CloseGameView(##CK3_TTS_FORCE##)를 호출해야 합니다.'
    );

    const shortcutIndex = content.indexOf('name = "tts_replay_shortcut_tutorial"');
    const shortcutBlock = content.slice(shortcutIndex, shortcutIndex + 400);
    assert.ok(
      shortcutBlock.includes("CloseGameView(Concatenate('##CK3_TTS_FORCE## '"),
      'F 단축키 클릭 시 다이렉트로 CloseGameView(##CK3_TTS_FORCE##)를 호출해야 합니다.'
    );
  });

  await t.test('3. [헤더 안내 라벨] 스피커 버튼 옆에 "음성 듣기 (단축키: F)" 라벨이 배치되어 있어야 함', () => {
    const labelMatch = content.match(
      /text_single\s*=\s*\{[\s\S]*?name\s*=\s*"tts_speak_label"[\s\S]*?raw_text\s*=\s*"음성 듣기 \(단축키: F\)"[\s\S]*?\}/
    );
    assert.ok(labelMatch, '헤더 스피커 버튼 옆에 "음성 듣기 (단축키: F)" 안내 라벨(tts_speak_label)이 배치되어 있어야 합니다.');
  });

  await t.test('4. [변수 수명주기 초기화] _show 및 _hide, 닫기 버튼에서 이전 스텝 변수가 초기화되어야 함', () => {
    const showMatch = content.match(/state\s*=\s*\{[\s\S]*?name\s*=\s*_show[\s\S]*?\}/);
    const hideMatch = content.match(/state\s*=\s*\{[\s\S]*?name\s*=\s*_hide[\s\S]*?\}/);

    assert.ok(showMatch, '_show state가 존재해야 합니다.');
    assert.ok(hideMatch, '_hide state가 존재해야 합니다.');

    assert.ok(
      showMatch[0].includes("GetVariableSystem.Clear('tutorial_current_step_text')"),
      '_show 시점에 이전 스텝 변수를 Clear하여 첫 수동 낭독 시 정상 발화되도록 해야 합니다.'
    );
    assert.ok(
      hideMatch[0].includes("GetVariableSystem.Clear('tutorial_current_step_text')"),
      '_hide 시점에 스텝 변수를 Clear하여 다음 오픈 시 정상 발화되도록 해야 합니다.'
    );
  });

  await t.test('5. [반복 버튼 낭독 연동] repeat 버튼 클릭 시 현재 스텝을 다이렉트로 강제 재낭독(FORCE)해야 함', () => {
    const repeatMatch = content.match(
      /button_standard\s*=\s*\{[\s\S]*?Tutorial\.HasTransition\('repeat'\)[\s\S]*?\}/
    );
    assert.ok(repeatMatch, 'repeat 버튼 블록이 존재해야 합니다.');
    assert.ok(
      repeatMatch[0].includes("CloseGameView(Concatenate('##CK3_TTS_FORCE## '"),
      'repeat 버튼 클릭 시 다이렉트로 CloseGameView(##CK3_TTS_FORCE##)가 바인딩되어 있어야 합니다.'
    );
  });
});
