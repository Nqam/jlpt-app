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

export type SessionStep =
  | { phase: 'learn'; itemType: ItemType; itemId: string }
  | {
      phase: 'review';
      item: { itemType: ItemType; itemId: string; kind: 'due' | 'new' };
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

    if (qi.kind === 'new') steps.push({ phase: 'learn', itemType: qi.itemType, itemId: qi.itemId });
    steps.push({
      phase: 'review',
      item: { itemType: qi.itemType, itemId: qi.itemId, kind: qi.kind },
      question,
    });
  }

  // Mini-test stays grammar-only (out of scope for this plan).
  const learned = user.allCards('grammar').filter((c) => {
    const s = statusOf(c);
    return s === 'learned' || s === 'mastered';
  });

  if (learned.length >= 5) {
    const count = Math.min(8, Math.max(5, Math.floor(learned.length / 2)));
    const sources = seededShuffle(
      learned.map((c) => c.item_id).filter((id) => getGrammarPoint(id) !== null),
      `mt:${dayKey}`,
    ).slice(0, count);
    sources.forEach((srcId, index) => {
      const point = getGrammarPoint(srcId)!;
      const kind = ROTATION[index % 3]!;
      const question = generateOfKind(kind, point, grammarLevelPoints(point.level), `${srcId}:mt:${index}`);
      steps.push({ phase: 'minitest', question, sourceItemId: srcId, index });
    });
  }

  return steps;
}
