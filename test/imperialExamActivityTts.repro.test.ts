import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 과거 시험(Imperial Examination) 등 활동 거점(locale) 이벤트 자동 TTS 침묵 재현 테스트
 * - activity_event_widget(_base)는 visible = HasOpenEvent 로 숨김/표시가 전환되는데,
 *   숨김 상태에서는 trigger_when이 평가되지 않고 표시되는 순간 이미 조건이 참이라 엣지가 발생하지 않음
 * - 결과: 첫 이벤트 표시 시 자동 낭독이 발화되지 않고 수동(FORCE) 버튼만 동작
 * - 해결: 위젯 표시 시점(_show)에 자동 낭독 상태로 직접 연결(next)
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

describe('활동 이벤트 위젯 표시 시점 자동 TTS 발화 검증 (과거 시험)', () => {
  const content = fs.readFileSync(ACTIVITY_GUI, 'utf-8');

  for (const typeHeader of ['type activity_event_widget = margin_widget', 'type activity_event_widget_base = widget']) {
    it(`${typeHeader}: _show 상태에서 tts_activity_event_auto_play로 연결되어야 한다`, () => {
      const block = extractTypeBlock(content, typeHeader);
      const showStateRegex = /state\s*=\s*\{\s*name\s*=\s*_show\b[^}]*next\s*=\s*tts_activity_event_auto_play/;
      assert.ok(showStateRegex.test(block), '위젯 표시(_show) 시 자동 낭독 상태로 next 연결이 필요합니다');
    });
  }
});
