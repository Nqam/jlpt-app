import { useState } from 'react';
import type { LessonQuestion } from '@/core/types';

export function ComprehensionQuiz({
  questions, onFinish,
}: {
  questions: LessonQuestion[];
  onFinish: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);

  const q = questions[idx];
  if (!q) return null;

  const last = idx + 1 >= questions.length;

  const choose = (i: number) => {
    if (picked !== null) return;
    setPicked(i);
  };
  const next = () => {
    if (last) { onFinish(); return; }
    setIdx((n) => n + 1);
    setPicked(null);
  };

  return (
    <div className="q comprehension-q">
      <p className="q-prompt">{q.prompt}</p>
      <div className="q-options">
        {q.choices.map((c, i) => {
          const cls = ['q-opt'];
          if (picked !== null) {
            if (i === q.answerIndex) cls.push('opt-correct');
            else if (i === picked) cls.push('opt-wrong');
          }
          return (
            <button
              key={i}
              type="button"
              className={cls.join(' ')}
              disabled={picked !== null}
              onClick={() => choose(i)}
            >
              {c}
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <>
          <p
            className={picked === q.answerIndex ? 'verdict-ok' : 'verdict-bad'}
            role="status"
          >
            {picked === q.answerIndex ? 'Верно' : 'Неверно'}
          </p>
          <button type="button" className="btn-primary" onClick={next}>
            {last ? 'Завершить' : 'Далее'}
          </button>
        </>
      )}
    </div>
  );
}
