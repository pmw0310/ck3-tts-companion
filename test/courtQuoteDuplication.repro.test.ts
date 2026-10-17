import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  extractCk3EventsFromChunk,
  deduplicateRepeatedContent,
  normalizeMultilineUnknownEffects
} from '@/main/textSanitizer';

/**
 * 인게임 궁정 및 캐릭터 이벤트에서 대사 내 큰따옴표(")가 포함된 경우 발생하는
 * 1) 단어 누락 및 2) 동일 문장 2회 반복 결함 방어 회귀 테스트
 */

const SAMPLE_REAL_ERROR_LOG = `[09:25:54][E][pdx_persistent_reader.cpp:216]: Error: "Unknown effect: 다, near line: 1
Unknown effect: ,, near line: 1
Unknown effect:  나의 사돈 형제인  ONCLICK:CHARACTER,16916630  TOOLTIP:CHARACTER,16916630  L 백작 헤리베르트 ! ! !(이)가 내 앞에서 허리를 숙였다.

, near line: 3
Unknown effect: 달, near line: 3
Unknown effect: 명령하신, near line: 3
Unknown effect: 전수, near line: 3
Unknown effect: 완료했습니다., near line: 3
Unknown effect: 이, near line: 3
Unknown effect: 소유권과, near line: 3
Unknown effect: 가치가, near line: 3
Unknown effect: 기록되어, near line: 3
Unknown effect: 실정과, near line: 3
Unknown effect: 하자가, near line: 3
Unknown effect: 게, near line: 3
Unknown effect: 이상, near line: 3
Unknown effect: 훨씬, near line: 3
Unknown effect: 봉역에서, near line: 3
Unknown effect: 징수하실, near line: 3
Unknown effect: 있을, near line: 3
Unknown effect: !, near line: 3" in file: "effect console command" near line: 3
[09:25:54][E][jomini_effect.cpp:1154]: Flag 'DI_subtype_throne' is set but is never used. Note that use in localization doesn't count due to technical limitations. Use in unused scripted triggers and effects also does not count
[09:25:54][E][pdx_persistent_reader.cpp:216]: Error: "Unknown effect: 다, near line: 1
Unknown effect: ,, near line: 1
Unknown effect:  나의 사돈 형제인  ONCLICK:CHARACTER,16916630  TOOLTIP:CHARACTER,16916630  L 백작 헤리베르트 ! ! !(이)가 내 앞에서 허리를 숙였다.

, near line: 3
Unknown effect: 달, near line: 3
Unknown effect: 명령하신, near line: 3
Unknown effect: 전수, near line: 3
Unknown effect: 완료했습니다., near line: 3
Unknown effect: 이, near line: 3
Unknown effect: 소유권과, near line: 3
Unknown effect: 가치가, near line: 3
Unknown effect: 기록되어, near line: 3
Unknown effect: 실정과, near line: 3
Unknown effect: 하자가, near line: 3
Unknown effect: 게, near line: 3
Unknown effect: 이상, near line: 3
Unknown effect: 훨씬, near line: 3
Unknown effect: 봉역에서, near line: 3
Unknown effect: 징수하실, near line: 3
Unknown effect: 있을, near line: 3
Unknown effect: !, near line: 3" in file: "effect console command" near line: 3`;

describe('궁정 대사 큰따옴표 절단 및 2회 중복 낭독 결함 회귀 검증', () => {
  it('자체 반복 문장 압축 함수(deduplicateRepeatedContent)가 연속 중복을 정확히 1회로 정제해야 한다', () => {
    const repeatedExact =
      '다 나의 사돈 형제인 백작 헤리베르트가 내 앞에서 허리를 숙였다다 나의 사돈 형제인 백작 헤리베르트가 내 앞에서 허리를 숙였다';
    const dedupedExact = deduplicateRepeatedContent(repeatedExact);
    assert.strictEqual(dedupedExact, '다 나의 사돈 형제인 백작 헤리베르트가 내 앞에서 허리를 숙였다');

    const repeatedWithSpace =
      '백작 헤리베르트가 내 앞에서 허리를 숙였다 백작 헤리베르트가 내 앞에서 허리를 숙였다';
    const dedupedWithSpace = deduplicateRepeatedContent(repeatedWithSpace);
    assert.strictEqual(dedupedWithSpace, '백작 헤리베르트가 내 앞에서 허리를 숙였다');
  });

  it('동일 시각에 2회 유입된 연속 Unknown effect 에러 블록이 단일 문장으로 합쳐지지 않고 1회만 복원되어야 한다', () => {
    const debugChunkHeader = `[09:25:54][I][jomini_effect_impl.cpp:450]: file: effect console command line: 1: ##CK3_TTS## 진실의 날: 조사 완료|||`;

    const normalizedErrorBuffer = normalizeMultilineUnknownEffects(SAMPLE_REAL_ERROR_LOG);
    const cleanErrorLines = normalizedErrorBuffer
      .split(/\r?\n/)
      .filter(
        (line) =>
          line.includes('Unknown effect:') ||
          line.includes('##CK3_TTS_END##') ||
          line.includes('[CK3_TTS_END]') ||
          line.includes('|||') ||
          line.includes('[E][') ||
          line.includes('Error:')
      )
      .join('\n');

    const stitched = `${debugChunkHeader}\n${cleanErrorLines}`;
    const events = extractCk3EventsFromChunk(stitched);

    assert.strictEqual(events.length, 1, '중복 에러 블록은 1건의 이벤트로 디듀플리케이션되어야 함');
    assert.strictEqual(events[0]?.title, '진실의 날: 조사 완료');

    const content = events[0]?.content ?? '';
    // "있을다 나의 사돈" 처럼 두 문장이 이어붙은 중복 패턴이 절대 없어야 함
    assert.ok(!content.includes('있을다 나의 사돈'), `중복 결합 감지: ${content}`);
    assert.ok(!content.includes('있을 다 나의 사돈'), `중복 결합 감지: ${content}`);

    // 특정 구문이 본문 내에 정확히 1번만 출현해야 함
    const occurrences = content.split('허리를 숙였다').length - 1;
    assert.strictEqual(occurrences, 1, `동일 문장 출현 횟수(${occurrences})는 정확히 1회여야 함`);
  });

  it('debug.log 세그먼트가 온전히 존재할 때는 원문 전체(큰따옴표 포함 대사)가 100% 완벽 복원되어야 한다', () => {
    const fullDebugChunk = `[09:25:54][D][console.cpp:1164]: Running console command: effect info_log = "##CK3_TTS## 진실의 날: 조사 완료|||"다 끝났습니다, 전하." 나의 사돈 형제인  ONCLICK:CHARACTER,16916630  TOOLTIP:CHARACTER,16916630  L 백작 헤리베르트 ! ! !(이)가 내 앞에서 허리를 숙였다.

"몇 달 전 명령하신 영지 전수 조사를 완료했습니다. 바로 이 책에 소유권과 토지 가치가 소상하게 기록되어 있지요. 실정과 어긋나는 하자가 있는 게 아닌 이상, 훨씬 효율적으로 봉역에서 조세를 징수하실 수 있을 겁니다!"|||GENDER:M##CK3_TTS_END##"
[09:25:54][I][jomini_effect_impl.cpp:450]: file: effect console command line: 1: ##CK3_TTS## 진실의 날: 조사 완료|||`;

    const events = extractCk3EventsFromChunk(fullDebugChunk);
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0]?.title, '진실의 날: 조사 완료');

    const content = events[0]?.content ?? '';
    assert.ok(content.includes('다 끝났습니다, 전하.'), '앞부분 큰따옴표 대사 보존');
    assert.ok(content.includes('영지 전수 조사를 완료했습니다.'), '뒷부분 큰따옴표 대사 보존');
    assert.ok(content.includes('조세를 징수하실 수 있을 겁니다!'), '종결 대사 보존');
  });
});
