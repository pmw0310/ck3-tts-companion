import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const customModsRoot = path.join(projectRoot, 'custom-mods');

/**
 * 동기화할 커스텀 모드 패키지 목록 (본편 안전판 + CFP 호환 패치 + 선택형 고증 문장 서브모드)
 */
const CUSTOM_MOD_PACKAGES = [
  {
    folderName: 'reincarnated-villains-867',
    defaultDisplayName: '[867 북마크] 전생한 악당들 (Reincarnated Villains)',
    defaultEnabled: true,
    tagsJson: '["Bookmarks","Character Interactions","Historical"]',
  },
  {
    folderName: 'reincarnated-villains-867-cfp-compatch',
    defaultDisplayName: '[867 북마크] 전생한 악당들 - CFP 호환 패치 (CFP Compatch)',
    defaultEnabled: 'auto_cfp',
    tagsJson: '["Bookmarks","Portraits","Fixes"]',
  },
  {
    folderName: 'reincarnated-villains-867-historical-flags',
    defaultDisplayName: '[867 북마크] 전생한 악당들 - 고증 문장 패치 (Historical Emblems)',
    defaultEnabled: false,
    tagsJson: '["Bookmarks","Graphics","Historical"]',
  },
];

const LEGACY_MOD_FOLDER_NAMES = ['hitler-867-bookmark'];

/**
 * 현재 운영체제에 따른 CK3 문서 폴더 경로를 반환합니다.
 * @returns {string} CK3 사용자 문서 경로
 */
const resolveCk3DocsDir = () => {
  const homeDir = os.homedir();
  const platform = os.platform();
  if (platform === 'win32') {
    const standardPath = path.join(homeDir, 'Documents', 'Paradox Interactive', 'Crusader Kings III');
    const oneDrivePath = path.join(homeDir, 'OneDrive', 'Documents', 'Paradox Interactive', 'Crusader Kings III');
    if (!fs.existsSync(standardPath) && fs.existsSync(oneDrivePath)) {
      return oneDrivePath;
    }
    return standardPath;
  }
  if (platform === 'darwin') {
    return path.join(homeDir, 'Documents', 'Paradox Interactive', 'Crusader Kings III');
  }
  return path.join(homeDir, '.local', 'share', 'Paradox Interactive', 'Crusader Kings III');
};

/**
 * 대상 파일이 UTF-8 with BOM (0xEF 0xBB 0xBF)과 CRLF 줄바꿈을 유지하도록 보장합니다.
 * @param {string} filePath - 검사 및 보정할 텍스트 파일 경로
 */
const ensureUtf8BomAndCrlf = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== '.txt' && ext !== '.yml' && ext !== '.gui' && ext !== '.asset') {
    return;
  }
  const rawBytes = fs.readFileSync(filePath);
  const hasBom =
    rawBytes.length >= 3 &&
    rawBytes[0] === 0xef &&
    rawBytes[1] === 0xbb &&
    rawBytes[2] === 0xbf;
  let content = (hasBom ? rawBytes.subarray(3) : rawBytes).toString('utf-8');
  if (ext === '.yml') {
    // IDE YAML 포매터가 첫 줄의 `l_korean:` 헤더와 첫 키를 한 줄로 합치는 현상을 자동 복구합니다.
    content = content.replace(/^(\s*l_[a-z_]+:)[ \t]+(\S)/m, '$1\n $2');
  }
  const crlfContent = content.replace(/\r+\n/g, '\n').replace(/\n/g, '\r\n');
  const bomBuffer = Buffer.from([0xef, 0xbb, 0xbf]);
  const bodyBuffer = Buffer.from(crlfContent, 'utf-8');
  fs.writeFileSync(filePath, Buffer.concat([bomBuffer, bodyBuffer]));
};

/**
 * 디렉터리를 재귀적으로 미러링 동기화합니다.
 * @param {string} src - 원본 디렉터리
 * @param {string} dest - 대상 디렉터리
 */
const syncDirectory = (src, dest) => {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const srcEntries = fs.readdirSync(src, { withFileTypes: true });
  const destEntries = fs.readdirSync(dest, { withFileTypes: true });
  const srcNames = new Set(srcEntries.map((e) => e.name));

  for (const destEntry of destEntries) {
    if (!srcNames.has(destEntry.name)) {
      const targetPath = path.join(dest, destEntry.name);
      if (destEntry.isDirectory()) {
        fs.rmSync(targetPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(targetPath);
      }
    }
  }

  for (const srcEntry of srcEntries) {
    const srcPath = path.join(src, srcEntry.name);
    const destPath = path.join(dest, srcEntry.name);
    if (srcEntry.isDirectory()) {
      syncDirectory(srcPath, destPath);
    } else {
      ensureUtf8BomAndCrlf(srcPath);
      fs.copyFileSync(srcPath, destPath);
    }
  }
};

/**
 * 단일 커스텀 모드 패키지를 문서 폴더와 런처 DB에 동기화합니다.
 * @param {object} pkg - 동기화할 모드 패키지 설정
 * @param {string} modRootDir - CK3 문서 mod 디렉터리
 * @param {DatabaseSync | null} db - Paradox 런처 SQLite 인스턴스
 * @param {boolean | undefined} forceHistorical - 고증 서브모드 강제 활성화 여부
 * @returns {{ modEntry: string, shouldEnableInDlcLoad: boolean } | null} 동기화 결과
 */
const syncSingleModPackage = (pkg, modRootDir, db, forceHistorical) => {
  const sourceModDir = path.join(customModsRoot, pkg.folderName);
  if (!fs.existsSync(sourceModDir)) {
    return null;
  }

  const targetModDir = path.join(modRootDir, pkg.folderName);
  const descriptorPath = path.join(sourceModDir, 'descriptor.mod');
  const targetDescriptorPath = path.join(targetModDir, 'descriptor.mod');

  // 패러독스 런처 업로드로 생성된 remote_file_id가 로컬 문서 폴더에 있다면 원본 descriptor.mod로 자동 역동기화하여 증발 방지
  if (fs.existsSync(descriptorPath) && fs.existsSync(targetDescriptorPath)) {
    const srcDesc = fs.readFileSync(descriptorPath, 'utf-8');
    const dstDesc = fs.readFileSync(targetDescriptorPath, 'utf-8');
    const remoteMatch = dstDesc.match(/remote_file_id="(\d+)"/);
    if (remoteMatch?.[1] && !srcDesc.includes('remote_file_id=')) {
      fs.writeFileSync(
        descriptorPath,
        `${srcDesc.trimEnd()}\r\nremote_file_id="${remoteMatch[1]}"\r\n`,
        'utf-8'
      );
      console.log(`ℹ️ [Custom Mod Sync] Workshop remote_file_id 보존 완료: ${remoteMatch[1]}`);
    }
  }

  syncDirectory(sourceModDir, targetModDir);
  let modDisplayName = pkg.defaultDisplayName;
  if (fs.existsSync(descriptorPath)) {
    const rawDesc = fs.readFileSync(descriptorPath, 'utf-8').replace(/^\uFEFF/, '').trimEnd();
    const nameMatch = rawDesc.match(/name="([^"]+)"/);
    if (nameMatch?.[1]) {
      modDisplayName = nameMatch[1];
    }
    const outerDescriptorPath = path.join(modRootDir, `${pkg.folderName}.mod`);
    const normalizedTarget = targetModDir.replace(/\\/g, '/');
    fs.writeFileSync(outerDescriptorPath, `${rawDesc}\r\npath="${normalizedTarget}"\r\n`, 'utf-8');
  }

  const thumbFile = path.join(targetModDir, 'thumbnail.png');
  const resolvedThumbPath = fs.existsSync(thumbFile) ? thumbFile : null;
  const isSubmod = pkg.folderName.endsWith('-historical-flags');
  const isCfpCompatch = pkg.defaultEnabled === 'auto_cfp';
  const dlcLoadCheckPath = path.join(path.dirname(modRootDir), 'dlc_load.json');
  const isCfpActive =
    isCfpCompatch &&
    fs.existsSync(dlcLoadCheckPath) &&
    fs.readFileSync(dlcLoadCheckPath, 'utf-8').includes('ugc_2220098919.mod');
  let shouldEnableInDlcLoad =
    isSubmod && forceHistorical !== undefined
      ? forceHistorical
      : isCfpCompatch
        ? isCfpActive
        : Boolean(pkg.defaultEnabled);

  if (db) {
    const normDirPath = targetModDir.replace(/\\/g, '/');
    const gameRegModPath = `mod/${pkg.folderName}.mod`;
    const existingMod = db
      .prepare('SELECT id FROM mods WHERE gameRegistryId = ? OR dirPath = ? OR dirPath = ?')
      .get(gameRegModPath, normDirPath, targetModDir);

    let modId = existingMod?.id;
    if (!modId) {
      modId = crypto.randomUUID();
      db.prepare(
        `INSERT INTO mods (id, status, source, version, gameRegistryId, dirPath, displayName, tags, thumbnailPath)
         VALUES (?, 'ready_to_play', 'local', '1.0.0', ?, ?, ?, ?, ?)`
      ).run(modId, gameRegModPath, targetModDir, modDisplayName, pkg.tagsJson, resolvedThumbPath);
    } else {
      db.prepare(
        'UPDATE mods SET displayName = ?, dirPath = ?, thumbnailPath = ?, status = ? WHERE id = ?'
      ).run(modDisplayName, targetModDir, resolvedThumbPath, 'ready_to_play', modId);
    }

    const activePlaysets = db.prepare('SELECT id FROM playsets WHERE isActive = 1').all();
    for (const ps of activePlaysets) {
      const inPlayset = db
        .prepare('SELECT enabled, position FROM playsets_mods WHERE playsetId = ? AND modId = ?')
        .get(ps.id, modId);
      if (!inPlayset) {
        const maxPosRow = db
          .prepare('SELECT MAX(position) as maxPos FROM playsets_mods WHERE playsetId = ?')
          .get(ps.id);
        const nextPos = (Number(maxPosRow?.maxPos) || 0) + 1;
        const initEnabled = shouldEnableInDlcLoad ? 1 : 0;
        db.prepare(
          'INSERT INTO playsets_mods (playsetId, modId, enabled, position) VALUES (?, ?, ?, ?)'
        ).run(ps.id, modId, initEnabled, nextPos);
      } else if (isSubmod && forceHistorical !== undefined) {
        db.prepare('UPDATE playsets_mods SET enabled = ? WHERE playsetId = ? AND modId = ?').run(
          forceHistorical ? 1 : 0,
          ps.id,
          modId
        );
      } else if (isSubmod) {
        shouldEnableInDlcLoad = Boolean(inPlayset.enabled);
      }
    }
  }

  console.log(`✅ [Custom Mod Sync] 동기화 완료: ${targetModDir}`);
  return { modEntry: `mod/${pkg.folderName}.mod`, shouldEnableInDlcLoad };
};

/**
 * 커스텀 북마크 본편 및 고증 서브모드 전체 동기화를 수행합니다.
 */
const main = () => {
  console.log('ℹ️ [Custom Mod Sync] 커스텀 북마크 모드 동기화 시작...');
  const args = new Set(process.argv.slice(2));
  const forceHistorical = args.has('--enable-historical')
    ? true
    : args.has('--disable-historical')
      ? false
      : undefined;

  const ck3DocsDir = resolveCk3DocsDir();
  const modRootDir = path.join(ck3DocsDir, 'mod');

  for (const legacyName of LEGACY_MOD_FOLDER_NAMES) {
    const legacyDir = path.join(modRootDir, legacyName);
    const legacyModFile = path.join(modRootDir, `${legacyName}.mod`);
    if (fs.existsSync(legacyDir)) {
      fs.rmSync(legacyDir, { recursive: true, force: true });
    }
    if (fs.existsSync(legacyModFile)) {
      fs.unlinkSync(legacyModFile);
    }
  }

  const sqlitePath = path.join(ck3DocsDir, 'launcher-v2.sqlite');
  const db = fs.existsSync(sqlitePath) ? new DatabaseSync(sqlitePath) : null;

  if (db) {
    for (const legacyName of LEGACY_MOD_FOLDER_NAMES) {
      const legacyReg = `mod/${legacyName}.mod`;
      const legacyRow = db.prepare('SELECT id FROM mods WHERE gameRegistryId = ?').get(legacyReg);
      if (legacyRow?.id) {
        db.prepare('DELETE FROM playsets_mods WHERE modId = ?').run(legacyRow.id);
        db.prepare('DELETE FROM mods WHERE id = ?').run(legacyRow.id);
      }
    }
  }

  const syncResults = [];
  for (const pkg of CUSTOM_MOD_PACKAGES) {
    const res = syncSingleModPackage(pkg, modRootDir, db, forceHistorical);
    if (res) {
      syncResults.push(res);
    }
  }

  // 서브모드(CFP 호환 패치, 고증 문장 패치)가 플레이셋에서 항상 본편보다 뒤(높은 position)에 로드되도록 순서 보장
  if (db) {
    const mainRow = db
      .prepare('SELECT id FROM mods WHERE gameRegistryId = ?')
      .get('mod/reincarnated-villains-867.mod');
    const orderedSubRegs = [
      'mod/reincarnated-villains-867-cfp-compatch.mod',
      'mod/reincarnated-villains-867-historical-flags.mod',
    ];
    if (mainRow?.id) {
      const activePlaysets = db.prepare('SELECT id FROM playsets WHERE isActive = 1').all();
      for (const ps of activePlaysets) {
        const mPos = db
          .prepare('SELECT position FROM playsets_mods WHERE playsetId = ? AND modId = ?')
          .get(ps.id, mainRow.id);
        let offset = 1;
        for (const subReg of orderedSubRegs) {
          const subRow = db.prepare('SELECT id FROM mods WHERE gameRegistryId = ?').get(subReg);
          if (!subRow?.id) continue;
          const sPos = db
            .prepare('SELECT position FROM playsets_mods WHERE playsetId = ? AND modId = ?')
            .get(ps.id, subRow.id);
          if (mPos && sPos && Number(sPos.position) <= Number(mPos.position)) {
            db.prepare('UPDATE playsets_mods SET position = ? WHERE playsetId = ? AND modId = ?').run(
              Number(mPos.position) + offset,
              ps.id,
              subRow.id
            );
            offset += 1;
          }
        }
      }
    }
    db.close();
  }

  const dlcLoadPath = path.join(ck3DocsDir, 'dlc_load.json');
  if (fs.existsSync(dlcLoadPath)) {
    const dlcLoad = JSON.parse(fs.readFileSync(dlcLoadPath, 'utf-8'));
    const removeSet = new Set([
      ...LEGACY_MOD_FOLDER_NAMES.map((n) => `mod/${n}.mod`),
      ...syncResults.filter((r) => !r.shouldEnableInDlcLoad).map((r) => r.modEntry),
    ]);
    dlcLoad.enabled_mods = (dlcLoad.enabled_mods || []).filter((e) => !removeSet.has(e));
    for (const res of syncResults) {
      if (res.shouldEnableInDlcLoad && !dlcLoad.enabled_mods.includes(res.modEntry)) {
        dlcLoad.enabled_mods.push(res.modEntry);
      }
    }
    fs.writeFileSync(dlcLoadPath, JSON.stringify(dlcLoad), 'utf-8');
  }
};

main();
