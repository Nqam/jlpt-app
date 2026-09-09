import type { GrammarPointFull } from '@/storage/content-db';
import type { Question } from '@/core/quiz/types';
import { generateForCard } from '@/core/quiz/registry';

/**
 * Up to `count` reinforcement questions for one grammar point, built with the
 * same generator the daily review uses (`generateForCard`, which rotates
 * cloze/choice/assemble by a "reps" index and falls back across kinds). A slot
 * whose whole fallback chain fails is skipped; a point with no usable examples
 * yields `[]` and the caller shows "нечего закреплять".
 */
export function buildGrammarReinforce(
  point: GrammarPointFull,
  levelPoints: readonly GrammarPointFull[],
  seed: string,
  count = 3,
): Question[] {
  const out: Question[] = [];
  for (let i = 0; i < count; i++) {
    try {
      // vary the rotation slot per question; dayKey slot carries the per-question seed
      out.push(generateForCard(point, levelPoints, i, `${seed}:${i}`));
    } catch {
      // this rotation slot produced nothing for this point — skip it
    }
  }
  return out;
}
