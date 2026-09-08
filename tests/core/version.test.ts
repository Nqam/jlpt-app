import { describe, it, expect } from 'vitest';
import { compareVersions, isNewer } from '@/core/version';

describe('compareVersions', () => {
  it.each([
    ['1.0.0', '1.0.0', 0],
    ['1.0.1', '1.0.0', 1],
    ['1.0.0', '1.0.1', -1],
    ['1.2.0', '1.10.0', -1], // числовое сравнение, не строковое
    ['2.0.0', '1.9.9', 1],
    ['v1.0.0', '1.0.0', 0], // ведущий v
    ['1.0.0', '1.0', 0], // недостающая часть = 0
    ['1.0.0-beta.1', '1.0.0', 0], // пре-релизный суффикс игнорируется
  ] as const)('compareVersions(%s, %s) === %i', (a, b, want) => {
    expect(compareVersions(a, b)).toBe(want);
  });
});

describe('isNewer', () => {
  it('is true only when latest strictly exceeds current', () => {
    expect(isNewer('1.0.1', '1.0.0')).toBe(true);
    expect(isNewer('1.0.0', '1.0.0')).toBe(false);
    expect(isNewer('0.9.0', '1.0.0')).toBe(false);
    expect(isNewer('v1.1.0', '1.0.9')).toBe(true);
  });
});
