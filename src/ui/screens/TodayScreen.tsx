import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useUserDb } from '@/ui/useUserDb';
import { useContentDb } from '@/ui/useContentDb';
import { daySummary } from '@/core/scheduler';
import { streak } from '@/core/progress';
import { currentCourseLessonId, courseCompletedIds } from '@/core/course';

function relative(iso: string, now: Date): string {
  const ms = new Date(iso).getTime() - now.getTime();
  const h = Math.round(ms / 3_600_000);
  if (h < 1) return 'меньше часа';
  if (h < 24) return `${h} ч`;
  return `${Math.round(h / 24)} дн`;
}

export function TodayScreen() {
  const user = useUserDb();
  const content = useContentDb();
  const now = new Date();
  const [skipped, setSkipped] = useState(false);

  const showPlacementOffer =
    !skipped &&
    !user.getSetting('placement_offered', false) &&
    user.allCards('grammar').length === 0;

  if (showPlacementOffer) {
    return (
      <section className="today placement-offer">
        <h1>Сегодня</h1>
        <p className="today-line">Хотите пройти вступительный тест?</p>
        <p className="today-hint">
          Он определит, что вы уже знаете, и пропустит это при изучении.
        </p>
        <p className="today-hint">
          Тесты по кандзи и словам — в их разделах или в Настройках.
        </p>
        <div className="placement-offer-actions">
          <Link className="btn-primary" to="/placement/grammar">
            Пройти
          </Link>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              user.setSetting('placement_offered', true);
              setSkipped(true);
            }}
          >
            Пропустить
          </button>
        </div>
      </section>
    );
  }

  const s = daySummary(user, content, now);
  const st = streak(user, now);

  const points = content.listCourseGrammar();
  const completedSet = new Set(courseCompletedIds(user));
  const hasCard = (id: string) => user.getCard('grammar', id) != null;
  const curId = currentCourseLessonId(points, completedSet, hasCard);
  const curPoint = curId ? points.find((p) => p.id === curId) ?? null : null;

  const miniMark = s.miniTestEligible ? (s.reviewedToday > 0 ? '✓' : '—') : '—';
  const showStart =
    s.dueCount > 0 || (s.miniTestEligible && s.reviewedToday === 0);

  return (
    <section className="today">
      <h1>Сегодня</h1>
      {s.allDone ? (
        <>
          <p className="today-line">
            На сегодня всё · мини-тест {miniMark} · стрик {st.current}
          </p>
          {s.nextDueAt && (
            <p className="today-hint">Следующая карточка — через {relative(s.nextDueAt, now)}</p>
          )}
          {showStart && (
            <Link className="btn-primary" to="/review">Начать</Link>
          )}
        </>
      ) : (
        <>
          <p className="today-line">
            {s.dueCount} повторить · мини-тест {miniMark} · стрик {st.current}
          </p>
          {s.queueOverCap && (
            <p className="today-hint">Очередь повторений переполнена — часть карточек перенесена на потом.</p>
          )}
          {showStart && <Link className="btn-primary" to="/review">Начать</Link>}
        </>
      )}
      {curPoint ? (
        <Link className="btn-ghost today-course" to={`/course/${curPoint.id}`}>
          {completedSet.size === 0 ? 'Начать курс' : 'Продолжить курс'} · {curPoint.title}
        </Link>
      ) : (
        <Link className="btn-ghost today-course" to="/course">Курс</Link>
      )}
      {s.miniTestEligible && (
        <Link className="btn-ghost today-course" to="/minitest">Мини-тест</Link>
      )}
    </section>
  );
}
