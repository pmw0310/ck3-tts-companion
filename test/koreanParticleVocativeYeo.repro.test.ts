import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeCk3Text } from '../src/main/textSanitizer';

test('한국어 호격 조사 (이)여 및 (이)시여 오변환 방지 재현 테스트', async (t) => {
  await t.test('1. 받침 없는 명사 뒤 "(이)여"는 "가여"가 아니라 "여"로 변환되어야 한다 (사용자 보고 케이스: 형제(이)여 -> 형제여)', () => {
    const input = '"형제(이)여, 어찌하여 나를 바라보지 않는 겁니까?"';
    const expected = '"형제여, 어찌하여 나를 바라보지 않는 겁니까?"';
    const result = sanitizeCk3Text(input);

    assert.equal(
      result,
      expected,
      `"형제(이)여"가 "${result}"(으)로 잘못 변환되었습니다. "형제여"가 되어야 합니다.`
    );
  });

  await t.test('2. 받침 있는 명사 뒤 "(이)여"는 "이여"로 변환되어야 한다 (예: 벗(이)여 -> 벗이여, 신(이)여 -> 신이여)', () => {
    const input1 = '벗(이)여, 어서 오게.';
    const expected1 = '벗이여, 어서 오게.';
    assert.equal(sanitizeCk3Text(input1), expected1);

    const input2 = '신(이)여, 우리를 굽어살피소서.';
    const expected2 = '신이여, 우리를 굽어살피소서.';
    assert.equal(sanitizeCk3Text(input2), expected2);
  });

  await t.test('3. 슬래시 표기 "(이/여)" 및 "(여/이)" 형태도 받침에 맞게 정상 변환되어야 한다', () => {
    assert.equal(sanitizeCk3Text('군주(이/여)'), '군주여');
    assert.equal(sanitizeCk3Text('황제(여/이)'), '황제여');
    assert.equal(sanitizeCk3Text('동포(이/여)'), '동포여');
    assert.equal(sanitizeCk3Text('국왕(이/여)'), '국왕이여');
    assert.equal(sanitizeCk3Text('백성(여/이)'), '백성이여');
  });

  await t.test('4. 호격 존칭 "(이)시여" 형태도 받침에 맞게 정상 변환되어야 한다', () => {
    assert.equal(sanitizeCk3Text('형제(이)시여'), '형제시여');
    assert.equal(sanitizeCk3Text('신(이)시여'), '신이시여');
    assert.equal(sanitizeCk3Text('군주(이)시여'), '군주시여');
    assert.equal(sanitizeCk3Text('국왕(이)시여'), '국왕이시여');
  });

  await t.test('5. 기존 주격 조사 "(이)가" 및 서술격 조사 "(이)다"의 변환에 회귀가 없어야 한다', () => {
    assert.equal(sanitizeCk3Text('철수(이)가 말했다.'), '철수가 말했다.');
    assert.equal(sanitizeCk3Text('영식(이)가 말했다.'), '영식이 말했다.');
    assert.equal(sanitizeCk3Text('이것은 사실(이)다.'), '이것은 사실이다.');
    assert.equal(sanitizeCk3Text('그것은 거짓(이)다.'), '그것은 거짓이다.');
  });
});

