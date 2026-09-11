import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserDb } from '@/ui/useUserDb';
import { useContentDb } from '@/ui/useContentDb';
import { buildDailySession, levelPointsFor, type SessionStep } from '@/core/session';
import { generateOfKind } from '@/core/quiz/registry';
import { grade } from '@/core/quiz/grade';
import { newCard, review, statusOf } from '@/core/srs';
import type { Answer, GradedAnswer } from '@/core/quiz/types';
import type { GrammarPointFull } from '@/storage/content-db';
import type { ItemType, KanjiPoint, VocabPoint } from '@/core/types';
import { QuestionView } from '@/ui/components/QuestionView';

/** Prior lapses at/above this count means the card is a known leech. */
const LEECH_LAPSES = 3;

/** What to show for a missed item in the end-of-session recap. */
function itemLabel(itemType: ItemType, point: GrammarPointFull | KanjiPoint | VocabPoint): string {
  if (itemType === 'grammar') return (point as GrammarPointFull).title;
  if (itemType === 'kanji') return (point as KanjiPoint).char;
  return (point as VocabPoint).headword;
}

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
  const [mistakes, setMistakes] = useState<{ itemType: ItemType; itemId: string; label: string }[]>([]);
  const [milestones, setMilestones] = useState(0);
  // A card that was already failing before this answer -- surfaced so the
  // learner gets pointed at the explanation instead of just cycling it again.
  const [isLeech, setIsLeech] = useState(false);

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
    setIsLeech(false);
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

  // Response time (question shown -> answered), NOT answered -> "Далее" clicked —
  // captured once per step so idle time spent looking at the reveal doesn't
  // inflate it. Feeds both the auto-grade rating and the FSRS review log.
  const responseMs = useRef(0);

  const answer = useCallback(
    (a: Answer) => {
      if (!step || graded) return;
      responseMs.current = Date.now() - shownAt.current;
      setLastAnswer(a);
      const g = grade(step.question, a, responseMs.current);
      setGraded(g);
      // Already-struggling card (>= LEECH_LAPSES prior lapses) failed again --
      // flag it so the learner gets pointed at the explanation, not just a
      // repeat of the same MCQ.
      if (step.phase === 'review' && !g.correct) {
        const existing = user.getCard(step.item.itemType, step.item.itemId);
        setIsLeech((existing?.lapses ?? 0) >= LEECH_LAPSES);
      }
    },
    [step, graded, user],
  );

  const next = useCallback(() => {
    if (!step) return;
    if (step.phase === 'review' && graded) {
      const now = new Date();
      const elapsedMs = responseMs.current;
      const { itemType, itemId } = step.item;
      const base = user.getCard(itemType, itemId) ?? newCard(itemType, itemId, now);
      const beforeStatus = statusOf(base);
      const { card, log } = review(base, graded.rating, now, elapsedMs, params);
      user.upsertCard(card);
      user.insertReviewLog(log);
      setTally((t) => ({ ...t, rc: t.rc + (graded.correct ? 1 : 0), rt: t.rt + 1 }));
      const afterStatus = statusOf(card);
      if (beforeStatus !== afterStatus && (afterStatus === 'learned' || afterStatus === 'mastered')) {
        setMilestones((m) => m + 1);
      }
      if (!graded.correct && point) {
        setMistakes((m) => [...m, { itemType, itemId, label: itemLabel(itemType, point) }]);
      }
    } else if (step.phase === 'minitest' && graded) {
      if (step.index < 1000) {
        if (!graded.correct) retryIds.current.add(step.sourceItemId);
        setTally((t) => ({ ...t, mc: t.mc + (graded.correct ? 1 : 0), mt: t.mt + 1 }));
      }
    }
    setIdx((i) => i + 1);
  }, [step, graded, user, params, point]);

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
        {milestones > 0 && (
          <p className="review-milestone">🎉 Закреплено: +{milestones}</p>
        )}
        {mistakes.length > 0 && (
          <div className="review-mistakes">
            <h2>Разобрать ещё раз</h2>
            <ul>
              {mistakes.map((m, i) => (
                <li key={i}>
                  <a href={`#/${m.itemType}/${m.itemId}`}>{m.label}</a>
                </li>
              ))}
            </ul>
          </div>
        )}
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
        {isLeech && step.phase === 'review' && (
          <p className="review-leech-hint">
            Эта карточка даётся тяжело — может, стоит разобрать{' '}
            <a href={`#/${step.item.itemType}/${step.item.itemId}`}>объяснение</a> ещё раз.
          </p>
        )}
        {graded && (
          <button type="button" className="btn-primary" onClick={next}>
            Далее
          </button>
        )}
      </div>
    </section>
  );
}
