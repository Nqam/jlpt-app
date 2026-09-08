import type { KanjiPoint } from '@/core/types';
import type { ChoiceQuestion, Question } from '@/core/quiz/types';
import { pickDistractors, distractorPool, shuffleWithAnswer } from '@/core/quiz/distractors';
import { seededPick } from '@/core/quiz/rng';

export const genKanjiMeaning = (
  point: KanjiPoint,
  levelPoints: readonly KanjiPoint[],
  seed: string,
): ChoiceQuestion => {
  const pool = distractorPool(levelPoints, point.id, (p) => [p.meaningRu]);
  const distractors = pickDistractors(pool, point.meaningRu, 3, `${seed}:d`);
  const { list, answerIndex } = shuffleWithAnswer([point.meaningRu, ...distractors], `${seed}:c`);
  return {
    id: seed, itemType: 'kanji', itemId: point.id, kind: 'choice',
    prompt: `Что означает «${point.char}»?`,
    choices: list, answerIndex,
  };
};

export const genKanjiReading = (
  point: KanjiPoint,
  levelPoints: readonly KanjiPoint[],
  seed: string,
): ChoiceQuestion => {
  const readings = [...point.onyomi, ...point.kunyomi];
  const correct = seededPick(readings, `${seed}:r`);
  const pool = distractorPool(levelPoints, point.id, (p) => [...p.onyomi, ...p.kunyomi]);
  const distractors = pickDistractors(pool, correct, 3, `${seed}:d`);
  const { list, answerIndex } = shuffleWithAnswer([correct, ...distractors], `${seed}:c`);
  return {
    id: seed, itemType: 'kanji', itemId: point.id, kind: 'choice',
    prompt: `Как читается «${point.char}»?`,
    choices: list, answerIndex,
  };
};

/**
 * Kanji has no cloze/assemble analogue (no example sentences), and both
 * generators above always succeed (validateKanji guarantees ≥1 reading and a
 * non-empty meaning) -- so there's no rotation/fallback chain like grammar's,
 * just a 2-way alternation by reps parity.
 */
export function generateKanjiQuestion(
  point: KanjiPoint,
  levelPoints: readonly KanjiPoint[],
  reps: number,
  seed: string,
): Question {
  const wantReading = ((reps % 2) + 2) % 2 === 1;
  return wantReading ? genKanjiReading(point, levelPoints, seed) : genKanjiMeaning(point, levelPoints, seed);
}
