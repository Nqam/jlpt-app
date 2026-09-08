import { describe, it, expect } from 'vitest';
import { pickDistractors, distractorPool, shuffleWithAnswer } from '@/core/quiz/distractors';

describe('core/quiz/distractors', () => {
  const pool = ['は', 'を', 'に', 'も', 'へ', 'で', 'は', 'が'];

  it('returns exactly n, excludes the correct answer and duplicates', () => {
    const d = pickDistractors(pool, 'は', 3, 's');
    expect(d).toHaveLength(3);
    expect(d).not.toContain('は');
    expect(new Set(d).size).toBe(3);
    d.forEach((x) => expect(pool).toContain(x));
  });

  it('is deterministic for a seed and varies by seed', () => {
    expect(pickDistractors(pool, 'は', 3, 's1')).toEqual(pickDistractors(pool, 'は', 3, 's1'));
    expect(pickDistractors(pool, 'は', 3, 's2')).not.toEqual(pickDistractors(pool, 'は', 5, 's2').slice(0, 3));
  });

  it('pads with — when the pool is too small', () => {
    const d = pickDistractors(['を'], 'は', 3, 's');
    expect(d).toHaveLength(3);
    expect(d.filter((x) => x === '—')).toHaveLength(2);
  });

  it('prefers candidates that share a leading character with correct', () => {
    const d = pickDistractors(['そうです', 'ました', 'そうだ', 'ません'], 'そうか', 2, 's');
    expect(d).toContain('そうです');
    expect(d).toContain('そうだ');
  });

  it('distractorPool works over any {id:string}-shaped point, generically', () => {
    const points = [
      { id: 'a', tag: 'x' }, { id: 'b', tag: 'y' }, { id: 'c', tag: 'z' },
    ];
    expect(distractorPool(points, 'a', (p) => [p.tag])).toEqual(['y', 'z']);
  });

  it('shuffleWithAnswer keeps the correct value findable at the returned index', () => {
    const { list, answerIndex } = shuffleWithAnswer(['は', 'を', 'に', 'も'], 'seed-1');
    expect(list).toHaveLength(4);
    expect(list[answerIndex]).toBe('は');
    expect(new Set(list)).toEqual(new Set(['は', 'を', 'に', 'も']));
  });
});
