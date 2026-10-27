/**
 * @file Clausewitz 엔진 100,000 [E] 로그 쿼터 고갈 및 미완성 TTS 태그 절단에 의한 처형 효과음 누락 재현 테스트
 * @description
 * 1) 바닐라/타 모드의 스크립트 에러 폭주로 error.log가 100,000줄 상한에 도달해 [E](error_log) 기록이 영구 중단되더라도,
 *    [I](info_log) 이중 채널 및 game.log 감시를 통해 처형 효과음이 정상 재생되는지 검증합니다.
 * 2) logWatcher에서 닫히지 않은 ##CK3_TTS 태그가 존재할 때 뒤따르는 ##CK3_EXECUTION## 태그가
 *    pendingBuffers 절단(slice)에 삼켜지지 않고 즉시 방출되는지 검증합니다.
 * 3) Windows NTFS 열린 파일 핸들 실시간 크기 조회(getLiveFileSize) 및 클립보드 채널을 통한 ##CK3_EXECUTION## 수신을 검증합니다.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  startWatchingLogFile,
  extractExecutionSoundsFromChunk,
  getLiveFileSize,
  type ClipboardBridge
} from '@/main/logWatcher';
import type { ExecutionSoundEvent } from '@/shared/types';

/**
 * 지정된 시간(ms)만큼 대기합니다.
 * @param ms - 대기 시간 (밀리초)
 * @returns 대기 완료 Promise
 */
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('처형 효과음 누락 결함 재현 (100,000 [E] 쿼터 고갈 & pendingBuffers 삼킴 & NTFS 열린 핸들)', () => {
  const modFile = path.resolve(
    process.cwd(),
    'ck3-mod/common/scripted_effects/zz_tts_companion_prison_effects.txt'
  );

  it('1. [스크립트 이중 채널 & 식량 도축 분기] zz_tts_companion_prison_effects.txt는 [E] 100,000건 쿼터 차단에 대비해 info_log(14개)와 error_log(14개)를 모두 방출하고 execution_provisions 분기를 포함해야 한다', () => {
    const content = fs.readFileSync(modFile, 'utf8');

    const infoExecMatches = content.match(/info_log\s*=\s*"##CK3_EXECUTION##[^"]+"/g) ?? [];
    const errorExecMatches = content.match(/error_log\s*=\s*"##CK3_EXECUTION##[^"]+"/g) ?? [];

    assert.strictEqual(
      infoExecMatches.length,
      14,
      'error.log 100,000건 쿼터 소진 시에도 동작하도록 info_log 처형 훅 14개가 모두 존재해야 합니다.'
    );
    assert.strictEqual(
      errorExecMatches.length,
      14,
      '비디버그 모드에서 동작하도록 error_log 처형 훅 14개가 모두 존재해야 합니다.'
    );
    assert.strictEqual(
      extractExecutionSoundsFromChunk(infoExecMatches.join('\n')).length,
      14,
      '모든 info_log 처형 훅이 유효한 처형 사운드 태그여야 합니다.'
    );
    assert.ok(
      content.includes('scope:execution_provisions'),
      '육지 없는 모험가의 식량 확보 처형(scope:execution_provisions) 옵션도 처형 효과음을 방출해야 합니다.'
    );
  });

  it('2. [pendingBuffers 삼킴 방어 & game.log 폴백 & 클립보드/열린 핸들] 닫히지 않은 ##CK3_TTS 파편이 앞선 상태에서도 ##CK3_EXECUTION## 태그가 삼켜지지 않고 즉시 감지되며, game.log [I] 및 클립보드 채널에서도 감지되어야 한다', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ck3-exec-cutoff-'));
    const debugLogPath = path.join(tmpDir, 'debug.log');
    const errorLogPath = path.join(tmpDir, 'error.log');
    const gameLogPath = path.join(tmpDir, 'game.log');

    fs.writeFileSync(debugLogPath, '', 'utf8');
    fs.writeFileSync(errorLogPath, '', 'utf8');
    fs.writeFileSync(gameLogPath, '', 'utf8');

    let currentClip = '기존 클립보드 텍스트';
    const mockClipboardBridge: ClipboardBridge<string> = {
      readText: () => currentClip,
      readSignature: () => `text:${currentClip}`,
      takeSnapshot: () => currentClip,
      restoreSnapshot: (snap) => {
        currentClip = snap ?? '';
      }
    };

    const receivedSounds: ExecutionSoundEvent[] = [];

    const watcher = startWatchingLogFile(
      debugLogPath,
      () => {},
      undefined,
      () => {},
      (sound) => {
        receivedSounds.push(sound);
      },
      mockClipboardBridge,
      50
    );

    try {
      await wait(120);

      // (A) error.log에 닫히지 않은 ##CK3_TTS 파편이 먼저 기록된 후 처형 태그가 들어온 경우
      fs.appendFileSync(
        errorLogPath,
        `[10:42:20][E][jomini_script_system.cpp:304]: Unknown effect: ##CK3_TTS## TITLE:미완성 제목|||DESC:큰따옴표로 잘린 본문\n` +
          `[10:42:21][E][jomini_effect_impl.cpp:450]: ##CK3_EXECUTION## beheaded|||GENDER:F##\n`,
        'utf8'
      );
      await wait(320);

      assert.strictEqual(
        receivedSounds.length,
        1,
        '앞선 미완성 ##CK3_TTS 태그 때문에 뒤따르는 ##CK3_EXECUTION## 태그가 slice로 잘려 누락되어서는 안 됩니다.'
      );
      assert.strictEqual(receivedSounds[0]?.type, 'beheading');
      assert.strictEqual(receivedSounds[0]?.gender, 'female');

      // (B) ck3.exe처럼 파일 핸들을 닫지 않고(open 'a') 쓰기만 수행한 상태에서도 getLiveFileSize 및 watcher가 즉시 감지해야 함
      const openWriteFd = fs.openSync(gameLogPath, 'a');
      try {
        const lineBuf = Buffer.from(
          `[10:43:00][I][jomini_effect_impl.cpp:436]: ##CK3_EXECUTION## burned|||GENDER:M##\n`,
          'utf8'
        );
        fs.writeSync(openWriteFd, lineBuf);
        assert.strictEqual(
          getLiveFileSize(gameLogPath),
          lineBuf.length,
          '열린 쓰기 핸들이 유지된 상태에서도 getLiveFileSize는 실시간 바이트 크기를 반환해야 합니다.'
        );
        await wait(650);
      } finally {
        fs.closeSync(openWriteFd);
      }

      assert.strictEqual(
        receivedSounds.length,
        2,
        'error.log 쿼터 고갈 및 열린 파일 핸들 환경에서 game.log의 [I] info_log 채널을 통해 처형 효과음이 감지되어야 합니다.'
      );
      assert.strictEqual(receivedSounds[1]?.type, 'burning');
      assert.strictEqual(receivedSounds[1]?.gender, 'male');

      // (C) 정상 상태에서 info_log(debug.log + game.log)와 error_log(error.log)에 동시에 기록되더라도 5초 디바운스로 1회만 재생되어야 함
      fs.appendFileSync(
        debugLogPath,
        `[10:44:00][I][jomini_effect_impl.cpp:436]: ##CK3_EXECUTION## hanged|||GENDER:M##\n`,
        'utf8'
      );
      fs.appendFileSync(
        gameLogPath,
        `[10:44:00][I][jomini_effect_impl.cpp:436]: ##CK3_EXECUTION## hanged|||GENDER:M##\n`,
        'utf8'
      );
      fs.appendFileSync(
        errorLogPath,
        `[10:44:00][E][jomini_effect_impl.cpp:450]: ##CK3_EXECUTION## hanged|||GENDER:M##\n`,
        'utf8'
      );
      await wait(320);

      assert.strictEqual(
        receivedSounds.length,
        3,
        'debug.log, game.log, error.log 3개 파일에 동시 기록되더라도 처형 효과음은 정확히 1회만 호출되어야 합니다.'
      );
      assert.strictEqual(receivedSounds[2]?.type, 'hanging');

      // (D) 클립보드 채널을 통해 ##CK3_EXECUTION## 페이로드가 유입된 경우에도 즉시 감지하고 사용자 클립보드를 복구해야 함
      currentClip = '##CK3_EXECUTION## devoured|||GENDER:F##';
      await wait(150);

      assert.strictEqual(
        receivedSounds.length,
        4,
        '클립보드 채널로 유입된 ##CK3_EXECUTION## 페이로드도 즉시 감지되어야 합니다.'
      );
      assert.strictEqual(receivedSounds[3]?.type, 'devour');
      assert.strictEqual(receivedSounds[3]?.gender, 'female');
      assert.strictEqual(currentClip, '기존 클립보드 텍스트', '처형 페이로드 소비 후 사용자 클립보드가 복구되어야 합니다.');

      // (E) [연속 화형 5초 쿨다운 삼킴 방어: 12:02:05 -> 12:02:10 실전 재현]
      // 5초 이내에 동일 성별 화형([12:02:05] -> [12:02:10])을 연속 집행했을 때,
      // 인게임 로그 시각([HH:MM:SS])이 다르면 5초 쿨다운에 삼켜지지 않고 2회 모두 재생되어야 함
      fs.appendFileSync(
        debugLogPath,
        `[12:02:05][I][jomini_effect_impl.cpp:450]: ##CK3_EXECUTION## burned|||GENDER:M##\n` +
          `[12:02:05][E][jomini_effect_impl.cpp:450]: ##CK3_EXECUTION## burned|||GENDER:M##\n`,
        'utf8'
      );
      fs.appendFileSync(
        errorLogPath,
        `[12:02:05][E][jomini_effect_impl.cpp:450]: ##CK3_EXECUTION## burned|||GENDER:M##\n`,
        'utf8'
      );
      await wait(520);

      assert.strictEqual(
        receivedSounds.length,
        5,
        '12:02:05 1차 화형 시 다중 파일/이중 채널 기록은 1회로 병합 재생되어야 합니다.'
      );

      // 520ms 후(5초 이내) 12:02:10 2차 남성 화형 집행
      fs.appendFileSync(
        debugLogPath,
        `[12:02:10][I][jomini_effect_impl.cpp:450]: ##CK3_EXECUTION## burned|||GENDER:M##\n` +
          `[12:02:10][E][jomini_effect_impl.cpp:450]: ##CK3_EXECUTION## burned|||GENDER:M##\n`,
        'utf8'
      );
      fs.appendFileSync(
        errorLogPath,
        `[12:02:10][E][jomini_effect_impl.cpp:450]: ##CK3_EXECUTION## burned|||GENDER:M##\n`,
        'utf8'
      );
      await wait(320);

      assert.strictEqual(
        receivedSounds.length,
        6,
        '5초 이내(12:02:05 -> 12:02:10) 연속 동일 성별 화형 집행 시 2차 화형 사운드가 5초 쿨다운에 삼켜지지 않고 즉시 재생되어야 합니다.'
      );
      assert.strictEqual(receivedSounds[5]?.type, 'burning');
      assert.strictEqual(receivedSounds[5]?.gender, 'male');
      assert.strictEqual(receivedSounds[5]?.logTimestamp, '12:02:10');
    } finally {
      await watcher.stop();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
