import { useMemo, useState } from 'react';
import type { LessonFull, LessonMarker } from '@/core/types';
import { useContentDb } from '../useContentDb';
import { sectionBody } from '@/core/quiz/grammar-questions';
import { Furigana } from './Furigana';

const SPEAKER = /^([A-Za-zА-Яа-я]{1,8}):\s*/;

/** Split one paragraph on the given marker surfaces, first occurrence, in order. */
function splitParagraph(text: string, markers: LessonMarker[]): Array<
  { kind: 'text'; value: string } | { kind: 'marker'; marker: LessonMarker }
> {
  const parts: Array<{ kind: 'text'; value: string } | { kind: 'marker'; marker: LessonMarker }> = [];
  let rest = text;
  // markers already in document order; consume each at its first occurrence in `rest`
  const pending = [...markers];
  while (rest.length > 0 && pending.length > 0) {
    // find the earliest-occurring still-pending marker in `rest`
    let bestIdx = -1;
    let bestAt = Infinity;
    pending.forEach((m, i) => {
      const at = rest.indexOf(m.surface);
      if (at !== -1 && at < bestAt) { bestAt = at; bestIdx = i; }
    });
    if (bestIdx === -1) break;
    const m = pending.splice(bestIdx, 1)[0]!;
    if (bestAt > 0) parts.push({ kind: 'text', value: rest.slice(0, bestAt) });
    parts.push({ kind: 'marker', marker: m });
    rest = rest.slice(bestAt + m.surface.length);
  }
  if (rest.length > 0) parts.push({ kind: 'text', value: rest });
  return parts;
}

export function LessonReader({ lesson }: { lesson: LessonFull }) {
  const db = useContentDb();
  const [translationShown, setTranslationShown] = useState(false);
  const [openMarker, setOpenMarker] = useState<string | null>(null);

  const paragraphs = useMemo(() => lesson.bodyRuby.split('\n\n'), [lesson.bodyRuby]);
  const translationParas = useMemo(() => lesson.translationRu.split('\n\n'), [lesson.translationRu]);

  // assign each marker to the first paragraph its surface appears in
  const markersByPara = useMemo(() => {
    const map = new Map<number, LessonMarker[]>();
    const remaining = [...lesson.markers];
    paragraphs.forEach((p, i) => {
      const here = remaining.filter((m) => p.includes(m.surface));
      for (const m of here) remaining.splice(remaining.indexOf(m), 1);
      if (here.length) map.set(i, here);
    });
    return map;
  }, [lesson.markers, paragraphs]);

  const glossFor = (m: LessonMarker): string => {
    if (m.type === 'vocab') {
      const v = db.getVocab(m.id);
      return v ? `${v.reading} — ${v.meaningRu}` : m.id;
    }
    if (m.type === 'kanji') {
      const k = db.getKanji(m.id);
      return k ? `${[...k.onyomi, ...k.kunyomi].join(' · ')} — ${k.meaningRu}` : m.id;
    }
    const g = db.getGrammar(m.id);
    return (g && sectionBody(g.bodyMarkdown, 'Кратко')) || m.id;
  };

  const renderParagraph = (text: string, paraIdx: number) => {
    const speakerMatch = lesson.kind === 'dialogue' ? text.match(SPEAKER) : null;
    const speaker = speakerMatch ? speakerMatch[1]! : null;
    const body = speaker ? text.slice(speakerMatch![0].length) : text;
    const segs = splitParagraph(body, markersByPara.get(paraIdx) ?? []);
    const inner = segs.map((s, i) =>
      s.kind === 'text' ? (
        <Furigana key={i} text={s.value} />
      ) : (
        <button
          key={i}
          type="button"
          className="lesson-marker"
          onClick={() => setOpenMarker((cur) => (cur === s.marker.id ? null : s.marker.id))}
        >
          <Furigana text={s.marker.surface} />
        </button>
      ),
    );
    if (speaker) {
      return (
        <p key={paraIdx} className="dialogue-line" data-speaker={speaker}>
          <span className="dialogue-speaker">{speaker}</span>
          <span className="dialogue-text">{inner}</span>
        </p>
      );
    }
    return <p key={paraIdx} className="lesson-read-paragraph">{inner}</p>;
  };

  const openMk = lesson.markers.find((m) => m.id === openMarker) ?? null;

  return (
    <div className="lesson-read">
      <div className="lesson-read-body">
        {paragraphs.map((p, i) => renderParagraph(p, i))}
      </div>

      {openMk && (
        <div className="lesson-marker-card" role="note">
          <strong><Furigana text={openMk.surface} /></strong>
          <span>{glossFor(openMk)}</span>
        </div>
      )}

      <button
        type="button"
        className="btn-ghost"
        onClick={() => setTranslationShown((s) => !s)}
      >
        {translationShown ? 'Скрыть перевод' : 'Показать перевод'}
      </button>
      {translationShown && (
        <div className="lesson-read-translation">
          {translationParas.map((p, i) => <p key={i}>{p}</p>)}
        </div>
      )}
    </div>
  );
}
