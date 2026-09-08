import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useContentDb } from '../useContentDb';
import { Furigana } from '../components/Furigana';
import { GrammarMarkdown } from '../components/GrammarMarkdown';
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

      <GrammarMarkdown source={point.bodyMarkdown} />

      <h2>Примеры</h2>
      <ul className="examples">
        {point.examples.map((ex, i) => (
          <li key={i} className="example">
            <div className="example-ja">
              <Furigana text={ex.jaRuby} />
            </div>
            <div className="example-ru">{ex.ru}</div>
          </li>
        ))}
      </ul>

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
