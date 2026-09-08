import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Проверяет закоммиченный артефакт build/icon.ico (пересобирается вручную
 * через `npm run make-icon`, см. build/README.md). Формат .ico:
 * https://learn.microsoft.com/windows/win32/menurc/icon-resource
 *   ICONDIR:  reserved(2)=0  type(2)=1  count(2)=N
 *   ICONDIRENTRY x N:  width(1) height(1) ... (0 в поле размера означает 256)
 */
const ICO = resolve(__dirname, '../../build/icon.ico');
const SVG = resolve(__dirname, '../../build/icon.svg');

describe('build/icon.ico', () => {
  it('exists and is a valid multi-size ICO', () => {
    expect(existsSync(ICO)).toBe(true);
    const buf = readFileSync(ICO);

    expect(buf.readUInt16LE(0)).toBe(0); // reserved
    expect(buf.readUInt16LE(2)).toBe(1); // type = icon

    const count = buf.readUInt16LE(4);
    expect(count).toBeGreaterThanOrEqual(3);

    const sizes = new Set<number>();
    for (let i = 0; i < count; i++) {
      const off = 6 + i * 16;
      sizes.add(buf.readUInt8(off) || 256);
    }
    expect(sizes.has(16)).toBe(true); // мелкий размер для панели задач
    expect(sizes.has(256)).toBe(true); // крупный для проводника / Alt+Tab
  });

  it('has a source SVG that draws the こ glyph on the project accent colour', () => {
    const svg = readFileSync(SVG, 'utf8');
    expect(svg).toContain('こ'); // от «こつこつ»
    expect(svg).toMatch(/rx="\d+"/); // скруглённый квадрат-подложка
  });
});
