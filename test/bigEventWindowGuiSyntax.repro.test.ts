import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('CK3 모드 GUI 무결성 및 구문 검증 (Mod GUI Integrity)', () => {
  const modGuiDir = path.resolve(__dirname, '../ck3-mod/gui');

  /**
   * 디렉토리 내의 모든 .gui 파일을 재귀적으로 수집합니다.
   * @param dir - 탐색 대상 디렉토리 경로
   * @returns .gui 파일 경로 목록
   */
  const getGuiFiles = (dir: string): string[] => {
    const results: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...getGuiFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.gui')) {
        results.push(fullPath);
      }
    }
    return results;
  };

  const guiFiles = getGuiFiles(modGuiDir);

  it('모든 GUI 파일에 깨진 문자(₩)가 없어야 하고 중괄호 쌍({, })이 100% 일치해야 한다', () => {
    assert.ok(guiFiles.length > 0, '검사할 GUI 파일이 1개 이상 존재해야 합니다.');

    for (const filePath of guiFiles) {
      const relativePath = path.relative(path.resolve(__dirname, '..'), filePath);
      const content = fs.readFileSync(filePath, 'utf8');

      // 1. 유효하지 않은 특수문자 검출
      assert.strictEqual(
        content.includes('₩'),
        false,
        `[${relativePath}] 파일 내에 오타 특수문자 "₩"가 포함되어 있으면 안 됩니다.`
      );

      // 2. 중괄호 쌍 일치 검사
      let openCount = 0;
      let closeCount = 0;
      for (const char of content) {
        if (char === '{') openCount++;
        if (char === '}') closeCount++;
      }
      assert.strictEqual(
        openCount,
        closeCount,
        `[${relativePath}] 여는 괄호 { (${openCount}개)와 닫는 괄호 } (${closeCount}개)의 개수가 일치해야 합니다.`
      );
    }
  });

  it('big_event_window.gui에 scheme_conclusion_window 및 theme_icon 정의가 보존되어야 한다', () => {
    const bigEventGuiPath = path.join(modGuiDir, 'event_windows/big_event_window.gui');
    const content = fs.readFileSync(bigEventGuiPath, 'utf8');

    assert.strictEqual(
      content.includes('type scheme_conclusion_window = big_event_window'),
      true,
      '방랑자 모략 결론 창의 기본 타입인 scheme_conclusion_window 정의가 반드시 존재해야 합니다.'
    );

    assert.strictEqual(
      content.includes('name = "theme_icon"'),
      true,
      '바닐라 테마 아이콘(theme_icon) 정의가 반드시 존재해야 합니다.'
    );

    assert.strictEqual(
      content.includes('name = "tts_speak_button"'),
      true,
      'TTS 스피커 버튼(tts_speak_button)이 존재해야 합니다.'
    );

    assert.strictEqual(
      content.includes('name = tts_scheme_conclusion_auto_play'),
      true,
      '모략 결론 창 전용 자동 재생 state(tts_scheme_conclusion_auto_play)가 정의되어 있어야 합니다.'
    );
  });

  it('방랑자 모략 결론 GUI 파일 3종이 정상 등록되어 있고 문법 오류가 없어야 한다', () => {
    const requiredFiles = [
      'event_windows/scheme_successful_event.gui',
      'event_windows/scheme_failed_event.gui',
      'event_windows/scheme_conclusion_event_no_header.gui',
    ];

    for (const relPath of requiredFiles) {
      const fullPath = path.join(modGuiDir, relPath);
      assert.strictEqual(fs.existsSync(fullPath), true, `[${relPath}] 파일이 반드시 존재해야 합니다.`);
      const content = fs.readFileSync(fullPath, 'utf8');
      assert.strictEqual(
        content.includes('scheme_conclusion_window = {'),
        true,
        `[${relPath}] scheme_conclusion_window 타입을 상속/선언해야 합니다.`
      );
    }
  });
});
