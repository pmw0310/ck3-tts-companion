import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanVersionString,
  parseSemVer,
  compareVersions,
  isNewerVersion
} from '../src/shared/versionComparator.js';

describe('SemVer 버전 파싱 및 비교 유틸리티 무결성 검증', () => {
  it('1. cleanVersionString: v 접두사 및 공백 정상 정규화', () => {
    assert.strictEqual(cleanVersionString('v1.4.0'), '1.4.0');
    assert.strictEqual(cleanVersionString('V2.0.1 '), '2.0.1');
    assert.strictEqual(cleanVersionString('  1.0.0  '), '1.0.0');
  });

  it('2. parseSemVer: 주요 버전 및 프리릴리스 정상 파싱', () => {
    const res1 = parseSemVer('1.4.0');
    assert.deepStrictEqual(res1, { major: 1, minor: 4, patch: 0, prerelease: null });

    const res2 = parseSemVer('v2.10.5-beta.1');
    assert.deepStrictEqual(res2, { major: 2, minor: 10, patch: 5, prerelease: 'beta.1' });

    const resInvalid = parseSemVer('invalid-version');
    assert.strictEqual(resInvalid, null);
  });

  it('3. compareVersions: 메이저, 마이너, 패치 버전 비교', () => {
    // 동일 버전
    assert.strictEqual(compareVersions('1.4.0', '1.4.0'), 0);
    assert.strictEqual(compareVersions('v1.4.0', '1.4.0'), 0);

    // 메이저 상위
    assert.strictEqual(compareVersions('2.0.0', '1.4.0'), 1);
    assert.strictEqual(compareVersions('1.4.0', '2.0.0'), -1);

    // 마이너 상위
    assert.strictEqual(compareVersions('1.5.0', '1.4.0'), 1);
    assert.strictEqual(compareVersions('1.3.9', '1.4.0'), -1);

    // 패치 상위
    assert.strictEqual(compareVersions('1.4.1', '1.4.0'), 1);
    assert.strictEqual(compareVersions('1.4.0', '1.4.1'), -1);
  });

  it('4. compareVersions: 정식 릴리스 vs 프리릴리스 비교', () => {
    // 정식 릴리스가 프리릴리스보다 높음
    assert.strictEqual(compareVersions('1.4.0', '1.4.0-beta.1'), 1);
    assert.strictEqual(compareVersions('1.4.0-beta.1', '1.4.0'), -1);
  });

  it('5. isNewerVersion: 상위 버전 출시 여부 판별', () => {
    assert.strictEqual(isNewerVersion('v1.4.1', '1.4.0'), true);
    assert.strictEqual(isNewerVersion('v1.5.0', '1.4.0'), true);
    assert.strictEqual(isNewerVersion('v2.0.0', '1.4.0'), true);
    assert.strictEqual(isNewerVersion('v1.4.0', '1.4.0'), false);
    assert.strictEqual(isNewerVersion('v1.3.9', '1.4.0'), false);
  });
});
