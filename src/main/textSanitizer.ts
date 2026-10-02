import { hasBatchim, josa } from 'es-hangul';

/** CK3 내부 서식, 아이콘, 툴팁 명령을 제거하기 위한 정규식 패턴 목록 */
const CK3_TAG_PATTERNS: readonly RegExp[] = [
  /\[\d{2}:\d{2}:\d{2}\]\[[A-Z]\]\[[^\]]+\]:\s*(?:console_success:\s*)?/gi, // [19:56:07][D][console.cpp:1193]: console_success: 등 로그 헤더
  /\bconsole_success:\s*/gi,                                  // console_success 접두사
  /\bERROR:\s*/g,                                             // ERROR 접두사
  /\[(?:TOOLTIP|ONCLICK|SCALED_STATIC_MODIFIER):[^\]]*\]/gi, // [TOOLTIP:...] 대괄호 서식 태그
  /\b(?:ONCLICK|TOOLTIP|SCALED_STATIC_MODIFIER):[^\s!]+/gi,  // ONCLICK:CHARACTER,12345 등 비대괄호 태그
  /\bEMP\b/gi,                                               // EMP 강조 서식
  /\bL;?\s*/g,                                               // L 및 L; 링크/영지 마커
  /\[[a-zA-Z0-9_.]+\([^)]*\)\]/g,                            // 스크립트 함수 호출
  /#(?:[a-zA-Z0-9_]+|!)+/g,                                 // #bold, #italic, #color_gray, #! 등 서식 태그
  /@[a-zA-Z0-9_!]+!/g,                                      // @skill_martial_icon! 등 아이콘
  /\b(?:indent_newline:\d|positive_value|negative_value)\b/g, // 들여쓰기 및 수치 변수
  /\b(?:COLOR_[A-Z0-9_]+)\b/g,                              // 컬러 상수
  /[_]{2,}/g                                                // 불필요한 연속 언더스코어
] as const;

type JosaParticleType =
  | '은/는'
  | '이/가'
  | '을/를'
  | '와/과'
  | '으로/로'
  | '아/야'
  | '이나/나'
  | '이란/란'
  | '이라/라'
  | '이든/든'
  | '이며/며';

type JosaRule = {
  readonly pattern: RegExp;
  readonly type: JosaParticleType;
  readonly suffix?: string;
};

/** 한국어 조건부 조사 변환 규칙 목록 */
const KOREAN_JOSA_RULES: readonly JosaRule[] = [
  // 1. 은/는
  {
    pattern: /\((?:은\s*[/]\s*는|는\s*[/]\s*은|은|는)\)(?:은|는)?/,
    type: '은/는'
  },
  // 2. 이/가
  {
    pattern: /\((?:이\s*[/]\s*가|가\s*[/]\s*이|이|가)\)(?:이|가)?/,
    type: '이/가'
  },
  // 3. 을/를
  {
    pattern: /\((?:을\s*[/]\s*를|를\s*[/]\s*을|을|를)\)(?:을|를)?/,
    type: '을/를'
  },
  // 4. 와/과
  {
    pattern: /\((?:과\s*[/]\s*와|와\s*[/]\s*과|과|와)\)(?:과|와)?/,
    type: '와/과'
  },
  // 5. 으로서/로서
  {
    pattern: /\((?:으\s*[/]\s*로서|로서\s*[/]\s*으|으)\)로서/,
    type: '으로/로',
    suffix: '서'
  },
  // 6. 으로/로
  {
    pattern: /\((?:으\s*[/]\s*로|로\s*[/]\s*으|으|로)\)(?:으|로)?/,
    type: '으로/로'
  },
  // 7. 아/야
  {
    pattern: /\((?:아\s*[/]\s*야|야\s*[/]\s*아|아|야)\)(?:아|야)?/,
    type: '아/야'
  },
  // 8. 이나/나
  {
    pattern: /\((?:이\s*[/]\s*나|나\s*[/]\s*이|이|나)\)(?:이|나)?/,
    type: '이나/나'
  },
  // 9. 이라/라
  {
    pattern: /\((?:이\s*[/]\s*라|라\s*[/]\s*이|이|라)\)(?:이|라)?/,
    type: '이라/라'
  },
  // 10. 이란/란
  {
    pattern: /\((?:이\s*[/]\s*란|란\s*[/]\s*이|이|란)\)(?:이|란)?/,
    type: '이란/란'
  },
  // 11. 이든/든
  {
    pattern: /\((?:이\s*[/]\s*든|든\s*[/]\s*이|이|든)\)(?:이|든)?/,
    type: '이든/든'
  },
  // 12. 이며/며
  {
    pattern: /\((?:이\s*[/]\s*며|며\s*[/]\s*이|이|며)\)(?:이|며)?/,
    type: '이며/며'
  }
] as const;

type CompiledJosaRule = {
  readonly regex: RegExp;
  readonly type: JosaParticleType;
  readonly suffix?: string;
};

/** 사전 컴파일된 한국어 조사 정규식 목록 (성능 최적화) */
const COMPILED_JOSA_RULES: readonly CompiledJosaRule[] = KOREAN_JOSA_RULES.map(
  (rule) => ({
    regex: new RegExp(
      `([가-힣a-zA-Z0-9]+)([\\x27"’”」』\\]]*)\\s*` + rule.pattern.source,
      'g'
    ),
    type: rule.type,
    suffix: rule.suffix
  })
);

/**
 * CK3 한글 번역 특유의 조건부 조사 태그((은)는, (이)가, (을)를 등)를 es-hangul 라이브러리를 통해 앞말의 음운 규칙에 맞는 완벽한 한국어 조사로 변환합니다.
 * @param text - 원본 텍스트
 * @returns 자연스러운 한국어 조사가 적용된 텍스트
 */
const resolveKoreanParticles = (text: string): string => {
  let resolved = text;

  // 1. 앞 단어가 있는 경우: 사전 컴파일된 정규식으로 조사 자동 변환
  for (const rule of COMPILED_JOSA_RULES) {
    resolved = resolved.replace(rule.regex, (_, word: string, quote: string) => {
      let particle = '';
      if (rule.type === '이든/든') {
        particle = hasBatchim(word) ? '이든' : '든';
      } else if (rule.type === '이며/며') {
        particle = hasBatchim(word) ? '이며' : '며';
      } else {
        const withJosa = josa(word, rule.type);
        particle = withJosa.slice(word.length);
      }
      const suffix = rule.suffix ?? '';
      return `${word}${quote}${particle}${suffix}`;
    });
  }

  // 2. 앞 단어 매칭에 실패한 독립 잔여 괄호 조사 안전 변환 (Fallback)
  resolved = resolved
    .replace(/(^|\s)\((?:은\s*[/]\s*는|는\s*[/]\s*은|은|는)\)(?:은|는)?/g, '$1는')
    .replace(/(^|\s)\((?:이\s*[/]\s*가|가\s*[/]\s*이|이|가)\)(?:이|가)?/g, '$1가')
    .replace(/(^|\s)\((?:을\s*[/]\s*를|를\s*[/]\s*을|을|를)\)(?:을|를)?/g, '$1를')
    .replace(/(^|\s)\((?:과\s*[/]\s*와|와\s*[/]\s*과|과|와)\)(?:과|와)?/g, '$1와')
    .replace(/(^|\s)\((?:으\s*[/]\s*로서|로서\s*[/]\s*으|으)\)로서/g, '$1로서')
    .replace(/(^|\s)\((?:으\s*[/]\s*로|로\s*[/]\s*으|으|로)\)(?:으|로)?/g, '$1로')
    .replace(/(^|\s)\((?:아\s*[/]\s*야|야\s*[/]\s*아|아|야)\)(?:아|야)?/g, '$1야')
    .replace(/\((?:은\s*[/]\s*는|는\s*[/]\s*은|은|는)\)(?:은|는)?/g, '는')
    .replace(/\((?:이\s*[/]\s*가|가\s*[/]\s*이|이|가)\)(?:이|가)?/g, '가')
    .replace(/\((?:을\s*[/]\s*를|를\s*[/]\s*을|을|를)\)(?:을|를)?/g, '를')
    .replace(/\((?:과\s*[/]\s*와|와\s*[/]\s*과|과|와)\)(?:과|와)?/g, '와')
    .replace(/\((?:으\s*[/]\s*로서|로서\s*[/]\s*으|으)\)로서/g, '로서')
    .replace(/\((?:으\s*[/]\s*로|로\s*[/]\s*으|으|로)\)(?:으|로)?/g, '로')
    .replace(/\((?:아\s*[/]\s*야|야\s*[/]\s*아|아|야)\)(?:아|야)?/g, '야');

  return resolved;
};

/**
 * CK3 게임 로그의 원본 지문에서 인게임 특수 태그, 인물 코드, 기계어 잔여물을 제거하고 깨끗한 낭독용 문장을 반환합니다.
 * @param rawText - CK3 엔진이 출력한 원본 텍스트
 * @returns TTS 합성에 최적화된 자연스러운 순수 한국어 문장
 */
export const sanitizeCk3Text = (rawText: string): string => {
  if (!rawText || rawText.trim().length === 0) {
    return '';
  }

  let cleaned = rawText;

  // 0. 패러독스 엔진 내부 서식/색상 구분용 제어 문자(\x15, ASCII 21 등) 제거
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // 1. CK3 태그 및 콘솔 로그 헤더 제거
  for (const pattern of CK3_TAG_PATTERNS) {
    cleaned = cleaned.replace(pattern, ' ');
  }

  // 2. 단어 앞의 세미콜론 제거 (예: "; 마이센" -> "마이센")
  cleaned = cleaned.replace(/(?:^|\s);\s*/g, ' ');

  // 3. 단어 뒤에 붙는 태그 닫기 느낌표 잔여물 제거 (예: "야로미르 ! ! !", "소란을 싫어하는 !", " ! !")
  cleaned = cleaned.replace(/(?:\s*!)+\s*(?=[가-힣a-zA-Z0-9(]|$)/g, ' ');
  cleaned = cleaned.replace(/\s+!\s+/g, ' ');
  cleaned = cleaned.replace(/(?:![\s!]*!)/g, ' ');

  // 4. 줄바꿈(\n)을 단락 간 자연스러운 공백으로 치환
  cleaned = cleaned.replace(/\r?\n+/g, ' ');

  // 5. 한국어 조사 태그 자동 보정
  cleaned = resolveKoreanParticles(cleaned);

  // 6. 문장 부호 앞 공백 및 연속 공백 정리
  return cleaned
    .replace(/\s+([,.?!])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
};

/**
 * 로그 텍스트 청크(멀티라인 줄바꿈 포함)에서 [CK3_TTS] 블록들을 온전하게 추출합니다.
 * 동일한 청크 내 중복 이벤트는 1회만 반환합니다.
 * @param chunk - 새로 읽어들인 debug.log 텍스트 청크
 * @returns 추출된 이벤트 목록
 */
export const extractCk3EventsFromChunk = (
  chunk: string
): Array<{ title: string; content: string }> => {
  const events: Array<{ title: string; content: string }> = [];
  const candidateEvents: Array<{ title: string; content: string }> = [];
  const triggerPrefix = '[CK3_TTS]';
  const endTag = '[CK3_TTS_END]';

  let searchIndex = 0;
  while (searchIndex < chunk.length) {
    const startIndex = chunk.indexOf(triggerPrefix, searchIndex);
    if (startIndex === -1) {
      break;
    }

    // 1. 앞선 로그가 ERROR: 로 시작하는 경우 패러독스 파서가 따옴표 등으로 잘라버린 불완전 에러 라인이므로 스킵
    const prefixContext = chunk.slice(Math.max(0, startIndex - 15), startIndex);
    if (prefixContext.includes('ERROR:')) {
      searchIndex = startIndex + triggerPrefix.length;
      continue;
    }

    const contentStart = startIndex + triggerPrefix.length;

    // 2. 반드시 [CK3_TTS_END] 닫는 태그가 온전히 존재하는 블록만 유효한 이벤트로 채택
    const endTagIndex = chunk.indexOf(endTag, contentStart);
    if (endTagIndex === -1) {
      // 닫는 태그가 없다면 불완전한 파편이므로 스킵
      searchIndex = contentStart;
      continue;
    }

    const payload = chunk.slice(contentStart, endTagIndex).trim();
    searchIndex = endTagIndex + endTag.length;

    if (payload.length > 0) {
      let title = '크루세이더 킹즈 3 사건';
      let content = '';

      if (payload.includes('|||')) {
        const [rawTitle, ...rest] = payload.split('|||');
        const rawContent = rest.join('|||');
        const sanitizedTitle = sanitizeCk3Text(rawTitle ?? '');
        const sanitizedContent = sanitizeCk3Text(rawContent ?? '');
        title = sanitizedTitle.length > 0 ? sanitizedTitle : title;
        content = sanitizedContent.length > 0 ? sanitizedContent : title;
      } else {
        content = sanitizeCk3Text(payload);
      }

      if (content.length > 0) {
        candidateEvents.push({ title, content });
      }
    }
  }

  // 동일한 청크 내 중복 또는 파편이 존재할 경우, 더 완전하고 긴 본문을 우선 채택
  for (const candidate of candidateEvents) {
    const existingIndex = events.findIndex(
      (e) =>
        e.title === candidate.title ||
        candidate.content.includes(e.content) ||
        e.content.includes(candidate.content)
    );
    if (existingIndex === -1) {
      events.push(candidate);
    } else {
      const existing = events[existingIndex];
      if (existing && candidate.content.length > existing.content.length) {
        events[existingIndex] = candidate;
      }
    }
  }

  return events;
};

/**
 * 기존 단일 라인 파싱 하위 호환용 함수
 * @param logLine - debug.log 한 줄
 * @returns 추출된 제목 및 내용 객체, 유효하지 않으면 null
 */
export const parseCk3LogLine = (
  logLine: string
): { title: string; content: string } | null => {
  const events = extractCk3EventsFromChunk(logLine);
  return events[0] ?? null;
};

export { splitIntoSentences } from '@/shared/sentenceSplitter';
