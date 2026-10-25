import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 전설 연대기 창(window_legend_chronicle.gui) 수동 낭독(스피커 버튼/F 단축키) 다이렉트 발화 및 안내 라벨 무결성 검증
 * 
 * 결함 배경:
 * 1. window_legend_chronicle.gui의 자동 재생 상태 머신(tts_legend_auto_play)은 on_start에서 tts_last_legend_name을
 *    즉시 세팅하여 trigger_when 조건이 false가 됨에 따라 state가 조기 중단(Abort)되어 tts_legend_console_play로 전이되지 못하고 침묵함.
 * 2. 수동 스피커 버튼(tts_speak_button)은 챕터 1~4가 없는 전설에서도 하드코딩된 (int32)1 ~ (int32)4 인덱스를 무조건 호출하고,
 *    다중 중첩 Select_CString을 사용하여 Jomini CDataSystem이 표현식 평가를 조기 폐기(Drop)함에 따라 CloseGameView가 아예 실행되지 않음.
 * 
 * 해결 요구사항:
 * 1. 왕실 궁정(window_court_events.gui) 및 튜토리얼(window_tutorial.gui)과 동일하게, 불안정한 자동 재생을 배제하고
 *    사용자가 원할 때 들을 수 있는 수동 전용 정책으로 통일함.
 * 2. 상단 헤더에 "음성 듣기 (단축키: F)" 안내 라벨(tts_speak_label)을 명시하여 직관적인 UX를 제공함.
 * 3. 스피커 버튼 및 F 단축키는 out-of-bounds 위험이 없는 100% 안전한 속성(Legend.GetNameNoTooltip 및 Legend.GetChapterDescriptionByIndex( '(int32)0' ))으로
 *    onclick에서 직접 CloseGameView('##CK3_TTS_FORCE## ...')를 0ms 즉시 호출해야 함.
 */

const GUI_PATH = path.resolve(__dirname, '../ck3-mod/gui/window_legend_chronicle.gui');

describe('전설 연대기 창 수동 낭독(스피커 버튼/F 단축키) 다이렉트 발화 및 무결성 검증', () => {
  const content = fs.readFileSync(GUI_PATH, 'utf-8');

  it('1. 불안정하고 조기 Abort를 유발하는 자동 재생 상태 머신(tts_legend_auto_play, tts_legend_console_play)은 배제되어야 한다', () => {
    assert.strictEqual(
      content.includes('name = tts_legend_auto_play'),
      false,
      '불안정한 자동 재생 상태 머신(tts_legend_auto_play)은 배제되어야 합니다.'
    );
    assert.strictEqual(
      content.includes('name = tts_legend_console_play'),
      false,
      '자동 콘솔 발화 상태 머신(tts_legend_console_play)은 배제되어야 합니다.'
    );
  });

  it('2. 헤더에 "음성 듣기 (단축키: F)" 안내 라벨(tts_speak_label)이 배치되어 있어야 한다', () => {
    const labelMatch = content.match(
      /text_single\s*=\s*\{[\s\S]*?name\s*=\s*"tts_speak_label"[\s\S]*?raw_text\s*=\s*"음성 듣기 \(단축키: F\)"[\s\S]*?\}/
    );
    assert.ok(
      labelMatch,
      '헤더에 "음성 듣기 (단축키: F)" 안내 라벨(tts_speak_label)이 존재해야 합니다.'
    );
  });

  it('3. 스피커 버튼(tts_speak_button)은 위험한 다중 챕터 인덱스/중첩 삼항 연산자 없이 안전한 0ms 다이렉트 CloseGameView를 호출해야 한다', () => {
    const speakIndex = content.indexOf('name = "tts_speak_button"');
    assert.ok(speakIndex !== -1, 'tts_speak_button이 존재해야 합니다.');
    const speakBlock = content.slice(speakIndex, speakIndex + 600);

    // army_split_half (F) 단축키 확인
    assert.match(
      speakBlock,
      /shortcut\s*=\s*"army_split_half"/,
      'F 단축키(army_split_half)가 바인딩되어 있어야 합니다.'
    );

    // out-of-bounds 인덱스((int32)1 ~ (int32)4)가 없어야 함
    assert.strictEqual(
      speakBlock.includes("'(int32)1'"),
      false,
      '유효하지 않은 챕터에서 Abort를 유발하는 (int32)1 호출이 없어야 합니다.'
    );
    assert.strictEqual(
      speakBlock.includes("'(int32)4'"),
      false,
      '(int32)4 호출이 없어야 합니다.'
    );

    // 다이렉트 CloseGameView 바인딩 확인
    assert.match(
      speakBlock,
      /onclick\s*=\s*"\[CloseGameView\(Concatenate\('##CK3_TTS_FORCE## ', Concatenate\(Legend\.GetNameNoTooltip, Concatenate\('\|\|\|', Concatenate\(Legend\.GetChapterDescriptionByIndex\(\s*'\s*\(int32\)0\s*'\s*\),\s*'##CK3_TTS_END##'\)\)\)\)\)\]"/,
      '스피커 버튼에 안전한 다이렉트 CloseGameView가 바인딩되어야 합니다.'
    );
  });

  it('4. 닫기 버튼 및 서고 제거 버튼에 CloseGameView(##CK3_TTS_STOP##) 정지 신호가 유지되어야 한다', () => {
    const stopMatches = content.match(/CloseGameView\('##CK3_TTS_STOP##'\)/g) ?? [];
    assert.ok(
      stopMatches.length >= 2,
      '닫기 버튼과 서고 제거 버튼에 최소 2곳 이상 STOP 신호가 바인딩되어 있어야 합니다.'
    );
  });
});

