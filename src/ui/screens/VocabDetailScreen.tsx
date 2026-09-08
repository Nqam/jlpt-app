import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useContentDb } from '../useContentDb';
import { LevelBadge } from '../components/LevelBadge';

export function VocabDetailScreen() {
  const { id = '' } = useParams();
  const db = useContentDb();
  const point = useMemo(() => db.getVocab(id), [db, id]);

  if (!point) {
    return (
      <section className="screen">
        <p className="muted">Слово не найдено.</p>
        <Link to="/vocab" className="back-link">
          ← Слова
        </Link>
      </section>
    );
  }

  return (
    <section className="screen vocab-detail">
      <Link to="/vocab" className="back-link">
        ← Слова
      </Link>
      <h1 className="vocab-detail-headword">
        {point.headword} <LevelBadge level={point.level} />
      </h1>
      <dl className="vocab-detail-fields">
        <dt>Чтение</dt>
        <dd>{point.reading}</dd>
        <dt>Часть речи</dt>
        <dd>{point.pos || '—'}</dd>
        <dt>Значение</dt>
        <dd>{point.meaningRu}</dd>
      </dl>
    </section>
  );
}
