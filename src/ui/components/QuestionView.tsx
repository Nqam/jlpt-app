import { useState } from 'react';
import type { Question, Answer, GradedAnswer } from '@/core/quiz/types';
import { Furigana } from '@/ui/components/Furigana';

export function QuestionView({
  question,
  onAnswer,
  revealed,
  showExplainLink = true,
}: {
  question: Question;
  onAnswer: (a: Answer) => void;
  revealed: GradedAnswer | null;
  /** Ссылка «Подробнее» на страницу пункта. Отключается во вступительном тесте:
   * переход уводит со страницы теста и теряет его состояние. */
  showExplainLink?: boolean;
}) {
  const [pickedIndex, setPickedIndex] = useState<number | null>(null);
  const [pickedOrder, setPickedOrder] = useState<number[]>([]);

  const breakdown = revealed && (
    <div className="q-breakdown">
      <p className={revealed.correct ? 'verdict-ok' : 'verdict-bad'}>
        {revealed.correct ? 'Верно' : 'Неверно'}
      </p>
      {question.kind === 'assemble' && (
        <p className="q-answer-line">
          <Furigana
            text={question.answerOrder.map((i) => question.tokens[i]).join(' ')}
          />
          <span className="q-translation"> — {question.translationRu}</span>
        </p>
      )}
      {showExplainLink && (
        <a className="q-more" href={`#/${question.itemType}/${question.itemId}`}>
          Подробнее
        </a>
      )}
    </div>
  );

  if (question.kind === 'cloze' || question.kind === 'choice') {
    const chooseIndex = (i: number) => {
      if (revealed) return;
      setPickedIndex(i);
      onAnswer({ kind: 'index', value: i });
    };
    return (
      <div className={`q q-${question.kind}`}>
        <p className="q-prompt">{question.prompt}</p>
        {question.kind === 'cloze' && (
          <>
            <p className="q-sentence">
              {question.sentenceRuby.split('___').map((part, i, arr) => (
                <span key={i}>
                  <Furigana text={part} />
                  {i < arr.length - 1 && (
                    <span className="cloze-blank">＿＿＿</span>
                  )}
                </span>
              ))}
            </p>
            {question.translationRu && (
              <p className="q-translation q-cloze-translation">{question.translationRu}</p>
            )}
          </>
        )}
        <div className="q-options">
          {question.choices.map((c, i) => {
            const cls = ['q-opt'];
            if (revealed) {
              if (i === question.answerIndex) cls.push('opt-correct');
              else if (i === pickedIndex) cls.push('opt-wrong');
            }
            return (
              <button
                key={i}
                type="button"
                className={cls.join(' ')}
                disabled={revealed !== null}
                onClick={() => chooseIndex(i)}
              >
                <Furigana text={c} />
              </button>
            );
          })}
        </div>
        {breakdown}
      </div>
    );
  }

  // assemble
  const used = new Set(pickedOrder);
  const place = (tokenIdx: number) => {
    if (revealed) return;
    setPickedOrder((o) => [...o, tokenIdx]);
  };
  const removeAt = (pos: number) => {
    if (revealed) return;
    setPickedOrder((o) => o.filter((_, i) => i !== pos));
  };
  const complete = pickedOrder.length === question.tokens.length;
  return (
    <div className="q q-assemble">
      <p className="q-prompt">{question.prompt}</p>
      <div className="q-line">
        {pickedOrder.map((tokenIdx, pos) => (
          <button
            key={pos}
            type="button"
            className="q-tok q-tok-line"
            disabled={revealed !== null}
            onClick={() => removeAt(pos)}
          >
            <Furigana text={question.tokens[tokenIdx]!} />
          </button>
        ))}
      </div>
      <div className="q-bank">
        {question.tokens.map((t, i) =>
          used.has(i) ? null : (
            <button
              key={i}
              type="button"
              className="q-tok"
              disabled={revealed !== null}
              onClick={() => place(i)}
            >
              <Furigana text={t} />
            </button>
          ),
        )}
      </div>
      <button
        type="button"
        className="btn-primary q-done"
        disabled={!complete || revealed !== null}
        onClick={() => onAnswer({ kind: 'order', value: pickedOrder })}
      >
        Готово
      </button>
      {breakdown}
    </div>
  );
}
