import { useUserDb } from '@/ui/useUserDb';
import { useContentDb, useLevels } from '@/ui/useContentDb';
import { levelRibbon, levelBars, statusCounts, streak, heatmap } from '@/core/progress';
import { ProgressBar } from '@/ui/components/ProgressBar';
import { Heatmap } from '@/ui/components/Heatmap';

export function ProgressScreen() {
  const user = useUserDb();
  const content = useContentDb();
  const levels = useLevels();
  const now = new Date();

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
  const bars = levelBars(user, content, active);
  const counts = statusCounts(user, content, active);
  const st = streak(user, now);
  const cells = heatmap(user, now, 17);

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

      <h2>Грамматика {active}</h2>
      <ProgressBar label="Изучено" value={bars.studied} total={bars.total} />
      <ProgressBar label="Закреплено" value={bars.consolidated} total={bars.total} />

      <div className="status-counts">
        <span>Новые {counts.new}</span>
        <span>Изучаются {counts.learning}</span>
        <span>Изучено {counts.learned}</span>
        <span>Освоено {counts.mastered}</span>
      </div>

      <h2>Активность</h2>
      <Heatmap cells={cells} />
      <p className="streak">
        Стрик {st.current} · рекорд {st.best}
      </p>

      <p className="unlock-rule">
        N4 откроется при ≥ 60 % закреплено по грамматике {active}.
      </p>
    </section>
  );
}
