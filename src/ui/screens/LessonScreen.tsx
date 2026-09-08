import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useContentDb } from '../useContentDb';
import { useUserDb } from '../useUserDb';
import {
  getCourseStep, setCourseStep, markLessonComplete, isLessonComplete,
  courseCompletedIds, nextUnlockedLessonId,
} from '@/core/course';
import { LessonNewStep } from '../components/LessonNewStep';
import { LessonReader } from '../components/LessonReader';
import { ComprehensionQuiz } from '../components/ComprehensionQuiz';
import { LessonReinforceStep } from '../components/LessonReinforceStep';

/** 0 New · 1 Read · 2 Comprehension · 3 Reinforce · 4 Summary */
const LAST_STEP = 4;

export function LessonScreen() {
  const { id = '' } = useParams();
  const db = useContentDb();
  const user = useUserDb();
  const lesson = useMemo(() => db.getLesson(id), [db, id]);
  const metas = useMemo(() => db.listLessons(), [db]);

  const hasIntroduces = (lesson?.introduces.length ?? 0) > 0;
  // Free-reading lessons have no New/Reinforce steps.
  const isSkipped = (step: number) => !hasIntroduces && (step === 0 || step === 3);

  const clampFrom = (raw: number): number => {
    let s = Math.max(0, Math.min(raw, LAST_STEP));
    while (s < LAST_STEP && isSkipped(s)) s += 1;
    return s;
  };

  const [step, setStep] = useState(() => clampFrom(getCourseStep(user, id)));
  const completedRef = useRef(false);

  const go = (next: number) => {
    const s = clampFrom(next);
    setStep(s);
    if (s < LAST_STEP) setCourseStep(user, id, s);
  };

  useEffect(() => {
    if (step !== LAST_STEP || completedRef.current) return;
    completedRef.current = true;
    if (!isLessonComplete(user, id)) markLessonComplete(user, id);
  }, [step, user, id]);

  if (!lesson) {
    return (
      <section className="screen lesson-screen">
        <p className="muted">Урок не найден.</p>
        <Link to="/course" className="back-link">← К курсу</Link>
      </section>
    );
  }

  const next = nextUnlockedLessonId(
    metas,
    new Set([...courseCompletedIds(user), id]),
    id,
  );

  return (
    <section className="screen lesson-screen">
      {step !== LAST_STEP && (
        <Link to="/course" className="back-link">← К курсу</Link>
      )}
      <h1>{lesson.title}</h1>

      {step === 0 && (
        <LessonNewStep introduces={lesson.introduces} onDone={() => go(1)} />
      )}

      {step === 1 && (
        <div className="lesson-step">
          <LessonReader lesson={lesson} />
          <button type="button" className="btn-primary" onClick={() => go(2)}>Дальше</button>
        </div>
      )}

      {step === 2 && (
        lesson.questions.length > 0 ? (
          <ComprehensionQuiz questions={lesson.questions} onFinish={() => go(3)} />
        ) : (
          <div className="lesson-step">
            <p className="muted">Вопросов на понимание нет.</p>
            <button type="button" className="btn-primary" onClick={() => go(3)}>Дальше</button>
          </div>
        )
      )}

      {step === 3 && (
        <LessonReinforceStep lesson={lesson} onDone={() => go(4)} />
      )}

      {step === 4 && (
        <div className="lesson-summary">
          <p className="lesson-summary-title">Урок пройден ✓</p>
          <div className="lesson-summary-actions">
            <Link to="/course" className="btn-ghost">К курсу</Link>
            {next && <Link to={`/lesson/${next}`} className="btn-primary">Следующий урок</Link>}
          </div>
        </div>
      )}
    </section>
  );
}
