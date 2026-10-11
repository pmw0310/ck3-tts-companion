import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 궁정 이벤트 창(window_court_events.gui)에서 탄원인 등 left_portrait가 없는 상황 시
 * EventWindowData.GetPortraitCharacter('left_portrait').IsFemale 직접 역참조로 인한
 * C++ 널 포인터 에러 및 CopyStringToClipboard 조기 취소 결함 재현 테스트
 */
describe('궁정 이벤트 창(window_court_events.gui) left_portrait 널 가드 무결성 검증', () => {
  const courtGuiPath = path.resolve(__dirname, '../ck3-mod/gui/window_court_events.gui');

  it('1. window_court_events.gui의 left_portrait 호출은 반드시 HasPortraitCharacter 선행 검사를 포함해야 한다', () => {
    const content = fs.readFileSync(courtGuiPath, 'utf-8');
    const lines = content.split('\n');

    const violations: { line: number; text: string }[] = [];
    lines.forEach((line, index) => {
      if (line.includes("GetPortraitCharacter('left_portrait').IsFemale")) {
        // 해당 줄에 HasPortraitCharacter('left_portrait')가 선행 검사로 존재하는지 확인
        if (!line.includes("HasPortraitCharacter('left_portrait')")) {
          violations.push({ line: index + 1, text: line.trim() });
        }
      }
    });

    assert.deepStrictEqual(
      violations,
      [],
      `HasPortraitCharacter('left_portrait') 선행 검사 누락 발견:\n${violations
        .map((v) => `Line ${v.line}: ${v.text}`)
        .join('\n')}`
    );
  });

  it('2. window_court_events.gui의 3중 포트레이트 삼항 연산자는 종결자 ##CK3_TTS_END##를 완벽히 닫아야 한다', () => {
    const content = fs.readFileSync(courtGuiPath, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      if (line.includes('EventWindowData.CopyStringToClipboard') && line.includes('left_portrait')) {
        // 3번째 인자로 ##CK3_TTS_END## 종결자가 명시되어 있는지 확인
        assert.ok(
          line.includes('##CK3_TTS_END##'),
          `CopyStringToClipboard 줄에 3중 중첩 폴백 종결자가 있어야 함: ${line.trim()}`
        );
      }
      if (line.includes('ExecuteConsoleCommand') && line.includes('left_portrait')) {
        assert.ok(
          line.includes('##CK3_TTS_END##'),
          `ExecuteConsoleCommand 줄에 3중 중첩 폴백 종결자가 있어야 함: ${line.trim()}`
        );
      }
    }
  });
});
