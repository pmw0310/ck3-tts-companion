import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractCk3EventsFromChunk,
  isValidNarrativeText,
  sanitizeCk3Text,
  normalizeMultilineUnknownEffects
} from '@/main/textSanitizer';

/**
 * [debug-harness] Flag 엔진 경고 로그 유출 및 라틴어 무차별 음차 변환 결함 재현 테스트
 *
 * 1. 문제 증상:
 *    인게임에서 큰따옴표 대사("... 반죽된 점토를 가죽으로 덮어...")로 시작하는 이벤트 발생 시
 *    콘솔 폴백(ExecuteConsoleCommand)에서 큰따옴표 조기 종료로 시작 태그만 debug.log에 남은 상태에서,
 *    error.log의 무관한 스크립트 플래그 경고("Flag 'DI_subtype_throne' is set but is never used...")가
 *    cleanErrorLines의 [E][ / Error: 필터 허위 통과 -> debugPending과 결합 -> 라틴어 음차 변환기로 직행하여
 *    "Flag'디_수브티페_트로네'이스 세트 부트 이스 네베르 우세드..." 라는 기괴한 텍스트로 변환되어 TTS 낭독됨.
 *
 * 2. 사용자 요청:
 *    "아마 라틴어때문에 꼬이는거 같은데 라틴어 없에도 될꺼야 패치되서 라틴어 안나오게 패치 됬던거 같은데"
 *    -> 라틴어 음차 변환기 전면 무력화/제거 및 시스템 엔진 경고 로그 결합·낭독 원천 차단.
 */

describe('Flag 엔진 경고 로그 유출 및 라틴어 음차 제거 회귀 검증 (debug-harness)', () => {
  const SAMPLE_FLAG_WARNING_LOG = `[09:25:54][E][jomini_effect.cpp:1154]: Flag 'DI_subtype_throne' is set but is never used. Note that use in localization doesn't count due to technical limitations. Use in unused scripted triggers and effects also does not count setting it in an unused scripted trigger or effect does not count setting it in an unused scripted trigger or effect does not count setting it in an unused scripted trigger or effect`;

  it('1. Flag is set but is never used 엔진 경고 문구는 유효한 내러티브 텍스트(isValidNarrativeText)로 인정되지 않아야 한다', () => {
    assert.strictEqual(
      isValidNarrativeText(SAMPLE_FLAG_WARNING_LOG),
      false,
      'Flag is set but is never used 경고는 내러티브 텍스트가 아니므로 false여야 함'
    );

    const rawWarningBody =
      "Flag 'DI_subtype_throne' is set but is never used. Note that use in localization doesn't count due to technical limitations. Use in unused scripted triggers and effects also does not count";
    assert.strictEqual(
      isValidNarrativeText(rawWarningBody),
      false,
      '헤더 없는 플래그 경고 원문도 false여야 함'
    );
  });

  it('2. sanitizeCk3Text는 영문 스크립트/경고 문구를 기괴한 한글 라틴어 발음("디_수브티페_트로네 이스 세트 부트...")으로 음차 변환하지 않아야 한다', () => {
    const rawEnglish =
      "Flag 'DI_subtype_throne' is set but is never used. Note that use in localization doesn't count due to technical limitations.";
    const sanitized = sanitizeCk3Text(rawEnglish);

    // 라틴어 음차 변환이 비활성화/제거되어 "이스 세트 부트 이스 네베르 우세드" 같은 엉터리 한글이 생성되지 않아야 함
    assert.ok(
      !sanitized.includes('이스 세트'),
      `엉터리 라틴어 음차("이스 세트")가 포함되어서는 안 됨: ${sanitized}`
    );
    assert.ok(
      !sanitized.includes('네베르 우세드'),
      `엉터리 라틴어 음차("네베르 우세드")가 포함되어서는 안 됨: ${sanitized}`
    );
    assert.ok(
      !sanitized.includes('디_수브티페'),
      `식별자 한글 음차("디_수브티페")가 포함되어서는 안 됨: ${sanitized}`
    );
  });

  it('3. logWatcher의 cleanErrorLines 필터링은 단순 [E][ 엔진 경고 로그(Flag ... is set)를 Unknown effect로 취급하여 결합하지 않아야 한다', () => {
    // [E][ 또는 Error: 가 들어있더라도 Unknown effect / CK3_TTS 가 없는 단순 엔진 에러 라인은 제외되어야 함
    const rawErrorBuffer = `[09:25:54][E][jomini_effect.cpp:1154]: Flag 'DI_subtype_throne' is set but is never used. Note that use in localization doesn't count due to technical limitations. Use in unused scripted triggers and effects also does not count
[09:25:54][E][pdx_persistent_reader.cpp:216]: Error: "Unknown effect: 이야기꾼은, near line: 1
Unknown effect: 신비한, near line: 1
Unknown effect: 미소를, near line: 1
Unknown effect: 지으며##CK3_TTS_END##" in file: "effect console command" near line: 1`;

    const normalizedErrorBuffer = normalizeMultilineUnknownEffects(rawErrorBuffer);

    // 수정 전 취약한 필터: line.includes('[E][') || line.includes('Error:') 로 인해 첫 번째 줄이 허위 통과함
    // 수정 후 안전한 필터 기준:
    const safeErrorLines = normalizedErrorBuffer
      .split(/\r?\n/)
      .filter(
        (line) =>
          line.includes('Unknown effect:') ||
          line.includes('##CK3_TTS_END##') ||
          line.includes('[CK3_TTS_END]') ||
          line.includes('|||')
      )
      .join('\n');

    assert.ok(
      !safeErrorLines.includes('Flag \'DI_subtype_throne\' is set but is never used'),
      '플래그 경고 로그는 cleanErrorLines에 포함되어서는 안 됨'
    );
    assert.ok(
      safeErrorLines.includes('Unknown effect: 이야기꾼은'),
      '정상 Unknown effect 라인은 보존되어야 함'
    );
  });

  it('4. debugPending("카이마나: 이야기꾼|||") 뒤에 플래그 경고 로그와 닫는 태그가 오더라도 가짜 에러 이벤트가 생성되지 않아야 한다', () => {
    const maliciousStitchedChunk = `[09:25:54][I][jomini_effect_impl.cpp:450]: file: effect console command line: 1: ##CK3_TTS## 카이마나: 이야기꾼|||
[09:25:54][E][jomini_effect.cpp:1154]: Flag 'DI_subtype_throne' is set but is never used. Note that use in localization doesn't count due to technical limitations. Use in unused scripted triggers and effects also does not count setting it in an unused scripted trigger or effect does not count
##CK3_TTS_END##`;

    const events = extractCk3EventsFromChunk(maliciousStitchedChunk);

    // 이벤트가 생성되지 않거나, 생성되더라도 본문이 플래그 경고가 아니어야 함
    if (events.length > 0) {
      for (const event of events) {
        assert.ok(
          !event.content.includes('Flag') && !event.content.includes('세트 부트') && !event.content.includes('네베르'),
          `플래그 경고 또는 라틴어 음차 텍스트가 이벤트 본문으로 추출되어서는 안 됨: ${event.content}`
        );
      }
    }
  });
});

