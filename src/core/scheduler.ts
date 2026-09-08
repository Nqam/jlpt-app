import type { UserDb } from '@/storage/user-db';
import type { ContentDb } from '@/storage/content-db';
import type { ItemType } from '@/core/types';
import { startOfLocalDay, endOfLocalDay, toUtcIso, localDayKey } from '@/core/time';
import { statusOf } from '@/core/srs';

export type { ItemType };

export interface DaySummary {
  dueCount: number;
  newCount: number;
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
  kind: 'due' | 'new';
}

function settings(user: UserDb) {
  return {
    newPerDay: user.getSetting('new_per_day', 5),
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

/** Every id of `itemType` in an `available` level, in new-card introduction order. */
export function availableItemIds(content: ContentDb, itemType: ItemType): string[] {
  const ids: { id: string; ord: number; layer: number }[] = [];
  for (const lvl of content.listLevels()) {
    if (lvl.status !== 'available') continue;
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
  unknownAvailable: string[]; // available ids with no card yet, in introduction order
  introducedToday: number;
}

function typeContext(user: UserDb, content: ContentDb, now: Date, itemType: ItemType): TypeContext {
  const endIso = toUtcIso(endOfLocalDay(now));
  const startIso = toUtcIso(startOfLocalDay(now));
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

  const known = new Set(cards.map((c) => c.item_id));
  const unknownAvailable = availableItemIds(content, itemType).filter((id) => !known.has(id));
  const introducedToday = user.introducedOnOrAfter(startIso, itemType);

  return { dueSorted, nextDueAt, unknownAvailable, introducedToday };
}

/**
 * Water-fills `total` across the types in `order`: each round gives every
 * still-hungry type an equal FLOOR share of what's left, hands the one-unit-
 * per-type remainder to the first types in `order` (at most one extra unit
 * each), caps each type at its remaining room, then drops types that hit
 * their room and repeats. A type with zero room from the start (no available
 * content, e.g. a level not shipped yet, or a test fixture that doesn't stub
 * it) never enters a round and never steals budget from the others.
 *
 * Uses floor+remainder rather than a per-round `Math.ceil` share: with 2
 * active types, ceil and floor+remainder agree (there is at most one leftover
 * unit either way). From 3 types on they diverge -- a ceil share rounds UP
 * for EVERY type in the round, not just enough of them to place the
 * remainder, so the earlier types in `order` can jointly exhaust the whole
 * round's budget before the loop ever reaches the later ones. Concretely,
 * total=7 across three unlimited-room types used to yield
 * grammar=3/kanji=3/vocab=1 (kanji's rounded-up 3 ate the unit vocab should
 * have shared); floor+remainder yields grammar=3/kanji=2/vocab=2.
 */
function allocateBudget(
  total: number,
  order: readonly ItemType[],
  capacity: (t: ItemType) => number,
): Record<ItemType, number> {
  const alloc = Object.fromEntries(order.map((t) => [t, 0])) as Record<ItemType, number>;
  let remaining = total;
  let active = order.filter((t) => capacity(t) > 0);
  while (remaining > 0 && active.length > 0) {
    const base = Math.floor(remaining / active.length);
    let leftover = remaining - base * active.length;
    for (const t of active) {
      const room = capacity(t) - alloc[t];
      const want = base + (leftover > 0 ? 1 : 0);
      if (leftover > 0) leftover -= 1;
      const take = Math.min(want, room, remaining);
      alloc[t] += take;
      remaining -= take;
    }
    active = active.filter((t) => capacity(t) - alloc[t] > 0);
  }
  return alloc;
}

interface Split {
  due: QueueItem[];
  newItems: QueueItem[];
  dueTotalBeforeCap: number;
  queueOverCap: boolean;
  reviewedToday: number;
  nextDueAt: string | null;
}

function split(user: UserDb, content: ContentDb, now: Date): Split {
  const { newPerDay, cap } = settings(user);

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
    .map((d) => ({ itemType: d.itemType, itemId: d.itemId, kind: 'due' as const }));

  const nextDueCandidates = ITEM_TYPES.map((t) => ctx[t].nextDueAt).filter((x): x is string => x !== null);
  const nextDueAt = nextDueCandidates.length ? nextDueCandidates.sort()[0]! : null;

  const introducedToday = ITEM_TYPES.reduce((sum, t) => sum + ctx[t].introducedToday, 0);
  const totalBudget = queueOverCap ? 0 : Math.max(0, newPerDay - introducedToday);
  const alloc = allocateBudget(totalBudget, ITEM_TYPES, (t) => ctx[t].unknownAvailable.length);
  const newItems: QueueItem[] = ITEM_TYPES.flatMap((t) =>
    ctx[t].unknownAvailable
      .slice(0, alloc[t])
      .map((id): QueueItem => ({ itemType: t, itemId: id, kind: 'new' })),
  );

  const reviewedToday =
    user.reviewCountsByDay().find((r) => r.day_key === localDayKey(now))?.count ?? 0;

  return { due, newItems, dueTotalBeforeCap, queueOverCap, reviewedToday, nextDueAt };
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
    newCount: s.newItems.length,
    reviewedToday: s.reviewedToday,
    queueOverCap: s.queueOverCap,
    allDone: s.due.length === 0 && s.newItems.length === 0,
    nextDueAt: s.nextDueAt,
    miniTestEligible: learnedOrBetter >= 5,
  };
}

export function buildQueue(user: UserDb, content: ContentDb, now: Date): QueueItem[] {
  const s = split(user, content, now);
  const items: QueueItem[] = [...s.due, ...s.newItems];
  const shuffled = seededShuffle(items, hashSeed(localDayKey(now)));
  if (s.due.length > 0 && shuffled[0]?.kind === 'new') {
    const firstDue = shuffled.findIndex((i) => i.kind === 'due');
    if (firstDue > 0) [shuffled[0], shuffled[firstDue]] = [shuffled[firstDue]!, shuffled[0]!];
  }
  return shuffled;
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
