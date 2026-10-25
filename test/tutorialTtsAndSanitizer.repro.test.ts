import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startWatchingLogFile } from '@/main/logWatcher';
import { extractCk3EventsFromChunk, sanitizeCk3Text } from '@/main/textSanitizer';
import { shouldPlayEvent } from '@/shared/eventDeduplicator';
import type { Ck3EventMessage } from '@/shared/types';

/**
 * 지정된 밀리초만큼 비동기 대기합니다.
 * @param ms - 대기 시간 (밀리초)
 * @returns 대기 완료 Promise
 */
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 튜토리얼 창(window_tutorial.gui) 자동 TTS 미작동 및 TUT 서식 마커/조사 공백 노출 결함 재현 테스트
 * - 결함 1: window_tutorial.gui의 _hide, tutorial_step_tts_trigger, tutorial_tts_deferred_auto, tutorial_tts_deferred_force
 *   state들이 루트 tutorial_window에 배치되어 C++ 위치 이동 애니메이션(center, top_right 등)과 경합해 취소(Abort)되고,
 *   단일 state 내 다중 on_start / on_finish 중복 선언으로 인해 변수 초기화(Clear) 및 갱신(Set)이 덮어써져 자동 TTS가 침묵함.
 * - 결함 2: 튜토리얼 본문의 #TUT 서식 마커가 콘솔 직렬화 시 "TUT"로 출력되어 본문 중간에 노출되고,
 *   게임 개념 태그 닫기 마커(" ! !이", " ! !들이나", " ! !하는") 제거 시 강제 공백이 삽입되어 "파벌 이", "봉신 들이나", "살해 하는"으로 분리됨.
 * - 결함 3: 튜토리얼에서 "다음" 버튼을 눌러 1/2 페이지(321자)에서 2/2 페이지(170자)로 넘어갈 때,
 *   두 스텝의 제목("파벌로부터 한 몸 건사하기")이 동일하고 2/2 페이지 본문이 1/2 페이지보다 짧다는 이유로
 *   textSanitizer 및 logWatcher의 recentTitleCache가 2/2 페이지를 '잘린 하위 파편'으로 오인하여 통째로 차단함.
 */
describe('튜토리얼 자동 TTS 상태 머신 무결성 및 TUT 마커·조사 공백 정제 검증', () => {
  const tutorialGuiPath = path.resolve(process.cwd(), 'ck3-mod/gui/window_tutorial.gui');

  it('1. window_tutorial.gui의 모든 state 블록은 단일 on_start 및 단일 on_finish 규칙(덮어쓰기 방지)을 준수해야 한다', () => {
    const content = fs.readFileSync(tutorialGuiPath, 'utf-8');
    const stateBlocks = content.match(/state\s*=\s*\{[^}]*\}/g) ?? [];
    assert.ok(stateBlocks.length > 0, 'state 블록이 존재해야 합니다.');

    const violations: string[] = [];
    for (const block of stateBlocks) {
      const nameMatch = block.match(/name\s*=\s*([^\s\n]+)/);
      const stateName = nameMatch?.[1] ?? 'unnamed';
      const onStartCount = (block.match(/\bon_start\s*=/g) ?? []).length;
      const onFinishCount = (block.match(/\bon_finish\s*=/g) ?? []).length;

      if (onStartCount > 1) {
        violations.push(`${stateName}: on_start가 ${onStartCount}회 중복 선언됨`);
      }
      if (onFinishCount > 1) {
        violations.push(`${stateName}: on_finish가 ${onFinishCount}회 중복 선언됨`);
      }
    }

    assert.deepStrictEqual(
      violations,
      [],
      `단일 state 내 중복 on_start/on_finish 선언이 없어야 합니다: ${violations.join(', ')}`
    );
  });

  it('2. 튜토리얼 수동 낭독은 C++ 위치 애니메이션 선점 및 상태 취소를 방지하기 위해 지연 트래커 없이 버튼 onclick에서 직접 발화되어야 한다', () => {
    const content = fs.readFileSync(tutorialGuiPath, 'utf-8');

    // 불안정한 지연 force 트래커가 배제되었는지 확인
    assert.strictEqual(
      content.includes('name = "tts_tutorial_deferred_force_tracker"'),
      false,
      'tts_tutorial_deferred_force_tracker는 제거되어야 합니다.'
    );

    // 스피커 버튼과 F 단축키가 다이렉트로 CloseGameView를 호출하는지 확인
    assert.ok(
      content.includes("onclick = \"[CloseGameView(Concatenate('##CK3_TTS_FORCE## '"),
      '스피커 버튼 및 단축키에 다이렉트 CloseGameView가 바인딩되어 있어야 합니다.'
    );
  });

  it('3. "파벌로부터 한 몸 건사하기" 튜토리얼 로그에서 TUT 마커가 완벽히 제거되고 개념 링크 뒤 조사/어미("파벌이", "봉신들이나", "공포의 대상이", "살해하는")가 공백 없이 결합되어야 한다', () => {
    const rawTutorialChunk = [
      '[16:33:39][I][jomini_effect_impl.cpp:450]: file: effect console command line: 7: ##CK3_TTS## 파벌로부터 한 몸 건사하기|||여러분에 맞서는  E;  TOOLTIP:GAME_CONCEPT,faction 파벌 ! !이 결성됐습니다. 하지만 당황하지 마십시오. 아직 바로잡을 시간은 충분하니까요!',
      '',
      '대개 여러분의 통치에 불만족한  E;  TOOLTIP:GAME_CONCEPT,vassals 봉신 ! !들이나  E;  TOOLTIP:GAME_CONCEPT,counties 영지 ! !가 파벌에 가담하곤 합니다. 이럴 때는 여러분을 향한  E;  TOOLTIP:GAME_CONCEPT,opinion 의견 ! !을 높이거나,  E;  TOOLTIP:GAME_CONCEPT,dreaded 공포의 대상 ! !이 되어 대처할 수 있습니다.',
      '',
      ' TUT 파벌의 결성을 막기 위해선, 여러분을 향한 봉신들의  E;  TOOLTIP:GAME_CONCEPT,opinion 의견 ! !을 개선하거나 정복 사업의 완급을 조절해야 합니다. 또 여러분보다 인기있는  E;  TOOLTIP:GAME_CONCEPT,claimants 주장자 ! !를  TOOLTIP:SCHEME_TYPE,murder  L; 살해 ! !하는 방법도 있죠.',
      '',
      '대개 파벌이 요구를 관철하기 전까지 시간이 주어지고, 그동안 봉신들을 달랠 수 있기 마련입니다. 그 순간을 현명하게 활용하십시오. !##CK3_TTS_END##'
    ].join('\n');

    const events = extractCk3EventsFromChunk(rawTutorialChunk);
    assert.strictEqual(events.length, 1, '튜토리얼 이벤트 1건이 정상 추출되어야 합니다.');
    assert.strictEqual(events[0]?.title, '파벌로부터 한 몸 건사하기');

    const content = events[0]?.content ?? '';
    assert.ok(!/\bTUT\b/i.test(content), `본문에 "TUT" 마커가 남아있지 않아야 합니다. 현재 본문: "${content}"`);
    assert.ok(content.includes('맞서는 파벌이 결성됐습니다.'), `"파벌 이"가 아닌 "파벌이"로 정제되어야 합니다. 현재 본문: "${content}"`);
    assert.ok(content.includes('불만족한 봉신들이나 영지가'), `"봉신 들이나"가 아닌 "봉신들이나"로 정제되어야 합니다. 현재 본문: "${content}"`);
    assert.ok(content.includes('공포의 대상이 되어'), `"공포의 대상 이"가 아닌 "공포의 대상이"로 정제되어야 합니다. 현재 본문: "${content}"`);
    assert.ok(content.includes('주장자를 살해하는 방법도 있죠.'), `"살해 하는"이 아닌 "살해하는"으로 정제되어야 합니다. 현재 본문: "${content}"`);
    assert.ok(content.endsWith('그 순간을 현명하게 활용하십시오.'), `문장 끝의 서식 닫기 느낌표(" !")가 제거되어야 합니다. 현재 본문: "${content}"`);
  });

  it('4. 기존 게임 개념 서식 닫기 마커("성직 지역!! 안에", "수도!!가")의 공백 보존 및 조사 결합도 회귀 없이 유지되어야 한다', () => {
    const sample =
      '당신의 영토 일부가 \u0015e;  \u0015TOOLTIP:GAME_CONCEPT,clerical_region 성직 지역\u0015!\u0015! 안에 있습니다. 당신은 \u0015e;  \u0015TOOLTIP:GAME_CONCEPT,capital 수도\u0015!\u0015!가 위치한 성직 지역의 관할에 속합니다.';
    const sanitized = sanitizeCk3Text(sample);
    assert.strictEqual(
      sanitized,
      '당신의 영토 일부가 성직 지역 안에 있습니다. 당신은 수도가 위치한 성직 지역의 관할에 속합니다.'
    );
  });

  it('5. [다음 버튼 스텝 전환] 1/2 페이지(321자) 직후 "다음"을 눌러 동일 제목의 더 짧은 2/2 페이지(170자)로 넘어갔을 때 파편으로 오인되어 차단되지 않고 정상 방출되어야 한다', async () => {
    const step1Chunk = [
      '[17:01:11][I][jomini_effect_impl.cpp:450]: file: effect console command line: 7: ##CK3_TTS## 파벌로부터 한 몸 건사하기|||여러분에 맞서는  E;  TOOLTIP:GAME_CONCEPT,faction 파벌 ! !이 결성됐습니다. 하지만 당황하지 마십시오. 아직 바로잡을 시간은 충분하니까요!',
      '',
      '대개 여러분의 통치에 불만족한  E;  TOOLTIP:GAME_CONCEPT,vassals 봉신 ! !들이나  E;  TOOLTIP:GAME_CONCEPT,counties 영지 ! !가 파벌에 가담하곤 합니다. 이럴 때는 여러분을 향한  E;  TOOLTIP:GAME_CONCEPT,opinion 의견 ! !을 높이거나,  E;  TOOLTIP:GAME_CONCEPT,dreaded 공포의 대상 ! !이 되어 대처할 수 있습니다.',
      '',
      ' TUT 파벌의 결성을 막기 위해선, 여러분을 향한 봉신들의  E;  TOOLTIP:GAME_CONCEPT,opinion 의견 ! !을 개선하거나 정복 사업의 완급을 조절해야 합니다. 또 여러분보다 인기있는  E;  TOOLTIP:GAME_CONCEPT,claimants 주장자 ! !를  TOOLTIP:SCHEME_TYPE,murder  L; 살해 ! !하는 방법도 있죠.',
      '',
      '대개 파벌이 요구를 관철하기 전까지 시간이 주어지고, 그동안 봉신들을 달랠 수 있기 마련입니다. 그 순간을 현명하게 활용하십시오. !##CK3_TTS_END##'
    ].join('\n');

    const step2Chunk = [
      '[17:01:13][I][jomini_effect_impl.cpp:450]: file: effect console command line: 5: ##CK3_TTS## 파벌로부터 한 몸 건사하기||| E;  TOOLTIP:GAME_CONCEPT,county_opinion 민중 의견 ! !이 낮은 영지는  E;  TOOLTIP:GAME_CONCEPT,peasant_faction 농노 파벌 ! !에 합류하는 경향이 있습니다. 이러한 파벌은 다른 파벌과는 달리 승리할 가능성을 따지지 않고 봉기하고 말죠.',
      '',
      '때로는 농노들에게 자기 분수를 깨닫게 해줘야 할 때도 있습니다.',
      '',
      ' TUT 농노 파벌을 면밀히 주시하십시오. 전쟁 도중에 봉기가 일어났다간,  E;  TOOLTIP:GAME_CONCEPT,control 장악력 ! !에 심한 손상이 생겨날 것입니다. !##CK3_TTS_END##'
    ].join('\n');

    // 1) 단일 청크에 1/2와 2/2가 연속으로 들어온 경우에도 둘 다 추출되어야 함
    const combinedEvents = extractCk3EventsFromChunk(`${step1Chunk}\n${step2Chunk}`);
    assert.strictEqual(
      combinedEvents.length,
      2,
      `동일 제목이더라도 본문이 서로 다른 1/2 스텝과 2/2 스텝은 각각 추출되어야 합니다 (현재: ${combinedEvents.length}건)`
    );

    // 2) logWatcher를 통해 2초 간격으로 1/2 페이지(321자) -> 2/2 페이지(170자)가 유입될 때 둘 다 방출되어야 함
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ck3-tutorial-next-'));
    const debugLogPath = path.join(tmpDir, 'debug.log');
    fs.writeFileSync(debugLogPath, '', 'utf8');

    const receivedEvents: Ck3EventMessage[] = [];
    const watcher = startWatchingLogFile(debugLogPath, (ev) => receivedEvents.push(ev));

    try {
      await wait(100);
      fs.appendFileSync(debugLogPath, `${step1Chunk}\n`, 'utf8');
      await wait(450);
      assert.strictEqual(receivedEvents.length, 1, '1/2 스텝이 먼저 수신되어야 합니다.');

      fs.appendFileSync(debugLogPath, `${step2Chunk}\n`, 'utf8');
      await wait(450);
      assert.strictEqual(
        receivedEvents.length,
        2,
        '2초 뒤 "다음" 클릭으로 유입된 더 짧은 2/2 스텝도 파편으로 차단되지 않고 수신되어야 합니다.'
      );
      assert.ok(
        receivedEvents[1]?.content.includes('민중 의견이 낮은 영지는 농노 파벌에 합류하는 경향이 있습니다.'),
        `2/2 스텝 본문이 온전히 정제되어야 합니다: "${receivedEvents[1]?.content}"`
      );

      // 3) 렌더러 shouldPlayEvent에서도 1/2 재생 도중 2/2가 유입되면 즉시 재생 허용(true)되어야 함
      const firstEv = receivedEvents[0]!;
      const secondEv = receivedEvents[1]!;
      const canPlayStep2 = shouldPlayEvent(
        secondEv,
        {
          isPlaying: true,
          currentEvent: firstEv,
          lastAutoSpokenText: firstEv.content,
          lastAutoSpokenTime: Date.now() - 2000,
          lastStoppedText: '',
          lastStoppedTime: 0
        },
        Date.now()
      );
      assert.strictEqual(canPlayStep2, true, '1/2 낭독 중 "다음" 클릭으로 들어온 2/2 스텝은 즉시 재생되어야 합니다.');
    } finally {
      await watcher.stop();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

