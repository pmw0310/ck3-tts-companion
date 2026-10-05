import test from 'node:test';
import assert from 'node:assert/strict';
import {
  transliterateLatinWord,
  convertLatinPhrasesInText,
  LATIN_LEXICON_MAP
} from '@/main/latinTransliteration';
import { sanitizeCk3Text } from '@/main/textSanitizer';

test('라틴어 기도문, 성경 구절 및 격언 한글 독음 변환 엔진 검증', async (t) => {
  await t.test('1. [단어 음차 검증] 개별 라틴어 단어의 교회 라틴어 음가 변환', () => {
    // 사용자 스크린샷 등장 단어들
    assert.strictEqual(transliterateLatinWord('Et'), '에트');
    assert.strictEqual(transliterateLatinWord('operam'), '오페람');
    assert.strictEqual(transliterateLatinWord('detis'), '데티스');
    assert.strictEqual(transliterateLatinWord('ut'), '우트');
    assert.strictEqual(transliterateLatinWord('quieti'), '퀴에티');
    assert.strictEqual(transliterateLatinWord('sitis'), '시티스');
    assert.strictEqual(transliterateLatinWord('vestrum'), '베스트룸');
    assert.strictEqual(transliterateLatinWord('agatis'), '아가티스');
    assert.strictEqual(transliterateLatinWord('operemini'), '오페레미니');
    assert.strictEqual(transliterateLatinWord('manibus'), '마니부스');
    assert.strictEqual(transliterateLatinWord('vestris'), '베스트리스');
    assert.strictEqual(transliterateLatinWord('sicut'), '시쿠트');
    assert.strictEqual(transliterateLatinWord('vobis'), '보비스');

    // 특수 합자(æ, œ) 및 교회식 c(체/치), ti(치) 음소 검증
    assert.strictEqual(transliterateLatinWord('præcepimus'), '프레체피무스');
    assert.strictEqual(transliterateLatinWord('negotium'), '네고치움');
    assert.strictEqual(transliterateLatinWord('gratia'), '그라치아');
  });

  await t.test('2. [대표 격언 사전 검증] 주요 라틴어 명문 및 구호 매핑', () => {
    assert.strictEqual(LATIN_LEXICON_MAP['deus vult'], '데우스 불트');
    assert.strictEqual(LATIN_LEXICON_MAP['pax vobiscum'], '팍스 보비스쿰');
    assert.strictEqual(LATIN_LEXICON_MAP['ora et labora'], '오라 에트 라보라');
    assert.strictEqual(LATIN_LEXICON_MAP['mea culpa'], '메아 쿨파');
    assert.strictEqual(LATIN_LEXICON_MAP['memento mori'], '메멘토 모리');
    assert.strictEqual(LATIN_LEXICON_MAP['carpe diem'], '카르페 디엠');

    const result = convertLatinPhrasesInText('우리는 외쳤다. "Deus Vult!" 그리고 평화가 깃들었다.');
    assert.ok(result.includes('데우스 불트'));
  });

  await t.test('3. [사용자 실전 스크린샷 문장] 데살로니가전서 성경 구절 인용문 전체 변환', () => {
    const rawLatinQuote =
      '"Et operam detis ut quieti sitis, et ut vestrum negotium agatis, et operemini manibus vestris, sicut præcepimus vobis."';
    const converted = convertLatinPhrasesInText(rawLatinQuote);

    // 알파벳이 전부 한글 독음으로 변환되었는지 검증
    assert.ok(!/[a-zA-Zæœ]/.test(converted), '변환 결과에 잔류 라틴 알파벳이 없어야 합니다.');
    assert.ok(converted.includes('에트 오페람 데티스 우트 퀴에티 시티스'));
    assert.ok(converted.includes('베스트룸 네고치움 아가티스'));
    assert.ok(converted.includes('마니부스 베스트리스, 시쿠트 프레체피무스 보비스'));
  });

  await t.test('4. [통합 파이프라인] sanitizeCk3Text 연동 및 한글 조사 보정 무결성 검증', () => {
    const input =
      '"Et operam detis ut quieti sitis, et ut vestrum negotium agatis, et operemini manibus vestris, sicut præcepimus vobis." 내 주교 주교 카난(이)가 아침 기도 시간에 말했다. 그 순간 명료한 깨달음이 찾아와, 잠시 숨을 쉬는 것도 잊을 정도였다.';

    const sanitized = sanitizeCk3Text(input);

    // 라틴어 구절이 한글로 유창하게 변환되었는지 확인
    assert.ok(sanitized.includes('에트 오페람 데티스'));
    assert.ok(sanitized.includes('프레체피무스 보비스'));

    // 한국어 조사 '(이)가'가 '카난이' 또는 '카난이가'로 자연스럽게 정제되었는지 확인
    assert.ok(sanitized.includes('주교 카난이가') || sanitized.includes('주교 카난이'));
    assert.ok(sanitized.includes('아침 기도 시간에 말했다'));
    assert.ok(sanitized.includes('명료한 깨달음이 찾아와'));

    // 원문 뒤의 한국어 문장이 100% 온전하게 보존되었는지 확인
    assert.ok(!sanitized.includes('Et operam'));
  });

  await t.test('5. [비라틴어 보존] 일반 영문 대문자 약어는 오변환되지 않아야 함', () => {
    const mixed = 'UI 설정에서 DLC 확인 완료';
    const result = convertLatinPhrasesInText(mixed);
    assert.strictEqual(result, mixed, '대문자 시스템 약어는 그대로 보존되어야 합니다.');
  });

  await t.test('6. [사용자 실전 제보 2] 베드로전서 2장 9절 (콜론 및 쉼표 포함 인용문 전수 변환)', () => {
    const rawInput =
      '"Vos autem genus electum, regale sacerdotium, gens sancta, populus acquisitionis: ut virtutes annuntietis eius qui de tenebris vos vocavit in admirabile lumen suum." "내 주교 주교 카난이 아침 기도 시간에 말했다. 그 순간 명료한 깨달음이 찾아와, 잠시 숨을 쉬는 것도 잊을 정도였다.';

    const sanitized = sanitizeCk3Text(rawInput);

    // 1. 잔류 라틴 알파벳이 0개여야 함
    const latinAlphaMatch = sanitized.match(/[a-zA-ZæœÆŒ]/g);
    assert.strictEqual(latinAlphaMatch, null, '변환 결과에 알파벳이 하나도 남아있지 않아야 합니다.');

    // 2. 콜론 앞뒤 구절이 전부 유창한 한글로 변환되었는지 검증
    assert.ok(sanitized.includes('보스 아우템'));
    assert.ok(sanitized.includes('제누스 엘렉툼'));
    assert.ok(sanitized.includes('레갈레 사체르도치움'));
    assert.ok(sanitized.includes('젠스 산크타'));
    assert.ok(sanitized.includes('포풀루스 아퀴지치오니스') || sanitized.includes('포풀루스 아퀴시치오니스'));
    assert.ok(sanitized.includes('비르투테스 안눈치에티스'));
    assert.ok(sanitized.includes('에이우스 퀴 데 테네브리스'));
    assert.ok(sanitized.includes('루멘 수움'));

    // 3. 한국어 본문도 100% 온전히 유지되어야 함
    assert.ok(sanitized.includes('내 주교 주교 카난이 아침 기도 시간에 말했다'));
    assert.ok(sanitized.includes('명료한 깨달음이 찾아와'));
  });
});

