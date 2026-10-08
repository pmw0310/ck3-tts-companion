import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { startWatchingLogFile } from '@/main/logWatcher';

describe('Jomini 콘솔 잠금 방어 및 logWatcher 스트림 안정성 검증', () => {
  const modGuiDir = path.resolve(__dirname, '../ck3-mod/gui');

  it('모든 GUI 파일의 _hide 애니메이션에 ##CK3_TTS_STOP## 콘솔 명령어가 남아있지 않아야 한다', () => {
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
    assert.ok(guiFiles.length > 0);

    const violations: { file: string; line: string }[] = [];

    // _hide 블록 내부에 ##CK3_TTS_STOP## 이 존재하는지 검사
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
          if (line.includes('{')) {
            hideBraceCount++;
          }
          if (line.includes('##CK3_TTS_STOP##')) {
            violations.push({
              file: path.relative(modGuiDir, filePath),
              line: `Line ${i + 1}: ${line.trim()}`
            });
          }
          if (line.includes('}')) {
            hideBraceCount--;
            if (hideBraceCount <= 0) {
              insideHideBlock = false;
            }
          }
        }
      }
    }

    assert.deepStrictEqual(violations, []);
  });

  it('주요 이벤트 창들의 자동 발화 상태에 delay가 적용되어 있어야 한다', () => {
    const targetFiles = [
      'event_windows/character_event.gui',
      'event_windows/fullscreen_event.gui',
      'event_windows/big_event_window.gui',
      'event_windows/duel_event.gui',
      'event_windows/scheme_preparations_event.gui',
      'event_windows/visit_settlement_window.gui',
      'window_war_results.gui',
      'window_legend_chronicle.gui',
      'window_activity_locale.gui',
      'window_activity.gui',
      'window_succession_event.gui',
      'window_tutorial.gui'
    ];

    for (const relativePath of targetFiles) {
      const fullPath = path.join(modGuiDir, relativePath);
      assert.strictEqual(fs.existsSync(fullPath), true);

      const content = fs.readFileSync(fullPath, 'utf-8');
      // ##CK3_TTS## 콘솔 명령이 포함된 state 블록에 delay가 정의되어 있는지 확인
      const hasTtsStateWithDelay =
        content.includes('delay =') || content.includes('delay=');
      assert.strictEqual(hasTtsStateWithDelay, true, `${relativePath}에 delay가 누락되었습니다.`);
    }
  });

  it('fullscreen_event.gui에서 _show와 fade_in 간의 2중 발화가 없어야 한다', () => {
    const fullPath = path.join(modGuiDir, 'event_windows/fullscreen_event.gui');
    const content = fs.readFileSync(fullPath, 'utf-8');

    // _show 블록 내부에는 ##CK3_TTS## 가 없어야 함
    const lines = content.split('\n');
    let insideShow = false;
    let showHasTts = false;

    for (const line of lines) {
      if (line.includes('name = _show')) {
        insideShow = true;
      }
      if (insideShow) {
        if (line.includes('##CK3_TTS##')) {
          showHasTts = true;
        }
        if (line.includes('}')) {
          insideShow = false;
        }
      }
    }

    assert.strictEqual(showHasTts, false);
    assert.strictEqual(content.includes('name = "fade_in"'), true);
  });

  it('logWatcher가 빠른 연속 파일 변경에 대해 스트림 락을 유지하고 순차적으로 이벤트를 처리해야 한다', async () => {
    const testLogDir = path.resolve(__dirname, '../temp_test_logs_lock');
    if (!fs.existsSync(testLogDir)) {
      fs.mkdirSync(testLogDir, { recursive: true });
    }
    const testLogPath = path.join(testLogDir, 'debug.log');
    fs.writeFileSync(testLogPath, '', 'utf-8');

    const receivedEvents: string[] = [];
    const handle = startWatchingLogFile(testLogPath, (event) => {
      receivedEvents.push(event.title ?? '');
    });

    try {
      // 1번째 청크 쓰기
      fs.appendFileSync(
        testLogPath,
        '[12:00:00][D][console.cpp:1164]: Running console command: effect debug_log = "##CK3_TTS## 첫번째 이벤트|||첫번째 내용##CK3_TTS_END##"\n'
      );

      // chokidar 200ms 폴링 주기 이후 2번째 청크 쓰기
      await new Promise((resolve) => setTimeout(resolve, 350));
      fs.appendFileSync(
        testLogPath,
        '[12:00:01][D][console.cpp:1164]: Running console command: effect debug_log = "##CK3_TTS## 두번째 이벤트|||두번째 내용##CK3_TTS_END##"\n'
      );

      // 충분한 폴링 대기 (600ms)
      await new Promise((resolve) => setTimeout(resolve, 600));

      assert.ok(receivedEvents.includes('첫번째 이벤트'));
      assert.ok(receivedEvents.includes('두번째 이벤트'));
    } finally {
      await handle.stop();
      if (fs.existsSync(testLogPath)) {
        fs.unlinkSync(testLogPath);
      }
      if (fs.existsSync(testLogDir)) {
        fs.rmdirSync(testLogDir);
      }
    }
  });
});
