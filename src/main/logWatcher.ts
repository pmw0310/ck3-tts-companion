import fs from 'node:fs';
import path from 'node:path';
import chokidar from 'chokidar';
import type { FSWatcher } from 'chokidar';
import { extractCk3EventsFromChunk } from '@/main/textSanitizer';
import type { Ck3EventMessage } from '@/shared/types';

/** 로그 감시자 상태 및 제어 핸들 */
export type LogWatcherHandle = {
  readonly stop: () => Promise<void>;
  readonly getPath: () => string;
};

/** 중복 감시 캐시 최대 저장 개수 (메모리 팽창 방지) */
const MAX_CACHE_SIZE = 100;
/** 중복 감시 캐시 유효 시간 (180초 = 3분, 알현실 체류 중 만료 방지) */
const CACHE_TTL_MS = 180000;

/**
 * 최근 이벤트 캐시에 항목을 기록하고 만료되었거나 상한을 초과한 항목을 안전하게 정리합니다.
 * @param cache - 최근 이벤트 캐시 Map
 * @param content - 이벤트 본문
 * @param timestamp - 현재 시각 (ms)
 */
const updateRecentEventCache = (
  cache: Map<string, number>,
  content: string,
  timestamp: number
): void => {
  cache.set(content, timestamp);

  // 1. 만료 항목 정리
  for (const [cachedContent, time] of cache.entries()) {
    if (timestamp - time > CACHE_TTL_MS) {
      cache.delete(cachedContent);
    }
  }

  // 2. 최대 개수 초과 시 가장 오래된 항목(FIFO) 삭제
  if (cache.size > MAX_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) {
      cache.delete(oldestKey);
    }
  }
};

/**
 * 지정된 CK3 debug.log 및 동일 디렉터리의 error.log를 실시간 동시 감시하며, 이벤트 텍스트가 추가되면 콜백을 실행합니다.
 * @param logFilePath - 기본 감시할 debug.log의 절대 경로
 * @param onEvent - 유효한 이벤트 감지 시 호출될 콜백 함수
 * @param onStatusChange - 파일 감시 상태 변경 시 호출될 콜백 함수
 * @param onStop - 창 닫힘 신호 감지 시 오디오 중단 콜백 함수
 * @returns 감시 제어 객체 (stop 메서드 포함)
 */
export const startWatchingLogFile = (
  logFilePath: string,
  onEvent: (event: Ck3EventMessage) => void,
  onStatusChange?: (isWatching: boolean, filePath: string) => void,
  onStop?: () => void
): LogWatcherHandle => {
  const filePositions = new Map<string, number>();
  let watcher: FSWatcher | null = null;
  const recentEventCache = new Map<string, number>();

  // 감시할 파일 목록 구성 (기본 debug.log 및 파서 구문 에러가 기록되는 error.log 동시 감시)
  const debugLogPath = path.resolve(logFilePath);
  const logDir = path.dirname(debugLogPath);
  const errorLogPath = path.join(logDir, 'error.log');

  const watchPaths: string[] = [debugLogPath];
  if (fs.existsSync(errorLogPath)) {
    watchPaths.push(errorLogPath);
  }

  // 기존 파일 크기 기록 (앱 시작 시점 이전의 지난 로그는 읽지 않고 건너뜀)
  for (const targetPath of watchPaths) {
    if (fs.existsSync(targetPath)) {
      try {
        const stats = fs.statSync(targetPath);
        filePositions.set(targetPath, stats.size);
      } catch (err: unknown) {
        console.warn(`⚠️ [LogWatcher] 초기 파일 크기 확인 실패 (${targetPath}):`, err);
      }
    }
  }

  watcher = chokidar.watch(watchPaths, {
    persistent: true,
    usePolling: true,
    interval: 200
  });

  /**
   * 지정된 로그 파일에서 새로 추가된 내용을 읽고 이벤트 및 중단 신호를 파싱합니다.
   * @param targetFilePath - 변경된 파일의 절대 경로
   */
  const handleFileChange = (targetFilePath: string): void => {
    const normalizedPath = path.resolve(targetFilePath);
    if (!fs.existsSync(normalizedPath)) {
      return;
    }

    try {
      const currentStats = fs.statSync(normalizedPath);
      let filePosition = filePositions.get(normalizedPath) ?? 0;

      // 게임 재시작 등으로 파일이 새로 쓰여 크기가 줄어든 경우 (truncate 또는 새 파일 생성)
      if (currentStats.size < filePosition) {
        filePosition = 0;
      }

      if (currentStats.size === filePosition) {
        return;
      }

      // createReadStream의 end는 inclusive(포함)이므로 정확한 바이트 경계를 위해 currentStats.size - 1 지정
      const readEnd = Math.max(filePosition, currentStats.size - 1);
      const stream = fs.createReadStream(normalizedPath, {
        start: filePosition,
        end: readEnd,
        encoding: 'utf-8'
      });

      filePositions.set(normalizedPath, currentStats.size);

      let bufferText = '';
      stream.on('data', (chunk: unknown) => {
        if (typeof chunk === 'string') {
          bufferText += chunk;
        }
      });

      stream.on('error', (streamError: unknown) => {
        console.error('❌ [LogWatcher Stream Error]:', streamError);
      });

      stream.on('end', () => {
        const stopTagHash = '##CK3_TTS_STOP##';
        const stopTagBracket = '[CK3_TTS_STOP]';
        const stopIndexHash = bufferText.lastIndexOf(stopTagHash);
        const stopIndexBracket = bufferText.lastIndexOf(stopTagBracket);

        let stopIndex = -1;
        let stopTagLength = 0;
        if (stopIndexHash > stopIndexBracket) {
          stopIndex = stopIndexHash;
          stopTagLength = stopTagHash.length;
        } else if (stopIndexBracket !== -1) {
          stopIndex = stopIndexBracket;
          stopTagLength = stopTagBracket.length;
        }

        // 1. 창 닫힘 신호(##CK3_TTS_STOP## 또는 [CK3_TTS_STOP]) 감지 시
        if (stopIndex !== -1) {
          // STOP 태그 이전의 텍스트는 닫힌 창의 잔여물이므로 완전히 버림!
          // 오직 STOP 태그 이후에 연속으로 기록된 진짜 새 이벤트만 파싱
          const textAfterStop = bufferText.slice(stopIndex + stopTagLength);
          const newEvents = extractCk3EventsFromChunk(textAfterStop);

          // 뒤에 신규 이벤트가 없는 순수 창 닫힘일 때만 렌더러에 STOP 신호 전송
          // 뒤에 신규 이벤트가 즉시 이어지는 경우(결투 라운드 전환 등), 새 이벤트가 자연스럽게 이전 오디오를 대체하므로 STOP 미발화
          if (newEvents.length === 0) {
            onStop?.();
            return;
          }

          const now = Date.now();

          for (const event of newEvents) {
            const lastSeenTime = recentEventCache.get(event.content);
            // 수동 강제 재낭독은 콘솔 에코 방지용 1초 디바운스만 적용하여 사용자의 재청취 편의 보장
            const cooldownMs = event.isForceReplay ? 1000 : 3000;
            if (lastSeenTime && now - lastSeenTime < cooldownMs) {
              continue;
            }

            updateRecentEventCache(recentEventCache, event.content, now);

            const eventMessage: Ck3EventMessage = {
              id: `${now}-${Math.random().toString(36).slice(2, 7)}`,
              timestamp: now,
              title: event.title,
              content: event.content,
              rawText: textAfterStop,
              isForceReplay: event.isForceReplay,
              speakerGender: event.speakerGender,
              eventType: event.eventType
            };
            onEvent(eventMessage);
          }
          return;
        }

        // 2. STOP 신호가 없는 정상적인 신규 이벤트 수신
        const parsedEvents = extractCk3EventsFromChunk(bufferText);
        const now = Date.now();

        for (const event of parsedEvents) {
          // 콘솔 echo 방지: 수동 강제 재낭독은 1초, 자동 감지는 2초 쿨다운 적용
          const lastSeenTime = recentEventCache.get(event.content);
          const cooldownMs = event.isForceReplay ? 1000 : 2000;
          if (lastSeenTime && now - lastSeenTime < cooldownMs) {
            continue;
          }

          updateRecentEventCache(recentEventCache, event.content, now);

          const eventMessage: Ck3EventMessage = {
            id: `${now}-${Math.random().toString(36).slice(2, 7)}`,
            timestamp: now,
            title: event.title,
            content: event.content,
            rawText: bufferText,
            isForceReplay: event.isForceReplay,
            speakerGender: event.speakerGender,
            eventType: event.eventType
          };
          onEvent(eventMessage);
        }
      });
    } catch (readError: unknown) {
      console.error('❌ [LogWatcher Read Error]:', readError);
    }
  };

  watcher.on('add', (changedPath: string) => {
    onStatusChange?.(true, logFilePath);
    handleFileChange(changedPath);
  });

  watcher.on('change', (changedPath: string) => {
    handleFileChange(changedPath);
  });

  watcher.on('unlink', (removedPath: string) => {
    const normalizedRemoved = path.resolve(removedPath);
    filePositions.delete(normalizedRemoved);
    if (!fs.existsSync(logFilePath)) {
      onStatusChange?.(false, logFilePath);
    }
  });

  watcher.on('error', (err: unknown) => {
    console.error('❌ [LogWatcher Watch Error]:', err);
    onStatusChange?.(false, logFilePath);
  });

  // 장시간 실행 시 게임 재시작이나 파일 회전/재생성으로 인한 감시 유실(Drift) 방지 자가 치유 폴링 타이머
  const healIntervalTimer = setInterval(() => {
    try {
      const activeWatchTargets = [path.resolve(logFilePath)];
      const currentLogDir = path.dirname(activeWatchTargets[0] ?? '');
      const currentErrorPath = path.join(currentLogDir, 'error.log');
      if (fs.existsSync(currentErrorPath)) {
        activeWatchTargets.push(currentErrorPath);
      }

      for (const normalizedTarget of activeWatchTargets) {
        if (fs.existsSync(normalizedTarget)) {
          const stats = fs.statSync(normalizedTarget);
          const lastPos = filePositions.get(normalizedTarget);
          // 파일이 새로 생성되었거나 크기가 변경되었는데 watcher가 놓친 경우 자가 치유
          if (lastPos === undefined || stats.size !== lastPos) {
            if (watcher) {
              watcher.add(normalizedTarget);
            }
            if (normalizedTarget === path.resolve(logFilePath)) {
              onStatusChange?.(true, logFilePath);
            }
            handleFileChange(normalizedTarget);
          }
        } else {
          if (filePositions.has(normalizedTarget)) {
            filePositions.delete(normalizedTarget);
            if (normalizedTarget === path.resolve(logFilePath)) {
              onStatusChange?.(false, logFilePath);
            }
          }
        }
      }
    } catch (healError: unknown) {
      // 헬스체크 중 일시적 접근 경합 안전 무시
    }
  }, 1500);

  onStatusChange?.(true, logFilePath);

  return {
    getPath: () => logFilePath,
    stop: async () => {
      clearInterval(healIntervalTimer);
      if (watcher) {
        await watcher.close();
        watcher = null;
      }
      onStatusChange?.(false, logFilePath);
    }
  };
};
