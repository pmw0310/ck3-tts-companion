import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const sourceModDir = path.join(projectRoot, 'ck3-mod');

/**
 * 현재 운영체제(macOS / Windows / Linux)에 따른 실제 CK3 모드 설치 경로를 계산합니다.
 * @returns 실제 CK3 모드 폴더 절대 경로
 */
const resolveGameModDir = () => {
  const homeDir = os.homedir();
  const platform = os.platform();

  if (platform === 'darwin') {
    return path.join(
      homeDir,
      'Documents',
      'Paradox Interactive',
      'Crusader Kings III',
      'mod',
      'ck3-tts-companion'
    );
  }

  if (platform === 'win32') {
    return path.join(
      homeDir,
      'Documents',
      'Paradox Interactive',
      'Crusader Kings III',
      'mod',
      'ck3-tts-companion'
    );
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

  // 2. 소스 파일/폴더를 대상 경로로 복사
  for (const srcEntry of srcEntries) {
    const srcPath = path.join(src, srcEntry.name);
    const destPath = path.join(dest, srcEntry.name);

    if (srcEntry.isDirectory()) {
      syncDirectory(srcPath, destPath);
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
        console.log(`📄 [Mod Sync] 복사 완료: ${srcEntry.name}`);
      }
    }
  }
};

const main = () => {
  console.log('🔄 [Mod Sync] CK3 모드 자동 동기화 시작...');
  if (!fs.existsSync(sourceModDir)) {
    console.error(`❌ [Mod Sync] 소스 모드 디렉터리를 찾을 수 없습니다: ${sourceModDir}`);
    process.exit(1);
  }

  const targetModDir = resolveGameModDir();
  console.log(`📍 [Mod Sync] 소스 경로: ${sourceModDir}`);
  console.log(`🎯 [Mod Sync] 대상 경로: ${targetModDir}`);

  try {
    syncDirectory(sourceModDir, targetModDir);
    console.log('✅ [Mod Sync] 실제 게임 모드 폴더로 모든 파일이 성공적으로 동기화되었습니다!');
  } catch (error) {
    console.error('❌ [Mod Sync] 동기화 중 오류 발생:', error);
    process.exit(1);
  }
};

main();
