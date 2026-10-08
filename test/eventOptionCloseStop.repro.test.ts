import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

describe('이벤트 및 창 닫기 시 TTS STOP 신호 방출 무결성 검증 (debug-harness)', () => {
  const modGuiDir = path.resolve(__dirname, '../ck3-mod/gui');

  it('1. shared/event_windows.gui의 button_eventoption에 ##CK3_TTS_STOP## onclick이 존재해야 한다', () => {
    const filePath = path.join(modGuiDir, 'shared/event_windows.gui');
    assert.ok(fs.existsSync(filePath), 'shared/event_windows.gui 파일이 존재해야 합니다.');
    const content = fs.readFileSync(filePath, 'utf-8');

    // button_eventoption 타입 정의 블록 추출
    const match = content.match(/type\s+button_eventoption\s*=\s*button_event_standard\s*\{([\s\S]*?)(?=\n\ttype|\n\})/);
    assert.ok(match, 'button_eventoption 정의를 찾을 수 있어야 합니다.');
    const blockContent = match[1]!;

    const hasStopOnClick =
      blockContent.includes("onclick = \"[ExecuteConsoleCommand('effect info_log = \\\"##CK3_TTS_STOP##\\\"')]\"") ||
      blockContent.includes('##CK3_TTS_STOP##');
    assert.strictEqual(
      hasStopOnClick,
      true,
      'shared/event_windows.gui의 button_eventoption에 ##CK3_TTS_STOP## onclick이 등록되어 있어야 합니다.'
    );
  });

  it('2. letter_event.gui의 button_event_letter에 ##CK3_TTS_STOP## onclick이 존재해야 한다', () => {
    const filePath = path.join(modGuiDir, 'event_windows/letter_event.gui');
    assert.ok(fs.existsSync(filePath), 'letter_event.gui 파일이 존재해야 합니다.');
    const content = fs.readFileSync(filePath, 'utf-8');

    const match = content.match(/button_event_letter\s*=\s*\{([\s\S]*?)(?=\n\t\t\t\t\t\})/);
    assert.ok(match, 'button_event_letter 블록을 찾을 수 있어야 합니다.');
    const blockContent = match[1]!;

    assert.strictEqual(
      blockContent.includes('##CK3_TTS_STOP##'),
      true,
      'letter_event.gui의 button_event_letter에 ##CK3_TTS_STOP## onclick이 등록되어 있어야 합니다.'
    );
  });

  it('3. anonymous_letter_event.gui의 button_event_letter에 ##CK3_TTS_STOP## onclick이 존재해야 한다', () => {
    const filePath = path.join(modGuiDir, 'event_windows/anonymous_letter_event.gui');
    assert.ok(fs.existsSync(filePath), 'anonymous_letter_event.gui 파일이 존재해야 합니다.');
    const content = fs.readFileSync(filePath, 'utf-8');

    const match = content.match(/button_event_letter\s*=\s*\{([\s\S]*?)(?=\n\t\t\t\t\t\})/);
    assert.ok(match, 'button_event_letter 블록을 찾을 수 있어야 합니다.');
    const blockContent = match[1]!;

    assert.strictEqual(
      blockContent.includes('##CK3_TTS_STOP##'),
      true,
      'anonymous_letter_event.gui의 button_event_letter에 ##CK3_TTS_STOP## onclick이 등록되어 있어야 합니다.'
    );
  });

  it('4. window_royal_court.gui의 close_court_view에 ##CK3_TTS_STOP## onclick이 존재해야 한다', () => {
    const filePath = path.join(modGuiDir, 'window_royal_court.gui');
    assert.ok(fs.existsSync(filePath), 'window_royal_court.gui 파일이 존재해야 합니다.');
    const content = fs.readFileSync(filePath, 'utf-8');

    const match = content.match(/button_close\s*=\s*\{[\s\S]*?name\s*=\s*"close_court_view"([\s\S]*?)(?=\n\t\t\})/);
    assert.ok(match, 'close_court_view 블록을 찾을 수 있어야 합니다.');
    const blockContent = match[1]!;

    assert.strictEqual(
      blockContent.includes('##CK3_TTS_STOP##'),
      true,
      'window_royal_court.gui의 close_court_view에 ##CK3_TTS_STOP## onclick이 등록되어 있어야 합니다.'
    );
  });

  it('5. window_legend_chronicle.gui의 닫기 버튼에 ##CK3_TTS_STOP## onclick이 존재해야 한다', () => {
    const filePath = path.join(modGuiDir, 'window_legend_chronicle.gui');
    assert.ok(fs.existsSync(filePath), 'window_legend_chronicle.gui 파일이 존재해야 합니다.');
    const content = fs.readFileSync(filePath, 'utf-8');

    const hasCloseStop =
      content.includes("[LegendChronicleWindow.Close]\")\n\t\t\t\t\t\tonclick = \"[ExecuteConsoleCommand('effect info_log = \\\"##CK3_TTS_STOP##\\\"')]\"") ||
      (content.includes('LegendChronicleWindow.Close') && content.includes('##CK3_TTS_STOP##'));

    assert.strictEqual(
      hasCloseStop,
      true,
      'window_legend_chronicle.gui의 닫기 버튼에 ##CK3_TTS_STOP## onclick이 등록되어 있어야 합니다.'
    );
  });

  it('6. window_activity_locale.gui의 닫기 버튼에 ##CK3_TTS_STOP## onclick이 존재해야 한다', () => {
    const filePath = path.join(modGuiDir, 'window_activity_locale.gui');
    assert.ok(fs.existsSync(filePath), 'window_activity_locale.gui 파일이 존재해야 합니다.');
    const content = fs.readFileSync(filePath, 'utf-8');

    const hasLocaleStop =
      content.includes("[ActivityLocaleWindow.Close]\")\n\t\tonclick = \"[ExecuteConsoleCommand('effect info_log = \\\"##CK3_TTS_STOP##\\\"')]\"") ||
      (content.includes('ActivityLocaleWindow.Close') && content.includes('##CK3_TTS_STOP##'));

    assert.strictEqual(
      hasLocaleStop,
      true,
      'window_activity_locale.gui의 닫기 버튼에 ##CK3_TTS_STOP## onclick이 등록되어 있어야 합니다.'
    );
  });

  it('7. [회귀 방어] 모든 GUI 파일의 _hide 애니메이션에는 ##CK3_TTS_STOP##이 없어야 한다 (콘솔 락 방지)', () => {
    const getGuiFiles = (dir: string): string[] => {
      let results: string[] = [];
      const list = fs.readdirSync(dir);
      for (const file of list) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          results = results.concat(getGuiFiles(fullPath));
        } else if (file.endsWith('.gui')) {
          results.push(fullPath);
        }
      }
      return results;
    };

    const guiFiles = getGuiFiles(modGuiDir);
    const violations: { file: string; line: string }[] = [];

    for (const filePath of guiFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      let insideHideBlock = false;
      let hideBraceCount = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (line.includes('name = _hide') || line.includes('name = "_hide"')) {
          insideHideBlock = true;
          hideBraceCount = 0;
        }

        if (insideHideBlock) {
          if (line.includes('{')) hideBraceCount++;
          if (line.includes('##CK3_TTS_STOP##')) {
            violations.push({
              file: path.relative(modGuiDir, filePath),
              line: `Line ${i + 1}: ${line.trim()}`
            });
          }
          if (line.includes('}')) {
            hideBraceCount--;
            if (hideBraceCount <= 0) insideHideBlock = false;
          }
        }
      }
    }

    assert.deepStrictEqual(violations, [], '_hide 블록 내부에 ##CK3_TTS_STOP## 콘솔 명령어가 포함되어 있으면 안 됩니다.');
  });
});
