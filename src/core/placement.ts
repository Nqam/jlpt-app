import type { ItemType } from '@/core/types';
import type { ContentDb } from '@/storage/content-db';
import type { UserDb } from '@/storage/user-db';
import type { Question } from '@/core/quiz/types';
import { availableItemIds } from '@/core/scheduler';
import { statusOf } from '@/core/srs';
import { seededShuffle } from '@/core/quiz/rng';
import { generateForCard } from '@/core/quiz/registry';
import { generateKanjiQuestion } from '@/core/quiz/kanji-questions';
import { generateVocabQuestion } from '@/core/quiz/vocab-questions';
import { levelPointsFor } from '@/core/session';

export type PlacementPercent = 10 | 25 | 50 | 100;

export interface PlacementState {
  itemType: ItemType;
  /** The sampled points, in ask order. Length === placementCount(pool.length, pct). */
  ids: string[];
  /** Cursor over `ids`, 0-based. */
  index: number;
  /** Ids the user answered correctly — the only ones that get marked "known". */
  correctIds: string[];
}

/**
 * Question count for a section size and chosen percentage:
 * `clamp(round(pct/100 * total), min(total, 10), min(total, 100))`.
 * So a tiny section (<=10) is always tested whole, a huge one is capped at 100,
 * and anything in between gets at least 10 questions.
 */
export function placementCount(total: number, pct: PlacementPercent): number {
  const raw = Math.round((pct / 100) * total);
  const lo = Math.min(total, 10);
  const hi = Math.min(total, 100);
  return Math.min(Math.max(raw, lo), hi);
}

/**
 * Builds a placement test. The pool is `availableItemIds(content, itemType,
 * availableCodes)` — the same canonical order the daily scheduler uses, already
 * excluding locked levels. The pool is split into "not yet passed" (no card, or a
 * card still in status `new`) and "passed" (card in learning/learned/mastered),
 * each part is seeded-shuffled, the parts are concatenated `[not passed] ++
 * [passed]`, and the first `placementCount(pool.length, pct)` are taken. A retake
 * therefore tops up the untested points first and only repeats tested ones once
 * those run out.
 */
export function initPlacement(
  content: ContentDb,
  user: UserDb,
  itemType: ItemType,
  availableCodes: ReadonlySet<string>,
  pct: PlacementPercent,
  seed: string,
): PlacementState {
  const pool = availableItemIds(content, itemType, availableCodes);
  const notPassed: string[] = [];
  const passed: string[] = [];
  for (const id of pool) {
    const card = user.getCard(itemType, id);
    if (!card || statusOf(card) === 'new') notPassed.push(id);
    else passed.push(id);
  }
  const ordered = [
    ...seededShuffle(notPassed, `${seed}:np`),
    ...seededShuffle(passed, `${seed}:p`),
  ];
  const count = placementCount(pool.length, pct);
  return { itemType, ids: ordered.slice(0, count), index: 0, correctIds: [] };
}

export function isPlacementDone(s: PlacementState): boolean {
  return s.index >= s.ids.length;
}

export function placementQuestionNumber(s: PlacementState): number {
  return s.index + 1;
}

export function placementTotal(s: PlacementState): number {
  return s.ids.length;
}

/**
 * The question for the point at the cursor. `null` if the test is done or the id
 * does not resolve to content. Dispatches to the section's own generator with
 * `reps=0`, seeded `${seed}:${id}` so a given run is deterministic.
 */
export function nextPlacementQuestion(
  s: PlacementState,
  content: ContentDb,
  seed: string,
): { itemId: string; question: Question } | null {
  if (isPlacementDone(s)) return null;
  const itemId = s.ids[s.index]!;
  const qSeed = `${seed}:${itemId}`;
  if (s.itemType === 'grammar') {
    const point = content.getGrammar(itemId);
    if (!point) return null;
    return { itemId, question: generateForCard(point, levelPointsFor(content, point.level), 0, qSeed) };
  }
  if (s.itemType === 'kanji') {
    const point = content.getKanji(itemId);
    if (!point) return null;
    return { itemId, question: generateKanjiQuestion(point, content.listKanji(point.level), 0, qSeed) };
  }
  const point = content.getVocab(itemId);
  if (!point) return null;
  return { itemId, question: generateVocabQuestion(point, content.listVocab(point.level), 0, qSeed) };
}

export function applyPlacementAnswer(s: PlacementState, correct: boolean): PlacementState {
  const itemId = s.ids[s.index]!;
  return {
    ...s,
    index: s.index + 1,
    correctIds: correct ? [...s.correctIds, itemId] : s.correctIds,
  };
}

export function placementKnownIds(s: PlacementState): string[] {
  return s.correctIds;
}

/**
 * One-time migration of the plan-4e grammar-only `placement_marked_ids` key into
 * the per-type `placement_marked_grammar_ids` key. Idempotent: does nothing once
 * the per-type key is non-empty (whether from a prior migration or a real
 * grammar retake under the new code) and nothing when there is no old key.
 */
export function migratePlacementMarks(user: UserDb): void {
  const old = user.getSetting<string[]>('placement_marked_ids', []);
  if (old.length === 0) return;
  if (user.getSetting<string[]>('placement_marked_grammar_ids', []).length > 0) return;
  user.setSetting('placement_marked_grammar_ids', old);
}
