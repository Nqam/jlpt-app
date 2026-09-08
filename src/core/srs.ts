import { fsrs, generatorParameters, createEmptyCard, type Card, type Grade, type State } from 'ts-fsrs';
import type { CardRow, ReviewLogRow } from '@/storage/user-db';
import { toUtcIso, localDayKey } from '@/core/time';

export type Rating = 1 | 2 | 3 | 4; // Again | Hard | Good | Easy
export type Status = 'new' | 'learning' | 'learned' | 'mastered';

export interface SrsParams {
  requestRetention: number;
  maximumInterval: number;
  enableFuzz: boolean;
}

function engine(p: SrsParams) {
  return fsrs(
    generatorParameters({
      request_retention: p.requestRetention,
      maximum_interval: p.maximumInterval,
      enable_fuzz: p.enableFuzz,
    }),
  );
}

function toFsrsCard(row: CardRow): Card {
  return {
    due: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days,
    learning_steps: row.learning_steps,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state as State,
    last_review: row.last_review ? new Date(row.last_review) : undefined,
  };
}

function fromFsrsCard(
  card: Card,
  base: Pick<CardRow, 'item_type' | 'item_id' | 'introduced_at'>,
): CardRow {
  return {
    item_type: base.item_type,
    item_id: base.item_id,
    introduced_at: base.introduced_at,
    due: toUtcIso(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? toUtcIso(card.last_review) : null,
  };
}

export function newCard(itemType: string, itemId: string, now: Date): CardRow {
  const empty = createEmptyCard(now);
  return fromFsrsCard(empty, {
    item_type: itemType,
    item_id: itemId,
    introduced_at: toUtcIso(now),
  });
}

export function review(
  row: CardRow,
  rating: Rating,
  now: Date,
  elapsedMs: number,
  params: SrsParams,
): { card: CardRow; log: ReviewLogRow } {
  const stateBefore = row.state;
  const { card } = engine(params).next(toFsrsCard(row), now, rating as unknown as Grade);
  const next = fromFsrsCard(card, row);
  const log: ReviewLogRow = {
    item_type: row.item_type,
    item_id: row.item_id,
    reviewed_at: toUtcIso(now),
    day_key: localDayKey(now),
    rating,
    state_before: stateBefore,
    stability_after: card.stability,
    elapsed_ms: Math.max(0, Math.round(elapsedMs)),
  };
  return { card: next, log };
}

export function statusOf(card: Pick<CardRow, 'reps' | 'stability'>): Status {
  if (card.reps === 0) return 'new';
  if (card.stability < 7) return 'learning';
  if (card.stability < 30) return 'learned';
  return 'mastered';
}

export function previewIntervals(
  row: CardRow,
  now: Date,
  params: SrsParams,
): Record<Rating, string> {
  const preview = engine(params).repeat(toFsrsCard(row), now);
  const out = {} as Record<Rating, string>;
  for (const r of [1, 2, 3, 4] as Rating[]) {
    const due = preview[r as unknown as Grade].card.due;
    out[r] = humanInterval(due.getTime() - now.getTime());
  }
  return out;
}

function humanInterval(ms: number): string {
  const min = ms / 60000;
  if (min < 60) return `${Math.max(1, Math.round(min))} мин`;
  const hours = min / 60;
  if (hours < 24) return `${Math.round(hours)} ч`;
  const days = hours / 24;
  if (days < 30) return `${Math.round(days)} д`;
  const months = days / 30;
  if (months < 12) return `${Math.round(months)} мес`;
  return `${(days / 365).toFixed(1)} г`;
}
