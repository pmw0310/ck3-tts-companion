import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { app } from "electron";
import type { ModSyncResult, ModVersionStatus } from "@/shared/types";
import {
   cleanVersionString,
   compareVersions,
} from "@/shared/versionComparator";

/** Crusader Kings III Steam App ID */
export const CK3_STEAM_APP_ID = "1158310";

/** CK3 Event Voice Reader (TTS Companion) 스팀 창작마당(Workshop) 모드 고유 ID */
export const WORKSHOP_MOD_ID = "3824371603";

/** 모드 식별용 이름 */
const MOD_DISPLAY_NAME = "CK3 Event Voice Reader (TTS Companion)";

/**
 * 프로젝트 내 소스 모드 디렉터리(`ck3-mod`)의 절대 경로를 탐색합니다.
 * 개발 환경 및 프로덕션 번들 환경을 모두 지원합니다.
 * @returns 소스 모드 디렉터리 절대 경로
 */
export const resolveSourceModDir = (): string => {
   const candidates: string[] = [
      path.join(process.cwd(), "ck3-mod"),
      path.join(app ? app.getAppPath() : process.cwd(), "ck3-mod"),
      path.join(process.resourcesPath ?? "", "ck3-mod"),
      path.join(__dirname, "../../ck3-mod"),
      path.join(__dirname, "../ck3-mod"),
   ];

   for (const candidate of candidates) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
         return candidate;
      }
   }

   return path.join(process.cwd(), "ck3-mod");
};

/**
 * 운영체제에 따른 후보 Crusader Kings III 문서(Paradox Interactive) `mod` 상위 폴더 목록을 반환합니다.
 * @returns 후보 `mod` 상위 폴더 절대 경로 배열
 */
export const getCandidateParadoxModRootDirs = (): string[] => {
   const homeDir = os.homedir();
   const platform = process.platform;
   const roots: string[] = [];

   if (platform === "win32") {
      roots.push(
         path.join(
            homeDir,
            "Documents",
            "Paradox Interactive",
            "Crusader Kings III",
            "mod",
         ),
         path.join(
            homeDir,
            "OneDrive",
            "Documents",
            "Paradox Interactive",
            "Crusader Kings III",
            "mod",
         ),
      );
   } else if (platform === "darwin") {
      roots.push(
         path.join(
            homeDir,
            "Documents",
            "Paradox Interactive",
            "Crusader Kings III",
            "mod",
         ),
         path.join(
            homeDir,
            "Library",
            "Application Support",
            "Paradox Interactive",
            "Crusader Kings III",
            "mod",
         ),
      );
   } else {
      roots.push(
         path.join(
            homeDir,
            ".local",
            "share",
            "Paradox Interactive",
            "Crusader Kings III",
            "mod",
         ),
         path.join(
            homeDir,
            ".steam",
            "steam",
            "steamapps",
            "compatdata",
            CK3_STEAM_APP_ID,
            "pfx",
            "drive_c",
            "users",
            "steamuser",
            "Documents",
            "Paradox Interactive",
            "Crusader Kings III",
            "mod",
         ),
      );
   }

   return roots;
};

/**
 * 운영체제에 따른 실제 Crusader Kings III 모드 설치 대상 디렉터리를 계산합니다.
 * @returns 실제 CK3 모드 폴더 절대 경로
 */
export const resolveGameModDir = (): string => {
   const homeDir = os.homedir();
   const platform = process.platform;

   if (platform === "darwin" || platform === "win32") {
      // Windows 및 macOS 기본 사용자 문서 폴더
      const standardPath = path.join(
         homeDir,
         "Documents",
         "Paradox Interactive",
         "Crusader Kings III",
         "mod",
         "ck3-tts-companion",
      );

      if (platform === "win32") {
         const oneDrivePath = path.join(
            homeDir,
            "OneDrive",
            "Documents",
            "Paradox Interactive",
            "Crusader Kings III",
            "mod",
            "ck3-tts-companion",
         );
         // 표준 경로가 없고 OneDrive 경로만 존재하는 경우 OneDrive 선택
         if (
            !fs.existsSync(path.dirname(standardPath)) &&
            fs.existsSync(path.dirname(oneDrivePath))
         ) {
            return oneDrivePath;
         }
         if (fs.existsSync(oneDrivePath) && !fs.existsSync(standardPath)) {
            return oneDrivePath;
         }
      }

      return standardPath;
   }

   // Linux (Steam Proton / 네이티브)
   return path.join(
      homeDir,
      ".local",
      "share",
      "Paradox Interactive",
      "Crusader Kings III",
      "mod",
      "ck3-tts-companion",
   );
};

/**
 * `.mod` 디스크립터 파일 내용에서 버전, 경로(`path` 또는 `archive`), 창작마당 ID(`remote_file_id`), 이름(`name`)을 파싱합니다.
 * @param content - `.mod` 파일의 UTF-8 문자열 내용
 * @returns 파싱된 메타데이터 객체
 */
export const parseModDescriptorContent = (
   content: string,
): {
   version: string | null;
   modPath: string | null;
   archivePath: string | null;
   remoteFileId: string | null;
   name: string | null;
} => {
   const versionMatch = /version\s*=\s*"([^"]+)"/.exec(content);
   const pathMatch = /(?:^|\r?\n)\s*path\s*=\s*"([^"]+)"/.exec(content);
   const archiveMatch = /(?:^|\r?\n)\s*archive\s*=\s*"([^"]+)"/.exec(content);
   const remoteIdMatch = /remote_file_id\s*=\s*"([^"]+)"/.exec(content);
   const nameMatch = /(?:^|\r?\n)\s*name\s*=\s*"([^"]+)"/.exec(content);

   return {
      version: versionMatch?.[1] ? cleanVersionString(versionMatch[1]) : null,
      modPath: pathMatch?.[1] ? pathMatch[1].trim() : null,
      archivePath: archiveMatch?.[1] ? archiveMatch[1].trim() : null,
      remoteFileId: remoteIdMatch?.[1] ? remoteIdMatch[1].trim() : null,
      name: nameMatch?.[1] ? nameMatch[1].trim() : null,
   };
};

/**
 * 주어진 모드 디렉터리에서 `descriptor.mod` 또는 `metadata.json`의 버전 정보를 추출합니다.
 * @param modDir - 대상 모드 디렉터리 경로
 * @returns 파싱된 버전 문자열 또는 null
 */
export const readModVersionFromDir = (modDir: string): string | null => {
   try {
      const descriptorPath = path.join(modDir, "descriptor.mod");
      if (fs.existsSync(descriptorPath)) {
         const content = fs.readFileSync(descriptorPath, "utf-8");
         const parsed = parseModDescriptorContent(content);
         if (parsed.version) {
            return parsed.version;
         }
      }

      const metadataPath = path.join(modDir, "metadata.json");
      if (fs.existsSync(metadataPath)) {
         const content = fs.readFileSync(metadataPath, "utf-8");
         const parsed = JSON.parse(content) as Record<string, unknown>;
         if (typeof parsed.version === "string") {
            return cleanVersionString(parsed.version);
         }
      }
   } catch (error: unknown) {
      console.warn(`⚠️ [ModSync] 모드 버전 읽기 실패 (${modDir}):`, error);
   }
   return null;
};

/**
 * Steam의 `libraryfolders.vdf` 파일 내용에서 등록된 스팀 라이브러리 경로 목록을 추출합니다.
 * @param vdfContent - `libraryfolders.vdf` 파일의 텍스트 내용
 * @returns 추출된 라이브러리 루트 경로 배열
 */
export const parseSteamLibraryFoldersVdf = (vdfContent: string): string[] => {
   const paths: string[] = [];
   const regex = /"path"\s+"([^"]+)"/gi;
   let match: RegExpExecArray | null = regex.exec(vdfContent);
   while (match !== null) {
      if (match[1]) {
         const unescaped = match[1].replace(/\\\\/g, "\\");
         paths.push(unescaped);
      }
      match = regex.exec(vdfContent);
   }
   return paths;
};

/**
 * 시스템 내 설치 가능한 Steam 라이브러리 폴더들의 후보 목록을 탐색합니다.
 * 기본 설치 경로 및 `libraryfolders.vdf`에 등록된 외부 드라이브 라이브러리를 모두 포함합니다.
 * @returns Steam 라이브러리 경로 목록 (중복 제거됨)
 */
export const getCandidateSteamLibraryDirs = (): string[] => {
   const homeDir = os.homedir();
   const platform = process.platform;
   const baseSteamDirs: string[] = [];

   if (platform === "win32") {
      const progFilesX86 =
         process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)";
      const progFiles = process.env.PROGRAMFILES ?? "C:\\Program Files";
      baseSteamDirs.push(
         path.join(progFilesX86, "Steam"),
         path.join(progFiles, "Steam"),
      );

      // 주요 드라이브 루트의 스팀 라이브러리 후보 경로 추가
      for (const drive of ["C", "D", "E", "F", "G"]) {
         baseSteamDirs.push(
            `${drive}:\\SteamLibrary`,
            `${drive}:\\Steam`,
            `${drive}:\\Program Files (x86)\\Steam`,
            `${drive}:\\Games\\Steam`,
            `${drive}:\\Games\\SteamLibrary`,
         );
      }
   } else if (platform === "darwin") {
      baseSteamDirs.push(
         path.join(homeDir, "Library", "Application Support", "Steam"),
      );
   } else {
      baseSteamDirs.push(
         path.join(homeDir, ".local", "share", "Steam"),
         path.join(homeDir, ".steam", "steam"),
         path.join(
            homeDir,
            ".var",
            "app",
            "com.valvesoftware.Steam",
            ".local",
            "share",
            "Steam",
         ),
      );
   }

   const discoveredLibraries = new Set<string>();

   for (const candidate of baseSteamDirs) {
      discoveredLibraries.add(candidate);
      const vdfPath = path.join(candidate, "steamapps", "libraryfolders.vdf");
      try {
         if (fs.existsSync(vdfPath)) {
            const vdfContent = fs.readFileSync(vdfPath, "utf-8");
            for (const libPath of parseSteamLibraryFoldersVdf(vdfContent)) {
               discoveredLibraries.add(libPath);
            }
         }
      } catch {
         // 권한 오류 등은 무시하고 다음 경로 계속 탐색
      }
   }

   return Array.from(discoveredLibraries);
};

/**
 * 감지된 개별 모드 설치 정보
 */
export type DetectedModInstallation = {
   readonly targetModDir: string;
   readonly installedVersion: string | null;
   readonly sourceType: "workshop-descriptor" | "workshop-dir" | "local-dir";
};

/**
 * 주어진 Paradox `mod` 폴더들과 Steam 라이브러리 폴더들에서 설치된 TTS 모드를 모두 탐색합니다.
 * - 1순위: 패러독스 런처가 생성한 `ugc_3824371603.mod` (또는 동일 `remote_file_id`를 가진 `.mod` 파일)
 * - 2순위: 스팀 창작마당 워크샵 폴더 (`steamapps/workshop/content/1158310/3824371603`)
 * - 3순위: 로컬 모드 폴더 (`mod/ck3-tts-companion` 및 `mod/CK3 Event Voice Reader (TTS Companion)`)
 * @param paradoxModRoots - 탐색할 Paradox `mod` 상위 폴더 목록
 * @param steamLibraryDirs - 탐색할 Steam 라이브러리 폴더 목록
 * @returns 감지된 모드 설치 목록
 */
export const detectInstalledModLocations = (
   paradoxModRoots: readonly string[] = getCandidateParadoxModRootDirs(),
   steamLibraryDirs: readonly string[] = getCandidateSteamLibraryDirs(),
): DetectedModInstallation[] => {
   const installations: DetectedModInstallation[] = [];
   const seenDirs = new Set<string>();

   const addInstallation = (
      targetModDir: string,
      installedVersion: string | null,
      sourceType: DetectedModInstallation["sourceType"],
   ): void => {
      const normalized = path.normalize(targetModDir);
      const key = `${normalized}::${installedVersion ?? ""}`;
      if (!seenDirs.has(key)) {
         seenDirs.add(key);
         installations.push({
            targetModDir: normalized,
            installedVersion,
            sourceType,
         });
      }
   };

   // 1. Paradox `mod` 폴더 내 `.mod` 디스크립터 파일(`ugc_3824371603.mod` 등) 및 로컬 폴더 검사
   for (const modRoot of paradoxModRoots) {
      if (!fs.existsSync(modRoot)) {
         continue;
      }

      const ck3DataDir = path.dirname(modRoot);

      // 1-A. `.mod` 파일 스캔 (`ugc_3824371603.mod` 우선 검사 후 폴더 내 다른 `.mod` 파일 확인)
      try {
         const entries = fs.readdirSync(modRoot, { withFileTypes: true });
         const modFiles = entries
            .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".mod"))
            .map((e) => e.name)
            .sort((a, b) => {
               const aIsUgc = a === `ugc_${WORKSHOP_MOD_ID}.mod` ? -1 : 0;
               const bIsUgc = b === `ugc_${WORKSHOP_MOD_ID}.mod` ? -1 : 0;
               return aIsUgc - bIsUgc;
            });

         for (const fileName of modFiles) {
            const modFilePath = path.join(modRoot, fileName);
            try {
               const content = fs.readFileSync(modFilePath, "utf-8");
               const parsed = parseModDescriptorContent(content);
               const isTargetMod =
                  fileName === `ugc_${WORKSHOP_MOD_ID}.mod` ||
                  parsed.remoteFileId === WORKSHOP_MOD_ID ||
                  parsed.name === MOD_DISPLAY_NAME ||
                  fileName === "ck3-tts-companion.mod";

               if (!isTargetMod) {
                  continue;
               }

               if (parsed.modPath) {
                  const resolvedModPath = path.isAbsolute(parsed.modPath)
                     ? parsed.modPath
                     : path.resolve(ck3DataDir, parsed.modPath);

                  if (fs.existsSync(resolvedModPath)) {
                     const dirVersion =
                        readModVersionFromDir(resolvedModPath) ??
                        parsed.version;
                     addInstallation(
                        resolvedModPath,
                        dirVersion,
                        "workshop-descriptor",
                     );
                     continue;
                  }
               }

               if (parsed.archivePath) {
                  const resolvedArchivePath = path.isAbsolute(
                     parsed.archivePath,
                  )
                     ? parsed.archivePath
                     : path.resolve(ck3DataDir, parsed.archivePath);

                  if (fs.existsSync(resolvedArchivePath)) {
                     addInstallation(
                        path.dirname(resolvedArchivePath),
                        parsed.version,
                        "workshop-descriptor",
                     );
                     continue;
                  }
               }

               // path/archive 속성이 없거나(단위 테스트/특수 환경) .mod 자체에 버전이 명시된 경우
               if (!parsed.modPath && !parsed.archivePath && parsed.version) {
                  addInstallation(
                     modFilePath,
                     parsed.version,
                     "workshop-descriptor",
                  );
               }
            } catch {
               // 개별 .mod 파일 파싱 실패 시 무시
            }
         }
      } catch {
         // 디렉터리 읽기 실패 시 무시
      }

      // 1-B. 로컬 모드 하위 디렉터리 확인 (`ck3-tts-companion` 및 창작마당 배포 폴더명)
      const localCandidateDirs = [
         path.join(modRoot, "ck3-tts-companion"),
         path.join(modRoot, MOD_DISPLAY_NAME),
      ];

      for (const localDir of localCandidateDirs) {
         if (fs.existsSync(localDir)) {
            try {
               if (fs.statSync(localDir).isDirectory()) {
                  const version = readModVersionFromDir(localDir);
                  addInstallation(localDir, version, "local-dir");
               }
            } catch {
               // stat 실패 시 무시
            }
         }
      }
   }

   // 2. Steam 라이브러리 내 창작마당 워크샵 폴더 직접 탐색 (`steamapps/workshop/content/1158310/3824371603`)
   for (const steamLib of steamLibraryDirs) {
      const workshopModDir = path.join(
         steamLib,
         "steamapps",
         "workshop",
         "content",
         CK3_STEAM_APP_ID,
         WORKSHOP_MOD_ID,
      );

      if (fs.existsSync(workshopModDir)) {
         try {
            if (fs.statSync(workshopModDir).isDirectory()) {
               const version = readModVersionFromDir(workshopModDir);
               addInstallation(workshopModDir, version, "workshop-dir");
            }
         } catch {
            // stat 실패 시 무시
         }
      }
   }

   return installations;
};

/**
 * 원본 소스 모드 디렉터리와 설치된 모드 디렉터리의 파일 구조 및 바이트 내용이 100% 일치하는지 검증합니다.
 * @param srcDir - 원본 소스 디렉터리 (`ck3-mod`)
 * @param destDir - 설치된 대상 모드 디렉터리
 * @returns 모든 파일이 완벽히 일치하면 true, 하나라도 다르거나 누락되었으면 false
 */
export const areModDirectoriesIdentical = (srcDir: string, destDir: string): boolean => {
   try {
      if (!fs.existsSync(srcDir) || !fs.existsSync(destDir)) {
         return false;
      }
      if (!fs.statSync(srcDir).isDirectory() || !fs.statSync(destDir).isDirectory()) {
         return false;
      }

      const srcEntries = fs.readdirSync(srcDir, { withFileTypes: true });
      const destEntries = fs.readdirSync(destDir, { withFileTypes: true });

      if (srcEntries.length !== destEntries.length) {
         return false;
      }

      const destMap = new Map(destEntries.map((e) => [e.name, e]));

      for (const srcEntry of srcEntries) {
         const destEntry = destMap.get(srcEntry.name);
         if (!destEntry || srcEntry.isDirectory() !== destEntry.isDirectory()) {
            return false;
         }

         const srcPath = path.join(srcDir, srcEntry.name);
         const destPath = path.join(destDir, srcEntry.name);

         if (srcEntry.isDirectory()) {
            if (!areModDirectoriesIdentical(srcPath, destPath)) {
               return false;
            }
         } else {
            const srcStat = fs.statSync(srcPath);
            const destStat = fs.statSync(destPath);
            if (srcStat.size !== destStat.size) {
               return false;
            }
            const srcBuf = fs.readFileSync(srcPath);
            const destBuf = fs.readFileSync(destPath);
            if (!srcBuf.equals(destBuf)) {
               return false;
            }
         }
      }

      return true;
   } catch {
      return false;
   }
};

/**
 * 현재 프로그램 버전과 실제 게임에 설치된 모드(스팀 창작마당 및 로컬 폴더) 버전·바이트 정합성 상태를 조회합니다.
 * @returns 모드 버전 동기화 상태 객체
 */
export const getModVersionStatus = async (): Promise<ModVersionStatus> => {
   const sourceModDir = resolveSourceModDir();
   const sourceVersion = readModVersionFromDir(sourceModDir);
   const appVersion = cleanVersionString(
      (app && typeof app.getVersion === "function" ? app.getVersion() : null) ||
         sourceVersion ||
         "1.11.3",
   );
   const fallbackTargetModDir = resolveGameModDir();

   const installations = detectInstalledModLocations();

   if (installations.length === 0) {
      return {
         isInstalled: false,
         isSynced: false,
         appVersion,
         installedVersion: null,
         targetModDir: fallbackTargetModDir,
         sourceModDir,
      };
   }

   // 여러 경로(예: 스팀 워크샵 + 로컬 폴더)가 동시에 감지된 경우:
   // 1) 현재 앱 버전 이상으로 동기화된 모드를 최우선 선택
   // 2) 그렇지 않다면 가장 최신 버전을 가진 설치본 선택
   const syncedInstall = installations.find(
      (item) =>
         item.installedVersion !== null &&
         compareVersions(item.installedVersion, appVersion) >= 0,
   );

   const bestInstall =
      syncedInstall ??
      installations.reduce((best, current) => {
         if (!best.installedVersion) return current;
         if (!current.installedVersion) return best;
         return compareVersions(
            current.installedVersion,
            best.installedVersion,
         ) > 0
            ? current
            : best;
      }, installations[0]!);

   const installedVersion = bestInstall.installedVersion;
   const isVersionMatch =
      installedVersion !== null &&
      compareVersions(installedVersion, appVersion) >= 0;

   // 감지된 모든 실제 디렉터리 설치본이 원본(sourceModDir)과 바이트 단위로 일치하는지 검증
   const directoryInstallations = installations.filter((inst) => {
      try {
         return fs.existsSync(inst.targetModDir) && fs.statSync(inst.targetModDir).isDirectory();
      } catch {
         return false;
      }
   });
   const isContentMatch =
      directoryInstallations.length > 0 &&
      directoryInstallations.every((inst) =>
         areModDirectoriesIdentical(sourceModDir, inst.targetModDir),
      );
   const isSynced = isVersionMatch && isContentMatch;

   return {
      isInstalled: true,
      isSynced,
      appVersion,
      installedVersion,
      targetModDir: bestInstall.targetModDir,
      sourceModDir,
   };
};

/**
 * 디렉터리를 재귀적으로 미러링 동기화합니다.
 * @param src - 원본 소스 디렉터리
 * @param dest - 동기화 대상 디렉터리
 * @returns 복사 및 삭제된 파일 개수 객체
 */
const mirrorDirectory = (
   src: string,
   dest: string,
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
            copiedCount += 1;
         }
      }
   }

   return { copiedCount, removedCount };
};

/**
 * 로컬 모드 폴더(`mod/ck3-tts-companion`) 설치 시 패러독스 런처가 로컬 모드로 인식하도록
 * 상위 `mod/` 폴더에 `ck3-tts-companion.mod` 디스크립터 파일을 생성/갱신합니다.
 * @param sourceModDir - 원본 `ck3-mod` 디렉터리
 * @param targetModDir - 설치된 로컬 모드 디렉터리
 */
const ensureLocalLauncherDescriptor = (
   sourceModDir: string,
   targetModDir: string,
): void => {
   try {
      const modParentDir = path.dirname(targetModDir);
      if (path.basename(modParentDir).toLowerCase() !== "mod") {
         return;
      }

      const localDescriptorPath = path.join(
         modParentDir,
         "ck3-tts-companion.mod",
      );

      const srcDescriptorPath = path.join(sourceModDir, "descriptor.mod");
      if (!fs.existsSync(srcDescriptorPath)) {
         return;
      }

      const rawDescriptor = fs
         .readFileSync(srcDescriptorPath, "utf-8")
         .trimEnd();
      const normalizedTarget = targetModDir.replace(/\\/g, "/");
      const hasPathLine = /(?:^|\r?\n)\s*path\s*=/.test(rawDescriptor);
      const finalDescriptor = hasPathLine
         ? rawDescriptor.replace(
              /(?:^|\r?\n)\s*path\s*=\s*"[^"]*"/,
              `\npath="${normalizedTarget}"`,
           )
         : `${rawDescriptor}\npath="${normalizedTarget}"\n`;

      fs.writeFileSync(localDescriptorPath, finalDescriptor, "utf-8");
   } catch (error: unknown) {
      console.warn(
         "⚠️ [ModSync] 로컬 런처 .mod 디스크립터 생성 건너뜀:",
         error,
      );
   }
};

/**
 * 패러독스 런처의 SQLite 데이터베이스(`launcher-v2.sqlite`)에 모드 썸네일 경로를 자동 등록합니다.
 * @param targetModDir - 설치된 실제 모드 디렉터리
 */
const updateLauncherThumbnailDatabase = (targetModDir: string): void => {
   const homeDir = os.homedir();
   const candidates = [
      path.join(
         homeDir,
         "Documents",
         "Paradox Interactive",
         "Crusader Kings III",
         "launcher-v2.sqlite",
      ),
      path.join(
         homeDir,
         "OneDrive",
         "Documents",
         "Paradox Interactive",
         "Crusader Kings III",
         "launcher-v2.sqlite",
      ),
      path.join(
         homeDir,
         ".local",
         "share",
         "Paradox Interactive",
         "Crusader Kings III",
         "launcher-v2.sqlite",
      ),
   ];

   const dbPath = candidates.find((p) => fs.existsSync(p));
   if (!dbPath) {
      return;
   }

   const thumbnailPath = path.join(targetModDir, "thumbnail.png");
   if (!fs.existsSync(thumbnailPath) || /[\0\r\n;]/.test(thumbnailPath)) {
      return;
   }

   try {
      const escapedThumbPath = thumbnailPath.replace(/'/g, "''");
      const sql = `UPDATE mods SET thumbnailPath = '${escapedThumbPath}' WHERE dirPath LIKE '%ck3-tts-companion%' OR dirPath LIKE '%${WORKSHOP_MOD_ID}%';`;
      execFileSync("sqlite3", [dbPath, sql], { stdio: "pipe" });
      console.info(
         "✅ [ModSync] 패러독스 런처 DB에 로컬 모드 썸네일 경로 자동 주입 완료",
      );
   } catch {
      console.warn(
         "⚠️ [ModSync] 패러독스 런처 썸네일 주입 건너뜀 (sqlite3 CLI 미설치 등)",
      );
   }
};

/**
 * 최신 CK3 모드 파일들을 실제 게임 모드 디렉터리로 원자적으로 동기화합니다.
 * 스팀 창작마당 워크샵 폴더와 로컬 모드 폴더(`mod/ck3-tts-companion`)를 모두 최신화합니다.
 * @returns 모드 동기화 수행 결과 객체
 */
export const syncModFiles = async (): Promise<ModSyncResult> => {
   const sourceModDir = resolveSourceModDir();
   const sourceVersion = readModVersionFromDir(sourceModDir);
   const appVersion = cleanVersionString(
      (app && typeof app.getVersion === "function" ? app.getVersion() : null) ||
         sourceVersion ||
         "1.11.3",
   );

   const detectedDirs = detectInstalledModLocations()
      .map((inst) => inst.targetModDir)
      .filter((dir) => {
         try {
            return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
         } catch {
            return false;
         }
      });

   const localGameModDir = resolveGameModDir();
   const uniqueTargetDirs = Array.from(
      new Set([...detectedDirs, localGameModDir]),
   );
   const primaryTargetModDir = uniqueTargetDirs[0]!;

   if (!fs.existsSync(sourceModDir)) {
      const errorMessage = `소스 모드 디렉터리를 찾을 수 없습니다: ${sourceModDir}`;
      console.error(`❌ [ModSync] ${errorMessage}`);
      return {
         isSuccess: false,
         copiedFilesCount: 0,
         removedFilesCount: 0,
         targetModDir: primaryTargetModDir,
         syncedVersion: appVersion,
         errorMessage,
      };
   }

   try {
      let totalCopied = 0;
      let totalRemoved = 0;

      for (const targetDir of uniqueTargetDirs) {
         console.info(
            `🔄 [ModSync] 모드 파일 동기화 시작: ${sourceModDir} -> ${targetDir}`,
         );
         const { copiedCount, removedCount } = mirrorDirectory(
            sourceModDir,
            targetDir,
         );
         totalCopied += copiedCount;
         totalRemoved += removedCount;
         ensureLocalLauncherDescriptor(sourceModDir, targetDir);
         updateLauncherThumbnailDatabase(targetDir);
      }

      console.info(
         `✅ [ModSync] 모드 동기화 완료! 복사: ${totalCopied}개, 삭제: ${totalRemoved}개`,
      );

      return {
         isSuccess: true,
         copiedFilesCount: totalCopied,
         removedFilesCount: totalRemoved,
         targetModDir: primaryTargetModDir,
         syncedVersion: appVersion,
      };
   } catch (error: unknown) {
      const errorMessage =
         error instanceof Error ? error.message : "알 수 없는 파일 복사 오류";
      console.error("❌ [ModSync] 모드 동기화 중 오류 발생:", error);

      return {
         isSuccess: false,
         copiedFilesCount: 0,
         removedFilesCount: 0,
         targetModDir: primaryTargetModDir,
         syncedVersion: appVersion,
         errorMessage,
      };
   }
};
