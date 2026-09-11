import type { Question, Answer, GradedAnswer } from '@/core/quiz/types';

const AGAIN: GradedAnswer = { correct: false, rating: 1 };

/** Below this response time, a correct answer reads as confident recall (Easy). */
const FAST_MS = 4_000;
/** Above this, a correct answer reads as effortful recall (Hard). */
const SLOW_MS = 15_000;

/** Trim + collapse internal whitespace — the only normalization typed kana needs. */
function normalizeTyped(s: string): string {
  return s.trim().replace(/\s+/g, '');
}

function isCorrect(question: Question, answer: Answer): boolean {
  if (question.kind === 'assemble') {
    if (answer.kind !== 'order') return false;
    const want = question.answerOrder;
    const got = answer.value;
    return got.length === want.length && got.every((v, i) => v === want[i]);
  }
  if (question.kind === 'type') {
    if (answer.kind !== 'text') return false;
    const got = normalizeTyped(answer.value);
    return got.length > 0 && question.answerText.some((a) => normalizeTyped(a) === got);
  }
  // cloze | choice
  return answer.kind === 'index' && answer.value === question.answerIndex;
}

/**
 * Grades an answer and picks an FSRS rating from it. A wrong answer is always
 * Again (1). A right one is scaled by how long it took to answer — response
 * time is the only signal auto-graded MCQ/cloze/assemble questions can offer
 * FSRS beyond bare correctness, and it is a real (if noisy) proxy for recall
 * confidence: instant recall (< `FAST_MS`) grades Easy (4), a considered but
 * unhesitant answer grades Good (3), a slow, effortful one grades Hard (2).
 *
 * `elapsedMs` defaults to a mid-band value so callers that don't care about
 * the nuance (mini-test, course reinforcement, placement — none of which
 * write to FSRS) keep the old always-Good-on-correct behaviour unchanged.
 */
export function grade(question: Question, answer: Answer, elapsedMs = 5_000): GradedAnswer {
  if (!isCorrect(question, answer)) return AGAIN;
  if (elapsedMs < FAST_MS) return { correct: true, rating: 4 };
  if (elapsedMs > SLOW_MS) return { correct: true, rating: 2 };
  return { correct: true, rating: 3 };
}
