import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useContentDb, useLevels } from '../useContentDb';
import { useUserDb } from '../useUserDb';

export function TextsListScreen() {
  const db = useContentDb();
  const levels = useLevels();
  const user = useUserDb();
  const [activeLevel, setActiveLevel] = useState(levels[0]?.code ?? '');

  const activeLevelObj = levels.find((l) => l.code === activeLevel);
  const points = useMemo(() => db.listTexts(activeLevel), [db, activeLevel]);
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
      {activeLevelObj?.status === 'coming_soon' ? (
        <p className="muted">Материал уровня {activeLevel} появится скоро.</p>
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
