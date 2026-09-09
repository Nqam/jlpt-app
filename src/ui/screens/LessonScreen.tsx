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
import { review, newCard } from '@/core/srs';

/** 0 New · 1 Read · 2 Comprehension · 3 Reinforce · 4 Summary */
const LAST_STEP = 4;

export function LessonScreen() {
  const { id = '' } = useParams();
  const db = useContentDb();
  const user = useUserDb();
  const lesson = useMemo(() => db.getLesson(id), [db, id]);
  const metas = useMemo(() => db.listLessons(), [db]);

  const hasIntroduces = lesson ? !lesson.isFreeReading : false;
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

  const goBack = () => {
    let s = step - 1;
    while (s > 0 && isSkipped(s)) s -= 1;
    if (s < 0) s = 0;
    setStep(s);
    setCourseStep(user, id, s);
  };

  useEffect(() => {
    if (step !== LAST_STEP || completedRef.current) return;
    completedRef.current = true;
    if (isLessonComplete(user, id)) return;

    const now = new Date();
    const params = {
      requestRetention: user.getSetting('fsrs_request_retention', 0.9),
      maximumInterval: user.getSetting('fsrs_maximum_interval', 365),
      enableFuzz: user.getSetting('fsrs_enable_fuzz', true),
    };
    for (const it of lesson?.introduces ?? []) {
      if (it.role !== 'introduce') continue;
      if (user.getCard(it.type, it.id)) continue;
      // Rating 3 ("Хорошо"): just taught — should resurface in ~10 min / next day.
      const { card } = review(newCard(it.type, it.id, now), 3, now, 0, params);
      user.upsertCard(card);
    }
    markLessonComplete(user, id);
  }, [step, user, id, lesson]);

  if (!lesson) {
    return (
      <section className="screen lesson-screen">
        <p className="muted">Урок не найден.</p>
        <Link to="/course" className="back-link">← К текстам</Link>
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
        <Link to="/course" className="back-link">← К текстам</Link>
      )}
      <h1>{lesson.title}</h1>

      {step >= 1 && step <= 3 && (
        <button type="button" className="btn-ghost lesson-back" onClick={goBack}>← Назад</button>
      )}

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
            <Link to="/course" className="btn-ghost">К текстам</Link>
            {next && <Link to={`/lesson/${next}`} className="btn-primary">Следующий урок</Link>}
          </div>
        </div>
      )}
    </section>
  );
}
