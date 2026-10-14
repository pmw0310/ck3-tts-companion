import crypto from 'node:crypto';
import type http from 'node:http';

/**
 * Microsoft Edge ReadAloud 서비스의 클라이언트 인증 토큰 상수입니다.
 */
export const EDGE_TTS_TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';

/**
 * Microsoft Edge ReadAloud Sec-MS-GEC v2가 요구하는 Chromium 버전 상수입니다.
 */
export const EDGE_TTS_CHROMIUM_FULL_VERSION = '143.0.3650.75';

/**
 * Microsoft Edge ReadAloud Sec-MS-GEC-Version 쿼리 파라미터 값입니다.
 */
export const EDGE_TTS_SEC_MS_GEC_VERSION = `2-${EDGE_TTS_CHROMIUM_FULL_VERSION}`;

/**
 * Microsoft Edge ReadAloud WebSocket 기본 엔드포인트입니다.
 */
export const EDGE_TTS_WSS_BASE_URL =
  'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';

// Windows FileTime Epoch 오프셋 (1601-01-01 ~ 1970-01-01 초 단위 차이)
const WIN_EPOCH_SECONDS = 11644473600;
const HECTO_NANOSECONDS_PER_SECOND = 10_000_000;

// FIPS 180-4 SHA-256 초기 해시 값
const SHA256_INITIAL: readonly number[] = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
];

// Sec-MS-GEC v2 커스텀 SHA-256 솔트 초기 상태 상수
const SHA256_STATE: readonly number[] = [
  0xfd9fbea2, 0x91243ce7, 0xbe499094, 0xcd2e1e0a,
  0x6c006f49, 0x04bd35ab, 0xfeb0a7e4, 0x03effbd2
];

// Sec-MS-GEC v2 커스텀 SHA-256 메시지 스케줄 시드 상수
const SHA256_SCHEDULE: readonly number[] = [
  0xeb24bf9e, 0x1558691f, 0xa0c09ee2, 0x0cfa32ba,
  0xa622ee8c, 0xd1dd9491, 0xc0dd25a0, 0xf9e70ab6,
  0xf0c31573, 0x7058ce4e, 0x7188e606, 0x00e5ab33,
  0xd258b060, 0x72766564
];

// FIPS 180-4 SHA-256 라운드 상수
const SHA256_ROUND_CONSTANTS: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

const SHA256_ADJUSTMENT = 0xc9dc06a7;
const SHA256_BLOCK_CONSTANTS: readonly number[] = SHA256_ROUND_CONSTANTS.map(
  (constant, index) => (index === 14 ? SHA256_ADJUSTMENT : constant)
);
const SHA256_SIGMA0_ADJUSTMENT = 0x059c0b80;
const SHA256_SIGMA1_ADJUSTMENT = 0x000b92c0;

// CS64 다항 체크섬 계수 테이블
const CS64_COEFFICIENTS: readonly (readonly [number, number])[] = [
  [0xe82e91b1, 0xb32700d0],
  [0x44de24c6, 0x88dff51d],
  [0x3beb65bc, 0x29514038],
  [0xc89c5933, 0xb328cbdf],
  [0x8d1ec211, 0xd405b4d5],
  [0x314ef5d5, 0x26e55f3c],
  [0xe92491b1, 0x607801c6],
  [0xf0a5b9d5, 0x82b2c1fb],
  [0x06064cf3, 0xfa51a3da],
  [0xda79fa60, 0x207cc464],
  [0xbed20560, 0x3c3c74f3],
  [0x89f9c9f8, 0xd2d14b61],
  [0x35fa38c6, 0xbb04a2c1],
  [0xcb49e3c6, 0xc5626167]
];

const CS64_FACTOR = 0x82893933;
const CS64_ADJUSTMENT0 = 0xf2f90b1a;
const CS64_ADJUSTMENT1 = 0x0b1a0000;

// JavaScript Number 정밀도 손실(2^53)을 방지하기 위해 Math.imul로 32비트 모듈러 곱셈을 수행합니다.
const mul32 = (a: number, b: number): number => Math.imul(a, b) >>> 0;

// 32비트 부호 없는 정수를 좌측으로 16비트 회전합니다.
const rol16 = (value: number): number => {
  const u = value >>> 0;
  return ((u << 16) | (u >>> 16)) >>> 0;
};

// SHA-256 small sigma 0 연산을 수행합니다.
const sigma0 = (value: number): number => {
  const u = value >>> 0;
  return ((u >>> 7) ^ (u << 25) ^ (u >>> 18) ^ (u << 14) ^ (u >>> 3)) >>> 0;
};

// SHA-256 small sigma 1 연산을 수행합니다.
const sigma1 = (value: number): number => {
  const u = value >>> 0;
  return ((u >>> 17) ^ (u << 15) ^ (u >>> 19) ^ (u << 13) ^ (u >>> 10)) >>> 0;
};

// 바이트 버퍼를 Little-Endian 32비트 워드 배열(짝수 길이 보장)로 분할합니다.
const wordsLe4Even = (data: Buffer): number[] => {
  const rem = data.length % 4;
  const padLen = rem === 0 ? 0 : 4 - rem;
  const padded = padLen > 0 ? Buffer.concat([data, Buffer.alloc(padLen)]) : data;
  if (padded.length === 0) {
    return [];
  }
  const words: number[] = [];
  for (let offset = 0; offset < padded.length; offset += 4) {
    words.push(padded.readUInt32LE(offset));
  }
  if (words.length % 2 === 1) {
    words.push(0);
  }
  return words;
};

// SHA-256 메시지 스케줄을 64워드로 확장합니다.
const expandSha256Schedule = (words: number[], firstWord = 16): void => {
  for (let index = firstWord; index < 64; index++) {
    const s1 = sigma1(words[index - 2]);
    const s0 = sigma0(words[index - 15]);
    words.push(
      (s1 + words[index - 7] + s0 + words[index - 16]) >>> 0
    );
  }
};

// SHA-256 라운드 압축 함수를 실행합니다.
const sha256Rounds = (
  state: readonly number[],
  words: readonly number[],
  firstRound = 0
): number[] => {
  let [a, b, c, d, e, f, g, h] = state.map((v) => v >>> 0);
  const constants =
    firstRound === 14 ? SHA256_BLOCK_CONSTANTS : SHA256_ROUND_CONSTANTS;

  for (let index = firstRound; index < 64; index++) {
    const bigSigma1 =
      (((e >>> 6) | (e << 26)) ^
        ((e >>> 11) | (e << 21)) ^
        ((e >>> 25) | (e << 7))) >>>
      0;
    const ch = (g ^ (e & (f ^ g))) >>> 0;
    const t1 = (h + bigSigma1 + ch + constants[index] + words[index]) >>> 0;
    const bigSigma0 =
      (((a >>> 2) | (a << 30)) ^
        ((a >>> 13) | (a << 19)) ^
        ((a >>> 22) | (a << 10))) >>>
      0;
    const maj = ((a & b) | (c & (a | b))) >>> 0;
    const t2 = (bigSigma0 + maj) >>> 0;

    h = g;
    g = f;
    f = e;
    e = (d + t1) >>> 0;
    d = c;
    c = b;
    b = a;
    a = (t1 + t2) >>> 0;
  }

  return [a, b, c, d, e, f, g, h];
};

// 토큰 앞 7바이트 솔트를 이용해 커스텀 SHA-256 초기 상태를 계산합니다.
const sha256Init = (salt7Bytes: Buffer): number[] => {
  const words: number[] = new Array<number>(14).fill(0);
  const firstWord =
    ((salt7Bytes[0] << 16) | (salt7Bytes[1] << 8) | salt7Bytes[2]) >>> 0;
  const secondWord = salt7Bytes.readUInt32BE(3);
  words.push(firstWord, secondWord);

  for (let index = 16; index < 30; index++) {
    let value = SHA256_SCHEDULE[index - 16];
    if (index - 2 >= 14) {
      const term1 =
        index === 16
          ? (sigma1(words[index - 2]) ^ SHA256_SIGMA1_ADJUSTMENT) >>> 0
          : sigma1(words[index - 2]);
      value = (value + term1) >>> 0;
    }
    if (index - 7 >= 14) {
      value = (value + words[index - 7]) >>> 0;
    }
    if (index - 15 >= 14) {
      const term0 =
        index === 29
          ? (sigma0(words[index - 15]) ^ SHA256_SIGMA0_ADJUSTMENT) >>> 0
          : sigma0(words[index - 15]);
      value = (value + term0) >>> 0;
    }
    words.push(value >>> 0);
  }

  words.push(
    (sigma1(words[28]) +
      words[23] +
      sigma0(words[15]) +
      words[14] +
      SHA256_ADJUSTMENT -
      SHA256_ROUND_CONSTANTS[14]) >>>
      0
  );

  expandSha256Schedule(words, 31);
  const working = sha256Rounds(SHA256_STATE, words, 14);
  return SHA256_INITIAL.map((x, idx) => (x + working[idx]) >>> 0);
};

// 토큰 데이터에 대한 Sec-MS-GEC v2 커스텀 SHA-256 다이제스트(32바이트)를 계산합니다.
const computeSha256Digest = (data: Buffer): Buffer => {
  if (data.length < 7) {
    throw new Error('Token salt must contain at least seven bytes');
  }
  const totalLength = 57 + data.length;
  const tail = data.subarray(7);
  const zeroPadLen = (((55 - totalLength) % 64) + 64) % 64;
  const lengthBuf = Buffer.alloc(8);
  lengthBuf.writeBigUInt64BE(BigInt(totalLength) * 8n, 0);

  const padded = Buffer.concat([
    tail,
    Buffer.from([0x80]),
    Buffer.alloc(zeroPadLen),
    lengthBuf
  ]);

  let state = sha256Init(data.subarray(0, 7));
  for (let offset = 0; offset < padded.length; offset += 64) {
    const words: number[] = [];
    for (let i = 0; i < 64; i += 4) {
      words.push(padded.readUInt32BE(offset + i));
    }
    expandSha256Schedule(words, 16);
    const working = sha256Rounds(state, words, 0);
    state = state.map((x, idx) => (x + working[idx]) >>> 0);
  }

  const out = Buffer.alloc(32);
  for (let idx = 0; idx < 8; idx++) {
    out.writeUInt32BE(state[idx] >>> 0, idx * 4);
  }
  return out;
};

// 토큰 데이터와 SHA-256 다이제스트로부터 64비트 CS64 체크섬 워드 2개를 계산합니다.
const computeCs64Digest = (
  data: Buffer,
  digest: Buffer
): readonly [number, number] => {
  const keyA = (digest.readUInt32LE(0) | 1) >>> 0;
  const keyB = (digest.readUInt32LE(4) | 1) >>> 0;
  const factors: readonly [number, number] = [
    mul32(keyA, CS64_FACTOR),
    mul32(keyB, CS64_FACTOR)
  ];

  const terms: number[] = CS64_COEFFICIENTS.map(([coefficient], index) =>
    mul32(coefficient, factors[index % 2])
  );
  const offsets: number[] = CS64_COEFFICIENTS.map(([, offset]) => offset >>> 0);

  const dataWords = wordsLe4Even(Buffer.concat([Buffer.from([0x00]), data]));
  for (let index = 0; index < dataWords.length; index++) {
    const word = dataWords[index];
    let term = mul32(word, index % 2 === 0 ? keyA : keyB);
    let offset = mul32(
      rol16(word),
      index % 2 === 0 ? 0xef0569fb : 0xc31713db
    );
    if (index === 0) {
      term = (term + mul32(CS64_ADJUSTMENT0, factors[0])) >>> 0;
      offset = (offset + CS64_ADJUSTMENT1) >>> 0;
    }
    terms.push(term >>> 0);
    offsets.push(offset >>> 0);
  }

  let swapAcc = 0;
  let swapLast = 0;
  let state = 0;
  let acc = 0;

  for (let index = 0; index < terms.length; index += 2) {
    const x = terms[index];
    const y = terms[index + 1];

    let t = rol16((offsets[index] + x) >>> 0);
    let q = mul32(t, 0x76f50f34);
    swapAcc = (swapAcc + ((mul32(rol16(q), 0xc3efea97) + q) >>> 0)) >>> 0;

    t = rol16((offsets[index + 1] + y) >>> 0);
    q = mul32(t, 0x1881ce3c);
    swapLast = (mul32(rol16(q), 0x35bd1ec9) + q) >>> 0;
    swapAcc = (swapAcc + swapLast) >>> 0;

    state = (mul32(state, keyA) + x) >>> 0;
    state = mul32(rol16(state), 0xcf98b111);
    state = mul32(rol16(state), 0x87085b9f);
    state = mul32(rol16(state), 0x12ceb96d);
    state = mul32(rol16(state), 0x257e1d83);
    acc = (acc + state) >>> 0;

    t = (mul32(state, keyB) + y) >>> 0;
    t = mul32(rol16(t), 0xa27416f5);
    t = mul32(rol16(t), 0xd38396ff);
    state = mul32(rol16(mul32(rol16(t), 0x7c932b89)), 0xbfa49f69);
    acc = (acc + state) >>> 0;
  }

  return [(swapLast ^ state) >>> 0, (swapAcc ^ acc) >>> 0];
};

/**
 * Microsoft Edge ReadAloud 서버가 요구하는 MUID(32자리 대문자 16진수) 쿠키 값을 생성합니다.
 * @returns 32자리 대문자 Hex 문자열
 */
export const generateEdgeTtsMuid = (): string => {
  return crypto.randomBytes(16).toString('hex').toUpperCase();
};

/**
 * 대시(-)가 제거된 32자리 소문자 16진수 WebSocket ConnectionId를 생성합니다.
 * @returns 32자리 소문자 Hex 문자열
 */
export const generateEdgeTtsConnectionId = (): string => {
  return crypto.randomBytes(16).toString('hex');
};

// 5분(300초) 윈도우 내 반복 호출 시 SHA-256 및 CS64 재연산을 방지하기 위한 인메모리 캐시
let lastHashInput = '';
let lastGeneratedToken = '';

/**
 * Microsoft Edge ReadAloud WebSocket API용 Sec-MS-GEC v2 DRM 토큰을 생성합니다.
 * CS64 체크섬(16자리 Hex)과 커스텀 SHA-256 다이제스트(64자리 Hex)를 결합한
 * `<16 hex>-<64 hex>` 규격 문자열을 반환합니다.
 * @param unixTimestampSeconds - 테스트용 고정 Unix 타임스탬프(초 단위, 생략 시 현재 시각 사용)
 * @returns 생성된 Sec-MS-GEC v2 토큰 문자열
 */
export const generateSecMsGecV2 = (unixTimestampSeconds?: number): string => {
  const baseSeconds =
    typeof unixTimestampSeconds === 'number'
      ? Math.floor(unixTimestampSeconds)
      : Math.floor(Date.now() / 1000);
  let ticks = baseSeconds + WIN_EPOCH_SECONDS;
  ticks -= ticks % 300;
  const windowsTicks = BigInt(ticks) * BigInt(HECTO_NANOSECONDS_PER_SECOND);
  const strToHash = `${windowsTicks.toString()}${EDGE_TTS_TRUSTED_CLIENT_TOKEN}`;

  if (strToHash === lastHashInput && lastGeneratedToken) {
    return lastGeneratedToken;
  }

  const data = Buffer.from(strToHash, 'ascii');
  const digest = computeSha256Digest(data);
  const [csWord0, csWord1] = computeCs64Digest(data, digest);
  const csBuf = Buffer.alloc(8);
  csBuf.writeUInt32LE(csWord0, 0);
  csBuf.writeUInt32LE(csWord1, 4);

  const cs64Hex = csBuf.toString('hex').toUpperCase();
  const sha256Hex = digest.toString('hex').toUpperCase();
  const token = `${cs64Hex}-${sha256Hex}`;

  lastHashInput = strToHash;
  lastGeneratedToken = token;
  return token;
};

/**
 * Sec-MS-GEC v2 토큰 및 버전이 포함된 Microsoft Edge ReadAloud WebSocket 합성 URL을 생성합니다.
 * @param unixTimestampSeconds - 테스트용 고정 Unix 타임스탬프(초 단위, 생략 시 현재 시각 사용)
 * @returns 완성된 WSS 합성 URL
 */
export const buildEdgeTtsSynthUrlV2 = (
  unixTimestampSeconds?: number
): string => {
  const connectionId = generateEdgeTtsConnectionId();
  const secMsGec = generateSecMsGecV2(unixTimestampSeconds);
  return (
    `${EDGE_TTS_WSS_BASE_URL}?TrustedClientToken=${EDGE_TTS_TRUSTED_CLIENT_TOKEN}` +
    `&ConnectionId=${connectionId}` +
    `&Sec-MS-GEC=${secMsGec}` +
    `&Sec-MS-GEC-Version=${EDGE_TTS_SEC_MS_GEC_VERSION}`
  );
};

/**
 * Edge-TTS WebSocket 핸드셰이크 요청에 필수 DRM 헤더(Cookie: muid=..., Pragma, Cache-Control 등)를 주입합니다.
 * @param req - Node.js HTTP ClientRequest 인스턴스
 * @returns 반환값 없음 (요청 객체 헤더 직접 수정)
 */
export const attachEdgeTtsDrmHeadersToRequest = (
  req: http.ClientRequest
): void => {
  if (!req.getHeader('Cookie')) {
    req.setHeader('Cookie', `muid=${generateEdgeTtsMuid()};`);
  }
  if (!req.getHeader('Pragma')) {
    req.setHeader('Pragma', 'no-cache');
  }
  if (!req.getHeader('Cache-Control')) {
    req.setHeader('Cache-Control', 'no-cache');
  }
  if (!req.getHeader('Accept-Language')) {
    req.setHeader('Accept-Language', 'en-US,en;q=0.9');
  }
  if (!req.getHeader('Accept-Encoding')) {
    req.setHeader('Accept-Encoding', 'gzip, deflate, br, zstd');
  }
};

/**
 * MsEdgeTTS 정적 메서드 패치 대상 인터페이스입니다.
 */
export interface EdgeTtsPatchableStatic {
  generateSecMsGec?: (trustedClientToken: string) => Promise<string>;
  getSynthUrl?: () => Promise<string>;
}

// 에이전트 중복 래핑 방지용 WeakSet
const patchedAgents = new WeakSet<object>();

/**
 * msedge-tts 라이브러리의 구버전 Sec-MS-GEC v1 생성기 및 WebSocket 에이전트를
 * 최신 Sec-MS-GEC v2(2-143.0.3650.75) 및 MUID 쿠키 헤더 규격으로 런타임 패치합니다.
 * @param edgeTtsClass - MsEdgeTTS 클래스 생성자 객체
 * @param agent - WebSocket 연결에 사용되는 https.Agent 인스턴스
 * @returns 반환값 없음
 */
export const applyEdgeTtsDrmPatch = (
  edgeTtsClass: unknown,
  agent?: object
): void => {
  if (
    (typeof edgeTtsClass === 'function' || typeof edgeTtsClass === 'object') &&
    edgeTtsClass !== null
  ) {
    const target = edgeTtsClass as EdgeTtsPatchableStatic;
    target.generateSecMsGec = async (): Promise<string> => generateSecMsGecV2();
    target.getSynthUrl = async (): Promise<string> => buildEdgeTtsSynthUrlV2();
  }

  if (agent && !patchedAgents.has(agent)) {
    const agentWithAddRequest = agent as {
      addRequest?: (req: http.ClientRequest, ...args: unknown[]) => void;
    };
    if (typeof agentWithAddRequest.addRequest === 'function') {
      const originalAddRequest = agentWithAddRequest.addRequest.bind(agent);
      agentWithAddRequest.addRequest = (
        req: http.ClientRequest,
        ...args: unknown[]
      ): void => {
        attachEdgeTtsDrmHeadersToRequest(req);
        originalAddRequest(req, ...args);
      };
      patchedAgents.add(agent);
    }
  }
};

