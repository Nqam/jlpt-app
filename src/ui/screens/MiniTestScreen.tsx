import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUserDb } from '@/ui/useUserDb';
import { useContentDb } from '@/ui/useContentDb';
import { buildMiniTest } from '@/core/session';
import { QuestionView } from '@/ui/components/QuestionView';
import { grade } from '@/core/quiz/grade';
import { recordActivity } from '@/core/progress';
import type { Answer, GradedAnswer } from '@/core/quiz/types';

/**
 * Standalone grammar mini-test — the same self-check that tails the daily
 * review, but reachable any time and re-takeable. Never writes to FSRS/user.db.
 */
export function MiniTestScreen() {
  const user = useUserDb();
  const content = useContentDb();
  const navigate = useNavigate();

  const [nonce, setNonce] = useState(() => Date.now());
  const steps = useMemo(
    () =>
      buildMiniTest(
        user,
        content,
        `mt:${nonce}`,
        (id, i) => `${id}:mt:${nonce}:${i}`,
        ['grammar', 'kanji', 'vocab'],
      ),
    [user, content, nonce],
  );

  const [idx, setIdx] = useState(0);
  const [graded, setGraded] = useState<GradedAnswer | null>(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });

  if (steps.length === 0) {
    return (
      <section className="screen">
        <h1>Мини-тест</h1>
        <p className="muted">
          Мини-тест откроется, когда наберётся не меньше 5 изученных карточек
          (грамматика, кандзи или слова вместе). Проходите курс, читайте
          тексты — карточки копятся.
        </p>
        <Link to="/course" className="btn-ghost">К курсу</Link>
      </section>
    );
  }

  const done = idx >= steps.length;
  if (done) {
    return (
      <section className="screen">
        <h1>Мини-тест пройден</h1>
        <p className="review-summary">Верно {score.correct} из {score.total}</p>
        <div className="lesson-summary-actions">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setNonce(Date.now());
              setIdx(0);
              setGraded(null);
              setScore({ correct: 0, total: 0 });
            }}
          >
            Ещё раз
          </button>
          <button type="button" className="btn-primary" onClick={() => navigate('/')}>
            Готово
          </button>
        </div>
      </section>
    );
  }

  const step = steps[idx]!;
  const last = idx + 1 >= steps.length;
  const answer = (a: Answer) => {
    if (graded) return;
    const g = grade(step.question, a);
    setGraded(g);
    setScore((s) => ({ correct: s.correct + (g.correct ? 1 : 0), total: s.total + 1 }));
  };
  const nextQ = () => {
    if (last) recordActivity(user, new Date());
    setIdx((i) => i + 1);
    setGraded(null);
  };

  return (
    <section className="screen review">
      <div className="review-progress">{idx + 1} / {steps.length}</div>
      <QuestionView
        key={step.question.id}
        question={step.question}
        onAnswer={answer}
        revealed={graded}
        showExplainLink
      />
      {graded && (
        <button type="button" className="btn-primary" onClick={nextQ}>
          {last ? 'Завершить' : 'Далее'}
        </button>
      )}
    </section>
  );
}
