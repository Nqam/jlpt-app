import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useContentDb } from '../useContentDb';
import { LevelBadge } from '../components/LevelBadge';

export function KanjiDetailScreen() {
  const { id = '' } = useParams();
  const db = useContentDb();
  const point = useMemo(() => db.getKanji(id), [db, id]);

  if (!point) {
    return (
      <section className="screen">
        <p className="muted">Кандзи не найден.</p>
        <Link to="/kanji" className="back-link">
          ← Кандзи
        </Link>
      </section>
    );
  }

  return (
    <section className="screen kanji-detail">
      <Link to="/kanji" className="back-link">
        ← Кандзи
      </Link>
      <h1 className="kanji-detail-char">
        {point.char} <LevelBadge level={point.level} />
      </h1>
      <p className="kanji-detail-meaning">{point.meaningRu}</p>
      <dl className="kanji-detail-readings">
        <dt>Онное чтение</dt>
        <dd>{point.onyomi.length ? point.onyomi.join('、') : '—'}</dd>
        <dt>Кунное чтение</dt>
        <dd>{point.kunyomi.length ? point.kunyomi.join('、') : '—'}</dd>
        <dt>Количество черт</dt>
        <dd>{point.strokeCount}</dd>
      </dl>
    </section>
  );
}
