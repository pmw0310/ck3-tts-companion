/**
 * Semantic Versioning 2.0 규격에 따른 버전 문자열 파싱 결과
 */
export type ParsedSemVer = {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease: string | null;
};

/**
 * 버전 문자열에서 'v' 접두사를 제거하고 정규화합니다.
 * @param version - 정규화할 버전 문자열 (예: 'v1.4.0')
 * @returns 정규화된 버전 문자열 (예: '1.4.0')
 */
export const cleanVersionString = (version: string): string => {
  return version.trim().replace(/^v/i, '');
};

/**
 * SemVer 형식의 버전 문자열을 파싱합니다.
 * @param versionStr - 파싱할 버전 문자열 (예: '1.4.0', 'v2.1.0-beta.1')
 * @returns 파싱된 SemVer 객체, 올바르지 않은 형식이면 null 반환
 */
export const parseSemVer = (versionStr: string): ParsedSemVer | null => {
  const cleaned = cleanVersionString(versionStr);
  // SemVer 정규식: MAJOR.MINOR.PATCH(-PRERELEASE)?
  const semverRegex = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
  const match = cleaned.match(semverRegex);

  if (!match) {
    return null;
  }

  const major = parseInt(match[1] ?? '0', 10);
  const minor = parseInt(match[2] ?? '0', 10);
  const patch = parseInt(match[3] ?? '0', 10);
  const prerelease = match[4] ?? null;

  return { major, minor, patch, prerelease };
};

/**
 * 두 버전 문자열을 비교합니다.
 * @param v1 - 첫 번째 버전 (예: 원격 최신 버전)
 * @param v2 - 두 번째 버전 (예: 현재 설치된 버전)
 * @returns v1 > v2 이면 1, v1 < v2 이면 -1, 동일하면 0 반환
 */
export const compareVersions = (v1: string, v2: string): number => {
  const p1 = parseSemVer(v1);
  const p2 = parseSemVer(v2);

  if (!p1 || !p2) {
    // 파싱 실패 시 단순 문자열 비교
    return cleanVersionString(v1).localeCompare(cleanVersionString(v2), undefined, {
      numeric: true,
      sensitivity: 'base'
    });
  }

  if (p1.major !== p2.major) {
    return p1.major > p2.major ? 1 : -1;
  }

  if (p1.minor !== p2.minor) {
    return p1.minor > p2.minor ? 1 : -1;
  }

  if (p1.patch !== p2.patch) {
    return p1.patch > p2.patch ? 1 : -1;
  }

  // prerelease 비교: prerelease가 없는 정식 버전이 prerelease가 있는 버전보다 높음
  if (p1.prerelease === null && p2.prerelease !== null) {
    return 1;
  }
  if (p1.prerelease !== null && p2.prerelease === null) {
    return -1;
  }
  if (p1.prerelease !== null && p2.prerelease !== null) {
    return p1.prerelease.localeCompare(p2.prerelease, undefined, { numeric: true });
  }

  return 0;
};

/**
 * 원격 버전이 현재 버전보다 최신(상위) 버전인지 여부를 판별합니다.
 * @param remoteVersion - 원격 저장소의 릴리스 버전 (예: 'v1.4.1')
 * @param currentVersion - 현재 앱의 로컬 버전 (예: '1.4.0')
 * @returns 원격 버전이 더 높은 상위 버전이면 true, 아니면 false
 */
export const isNewerVersion = (
  remoteVersion: string,
  currentVersion: string
): boolean => {
  return compareVersions(remoteVersion, currentVersion) > 0;
};
