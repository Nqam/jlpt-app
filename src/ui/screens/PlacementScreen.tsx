import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { useUserDb } from '@/ui/useUserDb';
import { useContentDb } from '@/ui/useContentDb';
import {
  initPlacement,
  nextPlacementQuestion,
  applyPlacementAnswer,
  isPlacementDone,
  placementKnownIds,
  placementQuestionNumber,
  placementTotal,
  placementCount,
  type PlacementPercent,
  type PlacementState,
} from '@/core/placement';
import type { ItemType } from '@/core/types';
import { availableItemIds } from '@/core/scheduler';
import { availableLevelCodes } from '@/core/levels';
import { QuestionView } from '@/ui/components/QuestionView';
import { grade } from '@/core/quiz/grade';
import { newCard, review } from '@/core/srs';
import type { Answer, GradedAnswer } from '@/core/quiz/types';

const SECTION_LABEL: Record<ItemType, string> = {
  grammar: 'грамматика',
  kanji: 'кандзи',
  vocab: 'слова',
};
const PERCENTS: PlacementPercent[] = [10, 25, 50, 100];

function isItemType(v: string | undefined): v is ItemType {
  return v === 'grammar' || v === 'kanji' || v === 'vocab';
}

export function PlacementScreen() {
  const { type } = useParams();
  const user = useUserDb();
  const content = useContentDb();
  const navigate = useNavigate();

  // A stable per-mount seed: the sample and every question are derived from it.
  const [seed] = useState(() => Date.now().toString());
  const [state, setState] = useState<PlacementState | null>(null);
  const [graded, setGraded] = useState<GradedAnswer | null>(null);
  const [markedCount, setMarkedCount] = useState<number | null>(null);
  const appliedRef = useRef(false);

  const availableCodes = useMemo(
    () => (isItemType(type) ? availableLevelCodes(user, content, new Date()) : new Set<string>()),
    [user, content, type],
  );
  const total = useMemo(
    () => (isItemType(type) ? availableItemIds(content, type, availableCodes).length : 0),
    [content, type, availableCodes],
  );

  const current = useMemo(
    () => (state ? nextPlacementQuestion(state, content, seed) : null),
    [state, content, seed],
  );

  useLayoutEffect(() => {
    setGraded(null);
  }, [state]);

  useEffect(() => {
    if (!state || !isItemType(type)) return;
    if (!isPlacementDone(state) || appliedRef.current) return;
    appliedRef.current = true;
    const now = new Date();
    const params = {
      requestRetention: user.getSetting('fsrs_request_retention', 0.9),
      maximumInterval: user.getSetting('fsrs_maximum_interval', 365),
      enableFuzz: user.getSetting('fsrs_enable_fuzz', true),
    };
    // Rating 4 ("Легко") — see plan 4e: rating 3 lands the card in Learning due
    // in ~10 min and floods today's queue right after the test.
    const newlyMarked: string[] = [];
    for (const itemId of placementKnownIds(state)) {
      if (user.getCard(type, itemId)) continue;
      const { card } = review(newCard(type, itemId, now), 4, now, 0, params);
      user.upsertCard(card);
      newlyMarked.push(itemId);
    }
    if (newlyMarked.length > 0) {
      const key = `placement_marked_${type}_ids`;
      const existing = user.getSetting<string[]>(key, []);
      user.setSetting(key, [...new Set([...existing, ...newlyMarked])]);
    }
    user.setSetting('placement_offered', true);
    setMarkedCount(newlyMarked.length);
  }, [state, type, user]);

  const answer = useCallback(
    (a: Answer) => {
      if (!current || graded) return;
      setGraded(grade(current.question, a));
    },
    [current, graded],
  );

  const next = useCallback(() => {
    if (!current || !graded) return;
    setState((s) => (s ? applyPlacementAnswer(s, graded.correct) : s));
  }, [current, graded]);

  const startWith = useCallback(
    (pct: PlacementPercent) => {
      if (!isItemType(type)) return;
      setState(initPlacement(content, user, type, availableCodes, pct, seed));
    },
    [content, user, type, availableCodes, seed],
  );

  if (!isItemType(type)) return <Navigate to="/placement/grammar" replace />;

  if (markedCount !== null) {
    return (
      <section className="screen placement placement-done">
        <h1>Готово</h1>
        <p>Отмечено как уже известные: {markedCount}.</p>
        <button type="button" className="btn-primary" onClick={() => navigate('/')}>
          На сегодня
        </button>
      </section>
    );
  }

  // Volume-choice screen: shown until a percentage is picked.
  if (state === null) {
    return (
      <section className="screen placement placement-volume">
        <h1>Тест: {SECTION_LABEL[type]}</h1>
        {total === 0 ? (
          <p className="muted">В этом разделе пока нет материала для теста.</p>
        ) : total <= 10 ? (
          <button type="button" className="btn-primary" onClick={() => startWith(100)}>
            Весь раздел ({total})
          </button>
        ) : (
          <div className="placement-volume-buttons">
            {PERCENTS.map((p) => (
              <button
                key={p}
                type="button"
                className="btn-ghost"
                onClick={() => startWith(p)}
              >
                {p}% · ≈{placementCount(total, p)}
              </button>
            ))}
          </div>
        )}
        <p className="today-hint">
          Верные ответы отметят пункты как известные. Остальные останутся в ежедневном повторении.
        </p>
      </section>
    );
  }

  if (!current) return null;

  return (
    <section className="screen placement">
      <p className="placement-counter">
        Вопрос {placementQuestionNumber(state)} из {placementTotal(state)}
      </p>
      <QuestionView
        key={current.question.id}
        question={current.question}
        onAnswer={answer}
        revealed={graded}
        showExplainLink={false}
      />
      {graded && (
        <button type="button" className="btn-primary" onClick={next}>
          Далее
        </button>
      )}
    </section>
  );
}
