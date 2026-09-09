import { Fragment, useMemo } from 'react';
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

      <ul className="course-list">
        {points.map((p, i) => {
          const state = courseLessonState(p, currentId, completedSet, hasCard);
          const newLevel = i === 0 || points[i - 1]!.level !== p.level;
          return (
            <Fragment key={p.id}>
              {newLevel && (
                <li className="course-level-header" data-level={p.level} aria-hidden>
                  {p.level}
                </li>
              )}
              <li className="course-item" data-lesson={p.id} data-state={state} data-level={p.level}>
                <Link to={`/course/${p.id}`} className="course-item-link">
                  <span className="course-item-title">{p.title}</span>
                  <span className="course-item-state" data-state={state}>{STATE_LABEL[state]}</span>
                </Link>
              </li>
            </Fragment>
          );
        })}
      </ul>
    </section>
  );
}
