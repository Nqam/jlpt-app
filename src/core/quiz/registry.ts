import type { GrammarPointFull } from '@/storage/content-db';
import type { Question, QuestionKind } from '@/core/quiz/types';
import { genCloze, genChoice, genAssemble, type GrammarGenerator }
  from '@/core/quiz/grammar-questions';

export const ROTATION: readonly QuestionKind[] = ['cloze', 'choice', 'assemble'];
const FALLBACK: readonly QuestionKind[] = ['assemble', 'cloze', 'choice'];

const GENERATORS: Record<QuestionKind, GrammarGenerator> = {
  cloze: genCloze,
  choice: genChoice,
  assemble: genAssemble,
};

function tryChain(
  kinds: readonly QuestionKind[],
  point: GrammarPointFull,
  levelPoints: readonly GrammarPointFull[],
  seedFor: (kind: QuestionKind, attempt: number) => string,
): Question {
  for (let i = 0; i < kinds.length; i++) {
    const kind = kinds[i]!;
    const q = GENERATORS[kind](point, levelPoints, seedFor(kind, i));
    if (q) return q;
  }
  throw new Error(`quiz registry: no generator produced a question for ${point.id}`);
}

export function generateForCard(
  point: GrammarPointFull,
  levelPoints: readonly GrammarPointFull[],
  reps: number,
  dayKey: string,
): Question {
  const primary = ROTATION[((reps % 3) + 3) % 3]!;
  return tryChain(
    [primary, ...FALLBACK],
    point,
    levelPoints,
    (kind) => `${point.id}:${dayKey}:${kind}`,
  );
}

export function generateOfKind(
  kind: QuestionKind,
  point: GrammarPointFull,
  levelPoints: readonly GrammarPointFull[],
  idSeed: string,
): Question {
  return tryChain(
    [kind, ...FALLBACK],
    point,
    levelPoints,
    (k, attempt) => (attempt === 0 ? idSeed : `${idSeed}:fb:${k}`),
  );
}
