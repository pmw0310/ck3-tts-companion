import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { extractCk3EventsFromChunk } from '../src/main/textSanitizer';

/**
 * 🏛️ 전설 연대기(Legend Chronicle) 데이터 미바인딩 공백 이벤트 및 "이벤트" 단독 낭독 결함 재현 테스트
 */
test('전설 연대기 데이터 미바인딩 공백 이벤트 및 "이벤트" 단독 낭독 결함 재현', async (t) => {
  // 실제 사용자의 15:06 및 15:07 debug.log에 기록된 데이터컨텍스트 미바인딩 청크
  const emptyLegendChunk = `[15:06:13][D][console.cpp:1164]: Running console command: effect debug_log = "##CK3_TTS## |||    |||GENDER:M##CK3_TTS_END##"`;

  await t.test('1. [결함 재현] 제목/본문이 모두 빈 공백 청크 유입 시 "이벤트"로 둔갑하여 추출되는 결함', () => {
    const events = extractCk3EventsFromChunk(emptyLegendChunk);

    // [요구사항]: 본문이 실질적인 텍스트 없이 공백만 있는 허위 청크는 0개로 완전히 드랍(무시)되어야 함!
    // 기존 취약점: title = '이벤트', content = '이벤트'로 파싱되어 "이벤트" 세 글자만 낭독됨
    assert.equal(
      events.length,
      0,
      '내용이 없는 빈 전설 연대기 청크는 가짜 "이벤트"로 파싱되지 않고 0개로 무시되어야 합니다.'
    );
  });

  await t.test('2. [GUI 구조 검증] window_legend_chronicle.gui에 trigger_when 데이터 준비 가드가 구현되어 있어야 함', () => {
    const guiPath = path.resolve('ck3-mod/gui/window_legend_chronicle.gui');
    assert.ok(fs.existsSync(guiPath), 'window_legend_chronicle.gui 파일이 존재해야 합니다.');
    const content = fs.readFileSync(guiPath, 'utf8');

    // 1. _show 상태에서 빈 데이터를 즉시 발화하는 취약한 on_start가 없어야 함
    const showBlockMatch = content.match(/state\s*=\s*\{\s*name\s*=\s*_show[\s\S]*?\n\t\}/);
    assert.ok(showBlockMatch, '_show state 블록이 존재해야 합니다.');
    const showBlock = showBlockMatch[0];
    assert.ok(
      !showBlock.includes('##CK3_TTS##'),
      '_show의 on_start에서 0프레임에 빈 데이터를 즉각 발화하지 않아야 합니다.'
    );

    // 2. Legend.GetNameNoTooltip이 비어있지 않을 때 트리거되는 안전한 auto_play state가 구현되어야 함
    assert.ok(
      content.includes('trigger_when = "[And(Not(StringIsEmpty(Legend.GetNameNoTooltip))'),
      'Legend.GetNameNoTooltip이 준비되었을 때만 트리거되는 trigger_when state가 있어야 합니다.'
    );

    // 3. 중괄호 쌍 일치
    let openCount = 0;
    let closeCount = 0;
    for (const char of content) {
      if (char === '{') openCount++;
      if (char === '}') closeCount++;
    }
    assert.equal(openCount, closeCount, '중괄호 열림과 닫힘 개수가 일치해야 합니다.');
  });
});
