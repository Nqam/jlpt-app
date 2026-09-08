import type { VocabPoint } from '@/core/types';

export function VocabLearnCard({ point }: { point: VocabPoint }) {
  const showReading = point.headword !== point.reading;
  return (
    <div className="learn-vocab">
      <div className="learn-vocab-headword">{point.headword}</div>
      <dl className="learn-vocab-fields">
        {showReading && (
          <>
            <dt>Чтение</dt>
            <dd>{point.reading}</dd>
          </>
        )}
        <dt>Часть речи</dt>
        <dd>{point.pos || '—'}</dd>
      </dl>
      <p className="learn-vocab-meaning">{point.meaningRu}</p>
    </div>
  );
}
