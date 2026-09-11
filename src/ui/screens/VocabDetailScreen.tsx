import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useContentDb } from '../useContentDb';
import { LevelBadge } from '../components/LevelBadge';
import type { ContentDb } from '@/storage/content-db';
import type { KanjiPoint } from '@/core/types';

/** JLPT shipped level codes to try when resolving a headword's kanji — cheapest
 *  is the word's own level, but a word can combine kanji taught at another. */
const KANJI_LEVEL_GUESSES = ['N5', 'N4'];

function kanjiInHeadword(db: ContentDb, headword: string, ownLevel: string): KanjiPoint[] {
  const levels = [ownLevel, ...KANJI_LEVEL_GUESSES.filter((l) => l !== ownLevel)];
  const out: KanjiPoint[] = [];
  const seen = new Set<string>();
  for (const ch of new Set(headword)) {
    for (const level of levels) {
      const k = db.getKanji(`${level.toLowerCase()}-${ch}`);
      if (k && !seen.has(k.id)) {
        seen.add(k.id);
        out.push(k);
        break;
      }
    }
  }
  return out;
}

export function VocabDetailScreen() {
  const { id = '' } = useParams();
  const db = useContentDb();
  const point = useMemo(() => db.getVocab(id), [db, id]);
  const kanjiBreakdown = useMemo(
    () => (point ? kanjiInHeadword(db, point.headword, point.level) : []),
    [db, point],
  );

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
      {kanjiBreakdown.length > 0 && (
        <>
          <h2>Кандзи в этом слове</h2>
          <ul className="related">
            {kanjiBreakdown.map((k) => (
              <li key={k.id}>
                <Link to={`/kanji/${k.id}`}>{k.char} · {k.meaningRu}</Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
