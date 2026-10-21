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

  it('2. [window_domicile.gui / window_character.gui / interaction_templates.gui] 최신 바닐라 드리프트 복원 및 디버그 은닉 보존 검증', () => {
    const domicileText = fs.readFileSync(path.join(modGuiDir, 'window_domicile.gui'), 'utf8');
    assert.ok(
      domicileText.includes('text = "[Domicile.GetRite.GetName]"'),
      'window_domicile.gui에 최신 바닐라 Domicile.GetRite.GetName이 보존되어야 합니다.'
    );
    assert.ok(
      domicileText.includes('onclick = "[DomicileWindow.PlayBuildingSfx( DomicileBuildingSlot.Self )]"'),
      'window_domicile.gui에 최신 바닐라 PlayBuildingSfx가 보존되어야 합니다.'
    );

    const charText = fs.readFileSync(path.join(modGuiDir, 'window_character.gui'), 'utf8');
    assert.ok(
      charText.includes('visible = "[And( Character.IsRuler, Character.IsClergy )]"'),
      'window_character.gui에 최신 바닐라 성직자 궁정 탭 조건식이 보존되어야 합니다.'
    );
    assert.ok(
      !charText.includes('visible = "[And( InDebugMode, Not( Character.AccessDenied ) )]"'),
      'window_character.gui의 디버그 전용 버튼은 모두 visible = no로 은닉되어야 합니다.'
    );

    const templatesText = fs.readFileSync(path.join(modGuiDir, 'interaction_templates.gui'), 'utf8');
    assert.ok(
      templatesText.includes('datacontext = "[InteractionSchemeInfo.GetOwner]"'),
      'interaction_templates.gui에 최신 바닐라 InteractionSchemeInfo.GetOwner가 보존되어야 합니다.'
    );
  });

  it('3. [window_legend_chronicle.gui / window_succession_event.gui] TTS state 단일 on_start 체이닝 검증', () => {
    const legendText = fs.readFileSync(path.join(modGuiDir, 'window_legend_chronicle.gui'), 'utf8');
    const legendAutoMatch = legendText.match(
      /state\s*=\s*\{\s*name\s*=\s*tts_legend_auto_play[\s\S]*?\r?\n\t\}/
    );
    assert.ok(legendAutoMatch, 'tts_legend_auto_play 블록이 존재해야 합니다.');
    assert.strictEqual(
      (legendAutoMatch[0].match(/^\s*on_start\s*=/gm) ?? []).length,
      1,
      'tts_legend_auto_play는 단일 on_start만 가져야 합니다.'
    );
    assert.ok(
      legendAutoMatch[0].includes('next = tts_legend_console_play'),
      'tts_legend_auto_play는 tts_legend_console_play로 체이닝되어야 합니다.'
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

  it('5. [로컬라이제이션 무결성] 바닐라 누락 키(TRIGGER_BLOCKER_GROUP, 잠재적 경쟁자, 벼농사 파라미터, 논밭 지역) 및 UTF-8 with BOM 검증', () => {
    const locFiles = [
      'ck3-mod/localization/korean/replace/debug_cleanup_l_korean.yml',
      'ck3-mod/localization/replace/korean/debug_cleanup_l_korean.yml',
      'ck3-mod/localization/english/replace/debug_cleanup_l_english.yml',
      'ck3-mod/localization/replace/english/debug_cleanup_l_english.yml'
    ];

    for (const rel of locFiles) {
      const filePath = path.resolve(process.cwd(), rel);
      const buf = fs.readFileSync(filePath);

      // UTF-8 BOM 검증 (0xEF, 0xBB, 0xBF)
      assert.strictEqual(buf[0], 0xef, `${rel} 파일은 UTF-8 BOM(0xEF)으로 시작해야 합니다.`);
      assert.strictEqual(buf[1], 0xbb, `${rel} 파일은 UTF-8 BOM(0xBB)으로 시작해야 합니다.`);
      assert.strictEqual(buf[2], 0xbf, `${rel} 파일은 UTF-8 BOM(0xBF)으로 시작해야 합니다.`);

      const content = buf.toString('utf8');

      // 4대 필수 교정 키 존재 검증
      assert.ok(
        content.includes('TRIGGER_BLOCKER_GROUP:0'),
        `${rel}에 TRIGGER_BLOCKER_GROUP 키가 정의되어 있어야 합니다.`
      );
      assert.ok(
        content.includes('has_relation_potential_rival_trigger:0'),
        `${rel}에 has_relation_potential_rival_trigger 키가 정의되어 있어야 합니다.`
      );
      assert.ok(
        content.includes('rice_cultivators_can_construct_paddy_fields_in_hills_and_jungle_name:0'),
        `${rel}에 rice_cultivators_can_construct_paddy_fields_in_hills_and_jungle_name 키가 정의되어 있어야 합니다.`
      );
      assert.ok(
        content.includes('paddy_fields_region:0'),
        `${rel}에 paddy_fields_region 키가 정의되어 있어야 합니다.`
      );
    }
  });
});

