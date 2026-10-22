import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  readModVersionFromDir,
  resolveGameModDir,
  resolveSourceModDir
} from '@/main/modSyncService';

describe('CK3 모드 동기화 서비스 (modSyncService) 무결성 검증', () => {
  it('1. resolveSourceModDir는 프로젝트 내 ck3-mod 디렉터리를 정상 감지해야 한다', () => {
    const srcDir = resolveSourceModDir();
    assert.ok(fs.existsSync(srcDir), 'ck3-mod 디렉터리가 존재해야 함');
    assert.ok(
      fs.existsSync(path.join(srcDir, 'descriptor.mod')),
      'descriptor.mod 파일이 존재해야 함'
    );
  });

  it('2. resolveGameModDir는 플랫폼에 맞는 유효한 경로 문자열을 반환해야 한다', () => {
    const gameModDir = resolveGameModDir();
    assert.ok(typeof gameModDir === 'string' && gameModDir.length > 0);
    assert.ok(gameModDir.includes('ck3-tts-companion'));
  });

  it('3. readModVersionFromDir는 descriptor.mod로부터 버전 번호를 정확히 파싱해야 한다', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ck3-mod-test-'));
    try {
      const descriptorContent = `version="1.10.0"\ntags={\n\t"Historical"\n}\nname="CK3 TTS Companion"`;
      fs.writeFileSync(path.join(tempDir, 'descriptor.mod'), descriptorContent, 'utf-8');

      const parsedVersion = readModVersionFromDir(tempDir);
      assert.strictEqual(parsedVersion, '1.10.0');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('4. readModVersionFromDir는 descriptor.mod가 없을 때 metadata.json을 폴백으로 읽어야 한다', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ck3-mod-test-json-'));
    try {
      const metadataContent = JSON.stringify({ name: 'CK3 TTS', version: '2.1.3' });
      fs.writeFileSync(path.join(tempDir, 'metadata.json'), metadataContent, 'utf-8');

      const parsedVersion = readModVersionFromDir(tempDir);
      assert.strictEqual(parsedVersion, '2.1.3');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('5. 디렉터리에 버전 파일이 없을 경우 null을 안전하게 반환해야 한다', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ck3-mod-empty-'));
    try {
      const parsedVersion = readModVersionFromDir(tempDir);
      assert.strictEqual(parsedVersion, null);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

