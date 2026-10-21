import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractCk3EventsFromChunk, isValidNarrativeText } from '@/main/textSanitizer';

/**
 * Jomini 엔진 스크립트 시스템 에러(untyped trigger, Scoped object 등)
 * 로그 유출 및 가짜 이벤트 생성 결함 재현 테스트 (debug-harness)
 */
describe('Jomini 엔진 스크립트 에러(untyped trigger) 로그 유출 차단 검증', () => {
  // 실제 사용자가 제보한 에러 로그가 포함된 청크 시뮬레이션
  const realUserErrorChunk = `
[17:27:14][I][jomini_effect_impl.cpp:450]: file: effect console command line: 1: ##CK3_TTS## 발자취를 따라|||
[17:27:14][E][pdx_persistent_reader.cpp:216]: Error: "Unknown effect: ...사촌, near line: 1
Unknown effect: 그렇게, near line: 1
Unknown effect: 이야기꽃을, near line: 3
Unknown effect: 있었다.|||GENDER:F, near line: 3" in file: "effect console command" near line: 3
[17:27:14][E][jomini_script_system.cpp:304]: Script system error! (while building tooltip/description)
  Error: untyped trigger [ Scoped object of type 'character_memory' is not valid (  weak (Character_memory - 4294967295) !) ]
  Script location: file: events/dlc/bp2/bp2_yearly_2.txt line: 236 (bp2_yearly.2000:option)

[17:27:14][E][jomini_script_system.cpp:304]: Script system error! (while building tooltip/description)
  Error: untyped trigger [ Scoped object of type 'character_memory' is not valid (  weak (Character_memory - 4294967295) !) ]
  Script location: file: events/dlc/bp2/bp2_yearly_2.txt line: 210 (bp2_yearly.2000:option)
`;

  it('1. [결함 재현] isValidNarrativeText는 untyped trigger 및 Scoped object 에러 라인을 내러티브 텍스트로 인정하지 않아야 한다', () => {
    const errorLine1 = "untyped trigger [ Scoped object of type 'character_memory' is not valid ( (Character_memory - 4294967295) ) ]";
    const errorLine2 = "Script location: file: events/dlc/bp2/bp2_yearly_2.txt line: 236 (bp2_yearly.2000:option)";
    const combinedError = "untyped trigger [ Scoped object of type'character_memory'is not valid ( (Character_memory - 4294967295) ) ] Script location: file: events/dlc/bp2/bp2_yearly_2.txt line: 236";

    assert.strictEqual(isValidNarrativeText(errorLine1), false, 'untyped trigger 라인은 차단되어야 합니다.');
    assert.strictEqual(isValidNarrativeText(errorLine2), false, 'Script location 라인은 차단되어야 합니다.');
    assert.strictEqual(isValidNarrativeText(combinedError), false, '결합된 에러 문자열은 차단되어야 합니다.');
  });

  it('2. [결함 재현] extractCk3EventsFromChunk는 사용자 제보 로그 청크에서 untyped trigger 에러 텍스트를 본문으로 채택하지 않아야 한다', () => {
    const events = extractCk3EventsFromChunk(realUserErrorChunk);
    // 복원된 이벤트가 있다면 본문에 untyped trigger 또는 Script location이 포함되지 않아야 함
    for (const ev of events) {
      assert.strictEqual(
        ev.content.includes('untyped trigger'),
        false,
        '이벤트 본문에 untyped trigger 에러 텍스트가 포함되어서는 안 됩니다.'
      );
      assert.strictEqual(
        ev.content.includes('Script location:'),
        false,
        '이벤트 본문에 Script location 에러 텍스트가 포함되어서는 안 됩니다.'
      );
    }
  });

  it('3. [결함 재현] 본문 없이 untyped trigger 에러만 단독 유입된 청크는 가짜 이벤트를 생성하지 않아야 한다', () => {
    const standaloneErrorChunk = `
[17:27:14][I][jomini_effect_impl.cpp:450]: file: effect console command line: 1: ##CK3_TTS## 발자취를 따라|||
[17:27:14][E][jomini_script_system.cpp:304]: Script system error! (while building tooltip/description)
  Error: untyped trigger [ Scoped object of type 'character_memory' is not valid (  weak (Character_memory - 4294967295) !) ]
  Script location: file: events/dlc/bp2/bp2_yearly_2.txt line: 236 (bp2_yearly.2000:option)
`;
    const events = extractCk3EventsFromChunk(standaloneErrorChunk);
    assert.strictEqual(
      events.length,
      0,
      '에러 로그만 있고 유효한 서사 본문이 없는 경우 가짜 이벤트가 생성되지 않아야 합니다.'
    );
  });

  it('4. [정상 회귀 검증] 온전한 본문이 있는 일반 이벤트는 100% 정상 추출되어야 한다', () => {
    const validChunk = '[17:27:14][I][jomini_effect_impl.cpp:450]: file: effect console command line: 1: ##CK3_TTS## 발자취를 따라|||사촌, 그렇게 해서 가문이 탄생한 거란다.##CK3_TTS_END##';
    const events = extractCk3EventsFromChunk(validChunk);
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0]?.title, '발자취를 따라');
    assert.ok(events[0]?.content.includes('사촌'));
  });
});

