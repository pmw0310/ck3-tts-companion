import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { extractCk3EventsFromChunk, sanitizeCk3Text } from '@/main/textSanitizer';

describe('콘솔 에러 유출 및 쪼개진 파편 스티칭 결함 재현 테스트', () => {
  it('1. sanitizeCk3Text는 "You can\'t add new commands..." 콘솔 오류 문구를 완벽히 제거해야 한다', () => {
    const rawWithEnglishConsoleError =
      "You can't add new commands while the console is still running commands. 수장, 잠시만 기다려주세요.";
    const cleanedEnglish = sanitizeCk3Text(rawWithEnglishConsoleError);
    assert.strictEqual(
      cleanedEnglish.includes("can't add new commands"),
      false,
      `영어 콘솔 오류가 잔류함: ${cleanedEnglish}`
    );
    assert.ok(
      cleanedEnglish.includes('수장, 잠시만 기다려주세요'),
      `본문이 보존되어야 함: ${cleanedEnglish}`
    );

    const rawWithTransliteratedError =
      "이오우 칸't add new commands while the console is still running commands. 수장, 잠시만 기다려주세요.";
    const cleanedTransliterated = sanitizeCk3Text(rawWithTransliteratedError);
    assert.strictEqual(
      cleanedTransliterated.includes("칸't add new commands") ||
        cleanedTransliterated.includes('이오우'),
      false,
      `음차된 콘솔 오류가 잔류함: ${cleanedTransliterated}`
    );
    assert.ok(
      cleanedTransliterated.includes('수장, 잠시만 기다려주세요'),
      `본문이 보존되어야 함: ${cleanedTransliterated}`
    );
  });

  it('2. debug.log 앞부분과 error.log 콘솔 락 에러가 스티칭되더라도 콘솔 에러가 본문에 유출되지 않아야 한다', () => {
    // 실제 사용자 환경에서 발생한 debug.log + error.log 스티칭 청크
    const rawStitchedChunk = `##CK3_TTS## 헌신적인 추종자|||
[11:55:18][E][ai_activity.cpp:415]: AI tried to create an invalid 'activity_hunt' activity with reason: 'Unknown - enable aiwatch to see.'
[11:55:19][E][console.cpp:1245]: You can't add new commands while the console is still running commands.
[11:55:19][E][pdx_persistent_reader.cpp:216]: Error: "Unknown effect: 수장, near line: 1
Unknown effect: 잠시만, near line: 1
Unknown effect:  야영지를 둘러보는데  ONCLICK:CHARACTER,38952  TOOLTIP:CHARACTER,38952  L 하드마르 ! ! !(이)가 나를 멈춰 세웠다. 그는 계속 숨을 가쁘게 내쉬면서 주변을 둘러보고 있었다.
Unknown effect: |||GENDER:M##CK3_TTS_END##, near line: 5" in file: "effect console command" near line: 5`;

    const events = extractCk3EventsFromChunk(rawStitchedChunk);
    assert.ok(events.length > 0, '이벤트가 추출되어야 함');
    const firstEvent = events[0]!;
    assert.strictEqual(
      firstEvent.content.includes("can't add new commands") ||
        firstEvent.content.includes("칸't add new commands") ||
        firstEvent.content.includes('이오우'),
      false,
      `본문에 콘솔 오류가 유출됨: ${firstEvent.content}`
    );
    assert.ok(
      firstEvent.content.includes('수장') && firstEvent.content.includes('하드마르'),
      `본문 내용이 보존되어야 함: ${firstEvent.content}`
    );
  });

  it('3. character_event.gui의 state 내부에서 on_start가 중복되지 않고 분리되어 있어야 한다', () => {
    const guiPath = path.resolve(__dirname, '../ck3-mod/gui/event_windows/character_event.gui');
    const content = fs.readFileSync(guiPath, 'utf-8');

    // 한 state 블록 내에 on_start 가 2개 이상 존재하는지 검사
    const lines = content.split('\n');
    let insideState = false;
    let onStartCount = 0;
    let stateName = '';
    const violations: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (line.includes('state = {')) {
        insideState = true;
        onStartCount = 0;
        stateName = `line ${i + 1}`;
      }
      if (insideState) {
        if (line.includes('name =')) {
          stateName = line.trim();
        }
        if (/^\s*on_start\s*=/.test(line)) {
          onStartCount++;
          if (onStartCount > 1) {
            violations.push(`${stateName} (line ${i + 1}): on_start 중복 선언`);
          }
        }
        if (line.includes('}')) {
          // 간이 블록 닫힘 검사 (상위 state 닫힘)
          if (/^\s*\}\s*$/.test(line)) {
            insideState = false;
          }
        }
      }
    }

    assert.deepStrictEqual(
      violations,
      [],
      `character_event.gui의 state 블록 내 on_start 중복 위반: ${violations.join(', ')}`
    );
  });
});
