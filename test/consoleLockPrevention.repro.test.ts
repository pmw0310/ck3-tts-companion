import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { extractCk3EventsFromChunk } from '@/main/textSanitizer';

/**
 * 디렉터리 내의 모든 .gui 파일을 재귀적으로 수집합니다.
 * @param dirPath - 검색할 디렉터리 경로
 * @returns .gui 파일 절대 경로 배열
 */
const collectGuiFiles = (dirPath: string): string[] => {
  const results: string[] = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectGuiFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.gui')) {
      results.push(fullPath);
    }
  }

  return results;
};

test('CK3 Jomini 콘솔 락 방지 및 TTS 태그 표준화 무결성 검증', async (t) => {
  const modGuiDir = path.resolve(process.cwd(), 'ck3-mod/gui');

  await t.test('1. 모드 내 모든 GUI 파일에 Jomini 파서 충돌을 유발하는 대괄호 [CK3_TTS*] 태그가 0건이어야 함', () => {
    const guiFiles = collectGuiFiles(modGuiDir);
    assert.ok(guiFiles.length >= 12, '최소 12개 이상의 GUI 파일이 검사되어야 합니다.');

    const bracketTagPattern = /\[CK3_TTS(?:_END|_STOP|_FORCE)?\]/;
    const violations: string[] = [];

    for (const filePath of guiFiles) {
      const content = fs.readFileSync(filePath, 'utf8');
      if (bracketTagPattern.test(content)) {
        violations.push(path.relative(process.cwd(), filePath));
      }
    }

    assert.deepEqual(
      violations,
      [],
      `Jomini 데이터 함수 충돌을 유발하는 [CK3_TTS*] 대괄호 태그가 남아있습니다: ${violations.join(', ')}`
    );
  });

  await t.test('2. 12대 핵심 GUI 파일에 안전한 해시 태그(##CK3_TTS*##)가 정상 적용되어 있어야 함', () => {
    const coreFiles = [
      'ck3-mod/gui/event_windows/character_event.gui',
      'ck3-mod/gui/event_windows/letter_event.gui',
      'ck3-mod/gui/event_windows/anonymous_letter_event.gui',
      'ck3-mod/gui/event_windows/duel_event.gui',
      'ck3-mod/gui/event_windows/big_event_window.gui',
      'ck3-mod/gui/window_activity.gui',
      'ck3-mod/gui/window_activity_locale.gui',
      'ck3-mod/gui/window_war_results.gui',
      'ck3-mod/gui/window_succession_event.gui',
      'ck3-mod/gui/interaction_notification_window.gui',
      'ck3-mod/gui/interaction_call_ally_notification_window.gui',
      'ck3-mod/gui/window_court_events.gui'
    ];

    for (const relPath of coreFiles) {
      const fullPath = path.resolve(process.cwd(), relPath);
      assert.ok(fs.existsSync(fullPath), `${relPath} 파일이 존재해야 합니다.`);
      const content = fs.readFileSync(fullPath, 'utf8');
      assert.ok(
        content.includes('##CK3_TTS'),
        `${relPath} 파일에 ##CK3_TTS 태그가 적용되어 있어야 합니다.`
      );
    }
  });

  await t.test('3. 모든 GUI 파일의 중괄호 쌍({, })이 100% 일치해야 함 (바닐라 구조 보존)', () => {
    const guiFiles = collectGuiFiles(modGuiDir);

    for (const filePath of guiFiles) {
      const content = fs.readFileSync(filePath, 'utf8');
      let openCount = 0;
      let closeCount = 0;
      for (const char of content) {
        if (char === '{') openCount++;
        if (char === '}') closeCount++;
      }
      assert.equal(
        openCount,
        closeCount,
        `${path.relative(process.cwd(), filePath)}의 중괄호 열림(${openCount})과 닫힘(${closeCount})이 일치해야 합니다.`
      );
    }
  });

  await t.test('4. extractCk3EventsFromChunk가 신규 해시 태그와 구형 대괄호 태그를 모두 양방향 파싱해야 함', () => {
    // 4-1. 신규 표준 해시 태그
    const newChunk = `[16:25:19][D][console.cpp:1193]: console_success: Executing effect script "debug_log = \\"##CK3_TTS## 신뢰|||성격이 형성되어 가는 과정에서 아이는 타인을 신뢰하는 법을 배워야 합니다.##CK3_TTS_END##\\""`;
    const newEvents = extractCk3EventsFromChunk(newChunk);
    assert.equal(newEvents.length, 1);
    assert.equal(newEvents[0]?.title, '신뢰');
    assert.equal(newEvents[0]?.content, '성격이 형성되어 가는 과정에서 아이는 타인을 신뢰하는 법을 배워야 합니다.');
    assert.equal(newEvents[0]?.isForceReplay, false);

    // 4-2. 신규 강제 재낭독 태그 (##CK3_TTS_FORCE##)
    const forceChunk = `[16:27:00][D][console.cpp:1193]: console_success: Executing effect script "debug_log = \\"##CK3_TTS_FORCE## 전수조사|||영지 내 세부적인 조사를 진행하여 세금 징수를 최적화해야 합니다.##CK3_TTS_END##\\""`;
    const forceEvents = extractCk3EventsFromChunk(forceChunk);
    assert.equal(forceEvents.length, 1);
    assert.equal(forceEvents[0]?.title, '전수조사');
    assert.equal(forceEvents[0]?.content, '영지 내 세부적인 조사를 진행하여 세금 징수를 최적화해야 합니다.');
    assert.equal(forceEvents[0]?.isForceReplay, true);

    // 4-3. 구버전 대괄호 태그 하위 호환성 검증
    const legacyChunk = `[16:20:00][D][console.cpp:1193]: console_success: Executing effect script "debug_log = \\"[CK3_TTS] 과거 사건|||과거 포맷 로그도 정상 추출되어야 합니다.[CK3_TTS_END]\\""`;
    const legacyEvents = extractCk3EventsFromChunk(legacyChunk);
    assert.equal(legacyEvents.length, 1);
    assert.equal(legacyEvents[0]?.title, '과거 사건');
    assert.equal(legacyEvents[0]?.content, '과거 포맷 로그도 정상 추출되어야 합니다.');
    assert.equal(legacyEvents[0]?.isForceReplay, false);
  });

  await t.test('5. 줄바꿈 및 다중 문단이 포함된 실전 게임 이벤트 청크 정상 추출 검증', () => {
    const multiLineChunk = `[16:27:14][D][console.cpp:1164]: Running console command: effect debug_log = "##CK3_TTS## 전수조사|||
    영지 관리관이 새로운 장부를 들고 찾아왔습니다.
    
    장부에는 각 마을의 인구수와 농작물 수확량, 그리고 체납된 세금 내역이 꼼꼼하게 기록되어 있습니다.
    
    '주군, 이번 조사를 통해 우리는 더 많은 세수를 확보할 수 있을 것입니다.'##CK3_TTS_END##"
    [16:27:14][D][console.cpp:1193]: console_success: Executing effect script "debug_log = \\"##CK3_TTS## 전수조사|||
    영지 관리관이 새로운 장부를 들고 찾아왔습니다.
    
    장부에는 각 마을의 인구수와 농작물 수확량, 그리고 체납된 세금 내역이 꼼꼼하게 기록되어 있습니다.
    
    '주군, 이번 조사를 통해 우리는 더 많은 세수를 확보할 수 있을 것입니다.'##CK3_TTS_END##\\""`;

    const events = extractCk3EventsFromChunk(multiLineChunk);
    assert.equal(events.length, 1, '동일 청크 내 중복 이벤트는 1회만 추출되어야 합니다.');
    assert.equal(events[0]?.title, '전수조사');
    assert.ok(events[0]?.content.includes('영지 관리관이 새로운 장부를 들고 찾아왔습니다.'));
    assert.ok(events[0]?.content.includes('이번 조사를 통해 우리는 더 많은 세수를 확보할 수 있을 것입니다.'));
  });
});
