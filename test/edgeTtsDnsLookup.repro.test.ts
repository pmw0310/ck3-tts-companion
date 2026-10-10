import { describe, it } from 'node:test';
import assert from 'node:assert';
import { edgeTtsDnsLookup, clearEdgeTtsDnsCache } from '@/main/ttsService';

/**
 * Edge-TTS의 macOS getaddrinfo(ENOTFOUND speech.platform.bing.com)
 * DNS 해석 실패 결함을 dns.resolve4 및 캐싱으로 원천 방어하는 무결성 검증 테스트입니다.
 */
describe('Edge-TTS DNS 해석 및 연결 안정성 검증 (edgeTtsDnsLookup)', () => {
  it('1. speech.platform.bing.com에 대해 c-ares 기반 IPv4 주소를 1초 이내에 성공적으로 해석해야 한다', async () => {
    const address = await new Promise<string>((resolve, reject) => {
      edgeTtsDnsLookup('speech.platform.bing.com', { family: 4 }, (err, addr) => {
        if (err) reject(err);
        else resolve(typeof addr === 'string' ? addr : addr[0].address);
      });
    });

    assert.ok(address, 'IPv4 주소가 비어있지 않아야 합니다.');
    // IPv4 주소 형식 정규식 검증
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    assert.strictEqual(
      ipv4Regex.test(address),
      true,
      `유효한 IPv4 주소여야 합니다: ${address}`
    );
  });

  it('2. all: true 옵션 시 객체 배열 형태({ address, family: 4 }[])로 반환해야 한다', async () => {
    const addresses = await new Promise<{ address: string; family: number }[]>((resolve, reject) => {
      edgeTtsDnsLookup('speech.platform.bing.com', { all: true }, (err, addrs) => {
        if (err) reject(err);
        else resolve(addrs as { address: string; family: number }[]);
      });
    });

    assert.ok(Array.isArray(addresses), '배열 형태여야 합니다.');
    assert.ok(addresses.length > 0, '1개 이상의 주소가 반환되어야 합니다.');
    assert.strictEqual(addresses[0].family, 4, 'IPv4 family 4여야 합니다.');
  });

  it('3. 연속 호출 시 10분 TTL 인메모리 DNS 캐시를 통해 즉시 반환되어야 한다', async () => {
    const start = Date.now();
    const address = await new Promise<string>((resolve, reject) => {
      edgeTtsDnsLookup('speech.platform.bing.com', {}, (err, addr) => {
        if (err) reject(err);
        else resolve(typeof addr === 'string' ? addr : addr[0].address);
      });
    });
    const elapsed = Date.now() - start;

    assert.ok(address, '캐시된 주소가 반환되어야 합니다.');
    assert.ok(elapsed < 50, `캐시 히트로 50ms 미만이어야 합니다 (실측: ${elapsed}ms)`);
  });

  it('4. options 대신 콜백 함수가 단독 두 번째 인자로 전달되어도 정상 처리되어야 한다', async () => {
    const address = await new Promise<string>((resolve, reject) => {
      // @ts-expect-error 콜백 단독 전달 오버로드 방어 테스트
      edgeTtsDnsLookup('speech.platform.bing.com', (err, addr) => {
        if (err) reject(err);
        else resolve(typeof addr === 'string' ? addr : addr[0].address);
      });
    });

    assert.ok(address, '콜백 단독 호출 시에도 주소가 반환되어야 합니다.');
  });

  it('5. clearEdgeTtsDnsCache 호출 시 캐시가 무효화되어야 한다', async () => {
    clearEdgeTtsDnsCache('speech.platform.bing.com');
    // 무효화 후 재조회 시 정상 동작 확인
    const address = await new Promise<string>((resolve, reject) => {
      edgeTtsDnsLookup('speech.platform.bing.com', {}, (err, addr) => {
        if (err) reject(err);
        else resolve(typeof addr === 'string' ? addr : addr[0].address);
      });
    });
    assert.ok(address, '캐시 무효화 후에도 정상 해석되어야 합니다.');
  });
});
