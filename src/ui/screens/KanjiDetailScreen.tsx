import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useContentDb } from '../useContentDb';
import { LevelBadge } from '../components/LevelBadge';

/** How many linked words to show before the list gets noisy for a common kanji. */
const MAX_LINKED_VOCAB = 8;

export function KanjiDetailScreen() {
  const { id = '' } = useParams();
  const db = useContentDb();
  const point = useMemo(() => db.getKanji(id), [db, id]);
  const linkedVocab = useMemo(
    () => (point ? db.searchVocab(point.char).slice(0, MAX_LINKED_VOCAB) : []),
    [db, point],
  );

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
      {linkedVocab.length > 0 && (
        <>
          <h2>Слова с этим кандзи</h2>
          <ul className="related">
            {linkedVocab.map((v) => (
              <li key={v.id}>
                <Link to={`/vocab/${v.id}`}>{v.headword} · {v.reading}</Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
