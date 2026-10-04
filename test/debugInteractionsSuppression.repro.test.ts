import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 디버그 모드에서 노출되는 CK3 캐릭터 우클릭 디버그 메뉴 상호작용 비활성화 무결성 검증 테스트
 * 주의: special_interaction이나 hidden = yes인 AI 시스템 상호작용(migration_interaction 등)은
 * C++ 엔진이 직접 참조하므로 오버라이드하면 크래시가 발생함.
 * 순수 디버그/치트 상호작용(93개)만 오버라이드해야 함.
 */
test('CK3 캐릭터 디버그 메뉴 상호작용 숨김 오버라이드 무결성 검증', async (t) => {
  const baseDir = path.resolve('ck3-mod/common/character_interactions');
  const zzzFile = path.join(baseDir, 'zzz_hide_debug_interactions.txt');

  const EXPECTED_DEBUG_INTERACTIONS = [
    'change_hunt_success_chance',
    'debug_give_animal_interaction',
    'debug_debug_test_story_interaction',
    'change_tournament_score',
    'add_to_court_interaction',
    'debug_secrets_interaction',
    'add_hook_interaction',
    'set_relation_debug',
    'change_character_weight_interaction',
    'slay_character_interaction',
    'change_cultural_acceptance_debug_interaction',
    'learn_language_debug_interaction',
    'debug_learn_all_tenets_interaction',
    'start_bout_interaction',
    'add_artifact_interaction',
    'take_artifact_interaction',
    'add_artifact_claim_interaction',
    'debug_destroy_artifact_interaction',
    'inspire_interaction',
    'sponsor_inspiration_debug',
    'complete_inspiration_debug',
    'test_effect_localization_interaction',
    'give_criminal_trait_interaction',
    'generate_artifact_with_history_interaction',
    'debug_sex_interaction',
    'debug_change_every_county',
    'do_a_crime_embezzle_interaction',
    'add_glory_interaction',
    'debug_progress_all_active_schemes_interaction',
    'debug_travel_to_ruler_interaction',
    'debug_add_truce_interaction',
    'spawn_epidemic_interaction',
    'spawn_legend_interaction',
    'debug_buff_schemes',
    'debug_clear_agents_from_schemes',
    'debug_make_laamp',
    'debug_add_to_contact_list_interaction',
    'debug_alliance_interaction',
    'create_task_contract_interaction',
    'debug_move_domicile_interaction',
    'debug_populate_contracts',
    'give_infinite_schemes_of_type_interaction',
    'antagonise_court',
    'spawn_courtier_interaction',
    'destroy_title_interaction',
    'debug_change_the_great_steppe',
    'debug_coronation_add_to_guest_subset_interaction',
    'change_coronation_law',
    'debug_change_dynastic_cycle',
    'debug_change_silk_road_cycle',
    'debug_set_mandala_aspect',
    'debug_change_the_christian_church',
    'debug_imprison_simple_interaction',
    'debug_force_next_realm_priest_interaction',
    'debug_change_opinion_interaction',
    'make_lover_interaction',
    'make_soulmate_interaction',
    'make_rival_interaction',
    'make_nemesis_interaction',
    'remove_rival_interaction',
    'make_friend_interaction',
    'learn_secrets_interaction',
    'make_dynasty_house_head_interaction',
    'take_title_interaction',
    'take_domain_interaction',
    'take_realm_interaction',
    'take_vassal_interaction',
    'take_tributary_interaction',
    'make_independent_interaction',
    'start_pregnancy_interaction',
    'get_claim_interaction',
    'claim_all_interaction',
    'get_claim_on_all_creatable_interaction',
    'test_dynasty_prestige_interaction',
    'debug_start_era_of_great_holy_wars_interaction',
    'debug_change_council_task_interaction',
    'debug_trigger_localization_testing_interaction',
    'create_betrothal_interaction',
    'set_relation_interaction',
    'designate_diarch_interaction',
    'start_diarchy_interaction',
    'end_diarchy_interaction',
    'test_cooldown_category_10_days',
    'test_cooldown_category_against_30_days',
    'take_hostage_interaction',
    'release_hostage_interaction',
    'make_noble_family_interaction',
    'destroy_noble_family_interaction',
    'invest_appointment_interaction',
    'transfer_title_army_maa_interaction',
    'debug_impact_house_relation_interaction',
    'debug_spawn_natural_disaster',
    'debug_change_bloc_cohesion'
  ];

  await t.test('1. zzz_hide_debug_interactions.txt 파일이 존재하고 UTF-8 BOM으로 시작해야 함', () => {
    assert.ok(fs.existsSync(zzzFile), 'zzz_hide_debug_interactions.txt 파일이 존재해야 합니다.');
    const buffer = fs.readFileSync(zzzFile);
    assert.equal(buffer[0], 0xef, 'BOM 첫째 바이트는 0xEF여야 합니다.');
    assert.equal(buffer[1], 0xbb, 'BOM 둘째 바이트는 0xBB여야 합니다.');
    assert.equal(buffer[2], 0xbf, 'BOM 셋째 바이트는 0xBF여야 합니다.');
  });

  await t.test('2. 93개 순수 디버그 상호작용 키가 모드에서 is_shown = { always = no }로 오버라이드되어야 함', () => {
    const modFiles = fs.readdirSync(baseDir).filter((f) => f.endsWith('.txt'));
    let combinedContent = '';
    for (const f of modFiles) {
      combinedContent += '\n' + fs.readFileSync(path.join(baseDir, f), 'utf8');
    }

    const missingKeys: string[] = [];
    for (const key of EXPECTED_DEBUG_INTERACTIONS) {
      const keyRegex = new RegExp(`^\\s*${key}\\s*=\\s*\\{`, 'm');
      if (!keyRegex.test(combinedContent)) {
        missingKeys.push(key);
      }
    }

    assert.equal(
      missingKeys.length,
      0,
      `다음 디버그 상호작용 키들이 모드에서 오버라이드되지 않았습니다: ${missingKeys.join(', ')}`
    );
  });

  await t.test('3. 크래시를 유발하는 AI 시스템 상호작용(migration_interaction 등)은 절대 오버라이드되지 않아야 함', () => {
    const content = fs.readFileSync(zzzFile, 'utf8');
    assert.ok(
      !/^\s*migration_interaction\s*=/m.test(content),
      'migration_interaction은 C++ 엔진(NAISituations::HandleMigration)이 참조하므로 오버라이드해서는 안 됩니다.'
    );
    assert.ok(
      !/^\s*refill_maa_nomad_interaction\s*=/m.test(content),
      'refill_maa_nomad_interaction은 AI 로직이므로 오버라이드해서는 안 됩니다.'
    );
  });

  await t.test('4. zzz_hide_debug_interactions.txt의 중괄호 쌍 일치 및 always = no 적용 검증', () => {
    const content = fs.readFileSync(zzzFile, 'utf8');
    let openCount = 0;
    let closeCount = 0;
    for (const char of content) {
      if (char === '{') openCount++;
      if (char === '}') closeCount++;
    }
    assert.equal(openCount, closeCount, `중괄호 열림(${openCount})과 닫힘(${closeCount}) 개수가 일치해야 합니다.`);

    const alwaysNoMatches = content.match(/always\s*=\s*no/g);
    assert.equal(
      alwaysNoMatches?.length,
      EXPECTED_DEBUG_INTERACTIONS.length,
      `전체 ${EXPECTED_DEBUG_INTERACTIONS.length}개의 순수 디버그 상호작용 모두 always = no가 적용되어야 합니다.`
    );
  });
});
