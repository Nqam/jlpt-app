import type { UserDb } from '@/storage/user-db';
import type { ContentDb, GrammarPointFull } from '@/storage/content-db';
import type { KanjiPoint, VocabPoint } from '@/core/types';
import type { Question } from '@/core/quiz/types';
import { buildQueue, type ItemType } from '@/core/scheduler';
import { generateForCard, generateOfKind, ROTATION } from '@/core/quiz/registry';
import { generateKanjiQuestion } from '@/core/quiz/kanji-questions';
import { generateVocabQuestion } from '@/core/quiz/vocab-questions';
import { statusOf } from '@/core/srs';
import { localDayKey } from '@/core/time';
import { seededShuffle } from '@/core/quiz/rng';
import { levelPointsFor } from '@/core/quiz/level-points';

export { levelPointsFor };

/** Whether `/minitest`'s combined self-check has enough material to run at
 *  all (>= 5 learned/mastered cards across `itemTypes`). Cheap enough to call
 *  from a screen render — no caching needed for a handful of card arrays. */
export function miniTestReady(
  user: UserDb,
  itemTypes: readonly ItemType[] = ['grammar', 'kanji', 'vocab'],
): boolean {
  const total = itemTypes.reduce(
    (sum, t) =>
      sum +
      user.allCards(t).filter((c) => {
        const s = statusOf(c);
        return s === 'learned' || s === 'mastered';
      }).length,
    0,
  );
  return total >= 5;
}

export type SessionStep =
  | {
      phase: 'review';
      item: { itemType: ItemType; itemId: string };
      question: Question;
    }
  | { phase: 'minitest'; question: Question; sourceItemId: string; index: number };

export function buildDailySession(user: UserDb, content: ContentDb, now: Date): SessionStep[] {
  const dayKey = localDayKey(now);
  const steps: SessionStep[] = [];

  const grammarPointCache = new Map<string, GrammarPointFull | null>();
  const getGrammarPoint = (id: string): GrammarPointFull | null => {
    if (!grammarPointCache.has(id)) grammarPointCache.set(id, content.getGrammar(id));
    return grammarPointCache.get(id)!;
  };
  const grammarLevelCache = new Map<string, GrammarPointFull[]>();
  const grammarLevelPoints = (level: string): GrammarPointFull[] => {
    if (!grammarLevelCache.has(level)) grammarLevelCache.set(level, levelPointsFor(content, level));
    return grammarLevelCache.get(level)!;
  };
  const kanjiLevelCache = new Map<string, KanjiPoint[]>();
  const kanjiLevelPoints = (level: string): KanjiPoint[] => {
    if (!kanjiLevelCache.has(level)) kanjiLevelCache.set(level, content.listKanji(level));
    return kanjiLevelCache.get(level)!;
  };
  const vocabLevelCache = new Map<string, VocabPoint[]>();
  const vocabLevelPoints = (level: string): VocabPoint[] => {
    if (!vocabLevelCache.has(level)) vocabLevelCache.set(level, content.listVocab(level));
    return vocabLevelCache.get(level)!;
  };

  for (const qi of buildQueue(user, content, now)) {
    const reps = user.getCard(qi.itemType, qi.itemId)?.reps ?? 0;
    let question: Question | null = null;

    if (qi.itemType === 'grammar') {
      const point = getGrammarPoint(qi.itemId);
      if (!point) continue;
      question = generateForCard(point, grammarLevelPoints(point.level), reps, dayKey);
    } else if (qi.itemType === 'kanji') {
      const point = content.getKanji(qi.itemId);
      if (!point) continue;
      question = generateKanjiQuestion(point, kanjiLevelPoints(point.level), reps, `${qi.itemId}:${dayKey}`);
    } else {
      const point = content.getVocab(qi.itemId);
      if (!point) continue;
      question = generateVocabQuestion(point, vocabLevelPoints(point.level), reps, `${qi.itemId}:${dayKey}`);
    }

    steps.push({
      phase: 'review',
      item: { itemType: qi.itemType, itemId: qi.itemId },
      question,
    });
  }

  // Mini-test tail: grammar-only, same seed all day.
  steps.push(
    ...buildMiniTest(user, content, `mt:${dayKey}`, (id, i) => `${id}:mt:${i}`),
  );

  return steps;
}

/**
 * A mini-test as a standalone list of `minitest` steps: fires only when the
 * learner has >= 5 cards (across `itemTypes`) at status learned/mastered;
 * 5..8 questions sampled from those points, one per point. Never touches
 * FSRS or user.db — it is a self-check, not a review session.
 *
 * `itemTypes` defaults to grammar-only — `buildDailySession`'s tail keeps
 * that default so the daily session is unchanged; the standalone `/minitest`
 * screen passes all three types for a combined self-check. `shuffleSeed`
 * picks which learned points are sampled; `qSeed(sourceId, index)` seeds each
 * question. `buildDailySession` passes a per-day seed so the tail is stable;
 * `/minitest` passes a fresh nonce each attempt so a retake varies.
 */
export function buildMiniTest(
  user: UserDb,
  content: ContentDb,
  shuffleSeed: string,
  qSeed: (sourceId: string, index: number) => string,
  itemTypes: readonly ItemType[] = ['grammar'],
): Extract<SessionStep, { phase: 'minitest' }>[] {
  const learned = itemTypes.flatMap((t) =>
    user
      .allCards(t)
      .filter((c) => {
        const s = statusOf(c);
        return s === 'learned' || s === 'mastered';
      })
      .map((c) => ({ itemType: t, id: c.item_id })),
  );
  if (learned.length < 5) return [];

  const grammarPointCache = new Map<string, GrammarPointFull | null>();
  const getGrammarPoint = (id: string): GrammarPointFull | null => {
    if (!grammarPointCache.has(id)) grammarPointCache.set(id, content.getGrammar(id));
    return grammarPointCache.get(id)!;
  };
  const grammarLevelCache = new Map<string, GrammarPointFull[]>();
  const grammarLevelPoints = (level: string): GrammarPointFull[] => {
    if (!grammarLevelCache.has(level)) grammarLevelCache.set(level, levelPointsFor(content, level));
    return grammarLevelCache.get(level)!;
  };
  const kanjiLevelCache = new Map<string, KanjiPoint[]>();
  const kanjiLevelPoints = (level: string): KanjiPoint[] => {
    if (!kanjiLevelCache.has(level)) kanjiLevelCache.set(level, content.listKanji(level));
    return kanjiLevelCache.get(level)!;
  };
  const vocabLevelCache = new Map<string, VocabPoint[]>();
  const vocabLevelPoints = (level: string): VocabPoint[] => {
    if (!vocabLevelCache.has(level)) vocabLevelCache.set(level, content.listVocab(level));
    return vocabLevelCache.get(level)!;
  };

  const resolves = (t: ItemType, id: string): boolean =>
    t === 'grammar' ? getGrammarPoint(id) !== null
    : t === 'kanji' ? content.getKanji(id) !== null
    : content.getVocab(id) !== null;

  const resolvable = learned.filter(({ itemType, id }) => resolves(itemType, id));
  const count = Math.min(8, Math.max(5, Math.floor(resolvable.length / 2)));
  const sources = seededShuffle(resolvable, shuffleSeed).slice(0, count);

  return sources.map(({ itemType, id }, index) => {
    let question: Question;
    if (itemType === 'grammar') {
      const point = getGrammarPoint(id)!;
      question = generateOfKind(
        ROTATION[index % 3]!, point, grammarLevelPoints(point.level), qSeed(id, index),
      );
    } else if (itemType === 'kanji') {
      const point = content.getKanji(id)!;
      question = generateKanjiQuestion(point, kanjiLevelPoints(point.level), index, qSeed(id, index));
    } else {
      const point = content.getVocab(id)!;
      question = generateVocabQuestion(point, vocabLevelPoints(point.level), index, qSeed(id, index));
    }
    return { phase: 'minitest' as const, question, sourceItemId: id, index };
  });
}
