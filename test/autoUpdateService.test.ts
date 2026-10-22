import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matchBestReleaseAsset, isSafeExternalUrl } from '@/main/updateService';

describe('인앱 자동 업데이트 서비스 (updateService) 무결성 검증', () => {
  const mockAssets = [
    {
      name: 'CK3 TTS Companion-1.11.0.exe',
      browser_download_url: 'https://github.com/pmw0310/ck3-tts-companion/releases/download/v1.11.0/CK3-TTS-Companion-1.11.0.exe',
      size: 78500000
    },
    {
      name: 'CK3 TTS Companion-1.11.0-mac-arm64.dmg',
      browser_download_url: 'https://github.com/pmw0310/ck3-tts-companion/releases/download/v1.11.0/CK3-TTS-Companion-1.11.0-mac-arm64.dmg',
      size: 85200000
    },
    {
      name: 'CK3 TTS Companion-1.11.0-mac-x64.dmg',
      browser_download_url: 'https://github.com/pmw0310/ck3-tts-companion/releases/download/v1.11.0/CK3-TTS-Companion-1.11.0-mac-x64.dmg',
      size: 89100000
    },
    {
      name: 'ck3-mod-v1.11.0.zip',
      browser_download_url: 'https://github.com/pmw0310/ck3-tts-companion/releases/download/v1.11.0/ck3-mod-v1.11.0.zip',
      size: 1200000
    }
  ];

  it('1. matchBestReleaseAsset은 현재 실행 플랫폼에 맞는 최적 에셋을 선별해야 한다', () => {
    const matched = matchBestReleaseAsset(mockAssets);
    assert.ok(matched !== undefined, '매칭된 에셋이 존재해야 함');
    assert.ok(matched.downloadUrl.startsWith('https://github.com/'));
    assert.ok(matched.sizeBytes > 0);

    if (process.platform === 'win32') {
      assert.strictEqual(matched.platform, 'win32');
      assert.ok(matched.name.endsWith('.exe'));
    } else if (process.platform === 'darwin') {
      assert.strictEqual(matched.platform, 'darwin');
      assert.ok(matched.name.endsWith('.dmg'));
      if (process.arch === 'arm64') {
        assert.ok(matched.name.includes('arm64'));
      }
    }
  });

  it('2. isSafeExternalUrl은 허용된 안전 도메인(GitHub, AI Studio)만 통과시켜야 한다', () => {
    assert.strictEqual(
      isSafeExternalUrl('https://github.com/pmw0310/ck3-tts-companion/releases'),
      true
    );
    assert.strictEqual(
      isSafeExternalUrl('https://objects.githubusercontent.com/github-production-release-asset/download'),
      true
    );
    assert.strictEqual(
      isSafeExternalUrl('https://malicious-site.com/virus.exe'),
      false
    );
    assert.strictEqual(
      isSafeExternalUrl('http://insecure-domain.org'),
      false
    );
    assert.strictEqual(
      isSafeExternalUrl('javascript:alert(1)'),
      false
    );
  });

  it('3. 에셋 목록이 비어있을 때는 undefined를 안전하게 반환해야 한다', () => {
    const emptyMatch = matchBestReleaseAsset([]);
    assert.strictEqual(emptyMatch, undefined);

    const undefinedMatch = matchBestReleaseAsset(undefined);
    assert.strictEqual(undefinedMatch, undefined);
  });
});

