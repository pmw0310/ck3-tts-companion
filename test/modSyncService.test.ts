import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  CK3_STEAM_APP_ID,
  WORKSHOP_MOD_ID,
  detectInstalledModLocations,
  parseModDescriptorContent,
  parseSteamLibraryFoldersVdf,
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

  it('6. 패러독스 런처가 생성한 스팀 창작마당 ugc_3824371603.mod 파일을 통해 모드를 정상 감지해야 한다', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ck3-ugc-test-'));
    try {
      const paradoxModRoot = path.join(tempRoot, 'Paradox Interactive', 'Crusader Kings III', 'mod');
      const workshopDir = path.join(
        tempRoot,
        'SteamLibrary',
        'steamapps',
        'workshop',
        'content',
        CK3_STEAM_APP_ID,
        WORKSHOP_MOD_ID
      );
      fs.mkdirSync(paradoxModRoot, { recursive: true });
      fs.mkdirSync(workshopDir, { recursive: true });

      fs.writeFileSync(
        path.join(workshopDir, 'descriptor.mod'),
        `version="1.11.3"\nname="CK3 Event Voice Reader (TTS Companion)"\nremote_file_id="${WORKSHOP_MOD_ID}"\n`,
        'utf-8'
      );

      const ugcModContent = [
        'version="1.11.3"',
        'name="CK3 Event Voice Reader (TTS Companion)"',
        `path="${workshopDir.replace(/\\/g, '/')}"`,
        `remote_file_id="${WORKSHOP_MOD_ID}"`
      ].join('\n');
      fs.writeFileSync(
        path.join(paradoxModRoot, `ugc_${WORKSHOP_MOD_ID}.mod`),
        ugcModContent,
        'utf-8'
      );

      const detected = detectInstalledModLocations([paradoxModRoot], []);
      assert.strictEqual(detected.length, 1);
      assert.strictEqual(detected[0]?.installedVersion, '1.11.3');
      assert.strictEqual(detected[0]?.sourceType, 'workshop-descriptor');
      assert.strictEqual(detected[0]?.targetModDir, path.normalize(workshopDir));
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('7. 런처 실행 전이라도 Steam 워크샵 폴더(1158310/3824371603)가 존재하면 직접 감지해야 한다', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ck3-steamlib-test-'));
    try {
      const steamLibDir = path.join(tempRoot, 'Steam');
      const workshopModDir = path.join(
        steamLibDir,
        'steamapps',
        'workshop',
        'content',
        CK3_STEAM_APP_ID,
        WORKSHOP_MOD_ID
      );
      fs.mkdirSync(workshopModDir, { recursive: true });
      fs.writeFileSync(
        path.join(workshopModDir, 'descriptor.mod'),
        `version="1.11.3"\nname="CK3 Event Voice Reader (TTS Companion)"\nremote_file_id="${WORKSHOP_MOD_ID}"\n`,
        'utf-8'
      );

      const detected = detectInstalledModLocations([], [steamLibDir]);
      assert.strictEqual(detected.length, 1);
      assert.strictEqual(detected[0]?.installedVersion, '1.11.3');
      assert.strictEqual(detected[0]?.sourceType, 'workshop-dir');
      assert.strictEqual(detected[0]?.targetModDir, path.normalize(workshopModDir));
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('8. parseSteamLibraryFoldersVdf 및 parseModDescriptorContent가 경로와 메타데이터를 정확히 파싱해야 한다', () => {
    const sampleVdf = `"libraryfolders"\n{\n\t"0"\n\t{\n\t\t"path"\t\t"C:\\\\Program Files (x86)\\\\Steam"\n\t}\n\t"1"\n\t{\n\t\t"path"\t\t"D:\\\\SteamLibrary"\n\t}\n}`;
    const libraries = parseSteamLibraryFoldersVdf(sampleVdf);
    assert.deepStrictEqual(libraries, ['C:\\Program Files (x86)\\Steam', 'D:\\SteamLibrary']);

    const parsedMod = parseModDescriptorContent(
      'version="v1.11.3"\nname="CK3 Event Voice Reader (TTS Companion)"\npath="D:/SteamLibrary/steamapps/workshop/content/1158310/3824371603"\nremote_file_id="3824371603"'
    );
    assert.strictEqual(parsedMod.version, '1.11.3');
    assert.strictEqual(parsedMod.remoteFileId, '3824371603');
    assert.strictEqual(
      parsedMod.modPath,
      'D:/SteamLibrary/steamapps/workshop/content/1158310/3824371603'
    );
  });
});
