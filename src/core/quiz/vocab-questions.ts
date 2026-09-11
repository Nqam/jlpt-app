import type { VocabPoint } from '@/core/types';
import type { ChoiceQuestion, Question, TypeQuestion } from '@/core/quiz/types';
import { pickDistractors, distractorPool, shuffleWithAnswer } from '@/core/quiz/distractors';

export const genVocabMeaning = (
  point: VocabPoint,
  levelPoints: readonly VocabPoint[],
  seed: string,
): ChoiceQuestion => {
  const pool = distractorPool(levelPoints, point.id, (p) => [p.meaningRu]);
  const distractors = pickDistractors(pool, point.meaningRu, 3, `${seed}:d`);
  const { list, answerIndex } = shuffleWithAnswer([point.meaningRu, ...distractors], `${seed}:c`);
  return {
    id: seed,
    itemType: 'vocab',
    itemId: point.id,
    kind: 'choice',
    prompt: `Что означает «${point.headword}»?`,
    choices: list,
    answerIndex,
  };
};

export const genVocabReading = (
  point: VocabPoint,
  levelPoints: readonly VocabPoint[],
  seed: string,
): ChoiceQuestion => {
  const pool = distractorPool(levelPoints, point.id, (p) => [p.reading]);
  const distractors = pickDistractors(pool, point.reading, 3, `${seed}:d`);
  const { list, answerIndex } = shuffleWithAnswer([point.reading, ...distractors], `${seed}:c`);
  return {
    id: seed,
    itemType: 'vocab',
    itemId: point.id,
    kind: 'choice',
    prompt: `Как читается «${point.headword}»?`,
    choices: list,
    answerIndex,
  };
};

/**
 * Typed-recall reading: the learner writes the kana reading instead of
 * picking it out of four choices. Production, not recognition — a stronger
 * memory signal than multiple choice. Graded by exact match after trimming
 * (see `grade.ts`), so it only makes sense where the reading is a single
 * clean kana string — exactly the words `generateVocabQuestion` already
 * excludes from reading questions altogether.
 */
export const genVocabReadingTyped = (
  point: VocabPoint,
  seed: string,
): TypeQuestion => ({
  id: seed,
  itemType: 'vocab',
  itemId: point.id,
  kind: 'type',
  prompt: `Напишите чтение «${point.headword}» хираганой`,
  answerText: [point.reading],
});

/**
 * Rotates meaning (choice) / reading (choice) / reading (typed) by reps mod
 * 3 -- EXCEPT a kana-only word (headword === reading, e.g. "あんな") has no
 * reading question worth asking ("how is it read?" when the headword already
 * IS the reading is trivial), so it always gets a meaning question.
 */
export function generateVocabQuestion(
  point: VocabPoint,
  levelPoints: readonly VocabPoint[],
  reps: number,
  seed: string,
): Question {
  if (point.headword === point.reading) return genVocabMeaning(point, levelPoints, seed);
  switch (((reps % 3) + 3) % 3) {
    case 1: return genVocabReading(point, levelPoints, seed);
    case 2: return genVocabReadingTyped(point, seed);
    default: return genVocabMeaning(point, levelPoints, seed);
  }
}
