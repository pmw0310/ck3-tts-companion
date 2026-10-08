import { hasBatchim, josa } from 'es-hangul';
import { convertLatinPhrasesInText } from '@/main/latinTransliteration';
import type { Ck3EventType } from '@/shared/types';

/** CK3 내부 서식, 아이콘, 툴팁 명령을 제거하기 위한 정규식 패턴 목록 */
const CK3_TAG_PATTERNS: readonly RegExp[] = [
  /\[\d{2}:\d{2}:\d{2}\]\[[A-Z]\]\[[^\]]+\]:\s*(?:console_success:\s*)?/gi, // [19:56:07][D][console.cpp:1193]: console_success: 등 로그 헤더
  /\bconsole_success:\s*/gi,                                  // console_success 접두사
  /\bERROR:\s*/g,                                             // ERROR 접두사
  /(?:\[|##)CK3_TTS(?:_END|_STOP|_FORCE)?(?:\]|##)/gi,        // TTS 제어 마커 잔여물 제거
  /\[(?:TOOLTIP|ONCLICK|SCALED_STATIC_MODIFIER):[^\]]*\]/gi, // [TOOLTIP:...] 대괄호 서식 태그
  /\b(?:ONCLICK|TOOLTIP|SCALED_STATIC_MODIFIER):[^\s"'\]]+/gi, // ONCLICK:CHARACTER,12345 및 TOOLTIP:NICKNAME,key,id 등 태그 및 ID 파편 제거
  /\bEMP\b/gi,                                               // EMP 강조 서식
  /\b[GLEIPBVN];\s*/gi,                                         // G;, L;, E;, I;, P;, B;, V;, N; 링크/게임컨셉/수치/아이콘 마커
  /(?:^|\s)[GIEPLBVN];?\s+(?=[가-힣a-zA-Z0-9'"`‘“「『\(\[])/gi, // 단독 G, I, E, L, P, B, V, N 마커 (예: "G 강령술사", "V; 3", "L ' 엽사 '", "I 승전")
  /#+[A-Za-z0-9_]+\s*(?:DEBUG|디버그)\s*#!?/gi,              // #D 디버그#! 등 복합 서식 태그 디버그 문구
  /(?:^|\s)#?[A-Za-z]\s*(?:DEBUG|디버그)\s*!?/gi,              // D 디버그!, #D 디버그! 등 엔진 콘솔 직렬화 및 포맷 잔여물
  /\b(?:DEBUG|디버그)\s*!/gi,                                  // 디버그! 단독 잔여물
  /\b(?:DEBUG|디버그)\s*:\s*/gi,                               // 디버그 접두사
  /\b(?:DEBUG|디버그)\b/gi,                                    // 디버그 단독 키워드 잔여물
  /#+(?:[a-zA-Z0-9_]+|!)+/g,                                 // #bold, #italic, #high, #! 등 서식 태그
  /(?:^|\s)(?:high|bold|italic|flavor|weak|color_[a-z0-9_]+)\b\s*/gi, // high, bold 등 폰트 서식 키워드 잔여물
  /\[[a-zA-Z0-9_.]+\([^)]*\)\]/g,                            // 스크립트 함수 호출
  /@[a-zA-Z0-9_!]+!/g,                                      // @skill_martial_icon! 등 아이콘
  /\b(?:indent_newline:\d|positive_value|negative_value)\b/g, // 들여쓰기 및 수치 변수
  /\b(?:COLOR_[A-Z0-9_]+)\b/g,                              // 컬러 상수
  /\s*\(BUG:.*?\binstead\)/gi,                                // (BUG: ... line: 506 (set_focus), using '...' instead) 엔진 중첩 디버그 경고
  /\s*\(BUG:[^)]*\)/gi,                                       // (BUG: ...) 단일 괄호 엔진 디버그 경고
  /\bAI\s*(?:수준|weight)\s*:\s*[\d.]+/gi,                    // AI 수준: 25.00 디버그 가중치 정보
  /(?:\|{1,3}\s*)?GENDER:[A-Za-z_]+(?:\b|(?=["'\s]))/gi,       // |||GENDER:F, |||GENDER:M, |||GENDER:LETTER_F 등 성별 메타데이터 태그 잔여물
  /\bUnknown effect:\s*/gi,                                   // error.log 파서 에러 접두사 잔여물
  /\(엑스판데드 프롬 필레:[^)]*\)/gi,                         // 음차 변환된 스크립트 확장 메타데이터 잔여물
  /\(expanded from file:[^)]*\)/gi,                           // (expanded from file: ...) 매크로 확장 메타데이터
  /,?\s*near line:\s*\d+/gi,                                  // near line: 3 등 라인 정보 잔여물
  /"?\s*in file:\s*"effect console command".*$/gim,           // in file: "effect console command" 잔여물
  /\b(?:expanded from file|effect console command)\b[^)]*\)?/gi, // 비괄호 형태 잔여물 방어
  /\b\d{3,}\s*,\s*[LGVBEIPN]\b/gi,                           // 15301, L 등 파편화된 ID와 링크 마커 결합 잔여물
  /(?:^|\s)\d{4,}(?=\s|$|[,.])/g,                             // 단위 없는 4자리 이상 고립된 캐릭터/타이틀 고유 ID 숫자열
  /(?:^|\s)[LGVBEIPN]\s+(?=이|가|은|는|을|를|의|에|와|과)/gi, // L 이가, L을를 등 마커 뒤 조사 파편
  /\s*\|{2,}\s*/g,                                           // 불필요한 연속 파이프(||, |||) 잔여물
  /\b[0-9A-Z]+(?:_[0-9A-Z]+){2,}\b/g,                         // 1_CORINTHIANS_1_10_LATIN_GLOSS 등 대문자 용어집(GLOSSARY)/DB 키 유출
  /[_]{2,}/g                                                // 불필요한 연속 언더스코어
] as const;

/** Jomini GUI 스크립트 키워드, 함수 호출 및 파싱되지 않은 엔진 코드 패턴 목록 */
const JOMINI_SCRIPT_GARBAGE_PATTERNS: readonly RegExp[] = [
  /\bConcatenate\s*\(/i,
  /\bSelect_CString\s*\(/i,
  /\bStringIsEmpty\s*\(/i,
  /\bExecuteConsoleCommand\b/i,
  /\bEventWindowData\b/i,
  /\bActivity\.[a-zA-Z0-9_]+/i,
  /\bPdxGui[a-zA-Z0-9_]*/i,
  /\b(?:GetTitle|GetDescription|GetOpening|GetContextName|GetNotificationText|GetSignature|GetHeader|GetDeadDesc|GetHeirDesc|GetOutcome|GetWarName|GetSimpleDescription|GetMessage)\b/i,
  // 장시간 플레이 시 [D] 로그 중단 대응으로 TTS 채널이 info_log로 전환되어 info/error 로그 이펙트 원문도 함께 차단
  /\beffect\s+(?:debug|info|error)_log\b/i,
  /\b(?:debug|info|error)_log\s*=/i,
  /^\s*['"][,\s]/,
  /['"],\s*[a-zA-Z_]+\s*\(/
] as const;

/**
 * 주어진 텍스트가 TTS로 낭독 가능한 정상적인 게임 내러티브 텍스트인지 검증합니다.
 * Jomini GUI 스크립트 코드, 미평가 엔진 키워드, 단순 기호 나열 등 비정상 데이터는 false를 반환합니다.
 * @param text - 검증할 텍스트
 * @returns TTS 낭독에 적합한 유효 문장 여부
 */
export const isValidNarrativeText = (text: string): boolean => {
  if (!text || text.trim().length === 0) {
    return false;
  }

  const trimmed = text.trim();

  // 1. Jomini GUI 스크립트 및 엔진 코드 패턴이 포함되어 있는지 검사
  for (const pattern of JOMINI_SCRIPT_GARBAGE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return false;
    }
  }

  // 2. 따옴표나 쉼표로 시작하는 스크립트 파편 차단
  if (/^['"][,\s]/.test(trimmed)) {
    return false;
  }

  // 3. 한글, 영문, 숫자 등 유의미한 자연어 글자 검사
  // - 한글은 1글자만으로도 완전한 단어(예: "개", "말", "꿈", "꽃")가 성립하므로 1자 이상 허용
  // - 영문/숫자 단독 파편(예: 'I', 'x', '1')을 거르기 위해 한글이 없으면 2자 이상 필요
  const hasHangul = /[가-힣]/.test(trimmed);
  const meaningfulCharMatch = trimmed.match(/[가-힣a-zA-Z0-9]/g);
  if (!meaningfulCharMatch) {
    return false;
  }
  if (!hasHangul && meaningfulCharMatch.length < 2) {
    return false;
  }

  return true;
};

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
  | '이며/며'
  | '이다/다';

type JosaRule = {
  readonly pattern: RegExp;
  readonly type: JosaParticleType;
  readonly suffix?: string;
};

/** 한국어 조건부 조사 변환 규칙 목록 */
const KOREAN_JOSA_RULES: readonly JosaRule[] = [
  // 1. 이다/다 (서술격 조사 - 이/가 규칙보다 앞서 매칭하여 '(이)다'가 '가다'로 오변환되는 것을 원천 방지)
  {
    pattern: /\((?:이\s*[/]\s*다|다\s*[/]\s*이|이|다)\)다/,
    type: '이다/다'
  },
  // 2. 은/는
  {
    pattern: /\((?:은\s*[/]\s*는|는\s*[/]\s*은|은|는)\)(?:은|는)?/,
    type: '은/는'
  },
  // 3. 이/가 (뒤에 '다'가 오는 서술격 조사는 매칭하지 않도록 lookahead 적용)
  {
    pattern: /\((?:이\s*[/]\s*가|가\s*[/]\s*이|이|가)\)(?:이|가)?(?!\s*다)/,
    type: '이/가'
  },
  // 4. 을/를
  {
    pattern: /\((?:을\s*[/]\s*를|를\s*[/]\s*을|을|를)\)(?:을|를)?/,
    type: '을/를'
  },
  // 5. 와/과
  {
    pattern: /\((?:과\s*[/]\s*와|와\s*[/]\s*과|과|와)\)(?:과|와)?/,
    type: '와/과'
  },
  // 6. 으로서/로서
  {
    pattern: /\((?:으\s*[/]\s*로서|로서\s*[/]\s*으|으)\)로서/,
    type: '으로/로',
    suffix: '서'
  },
  // 7. 으로/로
  {
    pattern: /\((?:으\s*[/]\s*로|로\s*[/]\s*으|으|로)\)(?:으|로)?/,
    type: '으로/로'
  },
  // 8. 아/야
  {
    pattern: /\((?:아\s*[/]\s*야|야\s*[/]\s*아|아|야)\)(?:아|야)?/,
    type: '아/야'
  },
  // 9. 이나/나
  {
    pattern: /\((?:이\s*[/]\s*나|나\s*[/]\s*이|이|나)\)(?:이|나)?/,
    type: '이나/나'
  },
  // 10. 이라/라
  {
    pattern: /\((?:이\s*[/]\s*라|라\s*[/]\s*이|이|라)\)(?:이|라)?/,
    type: '이라/라'
  },
  // 11. 이란/란
  {
    pattern: /\((?:이\s*[/]\s*란|란\s*[/]\s*이|이|란)\)(?:이|란)?/,
    type: '이란/란'
  },
  // 12. 이든/든
  {
    pattern: /\((?:이\s*[/]\s*든|든\s*[/]\s*이|이|든)\)(?:이|든)?/,
    type: '이든/든'
  },
  // 13. 이며/며
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
      } else if (rule.type === '이다/다') {
        particle = hasBatchim(word) ? '이다' : '다';
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
    .replace(/(^|\s)\((?:이\s*[/]\s*다|다\s*[/]\s*이|이|다)\)다/g, '$1다')
    .replace(/\((?:이\s*[/]\s*다|다\s*[/]\s*이|이|다)\)다/g, '다')
    .replace(/(^|\s)\((?:은\s*[/]\s*는|는\s*[/]\s*은|은|는)\)(?:은|는)?/g, '$1는')
    .replace(/(^|\s)\((?:이\s*[/]\s*가|가\s*[/]\s*이|이|가)\)(?:이|가)?(?!\s*다)/g, '$1가')
    .replace(/(^|\s)\((?:을\s*[/]\s*를|를\s*[/]\s*을|을|를)\)(?:을|를)?/g, '$1를')
    .replace(/(^|\s)\((?:과\s*[/]\s*와|와\s*[/]\s*과|과|와)\)(?:과|와)?/g, '$1와')
    .replace(/(^|\s)\((?:으\s*[/]\s*로서|로서\s*[/]\s*으|으)\)로서/g, '$1로서')
    .replace(/(^|\s)\((?:으\s*[/]\s*로|로\s*[/]\s*으|으|로)\)(?:으|로)?/g, '$1로')
    .replace(/(^|\s)\((?:아\s*[/]\s*야|야\s*[/]\s*아|아|야)\)(?:아|야)?/g, '$1야')
    .replace(/\((?:은\s*[/]\s*는|는\s*[/]\s*은|은|는)\)(?:은|는)?/g, '는')
    .replace(/\((?:이\s*[/]\s*가|가\s*[/]\s*이|이|가)\)(?:이|가)?(?!\s*다)/g, '가')
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

  // 0. 패러독스 엔진 텍스트 서식 닫기 마커 제어문자(\x15!\x15! 등) 및 내부 서식/색상 구분용 제어 문자 제거
  cleaned = cleaned.replace(/(?:[\x00-\x1F\x7F]+!|![\x00-\x1F\x7F]+)/g, ' ');
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // 1. 미평가/미치환 스코프 태그를 자연스러운 명사로 치환하거나 제거
  cleaned = cleaned
    .replace(/\[[a-zA-Z0-9_]*doctrine[a-zA-Z0-9_.]*(?:\([^)]*\))?(?:\|[a-zA-Z0-9_]+)?\]/gi, '교리')
    .replace(/\[[a-zA-Z0-9_]*tenet[a-zA-Z0-9_.]*(?:\([^)]*\))?(?:\|[a-zA-Z0-9_]+)?\]/gi, '원리')
    .replace(/\[[a-zA-Z0-9_]*faith[a-zA-Z0-9_.]*(?:\([^)]*\))?(?:\|[a-zA-Z0-9_]+)?\]/gi, '신앙')
    .replace(/\[[a-zA-Z0-9_]*culture[a-zA-Z0-9_.]*(?:\([^)]*\))?(?:\|[a-zA-Z0-9_]+)?\]/gi, '문화')
    .replace(/\[[a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)+(?:\([^)]*\))?(?:\|[a-zA-Z0-9_]+)?\]/g, ' ');

  // 2. CK3 태그 및 콘솔 로그 헤더 제거
  for (const pattern of CK3_TAG_PATTERNS) {
    cleaned = cleaned.replace(pattern, ' ');
  }

  // 3. 단어 앞의 세미콜론 제거 (예: "; 마이센" -> "마이센")
  cleaned = cleaned.replace(/(?:^|\s);\s*/g, ' ');

  // 3.5. 단독 잔여 Paradox 엔진 링크/컨셉/수치 마커(L, G, V) 완벽 제거 (예: "L ' 장경 '", "V; 3", "L 장경", "^L ")
  // 로마 숫자(I, IV세, IX 등) 손상을 방지하기 위해 단독 마커는 링크(L), 컨셉(G), 수치(V)에 한정하고 뒤에 한글, 숫자 또는 따옴표가 올 때만 정제
  cleaned = cleaned.replace(/(?:^|\s)[LGV];?\s*(?=['"`‘“「『가-힣\d])/gi, ' ');
  cleaned = cleaned.replace(/^[LGV]\s+/i, '');

  // 4. 단어 뒤에 분리되어 붙거나 결합된 태그 닫기 느낌표 잔여물 제거 (예: "야로미르 ! ! !", "성직 지역!! 안에", "수도!!가")
  // 단, 단어에 바로 붙은 정상 단일 감탄 부호("있습니다!", "성공!")는 보존
  cleaned = cleaned.replace(/([가-힣a-zA-Z0-9])!{2,}(?=\s|[가-힣a-zA-Z0-9]|$)/g, '$1 ');
  cleaned = cleaned.replace(/(?:\s+!)+\s*(?=[가-힣a-zA-Z0-9(]|$)/g, ' ');
  cleaned = cleaned.replace(/\s+!\s+/g, ' ');
  cleaned = cleaned.replace(/(?:![\s!]+!)/g, ' ');

  // 5. 줄바꿈(\n)을 단락 간 자연스러운 공백으로 치환
  cleaned = cleaned.replace(/\r?\n+/g, ' ');

  // 5.5. 라틴어 기도문, 성경 구절, 유명 격언을 유창한 한글 독음으로 자동 변환
  cleaned = convertLatinPhrasesInText(cleaned);

  // 6. 한국어 조사 태그 자동 보정
  cleaned = resolveKoreanParticles(cleaned);

  // 7. 태그 및 특수문자 제거 후 발생한 조사 앞 불필요한 공백 정리 (예: "수드레이야르 의" -> "수드레이야르의", "작위 를" -> "작위를")
  // 단, '이'는 지시관형사(예: "이 녀석", "이 결정")로 쓰일 수 있으므로 뒤에 또 다른 한글 단어가 오는 경우(\s+[가-힣])에는 앞 단어와 붙이지 않음
  cleaned = cleaned.replace(/([가-힣a-zA-Z0-9])\s+(의|가|을|를|은|는|에|에서|로|으로|와|과|도|만|부터|까지|이다|다|임이|임은|임도|임에|이며|이고|이나|이란|이라|이든|이라도|이야)(?=[^\w가-힣]|$)/g, '$1$2');
  cleaned = cleaned.replace(/([가-힣a-zA-Z0-9])\s+이(?=[,.?!;:)]|$)/g, '$1이');

  // 7.5. 수치 서식 태그 제거 후 발생한 숫자 뒤 단위성 명사 앞 공백 정리 (예: "3 명의" -> "3명의", "10 곳" -> "10곳")
  cleaned = cleaned.replace(/(\d+)\s+(명|개|세|살|번|곳|마리|척|채|권|장|병|잔|배|가지|년|월|일)(?=[의을를이가은는에서로와과도만부터까지,]|\s|$)/g, '$1$2');

  // 8. 따옴표 내부 불필요한 공백 정리 (예: "' 엽사 '" -> "'엽사'", "“ 영주 ”" -> "“영주”")
  cleaned = cleaned
    .replace(/(['"‘“「『])\s+([가-힣a-zA-Z0-9])/g, '$1$2')
    .replace(/([가-힣a-zA-Z0-9])\s+(['"’”」』])/g, '$1$2');

  // 9. 문장 부호 앞 공백 및 연속 공백 정리
  return cleaned
    .replace(/\s+([,.?!])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
};

/** 시작 태그 패턴 및 강제 재낭독 플래그 매핑 */
type StartTagPattern = {
  readonly tag: string;
  readonly isForceReplay: boolean;
};

const START_TAG_PATTERNS: readonly StartTagPattern[] = [
  { tag: '##CK3_TTS_FORCE##', isForceReplay: true },
  { tag: '[CK3_TTS_FORCE]', isForceReplay: true },
  { tag: '##CK3_TTS##', isForceReplay: false },
  { tag: '[CK3_TTS]', isForceReplay: false }
];

const END_TAG_PATTERNS: readonly string[] = ['##CK3_TTS_END##', '[CK3_TTS_END]'];

/** GUI가 이벤트 유형을 전달하는 메타 토큰 (예: |||TYPE:WAR_RESULTS) */
const EVENT_TYPE_MARKER_PATTERN = /\|{1,3}\s*TYPE:([A-Za-z_]+)/gi;

/** 메타 토큰 값 → 이벤트 유형 매핑 */
const EVENT_TYPE_MARKER_MAP: Readonly<Record<string, Ck3EventType>> = {
  WAR_RESULTS: 'war_results'
};

/**
 * 페이로드에서 이벤트 유형 메타 토큰을 분리합니다.
 * (제목 문자열 하드코딩 대신 GUI가 명시한 유형을 사용하기 위함)
 * @param payload - 시작/종료 태그 사이 페이로드
 * @returns 토큰이 제거된 페이로드와 감지된 유형(없으면 undefined)
 */
const extractEventTypeMarker = (payload: string): { payload: string; markerType?: Ck3EventType } => {
  let markerType: Ck3EventType | undefined;
  const stripped = payload.replace(EVENT_TYPE_MARKER_PATTERN, (_match: string, rawType: string) => {
    markerType = EVENT_TYPE_MARKER_MAP[rawType.toUpperCase()] ?? markerType;
    return '';
  });
  return { payload: stripped.trim(), markerType };
};

/**
 * error.log 파편에서 정제된 페이로드를 바탕으로 이벤트 객체를 생성합니다.
 * @param payload - 조합된 에러 로그 페이로드 문자열
 * @returns 검증된 이벤트 객체 또는 null
 */
const parseRecoveredPayload = (
  payload: string
): {
  title: string;
  content: string;
  isForceReplay?: boolean;
  speakerGender?: 'male' | 'female' | 'narrator';
  eventType?: Ck3EventType;
} | null => {
  let clean = payload
    .replace(/(?:\[|##)CK3_TTS(?:_FORCE)?(?:\]|##)/gi, '')
    .trim();

  const endIdx = clean.search(/(?:\[|##)CK3_TTS_END(?:\]|##)/i);
  if (endIdx !== -1) {
    clean = clean.slice(0, endIdx).trim();
  }

  const typeExtraction = extractEventTypeMarker(clean);
  clean = typeExtraction.payload;

  let title = '이벤트';
  let content = '';
  let speakerGender: 'male' | 'female' | 'narrator' | undefined;
  let eventType: Ck3EventType = 'default';

  if (clean.includes('|||')) {
    const cleanPayload = clean.replace(/^\|{2,}\s*/, '');
    const parts = cleanPayload.split('|||');
    const rawTitle = parts[0]?.trim() ?? '';
    let rawContent = parts.slice(1).join('|||');

    const lastPartRaw = (parts[parts.length - 1] ?? '').trim().toUpperCase();
    const isGenderMarker =
      /^GENDER:LETTER_F\b|^LETTER:F\b/.test(lastPartRaw) ||
      /^GENDER:LETTER_M\b|^LETTER:M\b/.test(lastPartRaw) ||
      /^GENDER:F\b|^FEMALE\b/.test(lastPartRaw) ||
      /^GENDER:M\b|^MALE\b/.test(lastPartRaw);

    if (isGenderMarker) {
      if (/^GENDER:LETTER_F\b|^LETTER:F\b/.test(lastPartRaw)) {
        speakerGender = 'female';
        eventType = 'letter';
      } else if (/^GENDER:LETTER_M\b|^LETTER:M\b/.test(lastPartRaw)) {
        speakerGender = 'male';
        eventType = 'letter';
      } else if (/^GENDER:F\b|^FEMALE\b/.test(lastPartRaw)) {
        speakerGender = 'female';
      } else if (/^GENDER:M\b|^MALE\b/.test(lastPartRaw)) {
        speakerGender = 'male';
      }

      if (parts.length === 2) {
        rawContent = parts[0] ?? '';
      } else {
        rawContent = parts.slice(1, -1).join('|||');
      }
    }

    rawContent = rawContent.replace(/\|{1,3}\s*GENDER:[A-Za-z_]+(?:\b|(?=["'\s]))/gi, '').trim();

    const sanitizedTitle = parts.length === 2 && isGenderMarker ? '이벤트' : sanitizeCk3Text(rawTitle);
    const sanitizedContent = sanitizeCk3Text(rawContent);
    title = sanitizedTitle.length > 0 ? sanitizedTitle : '이벤트';
    content = sanitizedContent;
  } else {
    const genderMatch = clean.match(/(?:\|{1,3}\s*)?GENDER:([A-Za-z_]+)/i);
    if (genderMatch && genderMatch[1]) {
      const g = genderMatch[1].toUpperCase();
      if (g.includes('FEMALE') || g === 'F' || g.includes('LETTER_F')) {
        speakerGender = 'female';
      } else if (g.includes('MALE') || g === 'M' || g.includes('LETTER_M')) {
        speakerGender = 'male';
      }
      clean = clean.replace(/(?:\|{1,3}\s*)?GENDER:[A-Za-z_]+(?:\b|(?=["'\s]))/gi, '').trim();
    }
    content = sanitizeCk3Text(clean);
  }

  if (isValidNarrativeText(title) && isValidNarrativeText(content)) {
    return { title, content, isForceReplay: false, speakerGender, eventType: typeExtraction.markerType ?? eventType };
  }
  return null;
};

/**
 * error.log 내 콘솔 명령어 구문 파싱 에러(큰따옴표 조기 종료 등)로 쪼개진 Unknown effect 라인들을 모아
 * 원래의 온전한 CK3 TTS 이벤트로 복원합니다.
 * @param chunk - 읽어들인 로그 청크
 * @returns 복원된 이벤트 목록
 */
const recoverEventsFromErrorLog = (
  chunk: string
): Array<{
  title: string;
  content: string;
  isForceReplay?: boolean;
  speakerGender?: 'male' | 'female' | 'narrator';
  eventType?: Ck3EventType;
}> => {
  const recoveredEvents: Array<{
    title: string;
    content: string;
    isForceReplay?: boolean;
    speakerGender?: 'male' | 'female' | 'narrator';
    eventType?: Ck3EventType;
  }> = [];

  if (!chunk.includes('effect console command') && !chunk.includes('Unknown effect:')) {
    return recoveredEvents;
  }

  const lines = chunk.split(/\r?\n/);
  let currentTokens: string[] = [];
  let isCollecting = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Unknown effect 에러 라인 매칭
    if (trimmed.includes('Unknown effect:')) {
      isCollecting = true;

      // 1. 접두사 "Unknown effect:" 앞부분(로그 헤더 포함) 제거
      let lineBody = trimmed.replace(/^.*?Unknown effect:\s*/, '');

      // 2. 뒤쪽의 '" in file: "effect console command"...' 메타데이터 제거
      lineBody = lineBody.replace(/"?\s*in file:\s*["']?effect console command["']?.*$/i, '');

      // 3. 뒤쪽의 '(expanded from file: ...)' 스크립트 확장 메타데이터 완벽 제거
      lineBody = lineBody.replace(/\(expanded from file:.*$/i, '');
      lineBody = lineBody.replace(/\(expanded from file:[^)]*\)/gi, '');

      // 4. 뒤쪽의 ', near line: 3' 또는 'near line: 3' 위치 정보 완벽 제거
      lineBody = lineBody.replace(/,?\s*near line:\s*\d+.*$/i, '');
      lineBody = lineBody.replace(/,?\s*near line:\s*\d+/gi, '');
      lineBody = lineBody.trim();

      // 5. 토큰 정제: 인게임 태그 및 DB 식별자 필터링
      // - TOOLTIP:FAITH, TOOLTIP:LANDED_TITLE,7232 등 서식 태그 및 ID 파편 제거
      lineBody = lineBody.replace(/\b(?:ONCLICK|TOOLTIP|SCALED_STATIC_MODIFIER):[^\s"'\]]+/gi, '').trim();
      lineBody = lineBody.replace(/,\s*\d{3,}\b/g, '').trim();

      // - maitreya_faith, catholic 등 순수 스네이크케이스 영문 DB 키(신앙/특성/문화 식별자) 제거
      lineBody = lineBody.replace(/\b[a-z0-9]+_[a-z0-9_]+\b/g, '').trim();

      // - 잔여 앞뒤 쉼표 및 느낌표 정리
      lineBody = lineBody.replace(/^[,!.\s]+/, '').replace(/[,!.\s]+$/, '').trim();

      // 6. 파편화된 무효 토큰 배제 (수집 스킵)
      // - 3자리 이상의 순수 숫자열 (캐릭터/타이틀 고유 ID 파편: 15301, 7232 등)
      if (/^\d{3,}$/.test(lineBody)) {
        continue;
      }
      // - 단독 서식/링크 마커 (L, G, V, B, E, I, P, N)
      if (/^[LGVBEIPN]$/i.test(lineBody)) {
        continue;
      }
      // - 구두점만 남은 토큰
      if (/^[!,.:;?\s]+$/.test(lineBody)) {
        continue;
      }

      if (lineBody.length > 0) {
        currentTokens.push(lineBody);
      }

      // 블록 종료 검사: 해당 라인에 닫는 태그나 "in file: effect console command" 가 있으면 블록 완료
      if (
        trimmed.includes('##CK3_TTS_END##') ||
        trimmed.includes('[CK3_TTS_END]') ||
        trimmed.includes('in file: "effect console command"')
      ) {
        const fullPayload = currentTokens.join(' ');
        const hasExplicitTtsMarker =
          fullPayload.includes('CK3_TTS') ||
          fullPayload.includes('|||') ||
          /\bGENDER:[A-Za-z_]+/i.test(fullPayload);

        // 명시적 TTS 마커(CK3_TTS 태그, ||| 구분자, GENDER 성별)가 없는 경우:
        // 전체 복원 텍스트가 최소 20자 이상이어야만 유효한 복원으로 판정.
        // (단순 무의미한 극소수 단어 조각 파편은 가짜 이벤트 생성을 방지하기 위해 폐기)
        const hasSubstantialSentence = fullPayload.length >= 20;

        currentTokens = [];
        isCollecting = false;

        if (!hasExplicitTtsMarker && !hasSubstantialSentence) {
          continue;
        }

        const recovered = parseRecoveredPayload(fullPayload);
        if (recovered) {
          recoveredEvents.push(recovered);
        }
      }
    } else if (isCollecting && (trimmed.includes('##CK3_TTS_END##') || trimmed.includes('[CK3_TTS_END]'))) {
      currentTokens.push(trimmed);
      const fullPayload = currentTokens.join(' ');
      currentTokens = [];
      isCollecting = false;

      const recovered = parseRecoveredPayload(fullPayload);
      if (recovered) {
        recoveredEvents.push(recovered);
      }
    } else if (isCollecting && trimmed.length === 0) {
      if (currentTokens.length > 0 && currentTokens.some((t) => t.includes('CK3_TTS'))) {
        const fullPayload = currentTokens.join(' ');
        const recovered = parseRecoveredPayload(fullPayload);
        if (recovered) {
          recoveredEvents.push(recovered);
        }
      }
      currentTokens = [];
      isCollecting = false;
    }
  }

  return recoveredEvents;
};

/**
 * 후보 텍스트의 핵심 단어들이 기존 텍스트에 50% 이상 포함되어 있는 파편(Subset)인지 판별합니다.
 * @param candidateText - 파편 검사 대상 텍스트
 * @param existingText - 비교 기준 원본 텍스트
 * @returns 50% 이상 단어가 중복되는 파편이면 true
 */
export const isFragmentOf = (candidateText: string, existingText: string): boolean => {
  const words = candidateText.split(/\s+/).filter((w) => w.length >= 2);
  if (words.length === 0) {
    return false;
  }
  let matchCount = 0;
  for (const word of words) {
    if (existingText.includes(word)) {
      matchCount++;
    }
  }
  return matchCount / words.length >= 0.5;
};

/**
 * 로그 텍스트 청크(멀티라인 줄바꿈 포함)에서 ##CK3_TTS## 및 [CK3_TTS] 블록들을 온전하게 추출합니다.
 * 동일한 청크 내 중복 이벤트는 1회만 반환합니다.
 * @param chunk - 새로 읽어들인 debug.log 텍스트 청크
 * @returns 추출된 이벤트 목록
 */
export const extractCk3EventsFromChunk = (
  chunk: string
): Array<{
  title: string;
  content: string;
  isForceReplay?: boolean;
  speakerGender?: 'male' | 'female' | 'narrator';
  eventType?: Ck3EventType;
}> => {
  const events: Array<{
    title: string;
    content: string;
    isForceReplay?: boolean;
    speakerGender?: 'male' | 'female' | 'narrator';
    eventType?: Ck3EventType;
  }> = [];
  const candidateEvents: Array<{
    title: string;
    content: string;
    isForceReplay?: boolean;
    speakerGender?: 'male' | 'female' | 'narrator';
    eventType?: Ck3EventType;
  }> = [];

  let searchIndex = 0;
  while (searchIndex < chunk.length) {
    // 1. 가장 먼저 등장하는 시작 태그 탐색
    let bestStart: { index: number; tag: string; isForceReplay: boolean } | null = null;
    for (const pattern of START_TAG_PATTERNS) {
      const idx = chunk.indexOf(pattern.tag, searchIndex);
      if (idx !== -1 && (bestStart === null || idx < bestStart.index)) {
        bestStart = { index: idx, tag: pattern.tag, isForceReplay: pattern.isForceReplay };
      }
    }

    if (!bestStart) {
      break;
    }

    const startIndex = bestStart.index;
    const isForceReplay = bestStart.isForceReplay;
    const prefixLength = bestStart.tag.length;

    // 2. 앞선 로그가 ERROR: 로 시작하는 경우 패러독스 파서가 따옴표 등으로 잘라버린 불완전 에러 라인이므로 스킵
    const prefixContext = chunk.slice(Math.max(0, startIndex - 15), startIndex);
    if (prefixContext.includes('ERROR:')) {
      searchIndex = startIndex + prefixLength;
      continue;
    }

    const contentStart = startIndex + prefixLength;

    // 3. 가장 먼저 등장하는 닫는 태그 탐색
    let bestEnd: { index: number; tag: string } | null = null;
    for (const endTag of END_TAG_PATTERNS) {
      const idx = chunk.indexOf(endTag, contentStart);
      if (idx !== -1 && (bestEnd === null || idx < bestEnd.index)) {
        bestEnd = { index: idx, tag: endTag };
      }
    }

    if (!bestEnd) {
      // 닫는 태그가 없다면 불완전한 파편이므로 스킵
      searchIndex = contentStart;
      continue;
    }

    // 따옴표로 잘린 시작 태그(END 없음)가 뒤따르는 다른 이벤트의 END와 결합되어
    // 로그 잡음이 섞인 거대한 가짜 본문이 만들어지는 것을 막기 위해, END 이전에 새 시작 태그가 있으면 현재 시작을 폐기
    const endIndex = bestEnd.index;
    const hasNestedStart = START_TAG_PATTERNS.some((pattern) => {
      const nestedIdx = chunk.indexOf(pattern.tag, contentStart);
      return nestedIdx !== -1 && nestedIdx < endIndex;
    });
    if (hasNestedStart) {
      searchIndex = contentStart;
      continue;
    }

    const typeExtraction = extractEventTypeMarker(chunk.slice(contentStart, bestEnd.index));
    const payload = typeExtraction.payload;
    searchIndex = bestEnd.index + bestEnd.tag.length;

    // 1차: 페이로드 원본 레벨에서 Jomini GUI 스크립트 코드 또는 미평가 표현식 유출 차단
    if (!isValidNarrativeText(payload)) {
      console.warn('⚠️ [TextSanitizer] 비정상 GUI 스크립트 페이로드가 감지되어 차단했습니다:', payload.slice(0, 100));
      continue;
    }

    if (payload.length > 0) {
      let title = '이벤트';
      let content = '';
      let speakerGender: 'male' | 'female' | 'narrator' | undefined;
      let eventType: Ck3EventType = 'default';

      if (payload.includes('|||')) {
        // 맨 앞에 불필요하게 시작된 파이프 기호(|||) 제거 (예: "[CK3_TTS]|||제목|||내용" 케이스 방어)
        const cleanPayload = payload.replace(/^\|{2,}\s*/, '');
        const parts = cleanPayload.split('|||');
        const rawTitle = parts[0] ?? '';
        let rawContent = parts.slice(1).join('|||');

        // 마지막 세그먼트가 성별 태그(LETTER_F, LETTER_M, GENDER:F, GENDER:M, FEMALE, MALE)인지 검사
        const lastPartRaw = (parts[parts.length - 1] ?? '').trim().toUpperCase();
        const isGenderMarker =
          /^GENDER:LETTER_F\b|^LETTER:F\b/.test(lastPartRaw) ||
          /^GENDER:LETTER_M\b|^LETTER:M\b/.test(lastPartRaw) ||
          /^GENDER:F\b|^FEMALE\b/.test(lastPartRaw) ||
          /^GENDER:M\b|^MALE\b/.test(lastPartRaw);

        if (isGenderMarker) {
          if (/^GENDER:LETTER_F\b|^LETTER:F\b/.test(lastPartRaw)) {
            speakerGender = 'female';
            eventType = 'letter';
          } else if (/^GENDER:LETTER_M\b|^LETTER:M\b/.test(lastPartRaw)) {
            speakerGender = 'male';
            eventType = 'letter';
          } else if (/^GENDER:F\b|^FEMALE\b/.test(lastPartRaw)) {
            speakerGender = 'female';
          } else if (/^GENDER:M\b|^MALE\b/.test(lastPartRaw)) {
            speakerGender = 'male';
          }

          if (parts.length === 2) {
            rawContent = parts[0] ?? '';
          } else {
            rawContent = parts.slice(1, -1).join('|||');
          }
        }

        // 혹시 분할되지 않고 본문 끝에 잔류한 성별 마커가 있다면 2차 방어로 완전 소멸
        rawContent = rawContent.replace(/\|{1,3}\s*GENDER:[A-Za-z_]+(?:\b|(?=["'\s]))/gi, '').trim();

        const sanitizedTitle = parts.length === 2 && isGenderMarker ? '이벤트' : sanitizeCk3Text(rawTitle);
        const sanitizedContent = sanitizeCk3Text(rawContent);
        title = sanitizedTitle.length > 0 ? sanitizedTitle : '이벤트';
        content = sanitizedContent;
      } else {
        content = sanitizeCk3Text(payload);
      }

      // 2차: 정제된 제목 및 본문이 유효한 내러티브 텍스트인지 최종 검증
      if (isValidNarrativeText(title) && isValidNarrativeText(content)) {
        candidateEvents.push({
          title,
          content,
          isForceReplay,
          speakerGender,
          eventType: typeExtraction.markerType ?? eventType
        });
      } else {
        console.warn('⚠️ [TextSanitizer] 정제 후 비정상 스크립트/무효 텍스트로 판정되어 차단했습니다:', { title, content });
      }
    }
  }

  // 4. error.log 내 콘솔 커맨드 구문 파싱 에러(큰따옴표 조기 종료 등)로 쪼개진 Unknown effect 라인들 자동 복원
  const recoveredFromErrors = recoverEventsFromErrorLog(chunk);
  for (const recovered of recoveredFromErrors) {
    candidateEvents.push(recovered);
  }

  // 동일한 청크 내 중복 또는 파편이 존재할 경우, 더 완전하고 긴 본문을 우선 채택
  for (const candidate of candidateEvents) {
    const existingIndex = events.findIndex(
      (e) =>
        e.title === candidate.title ||
        candidate.content.includes(e.content) ||
        e.content.includes(candidate.content) ||
        isFragmentOf(candidate.content, e.content) ||
        isFragmentOf(e.content, candidate.content)
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
  let lineToParse = logLine;
  if (
    (lineToParse.includes('[CK3_TTS]') || lineToParse.includes('##CK3_TTS##')) &&
    !lineToParse.includes('[CK3_TTS_END]') &&
    !lineToParse.includes('##CK3_TTS_END##')
  ) {
    lineToParse += lineToParse.includes('##CK3_TTS') ? '##CK3_TTS_END##' : '[CK3_TTS_END]';
  }
  const events = extractCk3EventsFromChunk(lineToParse);
  return events[0] ?? null;
};

export { splitIntoSentences } from '@/shared/sentenceSplitter';
