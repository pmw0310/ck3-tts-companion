import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { app } from 'electron';
import type { ModSyncResult, ModVersionStatus } from '@/shared/types';
import { cleanVersionString } from '@/shared/versionComparator';

/**
 * 프로젝트 내 소스 모드 디렉터리(`ck3-mod`)의 절대 경로를 탐색합니다.
 * 개발 환경 및 프로덕션 번들 환경을 모두 지원합니다.
 * @returns 소스 모드 디렉터리 절대 경로
 */
export const resolveSourceModDir = (): string => {
  const candidates = [
    path.join(process.cwd(), 'ck3-mod'),
    path.join(app ? app.getAppPath() : process.cwd(), 'ck3-mod'),
    path.join(process.resourcesPath ?? '', 'ck3-mod'),
    path.join(__dirname, '../../ck3-mod'),
    path.join(__dirname, '../ck3-mod')
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }

  return path.join(process.cwd(), 'ck3-mod');
};

/**
 * 운영체제에 따른 실제 Crusader Kings III 모드 설치 대상 디렉터리를 계산합니다.
 * @returns 실제 CK3 모드 폴더 절대 경로
 */
export const resolveGameModDir = (): string => {
  const homeDir = os.homedir();
  const platform = process.platform;

  if (platform === 'darwin' || platform === 'win32') {
    // Windows 및 macOS 기본 사용자 문서 폴더
    const standardPath = path.join(
      homeDir,
      'Documents',
      'Paradox Interactive',
      'Crusader Kings III',
      'mod',
      'ck3-tts-companion'
    );

    if (platform === 'win32') {
      // Windows OneDrive 리다이렉션 경로 우선 점검
      const oneDrivePath = path.join(
        homeDir,
        'OneDrive',
        'Documents',
        'Paradox Interactive',
        'Crusader Kings III',
        'mod',
        'ck3-tts-companion'
      );
      if (fs.existsSync(path.dirname(oneDrivePath))) {
        return oneDrivePath;
      }
    }

    return standardPath;
  }

  // Linux (Steam Proton / 네이티브)
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
 * 주어진 모드 디렉터리에서 `descriptor.mod` 또는 `metadata.json`의 버전 정보를 추출합니다.
 * @param modDir - 대상 모드 디렉터리 경로
 * @returns 파싱된 버전 문자열 또는 null
 */
export const readModVersionFromDir = (modDir: string): string | null => {
  try {
    const descriptorPath = path.join(modDir, 'descriptor.mod');
    if (fs.existsSync(descriptorPath)) {
      const content = fs.readFileSync(descriptorPath, 'utf-8');
      const match = /version\s*=\s*"([^"]+)"/.exec(content);
      if (match && match[1]) {
        return cleanVersionString(match[1]);
      }
    }

    const metadataPath = path.join(modDir, 'metadata.json');
    if (fs.existsSync(metadataPath)) {
      const content = fs.readFileSync(metadataPath, 'utf-8');
      const parsed = JSON.parse(content) as Record<string, unknown>;
      if (typeof parsed.version === 'string') {
        return cleanVersionString(parsed.version);
      }
    }
  } catch (error: unknown) {
    console.warn(`⚠️ [ModSync] 모드 버전 읽기 실패 (${modDir}):`, error);
  }
  return null;
};

/**
 * 현재 프로그램 버전과 실제 게임에 설치된 모드 버전의 동기화 상태를 조회합니다.
 * @returns 모드 버전 동기화 상태 객체
 */
export const getModVersionStatus = async (): Promise<ModVersionStatus> => {
  const appVersion = app ? app.getVersion() : '1.10.0';
  const sourceModDir = resolveSourceModDir();
  const targetModDir = resolveGameModDir();

  const isInstalled = fs.existsSync(targetModDir);
  const installedVersion = isInstalled ? readModVersionFromDir(targetModDir) : null;

  // 버전 번호가 동일하고 대상 모드가 존재하는지 검증
  const isSynced = isInstalled && installedVersion === appVersion;

  return {
    isInstalled,
    isSynced,
    appVersion,
    installedVersion,
    targetModDir,
    sourceModDir
  };
};

/**
 * 디렉터리를 재귀적으로 미러링 동기화합니다.
 * @param src - 원본 소스 디렉터리
 * @param dest - 동기화 대상 디렉터리
 * @returns { copiedCount: number, removedCount: number }
 */
const mirrorDirectory = (
  src: string,
  dest: string
): { copiedCount: number; removedCount: number } => {
  let copiedCount = 0;
  let removedCount = 0;

  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const srcEntries = fs.readdirSync(src, { withFileTypes: true });
  const destEntries = fs.readdirSync(dest, { withFileTypes: true });

  const srcNames = new Set(srcEntries.map((e) => e.name));

  // 1. 소스에 없는 대상 파일/폴더 삭제
  for (const destEntry of destEntries) {
    if (!srcNames.has(destEntry.name)) {
      const targetPath = path.join(dest, destEntry.name);
      if (destEntry.isDirectory()) {
        fs.rmSync(targetPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(targetPath);
      }
      removedCount += 1;
    }
  }

  // 2. 소스 파일/폴더 복사
  for (const srcEntry of srcEntries) {
    const srcPath = path.join(src, srcEntry.name);
    const destPath = path.join(dest, srcEntry.name);

    if (srcEntry.isDirectory()) {
      const subResult = mirrorDirectory(srcPath, destPath);
      copiedCount += subResult.copiedCount;
      removedCount += subResult.removedCount;
    } else {
      let shouldCopy = true;
      if (fs.existsSync(destPath)) {
        const srcStat = fs.statSync(srcPath);
        const destStat = fs.statSync(destPath);
        if (srcStat.size === destStat.size && srcStat.mtimeMs <= destStat.mtimeMs) {
          shouldCopy = false;
        }
      }

      if (shouldCopy) {
        fs.copyFileSync(srcPath, destPath);
        copiedCount += 1;
      }
    }
  }

  return { copiedCount, removedCount };
};

/**
 * 패러독스 런처의 SQLite 데이터베이스(`launcher-v2.sqlite`)에 모드 썸네일 경로를 자동 등록합니다.
 * @param targetModDir - 설치된 실제 모드 디렉터리
 */
const updateLauncherThumbnailDatabase = (targetModDir: string): void => {
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
  if (!fs.existsSync(thumbnailPath)) {
    return;
  }

  try {
    const escapedThumbPath = thumbnailPath.replace(/'/g, "''");
    const sql = `UPDATE mods SET thumbnailPath = '${escapedThumbPath}' WHERE dirPath LIKE '%ck3-tts-companion%';`;
    execFileSync('sqlite3', [dbPath, sql], { stdio: 'pipe' });
    console.info('✅ [ModSync] 패러독스 런처 DB에 로컬 모드 썸네일 경로 자동 주입 완료');
  } catch {
    console.warn('⚠️ [ModSync] 패러독스 런처 썸네일 주입 건너뜀 (sqlite3 CLI 미설치 등)');
  }
};

/**
 * 최신 CK3 모드 파일들을 실제 게임 모드 디렉터리로 원자적으로 동기화합니다.
 * @returns 모드 동기화 수행 결과 객체
 */
export const syncModFiles = async (): Promise<ModSyncResult> => {
  const sourceModDir = resolveSourceModDir();
  const targetModDir = resolveGameModDir();
  const appVersion = app ? app.getVersion() : '1.10.0';

  if (!fs.existsSync(sourceModDir)) {
    const errorMessage = `소스 모드 디렉터리를 찾을 수 없습니다: ${sourceModDir}`;
    console.error(`❌ [ModSync] ${errorMessage}`);
    return {
      isSuccess: false,
      copiedFilesCount: 0,
      removedFilesCount: 0,
      targetModDir,
      syncedVersion: appVersion,
      errorMessage
    };
  }

  try {
    console.info(`🔄 [ModSync] 모드 파일 동기화 시작: ${sourceModDir} -> ${targetModDir}`);
    const { copiedCount, removedCount } = mirrorDirectory(sourceModDir, targetModDir);
    updateLauncherThumbnailDatabase(targetModDir);

    console.info(
      `✅ [ModSync] 모드 동기화 완료! 복사: ${copiedCount}개, 삭제: ${removedCount}개`
    );

    return {
      isSuccess: true,
      copiedFilesCount: copiedCount,
      removedFilesCount: removedCount,
      targetModDir,
      syncedVersion: appVersion
    };
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : '알 수 없는 파일 복사 오류';
    console.error('❌ [ModSync] 모드 동기화 중 오류 발생:', error);

    return {
      isSuccess: false,
      copiedFilesCount: 0,
      removedFilesCount: 0,
      targetModDir,
      syncedVersion: appVersion,
      errorMessage
    };
  }
};

