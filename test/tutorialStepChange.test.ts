import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 튜토리얼 스텝 전환 및 자동 진행 시 TTS 재발화 무결성 검증 (Reproduction Test)
 */
test('튜토리얼 창 스텝 전환(다음 클릭 및 자동 진행) TTS 재발화 검증', async (t) => {
  const filePath = path.resolve(process.cwd(), 'ck3-mod/gui/window_tutorial.gui');
  assert.ok(fs.existsSync(filePath), 'window_tutorial.gui 파일이 존재해야 합니다.');

  const content = fs.readFileSync(filePath, 'utf-8');

  await t.test('1. [스텝 전환 감지기] Tutorial.GetStepText 변경을 실시간 감지하는 trigger_when state가 존재해야 함', () => {
    // 윈도우가 닫히지 않고 내부 스텝만 전환될 때 _show는 재발동하지 않으므로,
    // GetVariableSystem과 Tutorial.GetStepText를 비교하는 trigger_when state가 반드시 필요함
    const hasStepChangeDetector =
      content.includes('trigger_when') &&
      content.includes('tutorial_current_step_text') &&
      content.includes('Tutorial.GetStepText');

    assert.ok(
      hasStepChangeDetector,
      '튜토리얼 창에 스텝 텍스트(Tutorial.GetStepText) 변경을 실시간 감지하는 trigger_when state가 구현되어 있어야 합니다.'
    );
  });

  await t.test('2. [스텝 전환 시 자동 TTS 발화] 감지기 state에 ##CK3_TTS## 콘솔 명령이 바인딩되어 있어야 함', () => {
    // 스텝 변경 감지 state 블록 추출
    const detectorMatch = content.match(
      /state\s*=\s*\{[\s\S]*?tutorial_step_tts_trigger[\s\S]*?\}/
    );

    assert.ok(detectorMatch, 'tutorial_step_tts_trigger state 블록이 존재해야 합니다.');
    const detectorBlock = detectorMatch[0];

    assert.ok(
      detectorBlock.includes('GetVariableSystem.Set') &&
        detectorBlock.includes('tutorial_current_step_text'),
      '감지기 state에서 현재 스텝 텍스트를 변수에 갱신(Set)해야 합니다.'
    );
    assert.ok(
      detectorBlock.includes('##CK3_TTS##') &&
        detectorBlock.includes('Tutorial.GetStepName') &&
        detectorBlock.includes('Tutorial.GetStepText'),
      '감지기 state에서 새 스텝 제목과 본문으로 ##CK3_TTS## 콘솔 명령을 실행해야 합니다.'
    );
  });

  await t.test('3. [변수 수명주기 초기화] _show 및 _hide, 닫기 버튼에서 이전 스텝 변수가 초기화되어야 함', () => {
    const showMatch = content.match(/state\s*=\s*\{[\s\S]*?name\s*=\s*_show[\s\S]*?\}/);
    const hideMatch = content.match(/state\s*=\s*\{[\s\S]*?name\s*=\s*_hide[\s\S]*?\}/);

    assert.ok(showMatch, '_show state가 존재해야 합니다.');
    assert.ok(hideMatch, '_hide state가 존재해야 합니다.');

    assert.ok(
      showMatch[0].includes("GetVariableSystem.Clear('tutorial_current_step_text')"),
      '_show 시점에 이전 스텝 변수를 Clear하여 창 진입 시 첫 스텝이 즉시 발화되도록 해야 합니다.'
    );
    assert.ok(
      hideMatch[0].includes("GetVariableSystem.Clear('tutorial_current_step_text')"),
      '_hide 시점에 스텝 변수를 Clear하여 다음 오픈 시 정상 발화되도록 해야 합니다.'
    );
  });

  await t.test('4. [반복 버튼 낭독 연동] repeat 버튼 클릭 시 현재 스텝을 강제 재낭독(FORCE)해야 함', () => {
    const repeatMatch = content.match(
      /button_standard\s*=\s*\{[\s\S]*?Tutorial\.HasTransition\('repeat'\)[\s\S]*?\}/
    );
    assert.ok(repeatMatch, 'repeat 버튼 블록이 존재해야 합니다.');
    assert.ok(
      repeatMatch[0].includes('##CK3_TTS_FORCE##'),
      'repeat 버튼 클릭 시 현재 스텝 강제 재낭독(##CK3_TTS_FORCE##) 명령이 바인딩되어 있어야 합니다.'
    );
  });
});
