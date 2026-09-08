import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useContentDb, useEffectiveLevels } from '../useContentDb';
import { LevelBadge } from '../components/LevelBadge';

export function KanjiListScreen() {
  const db = useContentDb();
  const levels = useEffectiveLevels();
  const [activeLevel, setActiveLevel] = useState(levels[0]?.code ?? '');
  const [query, setQuery] = useState('');

  const activeLevelObj = levels.find((l) => l.code === activeLevel);
  const points = useMemo(() => {
    if (query.trim()) return db.searchKanji(query);
    return db.listKanji(activeLevel);
  }, [db, activeLevel, query]);

  return (
    <section className="screen">
      <h1>Кандзи</h1>
      <div role="tablist" className="level-tabs">
        {levels.map((l) => (
          <button
            key={l.code}
            role="tab"
            type="button"
            aria-selected={l.code === activeLevel}
            className="level-tab"
            onClick={() => {
              setActiveLevel(l.code);
              setQuery('');
            }}
          >
            {l.code}
          </button>
        ))}
      </div>
      <input
        type="search"
        aria-label="Поиск по кандзи"
        placeholder="Поиск по символу, чтению или значению…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="kanji-search"
      />
      {!query && activeLevelObj?.status === 'coming_soon' ? (
        <p className="muted">Материал уровня {activeLevel} появится скоро.</p>
      ) : !query && activeLevelObj?.status === 'locked' ? (
        <p className="muted">
          Уровень {activeLevel} откроется после 90% завершения предыдущего уровня.
        </p>
      ) : points.length === 0 ? (
        <p className="muted">Ничего не найдено.</p>
      ) : (
        <ul className="kanji-grid">
          {points.map((p) => (
            <li key={p.id}>
              <Link to={`/kanji/${p.id}`} className="kanji-grid-item">
                <span className="kanji-grid-char">{p.char}</span>
                <span className="kanji-grid-meaning">{p.meaningRu}</span>
                {query ? <LevelBadge level={p.level} /> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
