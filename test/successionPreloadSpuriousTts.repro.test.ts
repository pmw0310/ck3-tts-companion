import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('승계 창(window_succession_event) 게임 시작 시 오발화 결함 재현 테스트', () => {
  const modGuiDir = path.resolve(__dirname, '../ck3-mod/gui');

  it('window_succession_event.gui의 최상위 윈도우에 trigger_on_create = yes가 없어야 한다 (게임 시작 시 프리로드 오발화 방지)', () => {
    const successionGuiPath = path.join(modGuiDir, 'window_succession_event.gui');
    assert.strictEqual(fs.existsSync(successionGuiPath), true, 'window_succession_event.gui 파일이 존재해야 합니다.');

    const content = fs.readFileSync(successionGuiPath, 'utf8');

    // 최상위 윈도우 정의 구간 (1~40줄) 추출
    const topLines = content.split('\n').slice(0, 40).join('\n');

    // 결함 검증: 최상위 윈도우에 trigger_on_create = yes가 있으면 게임 시작 시 "당신은 퇴위했습니다."가 오발화됨
    const hasSpuriousTriggerOnCreate = /state\s*=\s*\{\s*name\s*=\s*tts_auto_play[\s\S]*?trigger_on_create\s*=\s*yes/m.test(topLines);
    
    assert.strictEqual(
      hasSpuriousTriggerOnCreate,
      false,
      'window_succession_event.gui 최상위 윈도우에 trigger_on_create = yes가 존재하면 게임 시작 시 "당신은 퇴위했습니다."가 상시 낭독되는 결함이 발생합니다. _show 상태의 on_start로 안전하게 격발해야 합니다.'
    );

    // 올바른 설계 검증: _show 상태에 ##CK3_TTS## 호출이 포함되어 있어야 함
    const hasShowStateWithTts = /state\s*=\s*\{\s*name\s*=\s*_show[\s\S]*?(?:\[|##)CK3_TTS(?:\]|##)/m.test(topLines);
    assert.strictEqual(
      hasShowStateWithTts,
      true,
      'window_succession_event.gui는 창이 실제로 열릴 때만 호출되는 _show state의 on_start에서 ##CK3_TTS##를 호출해야 합니다.'
    );
  });
});
