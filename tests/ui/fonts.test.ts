import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const fontsDir = resolve(__dirname, '../../src/ui/fonts');
const f = (name: string) => resolve(fontsDir, name);

describe('bundled Japanese font', () => {
  it('ships Noto Sans JP woff2 files for weights 400 and 700', () => {
    for (const weight of [400, 700]) {
      const file = f(`noto-sans-jp-japanese-${weight}.woff2`);
      expect(existsSync(file)).toBe(true);
      const buf = readFileSync(file);
      // WOFF2 signature: 'wOF2'
      expect(buf.toString('latin1', 0, 4)).toBe('wOF2');
      const kb = statSync(file).size / 1024;
      expect(kb).toBeGreaterThan(300);
      expect(kb).toBeLessThan(3072);
    }
  });

  it('declares both @font-face weights and is imported by theme.css', () => {
    const face = readFileSync(f('noto-sans-jp.css'), 'utf8');
    expect(face).toMatch(/font-family:\s*'Noto Sans JP'/);
    expect(face).toContain('font-weight: 400');
    expect(face).toContain('font-weight: 700');
    expect(face).toContain('woff2');

    const theme = readFileSync(resolve(__dirname, '../../src/ui/theme.css'), 'utf8');
    expect(theme).toContain("@import './fonts/noto-sans-jp.css'");
  });

  it('keeps a system Japanese fallback ahead of generic sans-serif', () => {
    const theme = readFileSync(resolve(__dirname, '../../src/ui/theme.css'), 'utf8');
    const line = theme.split('\n').find((l) => l.includes('--font-ja:'))!;
    expect(line).toMatch(/"Noto Sans JP".*(Yu Gothic|Meiryo).*sans-serif/);
  });

  it('bundles the OFL license text', () => {
    const ofl = readFileSync(f('OFL.txt'), 'utf8');
    expect(ofl).toMatch(/SIL Open Font License/i);
  });
});
