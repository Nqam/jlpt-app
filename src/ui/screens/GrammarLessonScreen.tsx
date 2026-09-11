import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useContentDb } from '../useContentDb';
import { useUserDb } from '../useUserDb';
import {
  getCourseStep, setCourseStep, markLessonComplete, isLessonComplete,
  nextCourseLessonId,
} from '@/core/course';
import { GrammarPointBody } from '../components/GrammarPointBody';
import { GrammarReinforceStep } from '../components/GrammarReinforceStep';
import { LevelBadge } from '../components/LevelBadge';
import { review, newCard } from '@/core/srs';
import { recordActivity } from '@/core/progress';

/** 0 Изучение · 1 Закрепление · 2 Итог */
const LAST_STEP = 2;

export function GrammarLessonScreen() {
  const { grammarId = '' } = useParams();
  const db = useContentDb();
  const user = useUserDb();
  const point = useMemo(() => db.getGrammar(grammarId), [db, grammarId]);
  const courseIds = useMemo(
    () => db.listCourseGrammar().map((p) => ({ id: p.id })),
    [db],
  );

  const [step, setStep] = useState(() =>
    Math.max(0, Math.min(getCourseStep(user, grammarId), LAST_STEP)),
  );
  const completedRef = useRef(false);

  const go = (next: number) => {
    const s = Math.max(0, Math.min(next, LAST_STEP));
    setStep(s);
    if (s < LAST_STEP) setCourseStep(user, grammarId, s);
  };

  useEffect(() => {
    if (step !== LAST_STEP || completedRef.current) return;
    completedRef.current = true;
    if (isLessonComplete(user, grammarId)) return;

    const now = new Date();
    const params = {
      requestRetention: user.getSetting('fsrs_request_retention', 0.9),
      maximumInterval: user.getSetting('fsrs_maximum_interval', 365),
      enableFuzz: user.getSetting('fsrs_enable_fuzz', true),
    };
    const create = (type: 'grammar' | 'kanji' | 'vocab', id: string) => {
      if (user.getCard(type, id)) return;
      const { card } = review(newCard(type, id, now), 3, now, 0, params);
      user.upsertCard(card);
    };
    if (point) {
      create('grammar', point.id);
      for (const kid of point.kanjiIds) {
        if (db.getKanji(kid)) create('kanji', kid);
      }
      for (const vid of point.introducesVocab ?? []) {
        if (db.getVocab(vid)) create('vocab', vid);
      }
    }
    markLessonComplete(user, grammarId);
    recordActivity(user, now);
  }, [step, user, grammarId, point, db]);

  if (!point) {
    return (
      <section className="screen lesson-screen">
        <p className="muted">Пункт не найден.</p>
        <Link to="/course" className="back-link">← К курсу</Link>
      </section>
    );
  }

  const next = nextCourseLessonId(courseIds, grammarId);

  return (
    <section className="screen lesson-screen grammar-lesson">
      {step !== LAST_STEP && <Link to="/course" className="back-link">← К курсу</Link>}
      <h1>{point.title} <LevelBadge level={point.level} /></h1>

      {step === 0 && (
        <div className="lesson-step">
          <GrammarPointBody point={point} />
          <button type="button" className="btn-primary" onClick={() => go(1)}>Понятно</button>
        </div>
      )}

      {step === 1 && <GrammarReinforceStep point={point} onDone={() => go(2)} />}

      {step === 2 && (
        <div className="lesson-summary">
          <p className="lesson-summary-title">Пункт пройден ✓</p>
          <div className="lesson-summary-actions">
            <Link to="/course" className="btn-ghost">К курсу</Link>
            {next && <Link to={`/course/${next}`} className="btn-primary">Следующий пункт</Link>}
          </div>
        </div>
      )}
    </section>
  );
}
