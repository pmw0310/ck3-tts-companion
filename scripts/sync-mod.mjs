import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const sourceModDir = path.join(projectRoot, 'ck3-mod');

const CK3_STEAM_APP_ID = '1158310';
const WORKSHOP_MOD_ID = '3824371603';

/**
 * 현재 운영체제(macOS / Windows / Linux)에 따른 기본 로컬 CK3 모드 설치 경로를 계산합니다.
 * @returns 실제 CK3 모드 폴더 절대 경로
 */
const resolveGameModDir = () => {
  const homeDir = os.homedir();
  const platform = os.platform();

  if (platform === 'darwin' || platform === 'win32') {
    const standardPath = path.join(
      homeDir,
      'Documents',
      'Paradox Interactive',
      'Crusader Kings III',
      'mod',
      'ck3-tts-companion'
    );

    if (platform === 'win32') {
      const oneDrivePath = path.join(
        homeDir,
        'OneDrive',
        'Documents',
        'Paradox Interactive',
        'Crusader Kings III',
        'mod',
        'ck3-tts-companion'
      );
      if (!fs.existsSync(path.dirname(standardPath)) && fs.existsSync(path.dirname(oneDrivePath))) {
        return oneDrivePath;
      }
      if (fs.existsSync(oneDrivePath) && !fs.existsSync(standardPath)) {
        return oneDrivePath;
      }
    }

    return standardPath;
  }

  // Linux (Steam Proton 등 기본 경로)
  return path.join(
    homeDir,
    '.local',
    'share',
    'Paradox Interactive',
    'Crusader Kings III',
    'mod',
    'ck3-tts-companion'
  );
};

/**
 * 설치된 스팀 창작마당(Workshop) 모드 디렉터리들을 탐색합니다.
 * @returns 감지된 스팀 창작마당 모드 폴더 배열
 */
const resolveWorkshopModDirs = () => {
  const homeDir = os.homedir();
  const platform = os.platform();
  const workshopDirs = new Set();

  // 1. ugc_3824371603.mod 내 path="..." 확인
  const modRoots = [
    path.join(homeDir, 'Documents', 'Paradox Interactive', 'Crusader Kings III', 'mod'),
    path.join(homeDir, 'OneDrive', 'Documents', 'Paradox Interactive', 'Crusader Kings III', 'mod')
  ];

  for (const modRoot of modRoots) {
    const ugcFile = path.join(modRoot, `ugc_${WORKSHOP_MOD_ID}.mod`);
    if (fs.existsSync(ugcFile)) {
      try {
        const content = fs.readFileSync(ugcFile, 'utf-8');
        const pathMatch = /(?:^|\r?\n)\s*path\s*=\s*"([^"]+)"/.exec(content);
        if (pathMatch?.[1]) {
          const resolved = path.normalize(pathMatch[1].trim());
          if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
            workshopDirs.add(resolved);
          }
        }
      } catch {
        // 무시
      }
    }
  }

  // 2. 기본 Steam 라이브러리 경로 스캔
  const candidateSteamDirs = [];
  if (platform === 'win32') {
    candidateSteamDirs.push(
      path.join(process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', 'Steam'),
      path.join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Steam'),
      'C:\\SteamLibrary',
      'D:\\SteamLibrary',
      'E:\\SteamLibrary'
    );
  } else if (platform === 'darwin') {
    candidateSteamDirs.push(path.join(homeDir, 'Library', 'Application Support', 'Steam'));
  } else {
    candidateSteamDirs.push(
      path.join(homeDir, '.local', 'share', 'Steam'),
      path.join(homeDir, '.steam', 'steam')
    );
  }

  for (const steamDir of candidateSteamDirs) {
    const wsPath = path.join(
      steamDir,
      'steamapps',
      'workshop',
      'content',
      CK3_STEAM_APP_ID,
      WORKSHOP_MOD_ID
    );
    if (fs.existsSync(wsPath)) {
      try {
        if (fs.statSync(wsPath).isDirectory()) {
          workshopDirs.add(path.normalize(wsPath));
        }
      } catch {
        // 무시
      }
    }
  }

  return Array.from(workshopDirs);
};

/**
 * 디렉터리를 재귀적으로 미러링 동기화합니다 (소스에 없는 대상 파일은 자동 삭제).
 * @param {string} src - 원본 소스 디렉터리
 * @param {string} dest - 동기화할 대상 디렉터리
 */
const syncDirectory = (src, dest) => {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const srcEntries = fs.readdirSync(src, { withFileTypes: true });
  const destEntries = fs.readdirSync(dest, { withFileTypes: true });

  const srcNames = new Set(srcEntries.map((e) => e.name));

  // 1. 소스에 없는 대상 파일/폴더 삭제 (Mirroring)
  for (const destEntry of destEntries) {
    if (!srcNames.has(destEntry.name)) {
      const targetPath = path.join(dest, destEntry.name);
      if (destEntry.isDirectory()) {
        fs.rmSync(targetPath, { recursive: true, force: true });
        console.log(`🗑️ [Mod Sync] 불필요 디렉터리 삭제: ${destEntry.name}`);
      } else {
        fs.unlinkSync(targetPath);
        console.log(`🗑️ [Mod Sync] 불필요 파일 삭제: ${destEntry.name}`);
      }
    }
  }

  // 2. 소스 파일/폴더를 대상 경로로 복사 (바이트 내용 비교로 100% 정합성 보장)
  for (const srcEntry of srcEntries) {
    const srcPath = path.join(src, srcEntry.name);
    const destPath = path.join(dest, srcEntry.name);

    if (srcEntry.isDirectory()) {
      syncDirectory(srcPath, destPath);
    } else {
      if (srcEntry.name.toLowerCase().endsWith('.yml')) {
        const rawYml = fs.readFileSync(srcPath);
        const hasBom = rawYml.length >= 3 && rawYml[0] === 0xef && rawYml[1] === 0xbb && rawYml[2] === 0xbf;
        const textBody = rawYml.toString('utf-8').replace(/^\uFEFF/, '');
        const normalizedBody = textBody.replace(/\r?\n/g, '\r\n');
        if (!hasBom || textBody !== normalizedBody) {
          fs.writeFileSync(srcPath, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(normalizedBody, 'utf-8')]));
        }
      }
      let shouldCopy = true;
      if (fs.existsSync(destPath)) {
        const srcStat = fs.statSync(srcPath);
        const destStat = fs.statSync(destPath);
        if (srcStat.size === destStat.size) {
          const srcBuf = fs.readFileSync(srcPath);
          const destBuf = fs.readFileSync(destPath);
          if (srcBuf.equals(destBuf)) {
            shouldCopy = false;
          }
        }
      }

      if (shouldCopy) {
        fs.copyFileSync(srcPath, destPath);
        console.log(`📄 [Mod Sync] 복사 완료: ${srcEntry.name}`);
      }
    }
  }
};

/**
 * 로컬 모드 폴더 설치 시 패러독스 런처(모드 업로드 및 플레이셋)가 로컬 모드로 인식하도록
 * 상위 mod/ 폴더에 ck3-tts-companion.mod 디스크립터 파일을 생성/갱신합니다.
 * @param {string} srcModDir - 원본 ck3-mod 디렉터리
 * @param {string} destModDir - 설치된 로컬 모드 디렉터리
 */
const ensureLocalLauncherDescriptor = (srcModDir, destModDir) => {
  try {
    const modParentDir = path.dirname(destModDir);
    if (path.basename(modParentDir).toLowerCase() !== 'mod') {
      return;
    }

    const srcDescriptorPath = path.join(srcModDir, 'descriptor.mod');
    if (!fs.existsSync(srcDescriptorPath)) {
      return;
    }

    const localDescriptorPath = path.join(modParentDir, `${path.basename(destModDir)}.mod`);
    const rawDescriptor = fs.readFileSync(srcDescriptorPath, 'utf-8').trimEnd();
    const normalizedTarget = destModDir.replace(/\\/g, '/');
    const hasPathLine = /(?:^|\r?\n)\s*path\s*=/.test(rawDescriptor);
    const finalDescriptor = hasPathLine
      ? rawDescriptor.replace(/(?:^|\r?\n)\s*path\s*=\s*"[^"]*"/, `\npath="${normalizedTarget}"`)
      : `${rawDescriptor}\npath="${normalizedTarget}"\n`;

    fs.writeFileSync(localDescriptorPath, finalDescriptor, 'utf-8');
    console.log(`📝 [Mod Sync] 패러독스 런처 로컬 디스크립터 갱신 완료: ${localDescriptorPath}`);
  } catch (error) {
    console.warn('⚠️ [Mod Sync] 로컬 런처 .mod 디스크립터 생성 건너뜀:', error);
  }
};

/**
 * 패러독스 런처의 SQLite 데이터베이스(launcher-v2.sqlite)에 로컬 모드 썸네일 경로를 자동 주입합니다.
 * @param {string} targetModDir - 실제 CK3 모드 설치 경로
 */
const syncLauncherThumbnail = (targetModDir) => {
  const homeDir = os.homedir();
  const candidates = [
    path.join(homeDir, 'Documents', 'Paradox Interactive', 'Crusader Kings III', 'launcher-v2.sqlite'),
    path.join(homeDir, 'OneDrive', 'Documents', 'Paradox Interactive', 'Crusader Kings III', 'launcher-v2.sqlite'),
    path.join(homeDir, '.local', 'share', 'Paradox Interactive', 'Crusader Kings III', 'launcher-v2.sqlite')
  ];

  const dbPath = candidates.find((p) => fs.existsSync(p));
  if (!dbPath) {
    return;
  }

  const thumbnailPath = path.join(targetModDir, 'thumbnail.png');
  if (!fs.existsSync(thumbnailPath) || /[\0\r\n;]/.test(thumbnailPath)) {
    return;
  }

  try {
    const escapedThumbPath = thumbnailPath.replace(/'/g, "''");
    const sql = `UPDATE mods SET thumbnailPath = '${escapedThumbPath}' WHERE dirPath LIKE '%ck3-tts-companion%' OR dirPath LIKE '%${WORKSHOP_MOD_ID}%';`;
    execFileSync('sqlite3', [dbPath, sql], { stdio: 'pipe' });
    console.log('🖼️ [Mod Sync] 패러독스 런처 DB에 로컬 모드 썸네일 경로를 자동 등록했습니다.');
  } catch {
    console.warn('⚠️ [Mod Sync] 패러독스 런처 썸네일 자동 주입 건너뜀 (sqlite3 CLI 미지원 등)');
  }
};

const main = () => {
  console.log('🔄 [Mod Sync] CK3 모드 자동 동기화 시작...');
  if (!fs.existsSync(sourceModDir)) {
    console.error(`❌ [Mod Sync] 소스 모드 디렉터리를 찾을 수 없습니다: ${sourceModDir}`);
    process.exit(1);
  }

  const workshopDirs = resolveWorkshopModDirs();
  const targetModDir = resolveGameModDir();
  console.log(`📍 [Mod Sync] 소스 경로: ${sourceModDir}`);

  try {
    // 1. 스팀 창작마당 구독 폴더가 존재하면 최우선 동기화
    for (const wsDir of workshopDirs) {
      console.log(`🎯 [Mod Sync] 스팀 창작마당 워크샵 폴더 동기화: ${wsDir}`);
      syncDirectory(sourceModDir, wsDir);
      syncLauncherThumbnail(wsDir);
    }

    // 2. 로컬 모드 폴더(mod/ck3-tts-companion) 및 ck3-tts-companion.mod 디스크립터 항상 동기화 (런처 모드 업로드 지원)
    console.log(`🎯 [Mod Sync] 로컬 모드 폴더 동기화: ${targetModDir}`);
    syncDirectory(sourceModDir, targetModDir);
    ensureLocalLauncherDescriptor(sourceModDir, targetModDir);
    syncLauncherThumbnail(targetModDir);

    // 3. 런처 모드 생성 도구로 만든 폴더가 존재하는 경우 해당 배포 폴더도 함께 동기화
    const modParentDir = path.dirname(targetModDir);
    const namedModDir = path.join(modParentDir, 'CK3 Event Voice Reader (TTS Companion)');
    if (fs.existsSync(namedModDir) && namedModDir !== targetModDir) {
      console.log(`🎯 [Mod Sync] 창작마당 업로드 폴더 추가 동기화: ${namedModDir}`);
      syncDirectory(sourceModDir, namedModDir);
      syncLauncherThumbnail(namedModDir);
    }

    console.log('✅ [Mod Sync] 실제 게임 모드 폴더로 모든 파일이 성공적으로 동기화되었습니다!');
  } catch (error) {
    console.error('❌ [Mod Sync] 동기화 중 오류 발생:', error);
    process.exit(1);
  }
};

main();
