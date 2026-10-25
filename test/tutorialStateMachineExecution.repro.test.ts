import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 튜토리얼 창(window_tutorial.gui) 수동 낭독(F 단축키/스피커 버튼) 전용 정책 및 다이렉트 onclick 무결성 검증
 * 
 * 정책 요구사항:
 * 1. 왕실 궁정(window_court_events.gui) 및 유물 툴팁과 동일하게, 튜토리얼 창 진입이나 스텝 전환 시
 *    자동으로 TTS를 재생하지 않고(자동 재생 비활성화), 사용자가 직접 F키나 스피커 버튼을 눌렀을 때만 발화함.
 * 2. 헤더의 스피커 버튼 옆에 "음성 듣기 (단축키: F)" 안내 라벨(tts_speak_label)을 명시하여 직관적인 UX를 제공함.
 * 3. C++ 윈도우 애니메이션에 의한 상태 취소(Abort)나 비동기 지연 결함을 방지하기 위해,
 *    스피커 버튼, F 단축키, 반복 버튼 클릭 시 변수 지연 없이 다이렉트 onclick으로 CloseGameView('##CK3_TTS_FORCE## ...')를 호출함.
 */
describe('튜토리얼 창 수동 낭독(F 단축키/스피커) 전용 정책 및 안내 라벨·발화 무결성 검증', () => {
  const tutorialGuiPath = path.resolve(process.cwd(), 'ck3-mod/gui/window_tutorial.gui');
  const content = fs.readFileSync(tutorialGuiPath, 'utf-8');

  it('1. 튜토리얼 창은 궁정과 같이 자동 재생 트래커 및 불안정한 지연 트래커가 배제되어야 한다', () => {
    // 자동 재생 위젯 2종(step_detector, deferred_auto_tracker)이 제거되었는지 확인
    assert.strictEqual(
      content.includes('name = "tts_tutorial_step_detector"'),
      false,
      '자동 감지기(tts_tutorial_step_detector)는 수동 전용 정책에 따라 제거되어야 합니다.'
    );
    assert.strictEqual(
      content.includes('name = "tts_tutorial_deferred_auto_tracker"'),
      false,
      '스텝 전환 자동 낭독기(tts_tutorial_deferred_auto_tracker)는 수동 전용 정책에 따라 제거되어야 합니다.'
    );
    assert.strictEqual(
      content.includes('name = "tts_tutorial_deferred_force_tracker"'),
      false,
      '취소 위험이 높은 지연 force 트래커(tts_tutorial_deferred_force_tracker)는 제거되어야 합니다.'
    );
  });

  it('2. 상단 헤더에 음성 듣기 스피커 버튼과 "음성 듣기 (단축키: F)" 안내 라벨이 배치되어 있어야 한다', () => {
    // 헤더 스피커 버튼 존재 및 다이렉트 onclick 확인
    const speakIndex = content.indexOf('name = "tts_speak_button"');
    assert.ok(speakIndex !== -1, '헤더에 tts_speak_button이 배치되어 있어야 합니다.');
    const speakBlock = content.slice(speakIndex, speakIndex + 400);
    assert.ok(
      speakBlock.includes("CloseGameView(Concatenate('##CK3_TTS_FORCE## '"),
      'tts_speak_button은 다이렉트로 CloseGameView를 호출해야 합니다.'
    );

    // 안내 라벨 존재 확인
    assert.match(
      content,
      /text_single\s*=\s*\{[\s\S]*?name\s*=\s*"tts_speak_label"[\s\S]*?raw_text\s*=\s*"음성 듣기 \(단축키: F\)"[\s\S]*?\}/,
      '헤더 스피커 버튼 옆에 "음성 듣기 (단축키: F)" 안내 라벨(tts_speak_label)이 배치되어 있어야 합니다.'
    );

    // 단축키 F 버튼 존재 및 다이렉트 onclick 확인
    const shortcutIndex = content.indexOf('name = "tts_replay_shortcut_tutorial"');
    assert.ok(shortcutIndex !== -1, 'F 단축키 바인딩 버튼(tts_replay_shortcut_tutorial)이 존재해야 합니다.');
    const shortcutBlock = content.slice(shortcutIndex, shortcutIndex + 400);
    assert.match(
      shortcutBlock,
      /shortcut\s*=\s*"army_split_half"/,
      'tts_replay_shortcut_tutorial은 army_split_half(F) 단축키를 가져야 합니다.'
    );
    assert.ok(
      shortcutBlock.includes("CloseGameView(Concatenate('##CK3_TTS_FORCE## '"),
      'tts_replay_shortcut_tutorial은 다이렉트로 CloseGameView를 호출해야 합니다.'
    );
  });

  it('3. repeat 버튼도 다이렉트 onclick으로 현재 스텝 낭독을 호출해야 한다', () => {
    const repeatIndex = content.indexOf("Tutorial.HasTransition('repeat')");
    assert.ok(repeatIndex !== -1, 'repeat 버튼이 존재해야 합니다.');
    const repeatBlock = content.slice(repeatIndex, repeatIndex + 400);
    assert.ok(
      repeatBlock.includes("CloseGameView(Concatenate('##CK3_TTS_FORCE## '"),
      'repeat 버튼은 다이렉트로 CloseGameView를 호출해야 합니다.'
    );
  });
});
