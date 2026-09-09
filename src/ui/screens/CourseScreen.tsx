import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useContentDb } from '../useContentDb';
import { useUserDb } from '../useUserDb';
import { currentCourseLessonId, courseLessonState, type CourseState } from '@/core/course';

const STATE_LABEL: Record<CourseState, string> = {
  done: '✓ пройден',
  current: '● текущий',
  ahead: '',
};

export function CourseScreen() {
  const db = useContentDb();
  const user = useUserDb();
  const points = useMemo(() => db.listCourseGrammar(), [db]);
  const completed = user.getSetting<string[]>('course_completed_ids', []);
  const completedSet = useMemo(() => new Set(completed), [completed]);
  const carded = useMemo(() => new Set(user.allCards('grammar').map((c) => c.item_id)), [user]);
  const hasCard = (id: string) => carded.has(id);
  const currentId = currentCourseLessonId(points, completedSet, hasCard);
  const current = currentId ? points.find((p) => p.id === currentId) ?? null : null;

  // Levels the course actually has content for, in course order.
  const levels = useMemo(() => {
    const seen = new Set<string>();
    return points.map((p) => p.level).filter((l) => (seen.has(l) ? false : seen.add(l)));
  }, [points]);
  const [activeLevel, setActiveLevel] = useState(() => current?.level ?? levels[0] ?? '');
  const rows = useMemo(
    () => points.filter((p) => p.level === activeLevel),
    [points, activeLevel],
  );

  return (
    <section className="screen course">
      <h1>Курс</h1>

      {current ? (
        <Link to={`/course/${current.id}`} className="btn-primary course-continue">
          {completedSet.size === 0 ? 'Начать курс' : 'Продолжить'} · {current.title}
        </Link>
      ) : (
        <p className="muted">Курс пройден — все пункты грамматики изучены.</p>
      )}

      <div role="tablist" className="level-tabs">
        {levels.map((code) => (
          <button
            key={code}
            role="tab"
            type="button"
            aria-selected={code === activeLevel}
            className="level-tab"
            onClick={() => setActiveLevel(code)}
          >
            {code}
          </button>
        ))}
      </div>

      <ul className="course-list">
        {rows.map((p) => {
          const state = courseLessonState(p, currentId, completedSet, hasCard);
          return (
            <li key={p.id} className="course-item" data-lesson={p.id} data-state={state} data-level={p.level}>
              <Link to={`/course/${p.id}`} className="course-item-link">
                <span className="course-item-title">{p.title}</span>
                <span className="course-item-state" data-state={state}>{STATE_LABEL[state]}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
