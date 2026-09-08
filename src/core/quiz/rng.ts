/** Детерминированная псевдослучайность для генерации вопросов. Только чистые функции. */

/** 32-битный беззнаковый FNV-1a. */
export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** xorshift32, засеян хешем строки. Возвращает функцию, дающую float в [0, 1). */
export function makeRng(seed: string): () => number {
  let state = hashSeed(seed) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 1_000_000) / 1_000_000;
  };
}

export function seededShuffle<T>(arr: readonly T[], seed: string): T[] {
  const a = arr.slice();
  const rand = makeRng(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function seededPick<T>(arr: readonly T[], seed: string): T {
  if (arr.length === 0) throw new Error('seededPick: empty array');
  return seededShuffle(arr, seed)[0]!;
}
