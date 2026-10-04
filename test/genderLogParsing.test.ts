import test from 'node:test';
import assert from 'node:assert/strict';
import { extractCk3EventsFromChunk } from '@/main/textSanitizer';

/**
 * CK3 게임 로그의 화자 성별 메타데이터(GENDER:F / GENDER:M) 추출 및 레거시 하위 호환성 검증
 */
test('화자 성별 메타데이터 로그 파싱 무결성 검증', async (t) => {
  await t.test('1. GENDER:F 태그가 포함된 여성 화자 이벤트 정상 파싱', () => {
    const chunk = '[21:30:00][D][console.cpp:1193]: console_success: ##CK3_TTS## 여왕의 서신|||폐하, 동맹군이 전장에 도착하였습니다.|||GENDER:F##CK3_TTS_END##';
    const events = extractCk3EventsFromChunk(chunk);

    assert.equal(events.length, 1);
    assert.equal(events[0]?.title, '여왕의 서신');
    assert.equal(events[0]?.content, '폐하, 동맹군이 전장에 도착하였습니다.');
    assert.equal(events[0]?.speakerGender, 'female');
    assert.equal(events[0]?.isForceReplay, false);
  });

  await t.test('2. GENDER:M 태그가 포함된 남성 화자 강제 재낭독 이벤트 정상 파싱', () => {
    const chunk = '[21:30:05][D][console.cpp:1193]: console_success: ##CK3_TTS_FORCE## 결투의 순간|||나의 검을 받아라.|||GENDER:M##CK3_TTS_END##';
    const events = extractCk3EventsFromChunk(chunk);

    assert.equal(events.length, 1);
    assert.equal(events[0]?.title, '결투의 순간');
    assert.equal(events[0]?.content, '나의 검을 받아라.');
    assert.equal(events[0]?.speakerGender, 'male');
    assert.equal(events[0]?.isForceReplay, true);
  });

  await t.test('3. 성별 태그가 없는 레거시 로그 형식도 100% 정상 하위 호환 파싱', () => {
    const chunk = '[21:30:10][D][console.cpp:1193]: console_success: ##CK3_TTS## 일반 사건|||궁정에서 의문의 소동이 일어났습니다.##CK3_TTS_END##';
    const events = extractCk3EventsFromChunk(chunk);

    assert.equal(events.length, 1);
    assert.equal(events[0]?.title, '일반 사건');
    assert.equal(events[0]?.content, '궁정에서 의문의 소동이 일어났습니다.');
    assert.equal(events[0]?.speakerGender, undefined);
  });
});
