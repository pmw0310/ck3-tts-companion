/**
 * @file latinTransliteration.ts
 * @description Crusader Kings 3 이벤트에 등장하는 라틴어 기도문, 성경 구절 및 격언을
 * 한국어 TTS 엔진이 유창하고 자연스럽게 낭독할 수 있도록 한글 독음(교회 라틴어 음가)으로 변환하는 모듈
 */

/** 유명 라틴어 격언, 성경 구절 및 상용구 사전 매핑 */
export const LATIN_LEXICON_MAP: Readonly<Record<string, string>> = {
  // 대표적인 중세/CK3 라틴어 구호 및 격언
  'deus vult': '데우스 불트',
  'pax vobiscum': '팍스 보비스쿰',
  'ora et labora': '오라 에트 라보라',
  'mea culpa': '메아 쿨파',
  'alea iacta est': '알레아 약타 에스트',
  'memento mori': '메멘토 모리',
  'carpe diem': '카르페 디엠',
  'veni vidi vici': '베니 비디 비치',
  'requiescat in pace': '레퀴에스카트 인 파체',
  'in hoc signo vinces': '인 호크 시그노 빈체스',
  'anno domini': '안노 도미니',
  'habemus papam': '하베무스 파팜',
  'gloria in excelsis deo': '글로리아 인 엑스첼시스 데오',
  'agnus dei': '아뉴스 데이',
  'sanctus dominus': '상크투스 도미누스',
  'te deum': '테 데움',
  'stabat mater': '스타바트 마테르',
  'dies irae': '디에스 이레',
  'ave maria': '아베 마리아',
  'pater noster': '파테르 노스테르',
  'credo in unum deum': '크레도 인 우눔 데움',
  'in nomine patris': '인 노미네 파트리스',
  'et filii': '에트 필리',
  'et spiritus sancti': '에트 스피리투스 상크티',
  'ex cathedra': '엑스 카테드라',
  'ad hoc': '아드 호크',
  'status quo': '스타투스 쿠오',
  'persona non grata': '페르소나 논 그라타',
  'quid pro quo': '퀴드 프로 쿠오',
  'ipso facto': '입소 팍토',
  'pro bono': '프로 보노',
  'de jure': '데 유레',
  'de facto': '데 팍토',
  'vox populi': '복스 포풀리',
  'tabula rasa': '타불라 라사',
  'sic transit gloria mundi': '시크 트란시트 글로리아 문디',
  'homo homini lupus': '호모 호미니 루푸스',
  'amor fati': '아모르 파티',
  'et tu brute': '에트 투 브루테',
  'panem et circenses': '파넴 에트 치르첸세스',
  'dulce et decorum est': '둘체 에트 데코룸 에스트',
  'in vino veritas': '인 비노 베리타스',
  'ad astra per aspera': '아드 아스트라 페르 아스페라',
  'non nobis domine': '논 노비스 도미네',
  'populus acquisitionis': '포풀루스 아퀴지치오니스',
  'regale sacerdotium': '레갈레 사체르도치움',
  'gens sancta': '젠스 산크타',
  'genus electum': '제누스 엘렉툼',
  'vos autem': '보스 아우템'
};

/** 한글 조합 상수 */
const HANGUL_BASE = 0xac00;
const CHOSUNG_INTERVAL = 21 * 28;
const JUNGSUNG_INTERVAL = 28;

const CHOSUNG_MAP: Readonly<Record<string, number>> = {
  ㄱ: 0,
  ㄲ: 1,
  ㄴ: 2,
  ㄷ: 3,
  ㄸ: 4,
  ㄹ: 5,
  ㅁ: 6,
  ㅂ: 7,
  ㅃ: 8,
  ㅅ: 9,
  ㅆ: 10,
  ㅇ: 11,
  ㅈ: 12,
  ㅉ: 13,
  ㅊ: 14,
  ㅋ: 15,
  ㅌ: 16,
  ㅍ: 17,
  ㅎ: 18
};

const JUNGSUNG_MAP: Readonly<Record<string, number>> = {
  ㅏ: 0,
  ㅐ: 1,
  ㅑ: 2,
  ㅒ: 3,
  ㅓ: 4,
  ㅔ: 5,
  ㅕ: 6,
  ㅖ: 7,
  ㅗ: 8,
  ㅘ: 9,
  ㅙ: 10,
  ㅚ: 11,
  ㅛ: 12,
  ㅜ: 13,
  ㅝ: 14,
  ㅞ: 15,
  ㅟ: 16,
  ㅠ: 17,
  ㅡ: 18,
  ㅢ: 19,
  ㅣ: 20
};

const JONGSUNG_MAP: Readonly<Record<string, number>> = {
  '': 0,
  ㄱ: 1,
  ㄴ: 4,
  ㄷ: 7,
  ㄹ: 8,
  ㅁ: 16,
  ㅂ: 17,
  ㅅ: 19,
  ㅇ: 21
};

/**
 * 초성, 중성, 종성을 조합하여 완성형 한글 1글자를 생성합니다.
 * @param cho - 초성 자음
 * @param jung - 중성 모음
 * @param jong - 종성 받침 (선택)
 * @returns 완성형 한글 글자
 */
const composeHangul = (cho: string, jung: string, jong: string = ''): string => {
  const choIdx = CHOSUNG_MAP[cho] ?? 11; // 기본 'ㅇ'
  const jungIdx = JUNGSUNG_MAP[jung] ?? 0; // 기본 'ㅏ'
  const jongIdx = JONGSUNG_MAP[jong] ?? 0;

  const charCode = HANGUL_BASE + choIdx * CHOSUNG_INTERVAL + jungIdx * JUNGSUNG_INTERVAL + jongIdx;
  return String.fromCharCode(charCode);
};

/**
 * 마지막 완성형 한글 글자에 받침(종성)을 덧붙입니다.
 * @param text - 조합 중인 한글 문자열
 * @param jong - 덧붙일 받침 자음
 * @returns 받침이 조합된 문자열
 */
const addJongsungToLastChar = (text: string, jong: string): string => {
  if (!text || text.length === 0) return text;
  const lastIndex = text.length - 1;
  const lastChar = text[lastIndex]!;
  const code = lastChar.charCodeAt(0);

  if (code >= HANGUL_BASE && code <= 0xd7a3) {
    const diff = code - HANGUL_BASE;
    const currentJong = diff % 28;
    if (currentJong === 0) {
      const jongIdx = JONGSUNG_MAP[jong] ?? 0;
      return text.slice(0, lastIndex) + String.fromCharCode(code + jongIdx);
    }
  }

  // 이미 받침이 있어 덧붙이지 못하는 경우 별도 음절 부착
  if (jong === 'ㅁ') return text + '음';
  if (jong === 'ㄴ') return text + '은';
  if (jong === 'ㄹ') return text + '을';
  if (jong === 'ㄱ') return text + '크';
  if (jong === 'ㅂ') return text + '프';
  return text;
};

/** 라틴어 모음 여부 판별 */
const isVowel = (c: string): boolean => 'aeiouy'.includes(c.toLowerCase());

/** 라틴어 자음 여부 판별 */
const isConsonant = (c: string): boolean => 'bcdfghjklmnpqrstvwxz'.includes(c.toLowerCase());

/** 라틴 알파벳 -> 한글 초성 매핑 */
const getHangulConsonant = (c: string): string => {
  switch (c.toLowerCase()) {
    case 'b':
      return 'ㅂ';
    case 'c':
    case 'k':
      return 'ㅋ';
    case 'd':
      return 'ㄷ';
    case 'f':
    case 'p':
      return 'ㅍ';
    case 'g':
      return 'ㄱ';
    case 'h':
      return 'ㅎ';
    case 'j':
    case 'y':
      return 'ㅇ';
    case 'l':
    case 'r':
      return 'ㄹ';
    case 'm':
      return 'ㅁ';
    case 'n':
      return 'ㄴ';
    case 's':
      return 'ㅅ';
    case 't':
      return 'ㅌ';
    case 'v':
    case 'w':
      return 'ㅂ';
    case 'z':
      return 'ㅈ';
    default:
      return 'ㅇ';
  }
};

/** 라틴 단일 모음 -> 한글 중성 매핑 */
const getHangulVowel = (c: string): string => {
  switch (c.toLowerCase()) {
    case 'a':
      return 'ㅏ';
    case 'e':
      return 'ㅔ';
    case 'i':
    case 'y':
      return 'ㅣ';
    case 'o':
      return 'ㅗ';
    case 'u':
      return 'ㅜ';
    default:
      return 'ㅏ';
  }
};

/**
 * 단일 라틴어 단어를 교회 라틴어(Church Latin) 발음 규칙에 따라 한글 음차합니다.
 * @param rawWord - 변환할 원본 라틴어 단어 (구두점 제외)
 * @returns 한글 독음 단어
 */
export const transliterateLatinWord = (rawWord: string): string => {
  if (!rawWord || rawWord.trim().length === 0) {
    return rawWord;
  }

  // 소문자화 및 라틴어 특수 합자(æ, œ) 정규화
  const word = rawWord
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe');

  // 단어 단위 사전 빠른 검사
  const lowerTrimmed = word.trim();
  const directMatch = LATIN_LEXICON_MAP[lowerTrimmed];
  if (directMatch) {
    return directMatch;
  }

  // 음소 분석 루프
  let result = '';
  let i = 0;
  const len = word.length;

  while (i < len) {
    const char = word[i]!;
    const nextChar = i + 1 < len ? word[i + 1]! : '';
    const afterNext = i + 2 < len ? word[i + 2]! : '';
    const after3 = i + 3 < len ? word[i + 3]! : '';

    // 1. qu + 모음 처리 (qui -> 퀴, quae -> 퀘, quod -> 쿼, quas -> 과/콰)
    if (char === 'q' && nextChar === 'u' && afterNext) {
      if (afterNext === 'a') {
        result += '콰';
        i += 3;
        continue;
      }
      if (afterNext === 'e') {
        result += '퀘';
        i += 3;
        continue;
      }
      if (afterNext === 'i') {
        result += '퀴';
        i += 3;
        continue;
      }
      if (afterNext === 'o') {
        result += '쿼';
        i += 3;
        continue;
      }
      if (afterNext === 'u') {
        result += '쿠';
        i += 3;
        continue;
      }
    }

    // 2. cqu + 모음 (acquisitionis -> 아퀴지치오니스)
    if (char === 'c' && nextChar === 'q' && afterNext === 'u' && after3) {
      if (after3 === 'i') {
        result += '퀴';
        i += 4;
        continue;
      }
      if (after3 === 'a') {
        result += '콰';
        i += 4;
        continue;
      }
      if (after3 === 'e') {
        result += '퀘';
        i += 4;
        continue;
      }
      if (after3 === 'o') {
        result += '쿼';
        i += 4;
        continue;
      }
    }

    // 3. gu + 모음 (sanguis -> 상구이스 등)
    if (char === 'g' && nextChar === 'u' && afterNext && 'aeio'.includes(afterNext)) {
      if (afterNext === 'a') {
        result += '과';
        i += 3;
        continue;
      }
      if (afterNext === 'e') {
        result += '궤';
        i += 3;
        continue;
      }
      if (afterNext === 'i') {
        result += '귀';
        i += 3;
        continue;
      }
      if (afterNext === 'o') {
        result += '궈';
        i += 3;
        continue;
      }
    }

    // 4. 자음 클러스터 (ch, ph, th, sc, gn)
    if (char === 'c' && nextChar === 'h') {
      if (afterNext && 'aeiou'.includes(afterNext)) {
        result += composeHangul('ㅋ', getHangulVowel(afterNext));
        i += 3;
        continue;
      }
      result += '크';
      i += 2;
      continue;
    }

    if (char === 'p' && nextChar === 'h') {
      if (afterNext && 'aeiou'.includes(afterNext)) {
        result += composeHangul('ㅍ', getHangulVowel(afterNext));
        i += 3;
        continue;
      }
      result += '프';
      i += 2;
      continue;
    }

    if (char === 't' && nextChar === 'h') {
      if (afterNext && 'aeiou'.includes(afterNext)) {
        result += composeHangul('ㅌ', getHangulVowel(afterNext));
        i += 3;
        continue;
      }
      result += '트';
      i += 2;
      continue;
    }

    // sc + e, i -> 셰, 시
    if (char === 's' && nextChar === 'c' && (afterNext === 'e' || afterNext === 'i')) {
      result += afterNext === 'e' ? '셰' : '시';
      i += 3;
      continue;
    }

    // gn + 모음 -> 냐, 녜, 니, 뇨, 뉴 (교회 라틴어 agnus -> 아뉴스)
    if (char === 'g' && nextChar === 'n' && afterNext && 'aeiou'.includes(afterNext)) {
      if (afterNext === 'a') result += '냐';
      else if (afterNext === 'e') result += '녜';
      else if (afterNext === 'i') result += '니';
      else if (afterNext === 'o') result += '뇨';
      else if (afterNext === 'u') result += '뉴';
      i += 3;
      continue;
    }

    // 5. ti + 모음 -> 치 (교회 라틴어: sacerdotium -> 사체르도치움, annuntietis -> 안눈치에티스)
    // 단, s, t, x 뒤는 티 (ostium -> 오스티움)
    if (char === 't' && nextChar === 'i' && afterNext && 'aeou'.includes(afterNext)) {
      const prevChar = i > 0 ? word[i - 1]! : '';
      if (!'stx'.includes(prevChar)) {
        if (afterNext === 'a') result += '치아';
        else if (afterNext === 'e') result += '치에';
        else if (afterNext === 'o') result += '치오';
        else if (afterNext === 'u') result += '치우';
        i += 3;
        continue;
      }
    }

    // 6. c + e, i -> 체, 치
    if (char === 'c' && (nextChar === 'e' || nextChar === 'i')) {
      result += nextChar === 'e' ? '체' : '치';
      i += 2;
      continue;
    }

    // 7. g + e, i -> 제, 지 (genus -> 제누스, gens -> 젠스)
    if (char === 'g' && (nextChar === 'e' || nextChar === 'i')) {
      result += nextChar === 'e' ? '제' : '지';
      i += 2;
      continue;
    }

    // 8. 모음 사이 s의 유성음화: 모음 + s + 모음 -> 지 (acquisitionis -> 아퀴지치오니스)
    if (char === 's' && nextChar === 'i' && i > 0 && isVowel(word[i - 1]!)) {
      result += '지';
      i += 2;
      continue;
    }

    // 9. 이중모음 (ae, oe, au, eu, ei)
    if (char === 'a' && nextChar === 'e') {
      result += '에';
      i += 2;
      continue;
    }
    if (char === 'o' && nextChar === 'e') {
      result += '에';
      i += 2;
      continue;
    }
    if (char === 'a' && nextChar === 'u') {
      result += '아우';
      i += 2;
      continue;
    }
    if (char === 'e' && nextChar === 'u') {
      result += '에우';
      i += 2;
      continue;
    }
    if (char === 'e' && nextChar === 'i' && afterNext === 'u') {
      result += '에이';
      i += 2;
      continue;
    }

    // 10. 단일 자음 + 단일 모음 음절 결합 (Consonant + Vowel)
    if (isConsonant(char) && nextChar && isVowel(nextChar)) {
      // 다음 모음이 ae나 oe인 경우
      if (i + 2 < len && nextChar === 'a' && word[i + 2] === 'e') {
        const cho = getHangulConsonant(char);
        result += composeHangul(cho, 'ㅔ');
        i += 3;
        continue;
      }

      // 모음 사이의 l (regale, populus) 또는 ll (stella): 한국어에서는 'ㄹ' 받침 + 'ㄹ' 초성 결합이 유창함
      if (char === 'l' && i > 0 && isVowel(word[i - 1]!) && result.length > 0) {
        result = addJongsungToLastChar(result, 'ㄹ');
        result += composeHangul('ㄹ', getHangulVowel(nextChar));
        i += 2;
        continue;
      }

      const cho = getHangulConsonant(char);
      const jung = getHangulVowel(nextChar);
      result += composeHangul(cho, jung);
      i += 2;
      continue;
    }

    // 11. 단독 모음
    if (isVowel(char)) {
      // 모음 뒤에 l + 모음이 오는 구조 (electum -> 엘렉툼)
      if (nextChar === 'l' && afterNext && isVowel(afterNext)) {
        result += composeHangul('ㅇ', getHangulVowel(char), 'ㄹ');
        result += composeHangul('ㄹ', getHangulVowel(afterNext));
        i += 3;
        continue;
      }

      result += composeHangul('ㅇ', getHangulVowel(char));
      i += 1;
      continue;
    }

    // 12. 단독 자음 (모음 앞이 아닌 자음: 자음 앞 또는 단어 끝)
    if (isConsonant(char)) {
      // (1) n 처리: 뒤에 자음이 오거나 단어 끝일 때 앞 글자에 'ㄴ' 받침 결합
      // 예: sancta -> 산, annuntietis -> 안 / 눈, gens -> 젠, in -> 인, non -> 논
      if (char === 'n') {
        if (result.length > 0) {
          result = addJongsungToLastChar(result, 'ㄴ');
        } else {
          result += '인';
        }
        i += 1;
        continue;
      }

      // (2) m 처리: 뒤에 자음 또는 단어 끝일 때 앞 글자에 'ㅁ' 받침 결합
      // 예: electum -> 툼, autem -> 템, tempus -> 템
      if (char === 'm') {
        if (result.length > 0) {
          result = addJongsungToLastChar(result, 'ㅁ');
        } else {
          result += '임';
        }
        i += 1;
        continue;
      }

      // (3) l 처리: 뒤에 자음 또는 단어 끝일 때 앞 글자에 'ㄹ' 받침 결합
      // 예: vult -> 불, culpa -> 쿨, nihil -> 니힐
      if (char === 'l') {
        if (result.length > 0) {
          result = addJongsungToLastChar(result, 'ㄹ');
        } else {
          result += '일';
        }
        i += 1;
        continue;
      }

      // (4) x 처리: 뒤에 자음 또는 단어 끝 (pax -> 팍스)
      if (char === 'x') {
        if (result.length > 0) {
          result = addJongsungToLastChar(result, 'ㄱ');
          result += '스';
        } else {
          result += '엑스';
        }
        i += 1;
        continue;
      }

      // (5) c 처리: c 뒤에 t (electum -> 엘렉툼)
      if (char === 'c' && nextChar === 't') {
        if (result.length > 0) {
          result = addJongsungToLastChar(result, 'ㄱ');
        } else {
          result += '크';
        }
        i += 1;
        continue;
      }

      // (6) c 처리: c 뒤에 q (acquisitionis -> 아퀴지치오니스)
      if (char === 'c' && nextChar === 'q') {
        i += 1;
        continue;
      }

      // (7) r 처리: 뒤에 자음 또는 단어 끝 (virtutes -> 비르투테스, pater -> 파테르)
      if (char === 'r') {
        result += '르';
        i += 1;
        continue;
      }

      // (8) s 처리: 단어 끝 또는 자음 앞 (vos -> 보스, sancta -> 크타 앞 스)
      if (char === 's') {
        result += '스';
        i += 1;
        continue;
      }

      // (9) t 처리: 단어 끝 또는 자음 앞 (ut -> 우트, virtutes -> 비르투테스)
      if (char === 't') {
        result += '트';
        i += 1;
        continue;
      }

      // (10) 기타 자음들
      if (char === 'p') {
        result += '프';
        i += 1;
        continue;
      }
      if (char === 'b') {
        result += '브';
        i += 1;
        continue;
      }
      if (char === 'd') {
        result += '드';
        i += 1;
        continue;
      }
      if (char === 'f') {
        result += '프';
        i += 1;
        continue;
      }
      if (char === 'g') {
        result += '그';
        i += 1;
        continue;
      }
      if (char === 'c') {
        result += '크';
        i += 1;
        continue;
      }
      if (char === 'v') {
        result += '브';
        i += 1;
        continue;
      }

      i += 1;
      continue;
    }

    // 알 수 없는 문자
    result += char;
    i += 1;
  }

  return result;
};

/**
 * 주어진 텍스트 내에서 라틴어 구절(인용구 내부의 연속된 라틴어 단어열 또는 라틴어 문장)을 찾아
 * 한글 독음으로 변환합니다.
 * @param text - 정제할 텍스트
 * @returns 라틴어 구절이 한글 독음으로 변환된 텍스트
 */
export const convertLatinPhrasesInText = (text: string): string => {
  if (!text || text.trim().length === 0) {
    return text;
  }

  // 1. 유명 라틴어 격언 사전 직접 치환 (대소문자 무시)
  let processed = text;
  for (const [latin, hangul] of Object.entries(LATIN_LEXICON_MAP)) {
    const escaped = latin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    processed = processed.replace(regex, hangul);
  }

  // 2. 인용 부호("...", “...”, '...', ‘...’)로 감싸진 라틴어 인용문 탐지 및 전면 변환
  // 콜론(:), 쉼표, 대시 등 어떤 구두점이 포함되어 있어도 인용구 내부 전체를 포착
  processed = processed.replace(
    /(["“'‘])([^"”'’]+)(["”'’])/g,
    (fullMatch, openQuote, quoteContent: string, closeQuote) => {
      // 이미 완성형 한글이 포함되어 있으면 한국어 대화문이므로 변환 제외
      if (/[가-힣]/.test(quoteContent)) {
        return fullMatch;
      }

      // 영문 알파벳이 전혀 없는 경우 변환 제외
      if (!/[a-zA-ZæœÆŒ]/.test(quoteContent)) {
        return fullMatch;
      }

      // 공백 및 구두점 보존하며 단어 단위로 음역
      const transliterated = quoteContent.replace(
        /[a-zA-ZæœÆŒ]+/g,
        (match) => transliterateLatinWord(match)
      );

      return `${openQuote}${transliterated}${closeQuote}`;
    }
  );

  // 3. 인용구 밖이라도 쉼표, 콜론 등으로 연결된 2개 이상의 연속된 라틴어 단어열 탐지 및 변환
  // 예: regale sacerdotium, gens sancta, populus acquisitionis:
  processed = processed.replace(
    /\b([a-zA-ZæœÆŒ]{2,}(?:[\s,;:–—\-]+[a-zA-ZæœÆŒ]{2,})+)\b/g,
    (match: string) => {
      // 일반 시스템 약어/대문자 코드(예: "DLC UI MOD") 등은 제외
      if (/^[A-Z\s,;:–—\-]+$/.test(match)) {
        return match;
      }

      return match.replace(
        /[a-zA-ZæœÆŒ]+/g,
        (w) => transliterateLatinWord(w)
      );
    }
  );

  return processed;
};
