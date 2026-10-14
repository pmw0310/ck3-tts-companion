import { describe, it } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { MsEdgeTTS } from 'msedge-tts';
import {
  EDGE_TTS_SEC_MS_GEC_VERSION,
  applyEdgeTtsDrmPatch,
  buildEdgeTtsSynthUrlV2,
  generateEdgeTtsMuid,
  generateSecMsGecV2
} from '@/main/edgeTtsDrm';
import { edgeTtsAgent } from '@/main/ttsService';

/**
 * Microsoft Edge ReadAloud Sec-MS-GEC v2 DRM 토큰 생성기 및
 * WebSocket MUID 헤더 패치의 무결성을 검증하는 회귀 테스트입니다.
 */
describe('Edge-TTS Sec-MS-GEC v2 DRM 토큰 및 헤더 패치 검증', () => {
  it('1. 고정 타임스탬프에 대해 rany2/edge-tts(drm.py)와 100% 동일한 v2 토큰(<16 hex>-<64 hex>)을 생성해야 한다', () => {
    const vectors: readonly { timestamp: number; expected: string }[] = [
      {
        timestamp: 0,
        expected:
          '52BC7A17B50DFEC9-28C4394775C8751CD2F6859C030C06DB1489ACAB3B3A7651831FC26895177ED6'
      },
      {
        timestamp: 1700000000,
        expected:
          '2CD23A2CA0B2595A-F3C846C370E05F9CC83ACC5F995C5F5D87A4D0F14CE8936A0F902E64099E38A2'
      },
      {
        timestamp: 1728900000,
        expected:
          '92C8D7882125BC88-81B24303C1D417D273CFA2F2169A7659C747B85AD526EAB202B6C611A24E2950'
      },
      {
        timestamp: 1760439600.5,
        expected:
          'DE589EA5ECBA1A13-DCA1258FC8CA9EC87DC87933247FAE77E7702D1C4AD98A4E8F1FBE461FC73674'
      }
    ];

    for (const { timestamp, expected } of vectors) {
      const actual = generateSecMsGecV2(timestamp);
      assert.strictEqual(
        actual,
        expected,
        `timestamp=${timestamp}의 Sec-MS-GEC v2 토큰이 기준 벡터와 일치해야 합니다.`
      );
    }
  });

  it('2. 5분(300초) 윈도우 내의 타임스탬프는 동일한 Sec-MS-GEC v2 토큰으로 내림 정렬되어야 한다', () => {
    const base = 1728900000;
    const tokenAtStart = generateSecMsGecV2(base);
    const tokenAtMid = generateSecMsGecV2(base + 149);
    const tokenAtEnd = generateSecMsGecV2(base + 299);
    const tokenNextWindow = generateSecMsGecV2(base + 300);

    assert.strictEqual(tokenAtStart, tokenAtMid);
    assert.strictEqual(tokenAtStart, tokenAtEnd);
    assert.notStrictEqual(tokenAtStart, tokenNextWindow);
  });

  it('3. buildEdgeTtsSynthUrlV2는 Sec-MS-GEC-Version=2-143.0.3650.75와 v2 토큰 포맷을 포함해야 한다', () => {
    const url = buildEdgeTtsSynthUrlV2(1700000000);
    assert.ok(
      url.includes(`Sec-MS-GEC-Version=${EDGE_TTS_SEC_MS_GEC_VERSION}`),
      `Sec-MS-GEC-Version=${EDGE_TTS_SEC_MS_GEC_VERSION} 쿼리가 포함되어야 합니다: ${url}`
    );
    assert.ok(
      url.includes(
        'Sec-MS-GEC=2CD23A2CA0B2595A-F3C846C370E05F9CC83ACC5F995C5F5D87A4D0F14CE8936A0F902E64099E38A2'
      ),
      `v2 Sec-MS-GEC 토큰이 URL에 포함되어야 합니다: ${url}`
    );
    assert.match(url, /ConnectionId=[0-9a-f]{32}/);
  });

  it('4. MsEdgeTTS.getSynthUrl() 및 MsEdgeTTS.generateSecMsGec()가 런타임 패치되어 v2 규격을 반환해야 한다', async () => {
    applyEdgeTtsDrmPatch(MsEdgeTTS, edgeTtsAgent);

    const staticTarget = MsEdgeTTS as unknown as {
      getSynthUrl: () => Promise<string>;
      generateSecMsGec: (token: string) => Promise<string>;
    };

    const token = await staticTarget.generateSecMsGec('6A5AA1D4EAFF4E9FB37E23D68491D6F4');
    assert.match(
      token,
      /^[0-9A-F]{16}-[0-9A-F]{64}$/,
      `패치된 MsEdgeTTS.generateSecMsGec는 <16 hex>-<64 hex> v2 포맷을 반환해야 합니다: ${token}`
    );

    const synthUrl = await staticTarget.getSynthUrl();
    assert.ok(
      synthUrl.includes('Sec-MS-GEC-Version=2-143.0.3650.75'),
      `패치된 MsEdgeTTS.getSynthUrl은 v2 버전을 포함해야 합니다: ${synthUrl}`
    );
    assert.match(
      synthUrl,
      /Sec-MS-GEC=[0-9A-F]{16}-[0-9A-F]{64}/,
      `패치된 MsEdgeTTS.getSynthUrl은 v2 토큰을 포함해야 합니다: ${synthUrl}`
    );
  });

  it('5. 패치된 Agent의 addRequest는 WebSocket 핸드셰이크 요청에 Cookie(muid), Pragma, Cache-Control 헤더를 자동 주입해야 한다', () => {
    const muid = generateEdgeTtsMuid();
    assert.match(muid, /^[0-9A-F]{32}$/, 'MUID는 32자리 대문자 Hex여야 합니다.');

    let capturedCookie = '';
    let capturedPragma = '';
    let capturedCacheControl = '';
    let capturedAcceptLang = '';

    const mockAgent = {
      addRequest: (req: http.ClientRequest): void => {
        capturedCookie = String(req.getHeader('Cookie') ?? '');
        capturedPragma = String(req.getHeader('Pragma') ?? '');
        capturedCacheControl = String(req.getHeader('Cache-Control') ?? '');
        capturedAcceptLang = String(req.getHeader('Accept-Language') ?? '');
      }
    };

    applyEdgeTtsDrmPatch(MsEdgeTTS, mockAgent);

    const req = http.request('http://speech.platform.bing.com/test', {
      agent: mockAgent as unknown as http.Agent,
      headers: {
        'User-Agent': 'EdgeTestUA',
        Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold'
      }
    });
    req.destroy();

    assert.match(
      capturedCookie,
      /^muid=[0-9A-F]{32};$/,
      `Cookie 헤더에 muid=<32 hex>;가 주입되어야 합니다: ${capturedCookie}`
    );
    assert.strictEqual(capturedPragma, 'no-cache');
    assert.strictEqual(capturedCacheControl, 'no-cache');
    assert.strictEqual(capturedAcceptLang, 'en-US,en;q=0.9');
  });
});

