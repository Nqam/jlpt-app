import { describe, it, expect } from 'vitest';
import { hashSeed, makeRng, seededShuffle, seededPick } from '@/core/quiz/rng';

describe('core/quiz/rng', () => {
  it('hashSeed is a stable 32-bit unsigned number', () => {
    const h = hashSeed('n5-wa-particle:2026-09-04:cloze');
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
    expect(hashSeed('a')).not.toBe(hashSeed('b'));
    expect(hashSeed('same')).toBe(hashSeed('same'));
  });

  it('makeRng is deterministic per seed and in [0,1)', () => {
    const a = makeRng('seed-1');
    const b = makeRng('seed-1');
    for (let i = 0; i < 20; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(makeRng('seed-2')()).not.toBe(makeRng('seed-1')());
  });

  it('seededShuffle is a permutation and deterministic', () => {
    const src = [1, 2, 3, 4, 5, 6, 7, 8];
    const s1 = seededShuffle(src, 'x');
    const s2 = seededShuffle(src, 'x');
    expect(s1).toEqual(s2);
    expect([...s1].sort((a, b) => a - b)).toEqual(src);
    expect(src).toEqual([1, 2, 3, 4, 5, 6, 7, 8]); // input not mutated
  });

  it('seededPick returns a member and is deterministic; throws on empty', () => {
    expect(['a', 'b', 'c']).toContain(seededPick(['a', 'b', 'c'], 'k'));
    expect(seededPick(['a', 'b', 'c'], 'k')).toBe(seededPick(['a', 'b', 'c'], 'k'));
    expect(() => seededPick([], 'k')).toThrow();
  });
});
