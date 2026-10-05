import { app } from 'electron';
import type { AppInfo, UpdateCheckResult } from '@/shared/types';
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
  const version = app ? app.getVersion() : '1.4.0';
  return {
    version: version || '1.4.0',
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
      'aistudio.google.com'
    ];
    return allowedHosts.some(
      (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)
    );
  } catch {
    return false;
  }
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
};

/**
 * GitHub 릴리스 API를 호출하여 최신 버전 정보 및 업데이트 유무를 조회합니다.
 * @param customCurrentVersion - 테스트 등을 위한 임의의 현재 버전 (생략 시 앱 버전 사용)
 * @returns 업데이트 검사 결과 객체
 */
export const checkForAppUpdates = async (
  customCurrentVersion?: string
): Promise<UpdateCheckResult> => {
  const currentVersion = customCurrentVersion ?? getAppMetadata().version;
  const fallbackUrl = `${GITHUB_REPO_URL}/releases/latest`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

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

    if (hasUpdate) {
      console.info(
        `ℹ️ [UpdateCheck] 새 버전 감지: 현재 ${currentVersion} -> 최신 ${latestVersion}`
      );
    } else {
      console.info(
        `✅ [UpdateCheck] 최신 버전을 사용 중입니다: ${currentVersion}`
      );
    }

    return {
      hasUpdate,
      currentVersion,
      latestVersion,
      releaseUrl,
      releaseTitle: data.name ?? `v${latestVersion}`,
      releaseNotes: data.body ?? '',
      publishedAt: data.published_at
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
