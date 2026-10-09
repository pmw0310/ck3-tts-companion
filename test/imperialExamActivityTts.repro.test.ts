import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 과거 시험(Imperial Examination) 등 활동 거점/이벤트 창 수동 낭독(스피커 버튼 및 F키) 전용 무결성 검증
 * - 정책(Option A): 활동 이벤트는 visible 토글 시 엣지 누락 및 연쇄 이벤트 오디오 충돌을 방지하기 위해
 *   자동 낭독 대신 100% 안정적인 수동 낭독(황금 스피커 버튼 및 F 단축키) 전용으로 전환
 * - 검증: 각 활동 이벤트 위젯이 수동 스피커 버튼과 F 단축키를 명확히 보유하고 있는지 검증
 */

const ACTIVITY_GUI = path.resolve(__dirname, '../ck3-mod/gui/window_activity.gui');

/**
 * 지정된 타입 정의 블록 본문을 중괄호 균형으로 추출합니다.
 * @param content - GUI 파일 전체 내용
 * @param typeHeader - 타입 선언 헤더 문자열
 * @returns 타입 블록 본문
 */
const extractTypeBlock = (content: string, typeHeader: string): string => {
  const start = content.indexOf(typeHeader);
  assert.ok(start !== -1, `${typeHeader} 정의가 존재해야 합니다`);
  const braceStart = content.indexOf('{', start);
  let depth = 0;
  for (let i = braceStart; i < content.length; i++) {
    if (content[i] === '{') depth++;
    if (content[i] === '}') depth--;
    if (depth === 0) {
      return content.slice(braceStart, i + 1);
    }
  }
  return content.slice(braceStart);
};

describe('활동 이벤트 위젯 수동 낭독(스피커 버튼 및 F 단축키) 전용 정책 검증', () => {
  const content = fs.readFileSync(ACTIVITY_GUI, 'utf-8');

  for (const typeHeader of ['type activity_event_widget = margin_widget', 'type activity_event_widget_base = widget']) {
    it(`${typeHeader}: 수동 낭독 버튼(tts_speak_button) 및 F 단축키가 구현되어 있어야 한다`, () => {
      const block = extractTypeBlock(content, typeHeader);
      assert.ok(block.includes('name = "tts_speak_button"'), '수동 낭독 버튼이 존재해야 합니다');
      assert.ok(block.includes('shortcut = "army_split_half"'), 'F 단축키가 바인딩되어 있어야 합니다');
      assert.ok(block.includes('##CK3_TTS_FORCE##'), '강제 재낭독(FORCE) 신호가 연결되어 있어야 합니다');
      assert.strictEqual(
        block.includes('tts_activity_event_auto_play'),
        false,
        '자동 낭독 state가 없어야 합니다 (수동 전용 정책)'
      );
    });
  }
});
