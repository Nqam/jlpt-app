import type { Question, Answer, GradedAnswer } from '@/core/quiz/types';

const AGAIN: GradedAnswer = { correct: false, rating: 1 };
const GOOD: GradedAnswer = { correct: true, rating: 3 };

export function grade(question: Question, answer: Answer): GradedAnswer {
  if (question.kind === 'assemble') {
    if (answer.kind !== 'order') return AGAIN;
    const want = question.answerOrder;
    const got = answer.value;
    if (got.length !== want.length) return AGAIN;
    return got.every((v, i) => v === want[i]) ? GOOD : AGAIN;
  }
  // cloze | choice
  if (answer.kind !== 'index') return AGAIN;
  return answer.value === question.answerIndex ? GOOD : AGAIN;
}
