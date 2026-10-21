import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { extractCk3EventsFromChunk, sanitizeCk3Text } from '@/main/textSanitizer';

describe('유물 툴팁(Artifact Tooltip) TTS 연동 및 텍스트 정제 무결성 검증 (debug-harness)', () => {
  const cooltipGuiPath = path.resolve(
    process.cwd(),
    'ck3-mod/gui/shared/cooltip.gui'
  );

  it('1. [결함 재현 - GUI 검증] cooltip.gui의 artifact_tooltip에 TTS 수동 스피커 버튼 및 F 단축키가 구현되어 있고 자동 재생은 비활성화되어야 한다', () => {
    const content = fs.readFileSync(cooltipGuiPath, 'utf8');

    // artifact_tooltip 위젯 영역 추출
    const artifactTooltipIndex = content.indexOf('type artifact_tooltip = widget');
    assert.ok(
      artifactTooltipIndex !== -1,
      'cooltip.gui에 type artifact_tooltip = widget 선언이 존재해야 합니다.'
    );

    const artifactTooltipChunk = content.substring(
      artifactTooltipIndex,
      artifactTooltipIndex + 5000
    );

    // TTS 자동 재생 비활성화 검증
    assert.strictEqual(
      artifactTooltipChunk.includes('tts_artifact_auto_play'),
      false,
      'artifact_tooltip 내에 자동 재생 state(tts_artifact_auto_play)가 없어야 합니다 (수동 전용 정책).'
    );

    // F 단축키 및 스피커 버튼 존재 여부 검증
    const hasReplayButton =
      artifactTooltipChunk.includes('##CK3_TTS_FORCE##') &&
      artifactTooltipChunk.includes('army_split_half');
    assert.ok(
      hasReplayButton,
      'artifact_tooltip 내에 수동 재낭독 황금 스피커 버튼 및 F 단축키(army_split_half)가 구현되어 있어야 합니다.'
    );
  });

  it('2. [실전 텍스트 검증] 사용자가 제보한 바그다드의 기념품 유물 로그가 정상 추출되어야 한다', () => {
    const rawLogChunk =
      '[21:20:00][D][console.cpp:1193]: console_success: effect info_log = "##CK3_TTS## 바그다드의 기념품|||튼튼한 순례자 휘장입니다. 바그다드에서 획득했으며, 착용자에게 보호의 힘을 불어넣어 준다는 소문이 있습니다.##CK3_TTS_END##"';

    const events = extractCk3EventsFromChunk(rawLogChunk);
    assert.strictEqual(events.length, 1, '1개의 유물 이벤트가 추출되어야 합니다.');
    assert.strictEqual(events[0]?.title, '바그다드의 기념품');
    assert.strictEqual(
      events[0]?.content,
      '튼튼한 순례자 휘장입니다. 바그다드에서 획득했으며, 착용자에게 보호의 힘을 불어넣어 준다는 소문이 있습니다.'
    );
  });

  it('3. [유물 인게임 포맷 검증] 유물 효과 아이콘(@...) 및 서식 태그(#F)가 포함되어도 깨끗하게 정제되어야 한다', () => {
    const rawDescWithFormatting =
      '#F 튼튼한 순례자 휘장입니다. 바그다드에서 획득했으며, @skill_prowess_icon! 기량 +1 및 착용자에게 보호의 힘을 불어넣어 준다는 소문이 있습니다.#!';

    const cleaned = sanitizeCk3Text(rawDescWithFormatting);
    assert.strictEqual(
      cleaned,
      '튼튼한 순례자 휘장입니다. 바그다드에서 획득했으며, 기량 +1 및 착용자에게 보호의 힘을 불어넣어 준다는 소문이 있습니다.'
    );
  });
});
