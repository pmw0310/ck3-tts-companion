import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeCk3Text, isValidNarrativeText } from '@/main/textSanitizer';
import { processTtsRequest } from '@/main/ttsService';
import type { AppSettings } from '@/shared/types';

test('별표(*) 특수기호 TTS 정제 및 "별표 하" 발음 방지 검증 (debug-harness)', async (t) => {
  await t.test('1. [단독 및 반복 별표] 단독 * 또는 연속 별표(***, * * *)는 완전히 제거되어 빈 문자열이 되어야 한다', () => {
    assert.strictEqual(sanitizeCk3Text('*'), '');
    assert.strictEqual(sanitizeCk3Text('***'), '');
    assert.strictEqual(sanitizeCk3Text('* * *'), '');
    assert.strictEqual(sanitizeCk3Text('＊'), ''); // 전각 별표
  });

  await t.test('2. [별표 하 패턴] "* 하" 또는 "*하*" 또는 "*하...*" 형태에서 별표가 제거되어 "별표" 낭독 없이 순수 지문만 남아야 한다', () => {
    assert.strictEqual(sanitizeCk3Text('* 하'), '하');
    assert.strictEqual(sanitizeCk3Text('*하*'), '하');
    assert.strictEqual(sanitizeCk3Text('*하...*'), '하...');
    assert.strictEqual(sanitizeCk3Text('* 하... 정말 힘들군.'), '하... 정말 힘들군.');
    assert.strictEqual(sanitizeCk3Text('그는 한숨을 쉬었다. *하*'), '그는 한숨을 쉬었다. 하');
  });

  await t.test('3. [지문 및 마크다운 강조] *한숨* 및 **강조** 서식에서 별표가 제거되어야 한다', () => {
    assert.strictEqual(
      sanitizeCk3Text('*한숨을 내쉬며* "알겠습니다."'),
      '한숨을 내쉬며 "알겠습니다."'
    );
    assert.strictEqual(
      sanitizeCk3Text('**중요한 결정**을 내려야 합니다.'),
      '중요한 결정을 내려야 합니다.'
    );
    assert.strictEqual(
      sanitizeCk3Text('* 불릿 포인트 항목'),
      '불릿 포인트 항목'
    );
  });

  await t.test('4. [단순 별표 텍스트 내러티브 검증] 별표만 있거나 공백만 있는 문자열은 isValidNarrativeText에서 false여야 한다', () => {
    assert.strictEqual(isValidNarrativeText('*'), false);
    assert.strictEqual(isValidNarrativeText('***'), false);
    assert.strictEqual(isValidNarrativeText('* * *'), false);
  });

  await t.test('5. [processTtsRequest 사전 방어] 낭독 요청 텍스트에 별표만 있는 요청은 비어있음으로 안전 거부되어야 한다', async () => {
    const dummySettings: AppSettings = {
      provider: 'system',
      edgeVoice: 'ko-KR-SunHiNeural',
      systemVoice: 'default',
      isAutoPlayEnabled: true,
      volume: 1,
      speechRate: '+0%',
      pitch: '+0Hz',
      isCacheEnabled: false,
      isAudioDramaEnabled: false
    } as unknown as AppSettings;

    const resultOnlyAsterisk = await processTtsRequest({
      text: '* * *',
      settings: dummySettings
    });
    assert.strictEqual(resultOnlyAsterisk.isSuccess, false);
    assert.strictEqual(resultOnlyAsterisk.errorMessage, '낭독할 텍스트가 비어 있습니다.');
  });
});
