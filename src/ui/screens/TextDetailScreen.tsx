import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useContentDb } from '../useContentDb';
import { useUserDb } from '../useUserDb';
import { Furigana } from '../components/Furigana';
import { recordActivity } from '@/core/progress';

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
