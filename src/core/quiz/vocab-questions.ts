import type { VocabPoint } from '@/core/types';
import type { ChoiceQuestion, Question } from '@/core/quiz/types';
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
 * Alternates meaning/reading by reps parity, same as kanji -- EXCEPT a
 * kana-only word (headword === reading, e.g. "あんな") has no reading
 * question worth asking ("how is it read?" when the headword already IS the
 * reading is trivial), so it always gets a meaning question.
 */
export function generateVocabQuestion(
  point: VocabPoint,
  levelPoints: readonly VocabPoint[],
  reps: number,
  seed: string,
): Question {
  if (point.headword === point.reading) return genVocabMeaning(point, levelPoints, seed);
  const wantReading = ((reps % 2) + 2) % 2 === 1;
  return wantReading ? genVocabReading(point, levelPoints, seed) : genVocabMeaning(point, levelPoints, seed);
}
