import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TRANSLATIONS,
  t,
  setLanguage,
  getCurrentLocale,
  resolveLocaleFromCandidates,
  type TranslationKey
} from '@/renderer/i18n';

describe('i18n 다국어 지원 엔진 무결성 검증', () => {
  it('1. ko와 en 사전 간 모든 번역 키가 누락 없이 100% 상호 일치해야 한다', () => {
    const koKeys = Object.keys(TRANSLATIONS.ko) as TranslationKey[];
    const enKeys = Object.keys(TRANSLATIONS.en) as TranslationKey[];

    const missingInEn = koKeys.filter((key) => !(key in TRANSLATIONS.en));
    const missingInKo = enKeys.filter((key) => !(key in TRANSLATIONS.ko));

    assert.deepEqual(
      missingInEn,
      [],
      `영어(en) 사전에 누락된 번역 키가 존재합니다: ${missingInEn.join(', ')}`
    );
    assert.deepEqual(
      missingInKo,
      [],
      `한국어(ko) 사전에 누락된 번역 키가 존재합니다: ${missingInKo.join(', ')}`
    );
    assert.strictEqual(koKeys.length, enKeys.length);
  });

  it('2. 기본 언어(ko) 설정 시 올바른 한국어 텍스트가 반환되어야 한다', () => {
    setLanguage('ko');
    assert.strictEqual(getCurrentLocale(), 'ko');
    assert.strictEqual(t('header.title'), 'CK3 TTS COMPANION');
    assert.strictEqual(t('card.currentTag'), '현재 낭독 중인 사건');
    assert.strictEqual(t('modal.btnSave'), '설정 저장 및 적용');
  });

  it('3. 영어(en) 설정 시 올바른 영문 텍스트가 반환되어야 한다', () => {
    setLanguage('en');
    assert.strictEqual(getCurrentLocale(), 'en');
    assert.strictEqual(t('card.currentTag'), 'CURRENT EVENT NARRATION');
    assert.strictEqual(t('card.statusIdle'), 'Idle');
    assert.strictEqual(t('card.btnStop'), '⏹️ Stop');
    assert.strictEqual(t('modal.btnSave'), 'Save & Apply Settings');
  });

  it('4. 동적 파라미터 치환({key})이 정상 동작해야 한다', () => {
    setLanguage('ko');
    const resultKo = t('toast.syncSuccess', { copied: 12, removed: 3 });
    assert.strictEqual(resultKo, '✅ CK3 모드 동기화 완료! (복사 12개, 정리 3개)');

    setLanguage('en');
    const resultEn = t('toast.syncSuccess', { copied: 12, removed: 3 });
    assert.strictEqual(resultEn, '✅ CK3 mod synced! (Copied: 12, Removed: 3)');
  });

  it('5. 다시 한국어로 원복 시 정상 동작해야 한다', () => {
    setLanguage('ko');
    assert.strictEqual(getCurrentLocale(), 'ko');
    assert.strictEqual(t('card.statusIdle'), '대기 중');
  });

  it('6. 한글 OS(ko*)로 처음 시작했을 때만 ko가 선택되고 나머지 모든 OS에서는 en이 먼저 선택되어야 한다', () => {
    assert.strictEqual(resolveLocaleFromCandidates(['ko-KR', 'en-US']), 'ko');
    assert.strictEqual(resolveLocaleFromCandidates(['ko']), 'ko');
    assert.strictEqual(resolveLocaleFromCandidates(['KO_KR']), 'ko');
    assert.strictEqual(resolveLocaleFromCandidates(['', '  ', 'ko-KR']), 'ko');

    // 비한글 OS (영어, 일본어, 중국어, 독일어, 프랑스어, 스페인어 등) 및 기본 폴백은 모두 'en'
    assert.strictEqual(resolveLocaleFromCandidates(['en-US', 'ko-KR']), 'en');
    assert.strictEqual(resolveLocaleFromCandidates(['en-GB']), 'en');
    assert.strictEqual(resolveLocaleFromCandidates(['ja-JP']), 'en');
    assert.strictEqual(resolveLocaleFromCandidates(['zh-CN']), 'en');
    assert.strictEqual(resolveLocaleFromCandidates(['de-DE']), 'en');
    assert.strictEqual(resolveLocaleFromCandidates(['fr-FR']), 'en');
    assert.strictEqual(resolveLocaleFromCandidates([]), 'en');
    assert.strictEqual(resolveLocaleFromCandidates([undefined, null, '']), 'en');
  });
});

