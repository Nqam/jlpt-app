import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useContentDb, useEffectiveLevels } from '../useContentDb';
import { useUserDb } from '../useUserDb';

/**
 * Переходный шим до плана 5-2: у урока нет `level`, только сквозной `stage`.
 * Мигрированные тексты получили stage 2..18 (условно N5) и 42..52 (условно N4).
 * План 5-2 заменит вкладки уровней на единый список курса по `stage`.
 */
const STAGE_LEVEL_SPLIT = 40;
const levelOfStage = (stage: number): string => (stage < STAGE_LEVEL_SPLIT ? 'N5' : 'N4');

export function TextsListScreen() {
  const db = useContentDb();
  const levels = useEffectiveLevels();
  const user = useUserDb();
  const [activeLevel, setActiveLevel] = useState(levels[0]?.code ?? '');

  const activeLevelObj = levels.find((l) => l.code === activeLevel);
  const allLessons = useMemo(() => db.listLessons(), [db]);
  const points = useMemo(
    () => allLessons.filter((l) => levelOfStage(l.stage) === activeLevel),
    [allLessons, activeLevel],
  );
  const readIds = user.getSetting<string[]>('texts_read_ids', []);

  return (
    <section className="screen">
      <h1>Тексты</h1>
      <div role="tablist" className="level-tabs">
        {levels.map((l) => (
          <button
            key={l.code}
            role="tab"
            type="button"
            aria-selected={l.code === activeLevel}
            className="level-tab"
            onClick={() => setActiveLevel(l.code)}
          >
            {l.code}
          </button>
        ))}
      </div>
      {activeLevelObj?.status === 'coming_soon' || activeLevelObj?.status === 'locked' ? (
        <p className="muted">Материал уровня {activeLevel} появится позже.</p>
      ) : points.length === 0 ? (
        <p className="muted">Текстов пока нет.</p>
      ) : (
        <ul className="text-list">
          {points.map((p) => (
            <li key={p.id}>
              <Link to={`/texts/${p.id}`} className="text-list-item">
                <span className="text-list-title">{p.title}</span>
                {readIds.includes(p.id) ? (
                  <span className="text-read-badge" aria-label="прочитано">✓</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
