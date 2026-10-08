import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { extractCk3EventsFromChunk, isValidNarrativeText } from '@/main/textSanitizer';

/**
 * 장시간 플레이 시 CK3 엔진이 [D](Debug) 레벨 로그 기록을 중단하는 결함에 대한 재현 테스트
 * - 실측: 게임 시작 약 1시간 25분(debug.log 약 21MB) 이후 모든 [D] 라인이 사라지고 [I]/[W]/[E]만 기록됨
 * - debug_log 이펙트는 [D] 레벨이므로 TTS 명령이 전면 침묵하고, error.log의 따옴표 파편만 복원되어 엉뚱한 단어가 낭독됨
 * - 해결: TTS 전송 채널을 [I] 레벨인 info_log 이펙트로 전환
 */

const MOD_ROOT = path.resolve(__dirname, '../ck3-mod');

const collectModFiles = (dir: string): string[] => {
  let results: string[] = [];
  for (const entry of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    if (fs.statSync(fullPath).isDirectory()) {
      results = results.concat(collectModFiles(fullPath));
    } else if (entry.endsWith('.gui') || entry.endsWith('.txt')) {
      results.push(fullPath);
    }
  }
  return results;
};

describe('[D] 레벨 로그 중단(장시간 플레이) 대응: info_log 채널 전환 검증', () => {
  it('모드 파일 어디에서도 TTS/처형 신호를 debug_log(=[D] 레벨)로 전송하지 않아야 한다', () => {
    const violations: string[] = [];
    for (const filePath of collectModFiles(MOD_ROOT)) {
      const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
      lines.forEach((line, index) => {
        // debug_log_scopes 등 다른 이펙트는 제외하고 정확히 debug_log = 형태만 검사
        if (/\bdebug_log\s*=/.test(line) && /CK3_(?:TTS|EXECUTION)/.test(line)) {
          violations.push(`${path.relative(MOD_ROOT, filePath)}:${index + 1}`);
        }
      });
    }
    assert.deepStrictEqual(violations, [], `debug_log 잔존 위치: ${violations.join(', ')}`);
  });

  it('info_log 기반 [I] 레벨 로그 라인에서도 이벤트가 정상 추출되어야 한다', () => {
    const chunk =
      '[04:50:00][I][jomini_effect_impl.cpp:450]: file: effect console command line: 1: ##CK3_TTS## 일대일 대결: 승리!|||노련한 전사로서 승리를 확신했다.|||GENDER:M##CK3_TTS_END##\n';
    const events = extractCk3EventsFromChunk(chunk);
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0]?.title, '일대일 대결: 승리!');
    assert.ok(events[0]?.content.includes('노련한 전사로서'));
  });

  it('info_log 콘솔 명령 원문(스크립트 잔여물)은 낭독 대상에서 차단되어야 한다', () => {
    assert.strictEqual(isValidNarrativeText('effect info_log = "##CK3_TTS_STOP##"'), false);
  });
});
