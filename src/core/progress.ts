import type { UserDb, CardRow } from '@/storage/user-db';
import type { ContentDb } from '@/storage/content-db';
import type { ItemType } from '@/core/types';
import { statusOf, type Status } from '@/core/srs';
import { localDayKey, daysBetweenLocal, startOfLocalDay } from '@/core/time';

export interface LevelBars { studied: number; consolidated: number; total: number; }
export interface StatusCounts { new: number; learning: number; learned: number; mastered: number; }
export interface HeatCell { dayKey: string; count: number; }
export interface RibbonSegment { code: string; status: string; fill: number; }

function levelItemIds(content: ContentDb, levelCode: string, itemType: ItemType): Set<string> {
  const list =
    itemType === 'grammar' ? content.listGrammar(levelCode)
    : itemType === 'kanji' ? content.listKanji(levelCode)
    : content.listVocab(levelCode);
  return new Set(list.map((p) => p.id));
}

function totalForLevel(content: ContentDb, levelCode: string, itemType: ItemType): number {
  if (itemType === 'grammar') return content.grammarCountByLevel(levelCode);
  return levelItemIds(content, levelCode, itemType).size;
}

function cardsForLevel(user: UserDb, itemType: ItemType, ids: Set<string>): CardRow[] {
  return user.allCards(itemType).filter((c) => ids.has(c.item_id));
}

export function levelBars(
  user: UserDb, content: ContentDb, levelCode: string, itemType: ItemType,
): LevelBars {
  const total = totalForLevel(content, levelCode, itemType);
  if (total === 0) return { studied: 0, consolidated: 0, total: 0 };
  const cards = cardsForLevel(user, itemType, levelItemIds(content, levelCode, itemType));
  let studied = 0;
  let consolidated = 0;
  for (const c of cards) {
    const s = statusOf(c);
    if (s === 'learning' || s === 'learned' || s === 'mastered') studied++;
    if (s === 'learned' || s === 'mastered') consolidated++;
  }
  return { studied: studied / total, consolidated: consolidated / total, total };
}

export function statusCounts(
  user: UserDb, content: ContentDb, levelCode: string, itemType: ItemType,
): StatusCounts {
  const total = totalForLevel(content, levelCode, itemType);
  const cards = cardsForLevel(user, itemType, levelItemIds(content, levelCode, itemType));
  const counts: Record<Status, number> = { new: 0, learning: 0, learned: 0, mastered: 0 };
  for (const c of cards) counts[statusOf(c)]++;
  counts.new = Math.max(0, total - cards.length);
  return counts;
}

const COMPLETION_TYPES: readonly ItemType[] = ['grammar', 'kanji', 'vocab'];

export function levelCompletion(user: UserDb, content: ContentDb, levelCode: string): number {
  const parts: number[] = [];
  for (const t of COMPLETION_TYPES) {
    const b = levelBars(user, content, levelCode, t);
    if (b.total > 0) parts.push(b.consolidated);
  }
  return parts.length === 0 ? 0 : parts.reduce((a, b) => a + b, 0) / parts.length;
}

const K_ACTIVITY_DAYS = 'activity_days';
/** Bounds the setting's JSON size — a day key is ~10 bytes, so this caps at
 *  roughly a year of growth before the oldest days roll off. */
const MAX_ACTIVITY_DAYS = 370;

/**
 * Marks `now`'s local day as "something happened" for streak/heatmap
 * purposes, for activity that doesn't write a `review_log` row -- finishing
 * a course lesson (finale creates cards, not a review session) or reading a
 * text. Idempotent per day. `insertReviewLog` (real SRS reviews) already
 * covers itself via `reviewCountsByDay` and does not need this call too.
 */
export function recordActivity(user: UserDb, now: Date): void {
  const key = localDayKey(now);
  const days = user.getSetting<string[]>(K_ACTIVITY_DAYS, []);
  if (days.includes(key)) return;
  const next = [...days, key].sort();
  user.setSetting(
    K_ACTIVITY_DAYS,
    next.length > MAX_ACTIVITY_DAYS ? next.slice(next.length - MAX_ACTIVITY_DAYS) : next,
  );
}

/** Every day with either a real review or a recorded non-review activity, with a count. */
function activeDayCounts(user: UserDb): Map<string, number> {
  const byDay = new Map(user.reviewCountsByDay().map((r) => [r.day_key, r.count]));
  for (const day of user.getSetting<string[]>(K_ACTIVITY_DAYS, [])) {
    if (!byDay.has(day)) byDay.set(day, 1);
  }
  return byDay;
}

/** Has *today* (`now`'s local day) seen any recorded activity yet? */
export function hasActivityToday(user: UserDb, now: Date): boolean {
  return activeDayCounts(user).has(localDayKey(now));
}

export function streak(user: UserDb, now: Date): { current: number; best: number } {
  const days = [...activeDayCounts(user).keys()].sort();
  if (days.length === 0) return { current: 0, best: 0 };

  // longest run
  let best = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = new Date(`${days[i - 1]}T12:00:00`);
    const cur = new Date(`${days[i]}T12:00:00`);
    run = daysBetweenLocal(prev, cur) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }

  // current run: must end today or yesterday
  const lastDay = new Date(`${days[days.length - 1]}T12:00:00`);
  const gap = daysBetweenLocal(lastDay, now);
  if (gap > 1 || gap < 0) return { current: 0, best };
  let current = 1;
  for (let i = days.length - 2; i >= 0; i--) {
    const a = new Date(`${days[i]}T12:00:00`);
    const b = new Date(`${days[i + 1]}T12:00:00`);
    if (daysBetweenLocal(a, b) === 1) current++;
    else break;
  }
  return { current, best: Math.max(best, current) };
}

export function heatmap(user: UserDb, now: Date, weeks: number): HeatCell[] {
  const byDay = activeDayCounts(user);
  const cells: HeatCell[] = [];
  const start = startOfLocalDay(now);
  const days = weeks * 7;
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(start);
    d.setDate(d.getDate() - i);
    const key = localDayKey(d);
    cells.push({ dayKey: key, count: byDay.get(key) ?? 0 });
  }
  return cells;
}

export function levelRibbon(user: UserDb, content: ContentDb): RibbonSegment[] {
  return content.listLevels().map((lvl) => ({
    code: lvl.code,
    status: lvl.status,
    fill: lvl.status === 'available' ? levelCompletion(user, content, lvl.code) : 0,
  }));
}
