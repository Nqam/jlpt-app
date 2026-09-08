import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useContentDb, useEffectiveLevels } from '../useContentDb';
import { LevelBadge } from '../components/LevelBadge';

export function VocabListScreen() {
  const db = useContentDb();
  const levels = useEffectiveLevels();
  const [activeLevel, setActiveLevel] = useState(levels[0]?.code ?? '');
  const [query, setQuery] = useState('');

  const activeLevelObj = levels.find((l) => l.code === activeLevel);
  const prevLevel = activeLevelObj
    ? levels.filter((l) => l.ord < activeLevelObj.ord).sort((a, b) => b.ord - a.ord)[0]?.code
    : undefined;
  const points = useMemo(() => {
    if (query.trim()) return db.searchVocab(query);
    return db.listVocab(activeLevel);
  }, [db, activeLevel, query]);

  return (
    <section className="screen">
      <h1>Слова</h1>
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
        aria-label="Поиск по слову, чтению или значению"
        placeholder="Поиск по слову, чтению или значению…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="vocab-search"
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
        <ul className="vocab-list">
          {points.map((p) => (
            <li key={p.id}>
              <Link to={`/vocab/${p.id}`} className="vocab-list-item">
                <span className="vocab-headword">{p.headword}</span>
                {p.headword !== p.reading ? <span className="vocab-reading">{p.reading}</span> : null}
                <span className="vocab-meaning">{p.meaningRu}</span>
                {query ? <LevelBadge level={p.level} /> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
