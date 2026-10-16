import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 캐시 현황 프로그레스 바(그래프) CSS 토큰 누락 및 렌더링 무결성 재현 테스트
 */
describe('캐시 현황 프로그레스 바 CSS 디자인 토큰 및 가시성 무결성 검증', () => {
  const cssPath = path.resolve(__dirname, '../src/renderer/index.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  it('1. :root에 --gold-active, --gold-light, --status-success, --transition-fast 등 필수 디자인 토큰이 반드시 선언되어 있어야 함', () => {
    // :root 블록 추출
    const rootMatch = cssContent.match(/:root\s*\{([^}]+)\}/);
    assert.ok(rootMatch, ':root 블록이 CSS 파일 내에 존재해야 합니다.');
    const rootBlock = rootMatch[1];

    const requiredTokens = [
      '--gold-primary',
      '--gold-hover',
      '--gold-active',
      '--gold-light',
      '--gold-glow',
      '--gold-border',
      '--status-success',
      '--transition-fast'
    ];

    for (const token of requiredTokens) {
      const regex = new RegExp(`${token}\\s*:`);
      assert.ok(regex.test(rootBlock), `:root에 ${token} 토큰이 정의되어 있어야 합니다.`);
    }
  });

  it('2. index.css 내에서 참조하는 모든 var(--*) 변수가 :root에 유효하게 선언되어 있어야 함', () => {
    // :root 블록 내의 정의된 토큰들 추출
    const rootMatch = cssContent.match(/:root\s*\{([^}]+)\}/);
    assert.ok(rootMatch);
    const rootBlock = rootMatch[1];

    const definedTokens = new Set<string>();
    const defRegex = /(--[a-z0-9-]+)\s*:/g;
    let defMatch: RegExpExecArray | null;
    while ((defMatch = defRegex.exec(rootBlock)) !== null) {
      definedTokens.add(defMatch[1]);
    }

    // CSS 전체에서 사용되는 var(--*) 추출
    const usageRegex = /var\(\s*(--[a-z0-9-]+)[^)]*\)/g;
    const missingTokens = new Set<string>();
    let useMatch: RegExpExecArray | null;
    while ((useMatch = usageRegex.exec(cssContent)) !== null) {
      const token = useMatch[1];
      if (!definedTokens.has(token)) {
        missingTokens.add(token);
      }
    }

    assert.deepStrictEqual(
      Array.from(missingTokens),
      [],
      `미정의된 CSS 토큰이 존재합니다: ${Array.from(missingTokens).join(', ')}`
    );
  });

  it('3. .cache-progress-bar에 단일 색상 폴백 및 뚜렷한 배경 그라데이션이 적용되어 있어야 함', () => {
    // .cache-progress-bar 블록 추출
    const barMatch = cssContent.match(/\.cache-progress-bar\s*\{([^}]+)\}/);
    assert.ok(barMatch, '.cache-progress-bar 클래스가 존재해야 합니다.');
    const barBlock = barMatch[1];

    // background 속성에 단일 색상 또는 유효한 그라데이션이 명시되어 있는지 확인
    const hasBackground = /background\s*:\s*[^;]+;/i.test(barBlock);
    assert.ok(hasBackground, '.cache-progress-bar에 background 속성이 정의되어 있어야 합니다.');

    // gradient 내에 유효하지 않은 미정의 변수(fallback 없는 형태)가 없는지 검증
    assert.ok(!barBlock.includes('var(--gold-active)'), 'var(--gold-active)는 안전한 폴백을 포함해야 합니다.');
  });
});
