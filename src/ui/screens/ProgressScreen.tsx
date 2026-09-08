import { useState } from 'react';
import { useUserDb } from '@/ui/useUserDb';
import { useContentDb, useEffectiveLevels } from '@/ui/useContentDb';
import { levelRibbon, levelBars, statusCounts, levelCompletion, streak, heatmap } from '@/core/progress';
import { unlockLevel, UNLOCK_THRESHOLD } from '@/core/levels';
import { ProgressBar } from '@/ui/components/ProgressBar';
import { Heatmap } from '@/ui/components/Heatmap';
import type { ItemType } from '@/core/types';

const CATEGORY_LABEL: Record<ItemType, string> = {
  grammar: 'Грамматика',
  kanji: 'Кандзи',
  vocab: 'Слова',
};

export function ProgressScreen() {
  const user = useUserDb();
  const content = useContentDb();
  const levels = useEffectiveLevels();
  const now = new Date();
  const [, setTick] = useState(0);

  if (levels.length === 0) {
    return (
      <section className="progress">
        <h1>Прогресс</h1>
        <p>Нет данных об уровнях.</p>
      </section>
    );
  }

  const ribbon = levelRibbon(user, content);
  const active = levels.find((l) => l.status === 'available')?.code ?? levels[0]!.code;
  const st = streak(user, now);
  const cells = heatmap(user, now, 17);

  // The next shipped-but-locked level, if any.
  const activeOrd = levels.find((l) => l.code === active)!.ord;
  const nextLocked = levels
    .filter((l) => l.ord > activeOrd && l.rawStatus === 'available' && l.status === 'locked')
    .sort((a, b) => a.ord - b.ord)[0];
  const completion = levelCompletion(user, content, active);

  return (
    <section className="progress">
      <h1>Прогресс</h1>

      <div className="ribbon">
        {ribbon.map((seg) => (
          <div key={seg.code} className={`ribbon-seg ${seg.status}`}>
            <span className="ribbon-code">{seg.code}</span>
            <div className="ribbon-track">
              <div
                className="ribbon-fill"
                style={{ width: `${Math.round(seg.fill * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {(['grammar', 'kanji', 'vocab'] as ItemType[]).map((type) => {
        const bars = levelBars(user, content, active, type);
        const counts = statusCounts(user, content, active, type);
        return (
          <div key={type} className="progress-category">
            <h2>{CATEGORY_LABEL[type]} {active}</h2>
            <ProgressBar label="Изучено" value={bars.studied} total={bars.total} />
            <ProgressBar label="Закреплено" value={bars.consolidated} total={bars.total} />
            <div className="status-counts">
              <span>Новые {counts.new}</span>
              <span>Изучаются {counts.learning}</span>
              <span>Изучено {counts.learned}</span>
              <span>Освоено {counts.mastered}</span>
            </div>
          </div>
        );
      })}

      <h2>Активность</h2>
      <Heatmap cells={cells} />
      <p className="streak">Стрик {st.current} · рекорд {st.best}</p>

      {nextLocked && (
        <div className="unlock-rule">
          <p>
            {nextLocked.code} откроется при {Math.round(UNLOCK_THRESHOLD * 100)}% «закреплено»
            по {active}. Сейчас: {Math.round(completion * 100)}%.
          </p>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              unlockLevel(user, nextLocked.code);
              setTick((n) => n + 1);
            }}
          >
            Открыть {nextLocked.code} сейчас
          </button>
        </div>
      )}
    </section>
  );
}
