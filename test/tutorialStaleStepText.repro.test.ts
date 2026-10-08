import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 튜토리얼에서 '다음'/'반복' 직후 F·스피커로 낭독하면 이전 단계 문단이 재생되는 결함 재현 테스트
 * - 실측(13:55:20 F, 13:55:34 스피커): 단계 전환 직후 Tutorial.GetStepText가 이전 단계 문단을 그대로 반환
 * - 원인: onclick 시점에 즉시 Concatenate(Tutorial.GetStepText)를 평가하여 엔진의 단계 전이 반영 전 값을 전송
 * - 해결: 버튼은 대기 플래그만 세우고, delay + trigger_when + on_finish 상태에서 지연 평가
 */

const TUTORIAL_GUI = path.resolve(__dirname, '../ck3-mod/gui/window_tutorial.gui');
const content = fs.readFileSync(TUTORIAL_GUI, 'utf-8');
const lines = content.split('\n');

/**
 * 지정한 이름의 state 블록 본문을 추출합니다.
 * @param stateName - state 이름
 * @returns state 블록 문자열 (없으면 빈 문자열)
 */
const extractStateBlock = (stateName: string): string => {
  const nameIndex = content.indexOf(`name = ${stateName}`);
  if (nameIndex === -1) return '';
  const endIndex = content.indexOf('\n\t\t}', nameIndex);
  return content.slice(nameIndex, endIndex);
};

describe('튜토리얼 이전 단계 문단 낭독 방지 (지연 평가)', () => {
  it('어떤 onclick도 Tutorial.GetStepText를 즉시 평가하여 TTS를 전송하지 않아야 한다', () => {
    const violations = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => /onclick\s*=/.test(line) && /CK3_TTS(?:_FORCE)?##/.test(line) && /Tutorial\.GetStepText/.test(line))
      .map(({ index }) => index + 1);
    assert.deepStrictEqual(violations, [], `즉시 평가 onclick 라인: ${violations.join(', ')}`);
  });

  it('지연 낭독 state(자동/강제)는 delay와 on_finish에서 최신 단계 문단을 전송해야 한다', () => {
    const autoBlock = extractStateBlock('tutorial_tts_deferred_auto');
    const forceBlock = extractStateBlock('tutorial_tts_deferred_force');
    for (const [block, tag, flag] of [
      [autoBlock, '##CK3_TTS## ', 'tutorial_tts_pending_auto'],
      [forceBlock, '##CK3_TTS_FORCE## ', 'tutorial_tts_pending_force']
    ] as const) {
      assert.ok(block.length > 0, `${flag} state 누락`);
      assert.match(block, /delay\s*=\s*0\.\d+/);
      assert.ok(block.includes(`GetVariableSystem.Exists('${flag}')`), 'trigger_when 플래그 감시 누락');
      assert.ok(block.includes(`on_finish = "[GetVariableSystem.Clear('${flag}')]"`), '플래그 소거 누락');
      assert.ok(/on_finish = "\[ExecuteConsoleCommand/.test(block) && block.includes(tag), 'on_finish 낭독 누락');
    }
  });

  it('다음/이전 버튼은 자동 플래그, F·스피커·반복은 강제 플래그를 세워야 한다', () => {
    const autoSetCount = (content.match(/GetVariableSystem\.Set\('tutorial_tts_pending_auto', 'yes'\)/g) ?? []).length;
    const forceSetCount = (content.match(/GetVariableSystem\.Set\('tutorial_tts_pending_force', 'yes'\)/g) ?? []).length;
    assert.strictEqual(autoSetCount, 2, '다음/이전 2곳');
    assert.strictEqual(forceSetCount, 3, 'F 단축키/스피커/반복 3곳');
  });
});
