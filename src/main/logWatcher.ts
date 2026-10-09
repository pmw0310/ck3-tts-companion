import fs from 'node:fs';
import path from 'node:path';
import chokidar from 'chokidar';
import type { FSWatcher } from 'chokidar';
import { extractCk3EventsFromChunk, isFragmentOf } from '@/main/textSanitizer';
import type {
  Ck3EventMessage,
  ExecutionSoundEvent,
  ExecutionSoundType
} from '@/shared/types';

/** 로그 감시자 상태 및 제어 핸들 */
export type LogWatcherHandle = {
  readonly stop: () => Promise<void>;
  readonly getPath: () => string;
};

/** 중복 감시 캐시 최대 저장 개수 (메모리 팽창 방지) */
const MAX_CACHE_SIZE = 100;
/** 중복 감시 캐시 유효 시간 (180초 = 3분, 알현실 체류 중 만료 방지) */
const CACHE_TTL_MS = 180000;
/** 클립보드 채널 폴링 주기 (ms) */
const CLIPBOARD_POLL_MS = 150;
/** 서로 다른 채널(클립보드/debug.log/error.log)로 도착한 동일 이벤트를 중복으로 보는 시간 창 (ms) */
const CROSS_CHANNEL_DEDUPE_MS = 5000;
/** error.log 파편을 클립보드 원문 도착 이후에 검사하기 위한 지연 시간 (ms) */
const ERROR_LOG_DEFER_MS = 600;
/** 클립보드에 실린 모드 페이로드 식별 마커 */
const CLIPBOARD_PAYLOAD_MARKER = '##CK3_TTS';
/** 로그 활동이 없으면(게임 미실행) 클립보드 폴링을 쉬는 기준 시간 (ms) */
const CLIPBOARD_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * 게임 GUI가 EventWindowData.CopyStringToClipboard로 넘긴 원문을 읽고 사용자 클립보드를 복구하기 위한 추상화
 * (Electron clipboard 모듈을 주입하여 테스트 가능성을 확보)
 * - 텍스트뿐 아니라 이미지/서식 등 비텍스트 클립보드도 손실 없이 복구하기 위해 불투명 스냅샷을 사용합니다.
 */
export type ClipboardBridge<TSnapshot> = {
  /** 클립보드 텍스트를 읽습니다. */
  readonly readText: () => string;
  /** 변경 감지용 서명(형식 목록 + 텍스트)을 반환합니다. */
  readonly readSignature: () => string;
  /** 현재 클립보드 전체 상태를 보관합니다. */
  readonly takeSnapshot: () => TSnapshot;
  /** 보관한 상태로 클립보드를 복구합니다. (null이면 비움) */
  readonly restoreSnapshot: (snapshot: TSnapshot | null) => void;
};

/** 이벤트 수신 채널 */
type EventChannel = 'debug' | 'error' | 'clipboard';

/** 텍스트 정제기가 추출한 단일 이벤트 */
type ParsedCk3Event = ReturnType<typeof extractCk3EventsFromChunk>[number];

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
 * 인게임 처형 명칭 텍스트를 사운드 타입 식별자로 매핑합니다.
 * 처형과 무관한 일반 상호작용(선물 보내기, 작위 수여 등)인 경우 null을 반환합니다.
 * @param name - 처형 상호작용 또는 옵션 명칭
 * @returns 정규화된 처형 사운드 타입 또는 처형이 아닌 경우 null
 */
export const resolveExecutionSoundType = (name: string): ExecutionSoundType | null => {
  const lower = name.toLowerCase();

  // 화형
  if (
    lower.includes('화형') ||
    lower.includes('burn') ||
    lower.includes('불태') ||
    lower.includes('태우')
  ) {
    return 'burning';
  }
  // 맹견형 / 사냥개 / 거열
  if (
    lower.includes('사냥개') ||
    lower.includes('맹견') ||
    lower.includes('개에게') ||
    lower.includes('맹수') ||
    lower.includes('거열') ||
    lower.includes('kennel') ||
    lower.includes('hound')
  ) {
    return 'kennel';
  }
  // 인신공양 / 제물 / 희생제
  if (
    lower.includes('제물') ||
    lower.includes('공양') ||
    lower.includes('희생') ||
    lower.includes('sacrifice') ||
    lower.includes('blot')
  ) {
    return 'sacrifice';
  }
  // 교수형
  if (lower.includes('교수') || lower.includes('목매') || lower.includes('hang')) {
    return 'hanging';
  }
  // 공개 처형 / 광장 효수 / 말뚝 관통형
  if (
    lower.includes('공개') ||
    lower.includes('광장') ||
    lower.includes('효수') ||
    lower.includes('관통') ||
    lower.includes('말뚝') ||
    lower.includes('꼬챙이') ||
    lower.includes('impale') ||
    lower.includes('public')
  ) {
    return 'public';
  }
  // 식인 / 죄수 포식
  if (
    lower.includes('고기') ||
    lower.includes('식인') ||
    lower.includes('먹') ||
    lower.includes('devour') ||
    lower.includes('provision')
  ) {
    return 'devour';
  }
  // 참수형 및 바닐라 기본 처형 (단두대, 도끼, 참수, 처형, 사형, execute)
  if (
    lower.includes('참수') ||
    lower.includes('단두대') ||
    lower.includes('도끼') ||
    lower.includes('목 베') ||
    lower.includes('목베') ||
    lower.includes('처형') ||
    lower.includes('사형') ||
    lower.includes('behead') ||
    lower.includes('execute') ||
    lower.includes('execution') ||
    lower.includes('decapitat')
  ) {
    return 'beheading';
  }

  // 상호작용 확인창(interaction_confirmation.gui)을 공유하는 일반 상호작용(선물, 작위 등)은 무음 처리
  return null;
};

/**
 * 로그 청크에서 처형 효과음 태그(##CK3_EXECUTION## ...##)를 추출하여 반환합니다.
 * 처형과 무관한 일반 상호작용 태그는 결과에서 안전하게 제외됩니다.
 * @param chunk - 수신된 로그 텍스트
 * @returns 감지된 처형 효과음 이벤트 목록
 */
export const extractExecutionSoundsFromChunk = (chunk: string): ExecutionSoundEvent[] => {
  const results: ExecutionSoundEvent[] = [];
  const regex = /##CK3_EXECUTION##\s*([^|\n#]+)(?:\|\|\|GENDER:([MF]))?##/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(chunk)) !== null) {
    const rawName = match[1]?.trim() ?? '';
    const genderStr = match[2] ?? 'M';
    const gender: 'male' | 'female' = genderStr === 'F' ? 'female' : 'male';
    const type = resolveExecutionSoundType(rawName);

    if (!type) {
      continue;
    }

    results.push({
      type,
      gender,
      rawName,
      timestamp: Date.now()
    });
  }

  return results;
};

/**
 * 지정된 CK3 debug.log 및 동일 디렉터리의 error.log를 실시간 동시 감시하며, 이벤트 텍스트가 추가되면 콜백을 실행합니다.
 * @param logFilePath - 기본 감시할 debug.log의 절대 경로
 * @param onEvent - 유효한 이벤트 감지 시 호출될 콜백 함수
 * @param onStatusChange - 파일 감시 상태 변경 시 호출될 콜백 함수
 * @param onStop - 창 닫힘 신호 감지 시 오디오 중단 콜백 함수
 * @param onExecutionSound - 처형 효과음 감지 시 호출될 콜백 함수
 * @param clipboardBridge - 따옴표 포함 대사를 원문 그대로 받기 위한 클립보드 채널 (선택)
 * @param clipboardPollMs - 클립보드 폴링 주기 (테스트 주입용, 기본 150ms)
 * @returns 감시 제어 객체 (stop 메서드 포함)
 */
export const startWatchingLogFile = <TSnapshot>(
  logFilePath: string,
  onEvent: (event: Ck3EventMessage) => void,
  onStatusChange?: (isWatching: boolean, filePath: string) => void,
  onStop?: () => void,
  onExecutionSound?: (event: ExecutionSoundEvent) => void,
  clipboardBridge?: ClipboardBridge<TSnapshot>,
  clipboardPollMs: number = CLIPBOARD_POLL_MS
): LogWatcherHandle => {
  const filePositions = new Map<string, number>();
  let watcher: FSWatcher | null = null;
  let isStopped = false;
  let lastLogActivityTime = Date.now();
  const deferredEmitTimers = new Set<ReturnType<typeof setTimeout>>();
  const recentEventCache = new Map<string, number>();
  const recentExecutionSoundCache = new Map<string, number>();
  const pendingBuffers = new Map<string, string>();
  const activeReadStreams = new Set<string>();
  const pendingReadRequests = new Set<string>();
  const crossChannelCache = new Map<string, { channel: EventChannel; time: number }>();

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
   * 추출된 이벤트를 채널 간 중복/파편/쿨다운 가드를 거쳐 렌더러로 방출합니다.
   * @param parsedEvents - 정제기가 추출한 이벤트 목록
   * @param channel - 수신 채널
   * @param rawText - 원본 텍스트 (디버깅용)
   */
  const emitParsedEvents = (
    parsedEvents: readonly ParsedCk3Event[],
    channel: EventChannel,
    rawText: string
  ): void => {
    // 감시 중단 이후 지연 방출된 이벤트가 재시작된 감시자와 중복 낭독되지 않도록 차단
    if (isStopped) {
      return;
    }
    const now = Date.now();

    // 만료된 채널 간 중복 캐시 정리 (메모리 팽창 방지)
    for (const [cachedContent, entry] of crossChannelCache.entries()) {
      if (now - entry.time > CROSS_CHANNEL_DEDUPE_MS) {
        crossChannelCache.delete(cachedContent);
      }
    }

    for (const event of parsedEvents) {
      // ⚠️ [error.log 파편 덮어쓰기 방어]
      // error.log에서 유입된 이벤트가 최근 다른 채널에서 받은 완전한 원본의 단어 파편이면 무시합니다.
      if (channel === 'error') {
        let isDuplicateFragment = false;
        for (const [cachedContent, cachedTime] of recentEventCache.entries()) {
          if (now - cachedTime < 10000 && isFragmentOf(event.content, cachedContent)) {
            isDuplicateFragment = true;
            break;
          }
        }
        if (isDuplicateFragment) {
          console.log('ℹ️ [LogWatcher] 완전한 원본이 이미 활성화되어 있어 error.log 파편 덮어쓰기를 차단했습니다.');
          continue;
        }
      }

      // 채널 간 중복: 다른 채널에서 5초 내 동일 본문이 이미 전달되었다면 같은 클릭/표시의 중복 수신으로 판단
      const crossEntry = crossChannelCache.get(event.content);
      if (crossEntry && crossEntry.channel !== channel) {
        continue;
      }

      // 콘솔 echo 방지: 수동 강제 재낭독은 1초, 자동 감지는 2초 쿨다운 적용
      const lastSeenTime = recentEventCache.get(event.content);
      const cooldownMs = event.isForceReplay ? 1000 : 2000;
      if (lastSeenTime && now - lastSeenTime < cooldownMs) {
        continue;
      }

      updateRecentEventCache(recentEventCache, event.content, now);
      crossChannelCache.set(event.content, { channel, time: now });

      const eventMessage: Ck3EventMessage = {
        id: `${now}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: now,
        title: event.title,
        content: event.content,
        rawText,
        isForceReplay: event.isForceReplay,
        speakerGender: event.speakerGender,
        eventType: event.eventType
      };
      onEvent(eventMessage);
    }
  };

  /**
   * 지정된 로그 파일에서 새로 추가된 내용을 읽고 이벤트 및 중단 신호를 파싱합니다.
   * @param targetFilePath - 변경된 파일의 절대 경로
   */
  const handleFileChange = (targetFilePath: string): void => {
    const normalizedPath = path.resolve(targetFilePath);
    if (!fs.existsSync(normalizedPath)) {
      return;
    }

    // 파일별 스트림 읽기 뮤텍스: 이미 읽기 스트림이 동작 중이면 다음 사이클에 순차 실행되도록 요청 예약
    if (activeReadStreams.has(normalizedPath)) {
      pendingReadRequests.add(normalizedPath);
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

      lastLogActivityTime = Date.now();

      activeReadStreams.add(normalizedPath);
      const targetSize = currentStats.size;

      // createReadStream의 end는 inclusive(포함)이므로 정확한 바이트 경계를 위해 currentStats.size - 1 지정
      const readEnd = Math.max(filePosition, targetSize - 1);
      const stream = fs.createReadStream(normalizedPath, {
        start: filePosition,
        end: readEnd,
        encoding: 'utf-8'
      });

      let bufferText = '';
      stream.on('data', (chunk: unknown) => {
        if (typeof chunk === 'string') {
          bufferText += chunk;
        }
      });

      stream.on('error', (streamError: unknown) => {
        console.error('❌ [LogWatcher Stream Error]:', streamError);
        activeReadStreams.delete(normalizedPath);
        if (pendingReadRequests.delete(normalizedPath)) {
          setTimeout(() => handleFileChange(normalizedPath), 20);
        }
      });

      stream.on('end', () => {
        try {
          // 이전 미완성 청크 버퍼가 있다면 이번 청크 앞에 결합
          const previousPending = pendingBuffers.get(normalizedPath) ?? '';
          bufferText = previousPending + bufferText;
          pendingBuffers.delete(normalizedPath);

          // 청크 끝부분에 닫는 태그(END) 없이 열린 태그만 있는 경우, 다음 청크와 결합하도록 보관
          const lastOpenHash = bufferText.lastIndexOf('##CK3_TTS');
          const lastOpenBracket = bufferText.lastIndexOf('[CK3_TTS');
          const lastOpenIndex = Math.max(lastOpenHash, lastOpenBracket);

          if (lastOpenIndex !== -1) {
            const tail = bufferText.slice(lastOpenIndex);
            const hasClosedEnd = tail.includes('##CK3_TTS_END##') || tail.includes('[CK3_TTS_END]');
            const isPureStop = tail.startsWith('##CK3_TTS_STOP##') || tail.startsWith('[CK3_TTS_STOP]');

            if (!hasClosedEnd && !isPureStop) {
              // 미완성 이벤트 태그를 pendingBuffer에 안전하게 보관하고 이번 청크에서는 제외
              pendingBuffers.set(normalizedPath, tail);
              bufferText = bufferText.slice(0, lastOpenIndex);
            }
          }

          // 처형 효과음 태그(##CK3_EXECUTION##) 감지 시 디바운스 (500ms로 빠른 연속 처형 보장)
          const executionSounds = extractExecutionSoundsFromChunk(bufferText);
          const currentExecutionTime = Date.now();
          for (const sound of executionSounds) {
            const soundCacheKey = `${sound.type}_${sound.gender}`;
            const lastSeen = recentExecutionSoundCache.get(soundCacheKey);
            // C++ 콘솔 3중 에코 및 후속 창 팝업 시점의 분할 플러시 방어 (5초 쿨다운)
            if (lastSeen && currentExecutionTime - lastSeen < 5000) {
              continue;
            }
            recentExecutionSoundCache.set(soundCacheKey, currentExecutionTime);
            onExecutionSound?.(sound);
          }

          const stopTagHash = '##CK3_TTS_STOP##';
          const stopTagBracket = '[CK3_TTS_STOP]';
          const lastStopIndex = Math.max(
            bufferText.lastIndexOf(stopTagHash),
            bufferText.lastIndexOf(stopTagBracket)
          );
          const hasStopSignal = lastStopIndex !== -1;

          // 1. 청크 내의 모든 유효한 CK3 이벤트 우선 추출
          const parsedEvents = extractCk3EventsFromChunk(bufferText);

          // 2. 창 닫힘(STOP) 신호 처리:
          // - 청크 내에 유효한 이벤트가 전혀 없는 순수 STOP이거나,
          // - 마지막 STOP 신호가 마지막 이벤트(END)보다 뒤에 위치하는 경우 (즉, 이벤트가 뜬 후 플레이어가 옵션을 선택하여 창을 닫음)
          // -> 재생 중이던 오디오를 즉시 정지하고 불필요한 이벤트 발화를 중단합니다.
          if (hasStopSignal) {
            const lastEndHash = bufferText.lastIndexOf('##CK3_TTS_END##');
            const lastEndBracket = bufferText.lastIndexOf('[CK3_TTS_END]');
            const lastEndIndex = Math.max(lastEndHash, lastEndBracket);

            if (parsedEvents.length === 0 || lastStopIndex > lastEndIndex) {
              onStop?.();
              return;
            }
          }

          const isFromErrorLog = normalizedPath === errorLogPath;
          if (isFromErrorLog) {
            // 클립보드 채널이 원문을 먼저 등록할 수 있도록 지연 후 파편 여부를 검사 (stop 시 일괄 취소되도록 추적)
            const deferredText = bufferText;
            const deferredTimer = setTimeout(() => {
              deferredEmitTimers.delete(deferredTimer);
              emitParsedEvents(parsedEvents, 'error', deferredText);
            }, ERROR_LOG_DEFER_MS);
            deferredEmitTimers.add(deferredTimer);
          } else {
            emitParsedEvents(parsedEvents, 'debug', bufferText);
          }
        } finally {
          // 스트림 읽기 종료 시점에 항상 바이트 포지션 확정 및 뮤텍스 락 해제 (STOP 조기 반환 시에도 데드락 방지)
          filePositions.set(normalizedPath, targetSize);
          activeReadStreams.delete(normalizedPath);

          // 스트림 읽기 도중 추가 유입된 변경 요청이 있다면 즉시 1회 순차 소비
          if (pendingReadRequests.delete(normalizedPath)) {
            setTimeout(() => handleFileChange(normalizedPath), 20);
          }
        }
      });
    } catch (readError: unknown) {
      activeReadStreams.delete(normalizedPath);
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

  // 📋 클립보드 채널: 대사에 큰따옴표가 있으면 콘솔 명령(info_log)이 잘려 원문을 잃으므로,
  // GUI가 EventWindowData.CopyStringToClipboard로 함께 넘긴 원문을 읽고 즉시 사용자 클립보드를 복구합니다.
  let clipboardTimer: ReturnType<typeof setInterval> | null = null;
  if (clipboardBridge) {
    let lastObservedSignature = '';
    // 사용자가 마지막으로 복사한 클립보드 전체 상태(이미지/서식 포함). 페이로드 소비 후 이 상태로 복구
    let lastUserSnapshot: TSnapshot | null = null;
    try {
      lastObservedSignature = clipboardBridge.readSignature();
      if (!clipboardBridge.readText().includes(CLIPBOARD_PAYLOAD_MARKER)) {
        lastUserSnapshot = clipboardBridge.takeSnapshot();
      }
    } catch (initError: unknown) {
      console.warn('⚠️ [LogWatcher] 초기 클립보드 읽기 실패:', initError);
    }

    clipboardTimer = setInterval(() => {
      // 게임 로그 활동이 없으면(게임 미실행) 사용자 클립보드를 불필요하게 읽지 않도록 폴링 중단
      if (Date.now() - lastLogActivityTime > CLIPBOARD_IDLE_TIMEOUT_MS) {
        return;
      }
      try {
        const currentSignature = clipboardBridge.readSignature();
        if (currentSignature === lastObservedSignature) {
          return;
        }
        lastObservedSignature = currentSignature;

        const currentText = clipboardBridge.readText();
        if (!currentText.includes(CLIPBOARD_PAYLOAD_MARKER)) {
          // 사용자가 직접 복사한 내용은 형식 그대로 복구 대상으로 보관
          lastUserSnapshot = clipboardBridge.takeSnapshot();
          return;
        }

        emitParsedEvents(extractCk3EventsFromChunk(currentText), 'clipboard', currentText);

        // 모드 페이로드를 소비한 뒤 사용자의 원래 클립보드 상태를 복구
        clipboardBridge.restoreSnapshot(lastUserSnapshot);
        lastObservedSignature = clipboardBridge.readSignature();
      } catch (clipboardError: unknown) {
        console.warn('⚠️ [LogWatcher] 클립보드 채널 처리 실패:', clipboardError);
      }
    }, clipboardPollMs);
  }

  return {
    getPath: () => logFilePath,
    stop: async () => {
      isStopped = true;
      clearInterval(healIntervalTimer);
      if (clipboardTimer) {
        clearInterval(clipboardTimer);
      }
      for (const deferredTimer of deferredEmitTimers) {
        clearTimeout(deferredTimer);
      }
      deferredEmitTimers.clear();
      if (watcher) {
        await watcher.close();
        watcher = null;
      }
      onStatusChange?.(false, logFilePath);
    }
  };
};
