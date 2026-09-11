import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useContentDb, useLevels } from '../useContentDb';
import { useUserDb } from '../useUserDb';
import { Furigana } from '../components/Furigana';
import { recordActivity } from '@/core/progress';
import { wordsInText } from '@/core/reading-vocab';
import { review, newCard } from '@/core/srs';
import type { LessonFull } from '@/core/types';
import type { UserDb } from '@/storage/user-db';

/** How many matched words to surface before the list gets noisy on a long text. */
const MAX_WORDS_SHOWN = 12;

/**
 * A tap-to-add glossary for vocabulary spotted in the text (best-effort
 * substring match, see `wordsInText`). Adding a word creates an FSRS card at
 * rating 3 ("Хорошо") — same convention as the course lesson finale: just
 * encountered in context, should resurface soon, not a real review session
 * (`insertReviewLog` is never called).
 */
function WordsInText({ user, point }: { user: UserDb; point: LessonFull }) {
  const db = useContentDb();
  const levels = useLevels();
  const pool = useMemo(() => levels.flatMap((l) => db.listVocab(l.code)), [db, levels]);
  const words = useMemo(() => wordsInText(point.bodyRuby, pool), [point.bodyRuby, pool]);
  // Captured once: words already carded before this screen opened stay hidden
  // entirely (nothing to add); words added *during* this visit get a ✓ instead
  // of vanishing, so the tap has visible feedback.
  const [alreadyKnown] = useState(
    () => new Set(words.filter((w) => user.getCard('vocab', w.id)).map((w) => w.id)),
  );
  const [added, setAdded] = useState<Set<string>>(new Set());
  const shown = words.filter((w) => !alreadyKnown.has(w.id)).slice(0, MAX_WORDS_SHOWN);

  if (shown.length === 0) return null;

  const addWord = (id: string) => {
    if (added.has(id)) return;
    const now = new Date();
    const params = {
      requestRetention: user.getSetting('fsrs_request_retention', 0.9),
      maximumInterval: user.getSetting('fsrs_maximum_interval', 365),
      enableFuzz: user.getSetting('fsrs_enable_fuzz', true),
    };
    const { card } = review(newCard('vocab', id, now), 3, now, 0, params);
    user.upsertCard(card);
    setAdded((s) => new Set(s).add(id));
  };

  return (
    <div className="text-words">
      <h2>Слова в этом тексте</h2>
      <ul className="text-words-list">
        {shown.map((w) => (
          <li key={w.id} className="text-words-item">
            <Link to={`/vocab/${w.id}`}>{w.headword} · {w.reading}</Link>
            <button
              type="button"
              className="btn-ghost text-words-add"
              disabled={added.has(w.id)}
              onClick={() => addWord(w.id)}
            >
              {added.has(w.id) ? '✓ добавлено' : '+ добавить'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TextDetailScreen() {
  const { id = '' } = useParams();
  const db = useContentDb();
  const user = useUserDb();
  const point = useMemo(() => db.getLesson(id), [db, id]);

  const [translationShown, setTranslationShown] = useState(false);
  const [qIndex, setQIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const markedRef = useRef(false);

  const done = point !== null && qIndex >= point.questions.length;

  useEffect(() => {
    if (!point || !done || markedRef.current) return;
    markedRef.current = true;
    const existing = user.getSetting<string[]>('texts_read_ids', []);
    if (!existing.includes(point.id)) {
      user.setSetting('texts_read_ids', [...existing, point.id]);
    }
    recordActivity(user, new Date());
  }, [point, done, user]);

  if (!point) {
    return (
      <section className="screen">
        <p className="muted">Текст не найден.</p>
        <Link to="/texts" className="back-link">
          ← Тексты
        </Link>
      </section>
    );
  }

  const paragraphs = point.bodyRuby.split('\n\n');
  const translationParagraphs = point.translationRu.split('\n\n');
  const question = point.questions[qIndex];

  const choose = (i: number) => {
    if (selected !== null) return;
    setSelected(i);
  };

  const next = () => {
    setQIndex((n) => n + 1);
    setSelected(null);
  };

  return (
    <section className="screen text-detail">
      <Link to="/texts" className="back-link">
        ← Тексты
      </Link>
      <h1>{point.title}</h1>

      <div className="text-body">
        {paragraphs.map((p, i) => (
          <p key={i} className="text-paragraph">
            <Furigana text={p} />
          </p>
        ))}
      </div>

      <button
        type="button"
        className="btn-ghost"
        onClick={() => setTranslationShown((s) => !s)}
      >
        {translationShown ? 'Скрыть перевод' : 'Показать перевод'}
      </button>
      {translationShown && (
        <div className="text-translation">
          {translationParagraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      )}

      <WordsInText user={user} point={point} />

      {!done && question && (
        <div className="q text-question">
          <p className="q-prompt">{question.prompt}</p>
          <div className="q-options">
            {question.choices.map((choice, i) => {
              let cls = 'q-opt';
              if (selected !== null) {
                if (i === question.answerIndex) cls += ' opt-correct';
                else if (i === selected) cls += ' opt-wrong';
              }
              return (
                <button
                  key={i}
                  type="button"
                  className={cls}
                  disabled={selected !== null}
                  onClick={() => choose(i)}
                >
                  {choice}
                </button>
              );
            })}
          </div>
          {selected !== null && (
            <p
              className={
                selected === question.answerIndex ? 'verdict-ok' : 'verdict-bad'
              }
              role="status"
            >
              {selected === question.answerIndex ? 'Верно' : 'Неверно'}
            </p>
          )}
          {selected !== null && (
            <button type="button" className="btn-primary" onClick={next}>
              {qIndex + 1 < point.questions.length ? 'Далее' : 'Завершить'}
            </button>
          )}
        </div>
      )}

      {done && (
        <p className="text-done">Текст прочитан. Вопросы пройдены: {point.questions.length}.</p>
      )}
    </section>
  );
}
