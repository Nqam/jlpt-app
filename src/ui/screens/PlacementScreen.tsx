import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserDb } from '@/ui/useUserDb';
import { useContentDb } from '@/ui/useContentDb';
import {
  initPlacement,
  nextPlacementQuestion,
  applyPlacementAnswer,
  isPlacementDone,
  placementFrontierIds,
  placementQuestionNumber,
  placementRemaining,
  type PlacementState,
} from '@/core/placement';
import { availableLevelCodes } from '@/core/levels';
import { QuestionView } from '@/ui/components/QuestionView';
import { grade } from '@/core/quiz/grade';
import { newCard, review } from '@/core/srs';
import type { Answer, GradedAnswer } from '@/core/quiz/types';

export function PlacementScreen() {
  const user = useUserDb();
  const content = useContentDb();
  const navigate = useNavigate();

  const [state, setState] = useState<PlacementState>(() =>
    initPlacement(content, availableLevelCodes(user, content, new Date())),
  );
  const [graded, setGraded] = useState<GradedAnswer | null>(null);
  const [markedCount, setMarkedCount] = useState<number | null>(null);
  const appliedRef = useRef(false);

  const current = useMemo(
    () => nextPlacementQuestion(state, content, 'placement'),
    [state, content],
  );

  useLayoutEffect(() => {
    setGraded(null);
  }, [state]);

  useEffect(() => {
    if (!isPlacementDone(state) || appliedRef.current) return;
    appliedRef.current = true;
    const now = new Date();
    const params = {
      requestRetention: user.getSetting('fsrs_request_retention', 0.9),
      maximumInterval: user.getSetting('fsrs_maximum_interval', 365),
      enableFuzz: user.getSetting('fsrs_enable_fuzz', true),
    };
    // One simulated review with rating 4 ("Easy") — not 3 ("Good") — so the
    // card lands directly in state 2 (Review) with a multi-day interval per
    // statusOf() in src/core/srs.ts, i.e. "уже знаю" (already known) and not
    // due today. A "Good" rating would instead put it in state 1 (Learning)
    // due back in ~10 minutes, flooding today's queue with cards the
    // placement test just said the user already knows.
    const newlyMarked: string[] = [];
    for (const itemId of placementFrontierIds(state)) {
      if (user.getCard('grammar', itemId)) continue;
      const { card } = review(newCard('grammar', itemId, now), 4, now, 0, params);
      user.upsertCard(card);
      newlyMarked.push(itemId);
    }
    // Tag which ids this test created, per grammar level in Settings' reset
    // buttons -- lets a user undo a placement-marked "known" call for a whole
    // level (e.g. a lucky-guess run) without touching organically-earned cards.
    if (newlyMarked.length > 0) {
      const existing = user.getSetting<string[]>('placement_marked_ids', []);
      user.setSetting('placement_marked_ids', [...new Set([...existing, ...newlyMarked])]);
    }
    user.setSetting('placement_offered', true);
    setMarkedCount(newlyMarked.length);
  }, [state, user]);

  const answer = useCallback(
    (a: Answer) => {
      if (!current || graded) return;
      setGraded(grade(current.question, a));
    },
    [current, graded],
  );

  const next = useCallback(() => {
    if (!current || !graded) return;
    setState((s) => applyPlacementAnswer(s, graded.correct));
  }, [current, graded]);

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

  if (!current) return null;

  const remaining = placementRemaining(state);

  return (
    <section className="screen placement">
      <p className="placement-counter">
        Вопрос {placementQuestionNumber(state)}
        {remaining > 1 && <> · осталось ещё ~{remaining}</>}
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
