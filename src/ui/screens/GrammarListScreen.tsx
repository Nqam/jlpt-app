import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useContentDb, useEffectiveLevels } from '../useContentDb';
import { LevelBadge } from '../components/LevelBadge';

export function GrammarListScreen() {
  const db = useContentDb();
  const levels = useEffectiveLevels();
  const [activeLevel, setActiveLevel] = useState(levels[0]?.code ?? '');
  const [query, setQuery] = useState('');

  const activeLevelObj = levels.find((l) => l.code === activeLevel);
  const prevLevel = activeLevelObj
    ? levels.filter((l) => l.ord < activeLevelObj.ord).sort((a, b) => b.ord - a.ord)[0]?.code
    : undefined;
  const points = useMemo(() => {
    if (query.trim()) return db.searchGrammar(query);
    return db.listGrammar(activeLevel);
  }, [db, activeLevel, query]);

  return (
    <section className="screen">
      <h1>Грамматика</h1>
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
        aria-label="Поиск по названию"
        placeholder="Поиск по названию…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="grammar-search"
      />
      {!query && activeLevelObj?.status === 'coming_soon' ? (
        <p className="muted">Материал уровня {activeLevel} появится скоро.</p>
      ) : !query && activeLevelObj?.status === 'locked' ? (
        <p className="muted">
          {prevLevel
            ? `Уровень ${activeLevel} откроется после 90% завершения уровня ${prevLevel}.`
            : `Уровень ${activeLevel} откроется после 90% завершения предыдущего уровня.`}
        </p>
      ) : points.length === 0 ? (
        <p className="muted">Ничего не найдено.</p>
      ) : (
        <ul className="grammar-list">
          {points.map((p) => (
            <li key={p.id}>
              <Link to={`/grammar/${p.id}`} className="grammar-list-item">
                <span className="grammar-list-title">{p.title}</span>
                {query ? <LevelBadge level={p.level} /> : null}
                <span className="grammar-list-layer">слой {p.layer}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
