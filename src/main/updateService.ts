import { app, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type {
  AppInfo,
  UpdateAssetInfo,
  UpdateCheckResult,
  UpdateDownloadProgress
} from '@/shared/types';
import { isNewerVersion, cleanVersionString } from '@/shared/versionComparator';

/** GitHub 레포지토리 소유자 및 저장소명 */
export const GITHUB_REPO_OWNER = 'pmw0310';
export const GITHUB_REPO_NAME = 'ck3-tts-companion';
export const GITHUB_REPO_URL = `https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}`;
export const GITHUB_API_LATEST_RELEASE = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases/latest`;

/**
 * 기본 제작자 및 애플리케이션 정보
 */
export const getAppMetadata = (): AppInfo => {
  const version = app ? app.getVersion() : '1.11.0';
  return {
    version: version || '1.11.0',
    author: 'BlackOlf',
    productName: 'CK3 TTS Companion',
    repoUrl: GITHUB_REPO_URL
  };
};

/**
 * 외부 링크가 열리기에 안전한 허용 도메인인지 검증합니다.
 * @param url - 검증할 URL 문자열
 * @returns 안전한 URL 여부
 */
export const isSafeExternalUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return false;
    }
    // GitHub 또는 허용된 도메인만 통과
    const allowedHosts = [
      'github.com',
      'api.github.com',
      'objects.githubusercontent.com',
      'github-releases.githubusercontent.com',
      'aistudio.google.com'
    ];
    return allowedHosts.some(
      (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)
    );
  } catch {
    return false;
  }
};

/** GitHub 릴리스 에셋 객체 타입 */
type GitHubReleaseAsset = {
  name: string;
  browser_download_url: string;
  size: number;
  content_type?: string;
};

/** GitHub Releases API 응답 객체 타입 */
type GitHubReleaseResponse = {
  tag_name?: string;
  name?: string;
  html_url?: string;
  body?: string;
  published_at?: string;
  draft?: boolean;
  prerelease?: boolean;
  message?: string;
  assets?: GitHubReleaseAsset[];
};

/**
 * 현재 실행 환경(OS 및 아키텍처)에 가장 적합한 릴리스 에셋을 선별합니다.
 * @param assets - GitHub 릴리스에 첨부된 에셋 목록
 * @returns 매칭된 에셋 정보 또는 undefined
 */
export const matchBestReleaseAsset = (
  assets?: GitHubReleaseAsset[]
): UpdateAssetInfo | undefined => {
  if (!assets || assets.length === 0) {
    return undefined;
  }

  const platform = process.platform;
  const arch = process.arch;

  if (platform === 'win32') {
    // Windows: .exe 파일 탐색 (포터블 실행 파일)
    const winExe = assets.find(
      (a) => a.name.toLowerCase().endsWith('.exe') && !a.name.toLowerCase().includes('blockmap')
    );
    if (winExe) {
      return {
        name: winExe.name,
        downloadUrl: winExe.browser_download_url,
        sizeBytes: winExe.size,
        platform: 'win32',
        arch: 'x64'
      };
    }
  }

  if (platform === 'darwin') {
    // macOS: Apple Silicon (arm64) vs Intel (x64) DMG 탐색
    const dmgAssets = assets.filter((a) => a.name.toLowerCase().endsWith('.dmg'));
    if (dmgAssets.length > 0) {
      if (arch === 'arm64') {
        const armDmg = dmgAssets.find((a) => a.name.toLowerCase().includes('arm64'));
        if (armDmg) {
          return {
            name: armDmg.name,
            downloadUrl: armDmg.browser_download_url,
            sizeBytes: armDmg.size,
            platform: 'darwin',
            arch: 'arm64'
          };
        }
      } else {
        const intelDmg = dmgAssets.find((a) => a.name.toLowerCase().includes('x64'));
        if (intelDmg) {
          return {
            name: intelDmg.name,
            downloadUrl: intelDmg.browser_download_url,
            sizeBytes: intelDmg.size,
            platform: 'darwin',
            arch: 'x64'
          };
        }
      }

      // 특정 아키텍처 명시가 없는 범용 또는 첫 번째 dmg
      const fallbackDmg = dmgAssets[0];
      return {
        name: fallbackDmg.name,
        downloadUrl: fallbackDmg.browser_download_url,
        sizeBytes: fallbackDmg.size,
        platform: 'darwin',
        arch
      };
    }
  }

  return undefined;
};

/**
 * GitHub 릴리스 API를 호출하여 최신 버전 정보 및 업데이트 유무를 조회합니다.
 * @param customCurrentVersion - 임의의 현재 버전 (생략 시 앱 버전 사용)
 * @returns 업데이트 검사 결과 객체
 */
export const checkForAppUpdates = async (
  customCurrentVersion?: string
): Promise<UpdateCheckResult> => {
  const currentVersion = customCurrentVersion ?? getAppMetadata().version;
  const fallbackUrl = `${GITHUB_REPO_URL}/releases/latest`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(GITHUB_API_LATEST_RELEASE, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': `CK3-TTS-Companion/${currentVersion}`
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.warn(
        `⚠️ [UpdateCheck] GitHub API 응답 실패 (${response.status}):`,
        errorText.slice(0, 100)
      );
      return {
        hasUpdate: false,
        currentVersion,
        latestVersion: currentVersion,
        releaseUrl: fallbackUrl,
        errorMessage: `GitHub API 응답 오류: HTTP ${response.status}`
      };
    }

    const data = (await response.json()) as GitHubReleaseResponse;
    const rawTag = data.tag_name ?? '';
    const latestVersion = cleanVersionString(rawTag);

    if (!latestVersion) {
      return {
        hasUpdate: false,
        currentVersion,
        latestVersion: currentVersion,
        releaseUrl: fallbackUrl,
        errorMessage: '유효한 버전 태그를 찾을 수 없습니다.'
      };
    }

    const hasUpdate = isNewerVersion(latestVersion, currentVersion);
    const releaseUrl = data.html_url && isSafeExternalUrl(data.html_url)
      ? data.html_url
      : fallbackUrl;

    const matchedAsset = matchBestReleaseAsset(data.assets);

    if (hasUpdate) {
      console.info(
        `ℹ️ [UpdateCheck] 새 버전 감지: 현재 ${currentVersion} -> 최신 ${latestVersion} (에셋: ${matchedAsset?.name ?? '없음'})`
      );
    } else {
      console.info(`✅ [UpdateCheck] 최신 버전을 사용 중입니다: ${currentVersion}`);
    }

    return {
      hasUpdate,
      currentVersion,
      latestVersion,
      releaseUrl,
      releaseTitle: data.name ?? `v${latestVersion}`,
      releaseNotes: data.body ?? '',
      publishedAt: data.published_at,
      matchedAsset
    };
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : '알 수 없는 네트워크 오류';
    console.warn('⚠️ [UpdateCheck] 업데이트 확인 실패 (오프라인 등):', errorMessage);

    return {
      hasUpdate: false,
      currentVersion,
      latestVersion: currentVersion,
      releaseUrl: fallbackUrl,
      errorMessage
    };
  }
};

/**
 * 앱 전용 임시 업데이트 디렉터리 경로를 반환합니다.
 * @returns 임시 디렉터리 절대 경로
 */
export const getUpdateTempDirectory = (): string => {
  return path.join(app ? app.getPath('temp') : '/tmp', 'ck3-tts-companion-updates');
};

/**
 * 최신 릴리스 바이너리를 로컬 임시 디렉터리로 다운로드합니다.
 * @param downloadUrl - 다운로드할 원격 파일 URL
 * @param onProgress - 진행률 통지 콜백
 * @returns { isSuccess: boolean, filePath?: string, errorMessage?: string }
 */
export const downloadUpdateBinary = async (
  downloadUrl: string,
  onProgress?: (progress: UpdateDownloadProgress) => void
): Promise<{ isSuccess: boolean; filePath?: string; errorMessage?: string }> => {
  if (!isSafeExternalUrl(downloadUrl)) {
    return {
      isSuccess: false,
      errorMessage: '허용되지 않은 다운로드 URL입니다.'
    };
  }

  try {
    const tempDir = getUpdateTempDirectory();
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const fileName = path.basename(new URL(downloadUrl).pathname) || 'update-package.bin';
    const destinationPath = path.join(tempDir, fileName);

    console.info(`📥 [UpdateDownload] 다운로드 시작: ${downloadUrl} -> ${destinationPath}`);

    const response = await fetch(downloadUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'CK3-TTS-Companion-AutoUpdater'
      }
    });

    if (!response.ok || !response.body) {
      return {
        isSuccess: false,
        errorMessage: `다운로드 응답 오류: HTTP ${response.status}`
      };
    }

    const totalBytes = parseInt(response.headers.get('content-length') ?? '0', 10);
    let downloadedBytes = 0;
    let lastTime = Date.now();
    let bytesSinceLastTime = 0;
    let speedBytesPerSec = 0;

    const fileStream = fs.createWriteStream(destinationPath);
    const reader = response.body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      if (value) {
        fileStream.write(Buffer.from(value));
        downloadedBytes += value.length;
        bytesSinceLastTime += value.length;

        const now = Date.now();
        const elapsed = now - lastTime;
        if (elapsed >= 500) {
          speedBytesPerSec = Math.round((bytesSinceLastTime / elapsed) * 1000);
          bytesSinceLastTime = 0;
          lastTime = now;

          const percent = totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : 0;
          if (onProgress) {
            onProgress({
              totalBytes,
              downloadedBytes,
              percent,
              speedBytesPerSec
            });
          }
        }
      }
    }

    fileStream.end();

    if (onProgress) {
      onProgress({
        totalBytes: downloadedBytes,
        downloadedBytes,
        percent: 100,
        speedBytesPerSec: 0
      });
    }

    console.info(`✅ [UpdateDownload] 다운로드 완료: ${destinationPath} (${downloadedBytes} bytes)`);

    return {
      isSuccess: true,
      filePath: destinationPath
    };
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : '알 수 없는 다운로드 실패';
    console.error('❌ [UpdateDownload] 다운로드 중 오류 발생:', error);
    return {
      isSuccess: false,
      errorMessage
    };
  }
};

/**
 * 다운로드된 새 버전을 실행하고 현재 애플리케이션을 안전하게 종료하거나 마운트합니다.
 * 보안 심층 방어: 대상 파일이 앱의 임시 업데이트 디렉터리 내부 파일인지 검증합니다.
 * @param downloadedFilePath - 다운로드 완료된 설치/실행 파일 경로
 * @returns 성공 여부
 */
export const installAndRestartUpdate = async (
  downloadedFilePath: string
): Promise<boolean> => {
  if (!fs.existsSync(downloadedFilePath)) {
    console.error(`❌ [UpdateInstall] 대상 파일이 존재하지 않습니다: ${downloadedFilePath}`);
    return false;
  }

  // [보안 심층 방어] 비인가 임의 파일 실행 차단 (경로 검증)
  const tempDir = getUpdateTempDirectory();
  const resolvedTarget = path.resolve(downloadedFilePath);
  const resolvedTemp = path.resolve(tempDir);

  if (!resolvedTarget.startsWith(resolvedTemp)) {
    console.warn(`⚠️ [UpdateInstall] 비인가 디렉터리 파일 실행 차단됨: ${resolvedTarget}`);
    return false;
  }

  const platform = process.platform;

  try {
    if (platform === 'win32') {
      // Windows: 새 포터블 .exe 실행 후 현재 프로세스 종료
      console.info(`🚀 [UpdateInstall] Windows 새 버전 프로세스 분리 실행: ${downloadedFilePath}`);
      const child = spawn(downloadedFilePath, [], {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();

      // 현재 앱 종료
      setTimeout(() => {
        app.quit();
      }, 500);
      return true;
    }

    if (platform === 'darwin') {
      // macOS: 최신 .dmg 파일 열기 (자동 마운트)
      console.info(`📦 [UpdateInstall] macOS DMG 열기 및 마운트: ${downloadedFilePath}`);
      await shell.openPath(downloadedFilePath);
      return true;
    }

    // Linux 등 기타 플랫폼: 파일 탐색기로 열기
    await shell.showItemInFolder(downloadedFilePath);
    return true;
  } catch (error: unknown) {
    console.error('❌ [UpdateInstall] 업데이트 실행/설치 중 오류 발생:', error);
    return false;
  }
};
