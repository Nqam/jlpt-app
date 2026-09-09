import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useContentDb } from '../useContentDb';
import { GrammarPointBody } from '../components/GrammarPointBody';
import { LevelBadge } from '../components/LevelBadge';

export function GrammarDetailScreen() {
  const { id = '' } = useParams();
  const db = useContentDb();
  const point = useMemo(() => db.getGrammar(id), [db, id]);

  if (!point) {
    return (
      <section className="screen">
        <p className="muted">Пункт грамматики не найден.</p>
        <Link to="/grammar" className="back-link">
          ← Грамматика
        </Link>
      </section>
    );
  }

  return (
    <section className="screen grammar-detail">
      <Link to="/grammar" className="back-link">
        ← Грамматика
      </Link>
      <h1>
        {point.title} <LevelBadge level={point.level} />
      </h1>

      <GrammarPointBody point={point} />

      {point.relatedTitles.length > 0 && (
        <>
          <h2>Связанные пункты</h2>
          <ul className="related">
            {point.relatedTitles.map((r) => (
              <li key={r.id}>
                <Link to={`/grammar/${r.id}`}>{r.title}</Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
