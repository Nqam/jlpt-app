import type { KanjiPoint } from '@/core/types';

export function KanjiLearnCard({ point }: { point: KanjiPoint }) {
  return (
    <div className="learn-kanji">
      <div className="learn-kanji-char">{point.char}</div>
      <dl className="learn-kanji-readings">
        <dt>Онное чтение</dt>
        <dd>{point.onyomi.length ? point.onyomi.join('、') : '—'}</dd>
        <dt>Кунное чтение</dt>
        <dd>{point.kunyomi.length ? point.kunyomi.join('、') : '—'}</dd>
        <dt>Количество черт</dt>
        <dd>{point.strokeCount}</dd>
      </dl>
      <p className="learn-kanji-meaning">{point.meaningRu}</p>
    </div>
  );
}
