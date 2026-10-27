import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * CK3 게임 업데이트 대비 바닐라 드리프트(Upstream Drift) 리베이스 및
 * Jomini GUI 단일 on_start 체이닝 / CRLF·BOM 무결성 회귀 테스트 (mod-compat-harness)
 */
describe('CK3 모드 호환성 리베이스 및 Jomini State 무결성 검증 (mod-compat-harness)', () => {
  const modGuiDir = path.resolve(process.cwd(), 'ck3-mod/gui');

  it('1. [cooltip.gui] 최신 바닐라 TenetTooltipTypes/game_concept_tooltip 보존 및 유물 툴팁 자동 재생 비활성화(수동 전용) 검증', () => {
    const filePath = path.join(modGuiDir, 'shared/cooltip.gui');
    const buf = fs.readFileSync(filePath);
    const content = buf.toString('utf8');

    // UTF-8 BOM 검증
    assert.strictEqual(buf[0], 0xef);
    assert.strictEqual(buf[1], 0xbb);
    assert.strictEqual(buf[2], 0xbf);

    // 최신 바닐라 패치 구조 보존 확인
    assert.ok(
      content.includes('template game_concept_tooltip'),
      'cooltip.gui에 최신 바닐라 template game_concept_tooltip이 보존되어야 합니다.'
    );
    assert.ok(
      content.includes('types TenetTooltipTypes'),
      'cooltip.gui에 최신 바닐라 types TenetTooltipTypes가 보존되어야 합니다.'
    );

    // 유물 툴팁 자동 재생 비활성화 검증: 호버 시 자동 재생 state가 없어야 함
    assert.strictEqual(
      content.includes('name = tts_artifact_auto_play'),
      false,
      'cooltip.gui에 유물 툴팁 자동 재생 state(tts_artifact_auto_play)가 없어야 합니다 (사용자 요청: 자동 재생 비활성화).'
    );

    // 수동 낭독 스피커 버튼 및 F 단축키 보존 검증
    assert.ok(
      content.includes('name = "tts_artifact_speak_button"'),
      'cooltip.gui에 수동 낭독 스피커 버튼(tts_artifact_speak_button)이 유지되어야 합니다.'
    );
    assert.ok(
      content.includes('shortcut = "army_split_half"'),
      'cooltip.gui에 수동 낭독 단축키(F - army_split_half)가 유지되어야 합니다.'
    );
  });

  it('2. [window_legend_chronicle.gui / window_succession_event.gui] 전설 연대기 수동 낭독(스피커 버튼/F 단축키) 및 승계 창 단일 on_start 체이닝 검증', () => {
    const legendText = fs.readFileSync(path.join(modGuiDir, 'window_legend_chronicle.gui'), 'utf8');

    // 전설 연대기는 자동 재생이 배제되고 수동 스피커 버튼 및 F 단축키(army_split_half) 다이렉트 바인딩으로 전환됨
    assert.strictEqual(
      legendText.includes('name = tts_legend_auto_play'),
      false,
      'window_legend_chronicle.gui에 자동 재생 state(tts_legend_auto_play)가 없어야 합니다 (수동 전용 전환).'
    );
    assert.ok(
      legendText.includes('shortcut = "army_split_half"'),
      'window_legend_chronicle.gui에 수동 낭독 단축키(F)가 존재해야 합니다.'
    );
    assert.ok(
      legendText.includes('name = "tts_speak_button"'),
      'window_legend_chronicle.gui에 스피커 버튼(tts_speak_button)이 존재해야 합니다.'
    );
    assert.ok(
      legendText.includes("onclick = \"[PdxGuiTriggerAllAnimations('tts_legend_speak_force')]\""),
      'window_legend_chronicle.gui 스피커 버튼에 다이렉트 onclick CloseGameView 실행 명령이 구현되어 있어야 합니다.'
    );

    const successionText = fs.readFileSync(path.join(modGuiDir, 'window_succession_event.gui'), 'utf8');
    const successionShowMatch = successionText.match(
      /state\s*=\s*\{\s*name\s*=\s*_show[\s\S]*?\r?\n\t\}/
    );
    assert.ok(successionShowMatch, 'window_succession_event.gui 루트 _show 블록이 존재해야 합니다.');
    assert.strictEqual(
      (successionShowMatch[0].match(/^\s*on_start\s*=/gm) ?? []).length,
      1,
      'window_succession_event.gui 루트 _show는 단일 on_start만 가져야 합니다.'
    );
    assert.ok(
      successionShowMatch[0].includes('next = tts_clear_ruler_transition_fade'),
      '_show는 tts_clear_ruler_transition_fade로 체이닝되어야 합니다.'
    );
  });

  it('4. [CRLF 줄바꿈 무결성] 바닐라 CRLF 기반 GUI 파일에 LF 혼입(MIXED)이나 LF 변질이 없어야 함', () => {
    const crlfTargets = [
      'window_activity_locale.gui',
      'window_court_events.gui',
      'window_royal_court.gui',
      'event_windows/visit_settlement_window.gui',
      'event_windows/scheme_conclusion_event_no_header.gui',
      'event_windows/scheme_failed_event.gui',
      'event_windows/scheme_successful_event.gui'
    ];

    for (const rel of crlfTargets) {
      const buf = fs.readFileSync(path.join(modGuiDir, rel));
      let lfOnly = 0;
      for (let i = 0; i < buf.length; i++) {
        if (buf[i] === 0x0a && (i === 0 || buf[i - 1] !== 0x0d)) {
          lfOnly++;
        }
      }
      assert.strictEqual(lfOnly, 0, `${rel} 파일에 CRLF가 아닌 단독 LF(${lfOnly}개)가 섞여 있지 않아야 합니다.`);
    }
  });

  it('5. [로컬라이제이션 무결성] tts_companion_l_*.yml 핵심 키(궁정 툴팁, 모험가 전환, 모험가 수장 칭호) 및 UTF-8 with BOM 검증', () => {
    const korFiles = [
      'ck3-mod/localization/korean/replace/tts_companion_l_korean.yml',
      'ck3-mod/localization/replace/korean/tts_companion_l_korean.yml'
    ];
    const engFiles = [
      'ck3-mod/localization/english/replace/tts_companion_l_english.yml',
      'ck3-mod/localization/replace/english/tts_companion_l_english.yml'
    ];

    for (const rel of [...korFiles, ...engFiles]) {
      const filePath = path.resolve(process.cwd(), rel);
      const buf = fs.readFileSync(filePath);

      // UTF-8 BOM 검증 (0xEF, 0xBB, 0xBF)
      assert.strictEqual(buf[0], 0xef, `${rel} 파일은 UTF-8 BOM(0xEF)으로 시작해야 합니다.`);
      assert.strictEqual(buf[1], 0xbb, `${rel} 파일은 UTF-8 BOM(0xBB)으로 시작해야 합니다.`);
      assert.strictEqual(buf[2], 0xbf, `${rel} 파일은 UTF-8 BOM(0xBF)으로 시작해야 합니다.`);

      const content = buf.toString('utf8');
      assert.ok(content.includes('TTS_COURT_EVENT_TOOLTIP:0'), `${rel}에 TTS_COURT_EVENT_TOOLTIP 키가 정의되어 있어야 합니다.`);
      assert.ok(content.includes('switch_adventurer:0'), `${rel}에 switch_adventurer 키가 정의되어 있어야 합니다.`);
    }

    for (const rel of korFiles) {
      const content = fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');
      assert.ok(content.includes('duke_landless_adventurer_camp_wanderers:0 "부군"'));
      assert.ok(content.includes('duchess_landless_adventurer_camp_wanderers:0 "부인"'));
      assert.ok(content.includes('duke_landless_adventurer_camp_scholars:0 "부군"'));
      assert.ok(content.includes('duchess_landless_adventurer_camp_scholars:0 "부인"'));
    }
  });
});

