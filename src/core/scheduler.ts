import type { UserDb } from '@/storage/user-db';
import type { ContentDb } from '@/storage/content-db';
import type { ItemType } from '@/core/types';
import { endOfLocalDay, toUtcIso, localDayKey } from '@/core/time';
import { statusOf } from '@/core/srs';

export type { ItemType };

export interface DaySummary {
  dueCount: number;
  reviewedToday: number;
  queueOverCap: boolean;
  allDone: boolean;
  nextDueAt: string | null;
  /** >= 5 grammar cards at status 'learned' or 'mastered' — the mini-test unlock. */
  miniTestEligible: boolean;
}

export interface QueueItem {
  itemType: ItemType;
  itemId: string;
}

function settings(user: UserDb) {
  return {
    cap: user.getSetting('review_queue_cap', 100),
  };
}

/**
 * Per-type "list every point in a level" lookup, keyed as a `Record<ItemType, ...>` so
 * TypeScript refuses to compile once a new `ItemType` member is added without a matching
 * entry here. Replaces the old `itemType === 'grammar' ? ... : ...` two-way ternary, which
 * silently treated ANY non-grammar type (including a future 'vocab') as kanji.
 */
const LEVEL_EXTRACTORS: Record<
  ItemType,
  (content: ContentDb, levelCode: string) => { id: string; layer: number }[]
> = {
  grammar: (content, level) => content.listGrammar(level).map((g) => ({ id: g.id, layer: g.layer })),
  // Kanji and vocab have no `layer` (no sub-level pedagogical ordering data) --
  // layer 0 for every item, so the sort below falls through to id order.
  kanji: (content, level) => content.listKanji(level).map((p) => ({ id: p.id, layer: 0 })),
  vocab: (content, level) => content.listVocab(level).map((p) => ({ id: p.id, layer: 0 })),
};

/**
 * Derived from `LEVEL_EXTRACTORS` (the exhaustively-checked source of truth)
 * rather than listed separately -- a separately-listed array type-checks fine
 * even if a new `ItemType` member is added and given a `LEVEL_EXTRACTORS`
 * entry but forgotten here, silently excluding it from scheduling. JS
 * preserves string-key insertion order, so this yields the same
 * ['grammar', 'kanji', 'vocab'] order as before.
 */
const ITEM_TYPES: readonly ItemType[] = Object.keys(LEVEL_EXTRACTORS) as readonly ItemType[];

/** Every id of `itemType` in an effective-available level, in new-card introduction order. */
export function availableItemIds(
  content: ContentDb, itemType: ItemType, availableCodes: ReadonlySet<string>,
): string[] {
  const ids: { id: string; ord: number; layer: number }[] = [];
  for (const lvl of content.listLevels()) {
    if (!availableCodes.has(lvl.code)) continue;
    for (const p of LEVEL_EXTRACTORS[itemType](content, lvl.code)) {
      ids.push({ id: p.id, ord: lvl.ord, layer: p.layer });
    }
  }
  // Level order first (N5 fully exhausted before N4 is ever offered as "new"),
  // then layer within a level, then id for a stable tie-break. Without the
  // level-ord key, a layer/id-only sort interleaves levels once two levels
  // both have real content and their ids happen to tie or sort adjacently
  // (e.g. "n4-..." < "n5-..." lexicographically) -- surfaced when N4 grammar
  // landed and flipped to available: new-card selection started offering N4
  // layer-1 items to a brand-new N5 learner before any N5 item at all.
  ids.sort((a, b) => a.ord - b.ord || a.layer - b.layer || a.id.localeCompare(b.id));
  return ids.map((x) => x.id);
}

/** Every id of `itemType` the content db can actually resolve, regardless of level status. */
function knownItemIds(content: ContentDb, itemType: ItemType): Set<string> {
  const s = new Set<string>();
  for (const lvl of content.listLevels()) {
    for (const p of LEVEL_EXTRACTORS[itemType](content, lvl.code)) s.add(p.id);
  }
  return s;
}

interface TypeContext {
  dueSorted: { itemId: string; due: string }[]; // due <= end of day, sorted by due ascending
  nextDueAt: string | null; // earliest due strictly after end of day, if any
}

function typeContext(
  user: UserDb, content: ContentDb, now: Date, itemType: ItemType,
): TypeContext {
  const endIso = toUtcIso(endOfLocalDay(now));
  // Drop cards whose content id no longer exists (renamed/removed point): the
  // review screen can't render them, so they must not gate or fill the queue.
  const knownContent = knownItemIds(content, itemType);
  const cards = user.allCards(itemType).filter((c) => knownContent.has(c.item_id));

  const dueSorted = cards
    .filter((c) => c.due <= endIso)
    .map((c) => ({ itemId: c.item_id, due: c.due }))
    .sort((a, b) => a.due.localeCompare(b.due));

  const future = cards.filter((c) => c.due > endIso).map((c) => c.due).sort();
  const nextDueAt = future.length ? future[0]! : null;

  return { dueSorted, nextDueAt };
}

interface Split {
  due: QueueItem[];
  dueTotalBeforeCap: number;
  queueOverCap: boolean;
  reviewedToday: number;
  nextDueAt: string | null;
}

function split(user: UserDb, content: ContentDb, now: Date): Split {
  const { cap } = settings(user);

  const ctx = Object.fromEntries(
    ITEM_TYPES.map((t) => [t, typeContext(user, content, now, t)]),
  ) as Record<ItemType, TypeContext>;

  // Merge all due cards across types, globally sorted by due date, capped once
  // (not per type -- a shared cap is what "review_queue_cap" means once more
  // than one item type can be due).
  const allDue = ITEM_TYPES.flatMap((t) => ctx[t].dueSorted.map((d) => ({ itemType: t, ...d })));
  allDue.sort((a, b) => a.due.localeCompare(b.due));
  const dueTotalBeforeCap = allDue.length;
  const queueOverCap = dueTotalBeforeCap > cap;
  const due: QueueItem[] = allDue
    .slice(0, cap)
    .map((d) => ({ itemType: d.itemType, itemId: d.itemId }));

  const nextDueCandidates = ITEM_TYPES.map((t) => ctx[t].nextDueAt).filter((x): x is string => x !== null);
  const nextDueAt = nextDueCandidates.length ? nextDueCandidates.sort()[0]! : null;

  const reviewedToday =
    user.reviewCountsByDay().find((r) => r.day_key === localDayKey(now))?.count ?? 0;

  return { due, dueTotalBeforeCap, queueOverCap, reviewedToday, nextDueAt };
}

export function daySummary(user: UserDb, content: ContentDb, now: Date): DaySummary {
  const s = split(user, content, now);
  const learnedOrBetter = user
    .allCards('grammar')
    .filter((c) => {
      const st = statusOf(c);
      return st === 'learned' || st === 'mastered';
    }).length;
  return {
    dueCount: s.due.length,
    reviewedToday: s.reviewedToday,
    queueOverCap: s.queueOverCap,
    allDone: s.due.length === 0,
    nextDueAt: s.nextDueAt,
    miniTestEligible: learnedOrBetter >= 5,
  };
}

export function buildQueue(user: UserDb, content: ContentDb, now: Date): QueueItem[] {
  const s = split(user, content, now);
  return seededShuffle([...s.due], hashSeed(localDayKey(now)));
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = arr.slice();
  let state = seed || 1;
  const rand = () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return ((state >>> 0) % 1_000_000) / 1_000_000;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
