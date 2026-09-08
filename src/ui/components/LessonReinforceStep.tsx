import { useMemo, useState } from 'react';
import type { LessonFull } from '@/core/types';
import { useContentDb } from '../useContentDb';
import { buildReinforceQuestions } from '@/core/quiz/lesson-reinforce';
import { QuestionView } from './QuestionView';
import { grade } from '@/core/quiz/grade';
import type { Answer, GradedAnswer } from '@/core/quiz/types';

export function LessonReinforceStep({
  lesson, onDone,
}: {
  lesson: LessonFull;
  onDone: () => void;
}) {
  const db = useContentDb();
  const [seed] = useState(() => `${lesson.id}:${Date.now()}`);
  const items = useMemo(
    () => buildReinforceQuestions(lesson, db, seed),
    [lesson, db, seed],
  );

  const [idx, setIdx] = useState(0);
  const [graded, setGraded] = useState<GradedAnswer | null>(null);

  if (items.length === 0) {
    return (
      <div className="reinforce">
        <p className="muted">Нечего закреплять — сразу к итогу.</p>
        <button type="button" className="btn-primary" onClick={onDone}>Дальше</button>
      </div>
    );
  }

  const item = items[idx]!;
  const last = idx + 1 >= items.length;

  const answer = (a: Answer) => {
    if (graded) return;
    setGraded(grade(item.question, a));
  };
  const next = () => {
    if (last) { onDone(); return; }
    setIdx((n) => n + 1);
    setGraded(null);
  };

  return (
    <div className="reinforce">
      {item.contextRu && <p className="reinforce-context">{item.contextRu}</p>}
      <QuestionView
        key={item.question.id}
        question={item.question}
        onAnswer={answer}
        revealed={graded}
        showExplainLink={false}
      />
      {graded && (
        <button type="button" className="btn-primary" onClick={next}>
          {last ? 'Завершить' : 'Далее'}
        </button>
      )}
    </div>
  );
}
