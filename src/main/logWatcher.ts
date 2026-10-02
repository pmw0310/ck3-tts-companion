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

  // 감시할 파일 목록 구성 (debug.log 및 error.log 동시 감시)
  const watchPaths: string[] = [logFilePath];
  const logDir = path.dirname(logFilePath);
  const errorLogPath = path.join(logDir, 'error.log');
  if (!watchPaths.includes(errorLogPath)) {
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
    interval: 200,
    awaitWriteFinish: {
      stabilityThreshold: 80,
      pollInterval: 40
    }
  });

  /**
   * 지정된 로그 파일에서 새로 추가된 내용을 읽고 이벤트 및 중단 신호를 파싱합니다.
   * @param targetFilePath - 변경된 파일의 절대 경로
   */
  const handleFileChange = (targetFilePath: string): void => {
    if (!fs.existsSync(targetFilePath)) {
      return;
    }

    try {
      const currentStats = fs.statSync(targetFilePath);
      let filePosition = filePositions.get(targetFilePath) ?? 0;

      // 게임 재시작 등으로 파일이 새로 쓰여 크기가 줄어든 경우
      if (currentStats.size < filePosition) {
        filePosition = 0;
      }

      if (currentStats.size === filePosition) {
        return;
      }

      const stream = fs.createReadStream(targetFilePath, {
        start: filePosition,
        end: currentStats.size,
        encoding: 'utf-8'
      });

      filePositions.set(targetFilePath, currentStats.size);

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
        const stopTag = '[CK3_TTS_STOP]';
        const stopIndex = bufferText.lastIndexOf(stopTag);

        // 1. 창 닫힘 신호([CK3_TTS_STOP]) 감지 시
        if (stopIndex !== -1) {
          onStop?.();

          // STOP 태그 이전의 텍스트는 닫힌 창의 잔여물이므로 완전히 버림!
          // 오직 STOP 태그 이후에 연속으로 기록된 진짜 새 이벤트만 파싱
          const textAfterStop = bufferText.slice(stopIndex + stopTag.length);
          const newEvents = extractCk3EventsFromChunk(textAfterStop);
          const now = Date.now();

          for (const event of newEvents) {
            const lastSeenTime = recentEventCache.get(event.content);
            if (lastSeenTime && now - lastSeenTime < 3000) {
              continue;
            }

            recentEventCache.set(event.content, now);

            const eventMessage: Ck3EventMessage = {
              id: `${now}-${Math.random().toString(36).slice(2, 7)}`,
              timestamp: now,
              title: event.title,
              content: event.content,
              rawText: textAfterStop
            };
            onEvent(eventMessage);
          }
          return;
        }

        // 2. STOP 신호가 없는 정상적인 신규 이벤트 수신
        const parsedEvents = extractCk3EventsFromChunk(bufferText);
        const now = Date.now();

        for (const event of parsedEvents) {
          // 콘솔 echo 및 다중 로그(debug.log/error.log 동시 기록) 중복 낭독 방지 (2초 쿨다운)
          const lastSeenTime = recentEventCache.get(event.content);
          if (lastSeenTime && now - lastSeenTime < 2000) {
            continue;
          }

          recentEventCache.set(event.content, now);

          // 만료된 캐시 정리 (30초 경과 항목)
          for (const [cachedContent, timestamp] of recentEventCache.entries()) {
            if (now - timestamp > 30000) {
              recentEventCache.delete(cachedContent);
            }
          }

          const eventMessage: Ck3EventMessage = {
            id: `${now}-${Math.random().toString(36).slice(2, 7)}`,
            timestamp: now,
            title: event.title,
            content: event.content,
            rawText: bufferText
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
    filePositions.delete(removedPath);
    if (!fs.existsSync(logFilePath)) {
      onStatusChange?.(false, logFilePath);
    }
  });

  watcher.on('error', (err: unknown) => {
    console.error('❌ [LogWatcher Watch Error]:', err);
    onStatusChange?.(false, logFilePath);
  });

  onStatusChange?.(true, logFilePath);

  return {
    getPath: () => logFilePath,
    stop: async () => {
      if (watcher) {
        await watcher.close();
        watcher = null;
      }
      onStatusChange?.(false, logFilePath);
    }
  };
};
