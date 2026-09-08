import { seededShuffle } from '@/core/quiz/rng';

export function pickDistractors(
  pool: readonly string[],
  correct: string,
  n: number,
  seed: string,
): string[] {
  const seen = new Set<string>([correct]);
  const unique: string[] = [];
  for (const c of pool) {
    const t = c.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    unique.push(t);
  }

  // Seeded shuffle first so ties below resolve deterministically but not by
  // original pool order. Include n in seed so different counts produce different shuffles.
  const shuffled = seededShuffle(unique, `${seed}:${n}`);
  shuffled.sort((a, b) => {
    const sharedA = a[0] === correct[0] ? 0 : 1;
    const sharedB = b[0] === correct[0] ? 0 : 1;
    if (sharedA !== sharedB) return sharedA - sharedB;
    return Math.abs(a.length - correct.length) - Math.abs(b.length - correct.length);
  });

  const out = shuffled.slice(0, n);
  while (out.length < n) out.push('—');
  return out;
}

/** Flattens every other level point's `extract(p)` strings into one candidate pool. */
export function distractorPool<T extends { id: string }>(
  levelPoints: readonly T[],
  excludeId: string,
  extract: (p: T) => string[],
): string[] {
  return levelPoints.filter((p) => p.id !== excludeId).flatMap(extract);
}

export function shuffleWithAnswer(
  correctFirst: string[],
  seed: string,
): { list: string[]; answerIndex: number } {
  const indexed = correctFirst.map((text, i) => ({ text, correct: i === 0 }));
  const shuffled = seededShuffle(indexed, seed);
  return {
    list: shuffled.map((x) => x.text),
    answerIndex: shuffled.findIndex((x) => x.correct),
  };
}
