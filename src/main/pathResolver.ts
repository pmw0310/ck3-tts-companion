import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import type { SupportedPlatform } from '@/shared/types';

/**
 * 운영체제(macOS / Windows / Linux)에 따른 기본 CK3 debug.log 경로를 계산합니다.
 * @returns debug.log 파일의 예상 경로 목록 (우선순위 순)
 */
export const getCandidateLogPaths = (): readonly string[] => {
  const homeDirectory = os.homedir();
  const currentPlatform = process.platform as SupportedPlatform;

  const candidatePaths: string[] = [];

  if (currentPlatform === 'darwin') {
    // macOS: Documents 폴더
    candidatePaths.push(
      path.join(
        homeDirectory,
        'Documents',
        'Paradox Interactive',
        'Crusader Kings III',
        'logs',
        'debug.log'
      )
    );
    // macOS 대체 경로: Application Support
    candidatePaths.push(
      path.join(
        homeDirectory,
        'Library',
        'Application Support',
        'Paradox Interactive',
        'Crusader Kings III',
        'logs',
        'debug.log'
      )
    );
  } else if (currentPlatform === 'win32') {
    // Windows: Documents 폴더
    candidatePaths.push(
      path.join(
        homeDirectory,
        'Documents',
        'Paradox Interactive',
        'Crusader Kings III',
        'logs',
        'debug.log'
      )
    );
    // Windows OneDrive 동기화 문서 경로
    candidatePaths.push(
      path.join(
        homeDirectory,
        'OneDrive',
        'Documents',
        'Paradox Interactive',
        'Crusader Kings III',
        'logs',
        'debug.log'
      )
    );
  } else {
    // Linux 기본 경로 (.local/share)
    candidatePaths.push(
      path.join(
        homeDirectory,
        '.local',
        'share',
        'Paradox Interactive',
        'Crusader Kings III',
        'logs',
        'debug.log'
      )
    );
  }

  return candidatePaths;
};

/**
 * 시스템에서 실제 존재하는 CK3 debug.log 경로를 자동으로 탐색하여 반환합니다.
 * @param customPath - 사용자가 직접 지정한 커스텀 경로 (선택적)
 * @returns 유효한 debug.log 절대 경로 또는 null
 */
export const resolveCk3LogPath = (customPath?: string | null): string | null => {
  // 사용자가 수동 설정한 경로가 우선
  if (customPath && fs.existsSync(customPath)) {
    return customPath;
  }

  const candidates = getCandidateLogPaths();
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // 아직 게임을 켜지 않아 파일이 없을 경우 첫 번째 기본 경로를 반환할 수도 있음
  return candidates[0] ?? null;
};
