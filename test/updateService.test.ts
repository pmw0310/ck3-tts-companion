import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isSafeExternalUrl,
  isSafeReleaseAssetUrl,
  getAppMetadata,
  GITHUB_REPO_URL
} from '@/main/updateService';

describe('업데이트 서비스 및 메타데이터 무결성 검증', () => {
  it('1. getAppMetadata: 기본 제작자 및 레포지토리 정보 반환', () => {
    const meta = getAppMetadata();
    assert.strictEqual(meta.author, 'BlackOlf');
    assert.strictEqual(meta.productName, 'CK3 TTS Companion');
    assert.strictEqual(meta.repoUrl, GITHUB_REPO_URL);
    assert.ok(meta.version.length > 0);
  });

  it('2. isSafeExternalUrl & isSafeReleaseAssetUrl: GitHub 및 허용된 도메인 검증', () => {
    assert.strictEqual(isSafeExternalUrl('https://github.com/pmw0310/ck3-tts-companion'), true);
    assert.strictEqual(isSafeExternalUrl('https://github.com/pmw0310/ck3-tts-companion/releases/tag/v1.5.0'), true);
    assert.strictEqual(isSafeExternalUrl('https://aistudio.google.com/apikey'), true);
    assert.strictEqual(isSafeExternalUrl('https://steamcommunity.com/sharedfiles/filedetails/?id=3824371603'), true);

    // 바이너리 릴리스 에셋 다운로드는 GitHub 공식 릴리스 도메인만 허용
    assert.strictEqual(isSafeReleaseAssetUrl('https://github.com/pmw0310/ck3-tts-companion/releases/download/v1.11.0/app.exe'), true);
    assert.strictEqual(isSafeReleaseAssetUrl('https://objects.githubusercontent.com/github-production-release-asset/app.exe'), true);
    assert.strictEqual(isSafeReleaseAssetUrl('https://steamcommunity.com/sharedfiles/filedetails/?id=3824371603'), false);

    // 위험하거나 유효하지 않은 URL 차단
    assert.strictEqual(isSafeExternalUrl('javascript:alert(1)'), false);
    assert.strictEqual(isSafeExternalUrl('file:///etc/passwd'), false);
    assert.strictEqual(isSafeExternalUrl('http://malicious-site.com/exploit'), false);
    assert.strictEqual(isSafeExternalUrl('not-a-valid-url'), false);
  });
});
