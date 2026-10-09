import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

describe('대관식 및 무(無)포트레이트 이벤트 Jomini HasPortraitCharacter 안전 가드 검증 (debug-harness)', () => {
  const modGuiDir = path.resolve(__dirname, '../ck3-mod/gui');

  it('1. window_activity.gui의 모든 Concatenate 성별 구문은 left_portrait 검사(HasPortraitCharacter)를 필수로 포함해야 한다', () => {
    const filePath = path.join(modGuiDir, 'window_activity.gui');
    const content = fs.readFileSync(filePath, 'utf-8');

    // left_portrait의 IsFemale 호출 시 반드시 HasPortraitCharacter('left_portrait') 가드가 선행되어야 함
    const isFemaleCalls = (content.match(/GetPortraitCharacter\('left_portrait'\)\.IsFemale/g) || []).length;
    const guardedCalls = (content.match(/HasPortraitCharacter\('left_portrait'\),\s*Select_CString\(\s*EventWindowData\.GetPortraitCharacter\('left_portrait'\)\.IsFemale/g) || []).length;

    assert.strictEqual(
      guardedCalls,
      isFemaleCalls,
      `window_activity.gui에서 left_portrait 안전 가드 없이 IsFemale을 직접 호출하는 취약한 구문이 ${isFemaleCalls - guardedCalls}건 발견되었습니다.`
    );
    assert.strictEqual(content.includes('##CK3_TTS_END##\\"'), true, '포트레이트가 1명도 없을 때를 위한 폴백 종결자가 누락되었습니다.');
  });

  it('2. window_activity_locale.gui의 모든 Concatenate 성별 구문은 left_portrait 검사를 포함해야 한다', () => {
    const filePath = path.join(modGuiDir, 'window_activity_locale.gui');
    const content = fs.readFileSync(filePath, 'utf-8');

    const isFemaleCalls = (content.match(/GetPortraitCharacter\('left_portrait'\)\.IsFemale/g) || []).length;
    const guardedCalls = (content.match(/HasPortraitCharacter\('left_portrait'\),\s*Select_CString\(\s*EventWindowData\.GetPortraitCharacter\('left_portrait'\)\.IsFemale/g) || []).length;

    assert.strictEqual(
      guardedCalls,
      isFemaleCalls,
      `window_activity_locale.gui에서 left_portrait 안전 가드 없이 IsFemale을 직접 호출하는 취약한 구문이 ${isFemaleCalls - guardedCalls}건 발견되었습니다.`
    );
    assert.strictEqual(content.includes('##CK3_TTS_END##\\"'), true, '포트레이트가 1명도 없을 때를 위한 폴백 종결자가 누락되었습니다.');
  });

  it('3. character_event, big_event, fullscreen_event 등 모든 이벤트 창의 성별 구문은 left_portrait 검사를 포함해야 한다', () => {
    const targetFiles = [
      'event_windows/character_event.gui',
      'event_windows/big_event_window.gui',
      'event_windows/fullscreen_event.gui',
      'event_windows/duel_event.gui',
      'event_windows/visit_settlement_window.gui',
      'event_windows/scheme_preparations_event.gui'
    ];

    const violations: string[] = [];

    for (const relPath of targetFiles) {
      const fullPath = path.join(modGuiDir, relPath);
      if (!fs.existsSync(fullPath)) continue;
      const content = fs.readFileSync(fullPath, 'utf-8');
      const isFemaleCalls = (content.match(/GetPortraitCharacter\('left_portrait'\)\.IsFemale/g) || []).length;
      const guardedCalls = (content.match(/HasPortraitCharacter\('left_portrait'\),\s*Select_CString\(\s*EventWindowData\.GetPortraitCharacter\('left_portrait'\)\.IsFemale/g) || []).length;

      if (isFemaleCalls !== guardedCalls || !content.includes('##CK3_TTS_END##\\"')) {
        violations.push(`${relPath} (미보호 호출: ${isFemaleCalls - guardedCalls}건)`);
      }
    }

    assert.deepStrictEqual(
      violations,
      [],
      `다음 GUI 파일들에서 left_portrait 안전 가드가 누락되었거나 폴백 종결자가 없습니다: ${violations.join(', ')}`
    );
  });

  it('4. window_activity.gui의 activity_event_widget에 수동 낭독 버튼(tts_speak_button) 및 F 단축키가 구현되어 있어야 한다', () => {
    const filePath = path.join(modGuiDir, 'window_activity.gui');
    const content = fs.readFileSync(filePath, 'utf-8');

    assert.strictEqual(
      content.includes('name = "tts_speak_button"'),
      true,
      '활동 창에 수동 낭독 스피커 버튼이 구현되어 있어야 합니다.'
    );
    assert.strictEqual(
      content.includes('shortcut = "army_split_half"'),
      true,
      '활동 창에 F 단축키가 정상 바인딩되어 있어야 합니다.'
    );
    assert.strictEqual(
      content.includes('##CK3_TTS_FORCE##'),
      true,
      '스피커 버튼 및 F키에 FORCE 낭독 신호가 연결되어 있어야 합니다.'
    );
  });
});
