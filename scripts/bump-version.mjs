import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

/**
 * Semantic Versioning 규칙에 따라 버전을 1단계 증가시킵니다.
 * @param currentVersion - 현재 버전 문자열 (예: '1.0.0')
 * @param bumpType - 버전 범프 단위 ('major' | 'minor' | 'patch')
 * @returns 증가된 새 버전 문자열
 */
const bumpSemanticVersion = (currentVersion, bumpType) => {
  const parts = currentVersion.split('.').map((num) => parseInt(num, 10));
  let major = parts[0] ?? 1;
  let minor = parts[1] ?? 0;
  let patch = parts[2] ?? 0;

  switch (bumpType) {
    case 'major':
      major += 1;
      minor = 0;
      patch = 0;
      break;
    case 'minor':
      minor += 1;
      patch = 0;
      break;
    case 'patch':
    default:
      patch += 1;
      break;
  }

  return `${major}.${minor}.${patch}`;
};

/**
 * 커밋 메시지 또는 전달 인자를 분석하여 적합한 버전 범프 단위를 판별합니다.
 * @param inputArg - 커밋 메시지 또는 명시적 단위 ('major' | 'minor' | 'patch' | 'auto')
 * @returns 판별된 범프 단위 또는 스킵 시 null
 */
const determineBumpType = (inputArg) => {
  if (!inputArg || inputArg === 'auto') {
    // 인자가 없거나 auto인 경우 가장 최근 Git 커밋 메시지 확인
    try {
      const lastCommitMsg = execSync('git log -1 --pretty=%B', {
        encoding: 'utf-8',
        cwd: ROOT_DIR
      }).trim();
      return analyzeCommitMessage(lastCommitMsg);
    } catch {
      console.warn('⚠️ [Version] 최근 커밋 메시지 조회 불가, 기본 patch 적용');
      return 'patch';
    }
  }

  const normalized = inputArg.toLowerCase().trim();
  if (normalized === 'major' || normalized === 'minor' || normalized === 'patch') {
    return normalized;
  }

  // 전달된 문자열이 커밋 메시지 자체인 경우 파싱
  return analyzeCommitMessage(inputArg);
};

/**
 * Conventional Commits 메시지 패턴을 분석하여 범프 단위를 도출합니다.
 * @param commitMessage - 커밋 메시지 문자열
 * @returns 판별된 범프 단위 또는 스킵(null)
 */
const analyzeCommitMessage = (commitMessage) => {
  if (!commitMessage) {
    return 'patch';
  }

  // 1. Major 범프 조건: BREAKING CHANGE 문구 또는 타입 뒤 느낌표(feat!:)
  if (
    commitMessage.includes('BREAKING CHANGE') ||
    commitMessage.includes('BREAKING-CHANGE') ||
    /^[a-z]+(\([a-z0-9_,-]+\))?!:/.test(commitMessage)
  ) {
    return 'major';
  }

  // 2. Minor 범프 조건: feat(새로운 기능 추가)
  if (/^feat(\([a-z0-9_,-]+\))?:/i.test(commitMessage)) {
    return 'minor';
  }

  // 3. Patch 범프 조건: fix, refactor, perf (버그 수정, 성능, 리팩토링)
  if (/^(fix|refactor|perf)(\([a-z0-9_,-]+\))?:/i.test(commitMessage)) {
    return 'patch';
  }

  // 4. 스킵 대상: docs, chore, test, style 등
  console.info('ℹ️ [Version] 단순 문서/설정/테스트 커밋으로 버전 범프를 건너뜁니다.');
  return null;
};

/**
 * package.json의 version 필드를 업데이트합니다.
 * @param newVersion - 갱신할 새 버전 문자열
 */
const updatePackageJson = (newVersion) => {
  const filePath = path.join(ROOT_DIR, 'package.json');
  if (!fs.existsSync(filePath)) {
    return;
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const json = JSON.parse(content);
  json.version = newVersion;
  fs.writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`, 'utf-8');
  console.log(`✅ [Version] package.json 갱신: ${newVersion}`);
};

/**
 * package-lock.json의 version 필드들을 동기화합니다.
 * @param newVersion - 갱신할 새 버전 문자열
 */
const updatePackageLockJson = (newVersion) => {
  const filePath = path.join(ROOT_DIR, 'package-lock.json');
  if (!fs.existsSync(filePath)) {
    return;
  }
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const json = JSON.parse(content);
    json.version = newVersion;
    if (json.packages && json.packages['']) {
      json.packages[''].version = newVersion;
    }
    fs.writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`, 'utf-8');
    console.log(`✅ [Version] package-lock.json 갱신: ${newVersion}`);
  } catch (error) {
    console.warn('⚠️ [Version] package-lock.json 갱신 실패 (무시됨):', error);
  }
};

/**
 * CK3 모드 descriptor.mod 파일의 version 속성을 동기화합니다.
 * @param newVersion - 갱신할 새 버전 문자열
 */
const updateCk3Descriptor = (newVersion) => {
  const filePath = path.join(ROOT_DIR, 'ck3-mod', 'descriptor.mod');
  if (!fs.existsSync(filePath)) {
    return;
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const updated = content.replace(/^version="[^"]*"/m, `version="${newVersion}"`);
  fs.writeFileSync(filePath, updated, 'utf-8');
  console.log(`✅ [Version] ck3-mod/descriptor.mod 갱신: ${newVersion}`);
};

/**
 * 버전 범프 메인 실행 루틴
 */
const runVersionBump = () => {
  const inputArg = process.argv[2] ?? 'auto';
  const packageJsonPath = path.join(ROOT_DIR, 'package.json');

  if (!fs.existsSync(packageJsonPath)) {
    console.error('❌ [Version] package.json 파일을 찾을 수 없습니다.');
    process.exit(1);
  }

  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  const currentVersion = pkg.version ?? '1.0.0';

  const bumpType = determineBumpType(inputArg);
  if (!bumpType) {
    // 변경 스킵
    process.exit(0);
  }

  const newVersion = bumpSemanticVersion(currentVersion, bumpType);
  console.info(
    `🚀 [Version] 버전 범프 진행: ${currentVersion} -> ${newVersion} (${bumpType})`
  );

  updatePackageJson(newVersion);
  updatePackageLockJson(newVersion);
  updateCk3Descriptor(newVersion);

  console.log(`🎉 [Version] 모든 설정 파일의 버전 동기화가 성공적으로 완료되었습니다: v${newVersion}`);
};

runVersionBump();
