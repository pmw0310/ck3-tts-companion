import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { extractCk3EventsFromChunk } from '@/main/textSanitizer';

describe('전설 연대기(Legend Chronicle) TTS 연동 및 조사 정제 검증', () => {
  it('전설 연대기 로그 청크에서 제목, 본문, 성별 및 조사 변환이 완벽히 수행되어야 한다', () => {
    const legendChunk = `[16:15:00][D][console.cpp:1164]: Running console command: effect debug_log = "##CK3_TTS## 용맹한 수호자|||위대하고 거대하며, 그의 업적은 견줄 데가 없다. 이 땅을 좀먹는 소문을 접한 김 궁예(은)는 어려운 업적을 세우겠노라 뜻을 세웠다. 김 궁예의 전설은 경이로운 모험으로 완성되었다. 그의 위대한 전공은 모든 왕이 경탄할 정도였으며, 수많은 귀족과 평민이 전설을 직접 보고 싶은 마음에 찾아오기까지 했다. 하지만 이게 이야기의 끝은 아니다. 김 궁예(이)가 고향으로 돌아왔을 때 그는 위기에 처한 사람들을 돕고 복수를 도왔다. 산적, 맹수, 악인 누구도 분노로 타오르는 그의 검을 피해 가지 못했다. 고향으로 돌아가는 여정은 쉽지 않았지만, 왕자 김 궁예(은)는 승리의 연호를 받으며 도시에 입성했다. 자, 우리 모두 기쁜 마음으로 이 연회를 즐기자. 그의 전설을 기리는 마음으로!|||GENDER:M##CK3_TTS_END##"`;

    const events = extractCk3EventsFromChunk(legendChunk);
    assert.strictEqual(events.length, 1);

    const event = events[0];
    assert.ok(event);
    assert.strictEqual(event.title, '용맹한 수호자');
    assert.strictEqual(event.speakerGender, 'male');

    // 한글 조건부 조사 완벽 변환 검증 (김 궁예는 받침이 없으므로 '는', '가'로 변환)
    assert.ok(event.content.includes('김 궁예는 어려운 업적을'));
    assert.ok(event.content.includes('김 궁예가 고향으로 돌아왔을 때'));
    assert.ok(event.content.includes('왕자 김 궁예는 승리의 연호를'));
    assert.ok(!event.content.includes('(은)는'));
    assert.ok(!event.content.includes('(이)가'));
  });

  it('window_legend_chronicle.gui 모드 파일에 TTS 자동 낭독, 정지 훅 및 황금 스피커 버튼이 올바르게 구현되어 있어야 한다', () => {
    const guiPath = path.resolve(process.cwd(), 'ck3-mod/gui/window_legend_chronicle.gui');
    assert.ok(fs.existsSync(guiPath), 'window_legend_chronicle.gui 파일이 존재해야 합니다');

    const content = fs.readFileSync(guiPath, 'utf-8');

    // 1. 최상위 datacontext 및 state 검증
    assert.ok(content.includes('datacontext = "[LegendChronicleWindow.GetLegend]"'), '최상위 윈도우에 Legend datacontext가 선언되어야 합니다');
    // _hide 애니메이션 상태에 콘솔 락을 유발하는 ##CK3_TTS_STOP##이 없어야 함
    const hideMatch = content.match(/state\s*=\s*\{\s*name\s*=\s*_hide[\s\S]*?\n\t\}/);
    if (hideMatch) {
      assert.ok(!hideMatch[0].includes('##CK3_TTS_STOP##'), '_hide 상태에 콘솔 락을 유발하는 ##CK3_TTS_STOP##이 없어야 합니다');
    }

    // 2. 황금 스피커 버튼 및 F 단축키 검증
    assert.ok(content.includes('name = "tts_speak_button"'), 'tts_speak_button 위젯이 존재해야 합니다');
    assert.ok(content.includes('shortcut = "army_split_half"'), 'F 단축키가 바인딩되어 있어야 합니다');
    assert.ok(content.includes('effect info_log = \\"##CK3_TTS_FORCE## '), '버튼 클릭 시 ##CK3_TTS_FORCE## 강제 재생이 연동되어야 합니다');

    // 3. 중괄호 쌍 일치 검증
    const openBraces = (content.match(/\{/g) || []).length;
    const closeBraces = (content.match(/\}/g) || []).length;
    assert.strictEqual(openBraces, closeBraces, '열린 중괄호와 닫힌 중괄호의 개수가 일치해야 합니다');
  });
});
