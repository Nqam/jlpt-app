import { useEffect, useMemo, useRef, useState } from 'react';
import type { LessonIntroduce } from '@/core/types';
import { useContentDb } from '../useContentDb';
import { sectionBody } from '@/core/quiz/grammar-questions';
import { Furigana } from './Furigana';
import { FlashCard } from './FlashCard';

interface Flash {
  key: string;
  front: React.ReactNode;
  back: React.ReactNode;
}

export function LessonNewStep({
  introduces, onDone,
}: {
  introduces: LessonIntroduce[];
  onDone: () => void;
}) {
  const db = useContentDb();

  const grammarBlocks = useMemo(
    () =>
      introduces
        .filter((it) => it.type === 'grammar' && it.role === 'introduce')
        .map((it) => {
          const g = db.getGrammar(it.id);
          const brief = g ? sectionBody(g.bodyMarkdown, 'Кратко') : null;
          return g && brief ? { id: it.id, title: g.title, brief } : null;
        })
        .filter((x): x is { id: string; title: string; brief: string } => x !== null),
    [introduces, db],
  );

  const flashes = useMemo<Flash[]>(() => {
    const out: Flash[] = [];
    for (const it of introduces) {
      if (it.role !== 'introduce') continue;
      if (it.type === 'vocab') {
        const v = db.getVocab(it.id);
        if (v) out.push({
          key: `vocab:${it.id}`,
          front: <span className="flashcard-word"><Furigana text={v.headword} /></span>,
          back: <span>{v.reading} — {v.meaningRu}</span>,
        });
      } else if (it.type === 'kanji') {
        const k = db.getKanji(it.id);
        if (k) out.push({
          key: `kanji:${it.id}`,
          front: <span className="flashcard-word flashcard-kanji">{k.char}</span>,
          back: <span>{[...k.onyomi, ...k.kunyomi].join(' · ')} — {k.meaningRu}</span>,
        });
      }
    }
    return out;
  }, [introduces, db]);

  const [queue, setQueue] = useState<Flash[]>(() => flashes);
  const [pos, setPos] = useState(0);

  const current = queue[pos] ?? null;
  const noFlashes = flashes.length === 0;

  const advance = () => setPos((p) => p + 1);
  const requeue = () => {
    setQueue((q) => [...q, q[pos]!]);
    advance();
  };

  const doneWithFlashes = !noFlashes && pos >= queue.length;

  const firedRef = useRef(false);
  useEffect(() => {
    if (doneWithFlashes && !firedRef.current) {
      firedRef.current = true;
      onDone();
    }
  }, [doneWithFlashes, onDone]);

  return (
    <div className="lesson-new">
      {grammarBlocks.map((g) => (
        <div key={g.id} className="lesson-new-grammar">
          <h3>{g.title}</h3>
          <p>{g.brief}</p>
        </div>
      ))}

      {noFlashes ? (
        <button type="button" className="btn-primary" onClick={onDone}>Дальше</button>
      ) : doneWithFlashes ? (
        <button type="button" className="btn-primary" onClick={onDone}>Дальше</button>
      ) : current ? (
        <FlashCard
          key={`${current.key}:${pos}`}
          front={current.front}
          back={current.back}
          onKnown={advance}
          onAgain={requeue}
        />
      ) : null}
    </div>
  );
}
