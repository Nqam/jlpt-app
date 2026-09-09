import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useContentDb } from '../useContentDb';
import { useUserDb } from '../useUserDb';
import {
  courseLessonStates, currentMandatoryLessonId,
  type CourseLessonState,
} from '@/core/course';

const STATE_LABEL: Record<CourseLessonState, string> = {
  done: '✓ пройден',
  current: 'текущий',
  'unlocked-reading': 'чтение',
  locked: '🔒 закрыт',
};

export function CourseScreen() {
  const db = useContentDb();
  const user = useUserDb();
  const lessons = useMemo(() => db.listLessons(), [db]);
  const completed = user.getSetting<string[]>('course_completed_ids', []);
  const completedSet = useMemo(() => new Set(completed), [completed]);
  const states = useMemo(
    () => courseLessonStates(lessons, completedSet),
    [lessons, completedSet],
  );
  const currentId = useMemo(
    () => currentMandatoryLessonId(lessons, completedSet),
    [lessons, completedSet],
  );
  const current = currentId ? lessons.find((l) => l.id === currentId) ?? null : null;

  return (
    <section className="screen course">
      <h1>Тексты</h1>

      {current && (
        <Link to={`/lesson/${current.id}`} className="btn-primary course-continue">
          Продолжить · этап {current.stage}: {current.title}
        </Link>
      )}

      <ul className="course-list">
        {lessons.map((l) => {
          const state = states.get(l.id) ?? 'locked';
          const label = STATE_LABEL[state];
          const inner = (
            <>
              <span className="course-item-title">{l.title}</span>
              <span className="course-item-state" data-state={state}>{label}</span>
            </>
          );
          return (
            <li key={l.id} className="course-item" data-lesson={l.id} data-state={state}>
              {state === 'locked' ? (
                <span className="course-item-link course-item-link--locked" aria-disabled>
                  {inner}
                </span>
              ) : (
                <Link to={`/lesson/${l.id}`} className="course-item-link">{inner}</Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
