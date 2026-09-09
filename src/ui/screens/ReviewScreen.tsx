import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserDb } from '@/ui/useUserDb';
import { useContentDb } from '@/ui/useContentDb';
import { buildDailySession, levelPointsFor, type SessionStep } from '@/core/session';
import { generateOfKind } from '@/core/quiz/registry';
import { grade } from '@/core/quiz/grade';
import { newCard, review } from '@/core/srs';
import type { Answer, GradedAnswer } from '@/core/quiz/types';
import type { GrammarPointFull } from '@/storage/content-db';
import type { KanjiPoint, VocabPoint } from '@/core/types';
import { QuestionView } from '@/ui/components/QuestionView';

export function ReviewScreen() {
  const user = useUserDb();
  const content = useContentDb();
  const navigate = useNavigate();

  const baseSteps = useMemo(
    () => buildDailySession(user, content, new Date()),
    [user, content],
  );
  const params = useMemo(
    () => ({
      requestRetention: user.getSetting('fsrs_request_retention', 0.9),
      maximumInterval: user.getSetting('fsrs_maximum_interval', 365),
      enableFuzz: user.getSetting('fsrs_enable_fuzz', true),
    }),
    [user],
  );

  const [tail, setTail] = useState<SessionStep[]>([]);
  const steps = useMemo(() => [...baseSteps, ...tail], [baseSteps, tail]);

  const [idx, setIdx] = useState(0);
  const [graded, setGraded] = useState<GradedAnswer | null>(null);
  const [, setLastAnswer] = useState<Answer | null>(null);
  const shownAt = useRef(Date.now());
  const initedIdx = useRef(-1);
  const retryIds = useRef<Set<string>>(new Set());
  const retryBuilt = useRef(false);
  const [tally, setTally] = useState({ rc: 0, rt: 0, mc: 0, mt: 0 });

  const step: SessionStep | undefined = steps[idx];

  // Skip a step whose content id no longer resolves.
  const stepItemId =
    step?.phase === 'review'
      ? step.item.itemId
      : step?.phase === 'minitest'
        ? step.sourceItemId
        : null;
  // Minitest steps are always grammar-sourced (mini-test stays grammar-only, Plan 4b-1).
  const stepItemType =
    step?.phase === 'review' ? step.item.itemType
    : step?.phase === 'minitest' ? 'grammar'
    : null;
  const point: GrammarPointFull | KanjiPoint | VocabPoint | null =
    !stepItemId || !stepItemType
      ? null
      : stepItemType === 'grammar'
        ? content.getGrammar(stepItemId)
        : stepItemType === 'kanji'
          ? content.getKanji(stepItemId)
          : content.getVocab(stepItemId);
  useEffect(() => {
    if (step && !point) setIdx((i) => i + 1);
  }, [step, point]);

  // Reset per-step state once per position, before paint (Plan 2 lesson:
  // a passive effect flashes a frame of the previous answer).
  useLayoutEffect(() => {
    if (!step || initedIdx.current === idx) return;
    initedIdx.current = idx;
    setGraded(null);
    setLastAnswer(null);
    shownAt.current = Date.now();
  }, [idx, step]);

  // Build the retry round when the base session ends with unresolved mini-test fails.
  useEffect(() => {
    if (idx < baseSteps.length || retryBuilt.current || retryIds.current.size === 0) return;
    retryBuilt.current = true;
    const built: SessionStep[] = [];
    [...retryIds.current].forEach((id, n) => {
      const p = content.getGrammar(id);
      if (!p) return;
      built.push({
        phase: 'minitest',
        sourceItemId: id,
        index: 1000 + n,
        question: generateOfKind('choice', p, levelPointsFor(content, p.level), `${id}:retry:${n}`),
      });
    });
    if (built.length) setTail(built);
  }, [idx, baseSteps.length, content]);

  const answer = useCallback(
    (a: Answer) => {
      if (!step || graded) return;
      setLastAnswer(a);
      setGraded(grade(step.question, a));
    },
    [step, graded],
  );

  const next = useCallback(() => {
    if (!step) return;
    if (step.phase === 'review' && graded) {
      const now = new Date();
      const elapsedMs = Date.now() - shownAt.current;
      const { itemType, itemId } = step.item;
      const base = user.getCard(itemType, itemId) ?? newCard(itemType, itemId, now);
      const { card, log } = review(base, graded.rating, now, elapsedMs, params);
      user.upsertCard(card);
      user.insertReviewLog(log);
      setTally((t) => ({ ...t, rc: t.rc + (graded.correct ? 1 : 0), rt: t.rt + 1 }));
    } else if (step.phase === 'minitest' && graded) {
      if (step.index < 1000) {
        if (!graded.correct) retryIds.current.add(step.sourceItemId);
        setTally((t) => ({ ...t, mc: t.mc + (graded.correct ? 1 : 0), mt: t.mt + 1 }));
      }
    }
    setIdx((i) => i + 1);
  }, [step, graded, user, params]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        navigate('/');
        return;
      }
      if (!step) return;
      if (graded && e.key === 'Enter') {
        next();
        return;
      }
      if (
        !graded &&
        (step.question.kind === 'cloze' || step.question.kind === 'choice') &&
        ['1', '2', '3', '4'].includes(e.key)
      ) {
        answer({ kind: 'index', value: Number(e.key) - 1 });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, graded, answer, next, navigate]);

  if (idx >= steps.length && (retryBuilt.current || retryIds.current.size === 0)) {
    const mt = tally.mt === 0 ? 'мини-тест —' : `мини-тест ${tally.mc}/${tally.mt}`;
    return (
      <section className="review review-done">
        <h1>Готово</h1>
        <p className="review-summary">
          Верно {tally.rc}/{tally.rt} · {mt}
        </p>
        <button type="button" className="btn-primary" onClick={() => navigate('/')}>
          Готово
        </button>
      </section>
    );
  }

  if (!step || !point) return null;

  return (
    <section className="review">
      <div className="review-progress">
        {idx + 1} / {steps.length}
      </div>

      <div className="review-question">
        <QuestionView
          key={step.question.id}
          question={step.question}
          onAnswer={answer}
          revealed={graded}
        />
        {graded && (
          <button type="button" className="btn-primary" onClick={next}>
            Далее
          </button>
        )}
      </div>
    </section>
  );
}
