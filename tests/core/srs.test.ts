import { describe, it, expect } from 'vitest';
import { newCard, review, statusOf, previewIntervals } from '@/core/srs';

const PARAMS = { requestRetention: 0.9, maximumInterval: 365, enableFuzz: false };
const now = new Date('2026-03-01T08:00:00.000Z');

describe('core/srs', () => {
  it('newCard starts unreviewed', () => {
    const c = newCard('grammar', 'n5-wa-particle', now);
    expect(c.reps).toBe(0);
    expect(c.state).toBe(0); // State.New
    expect(c.item_id).toBe('n5-wa-particle');
    expect(c.introduced_at).toBe(now.toISOString());
    expect(statusOf(c)).toBe('new');
  });

  it('Good raises stability, Again raises lapses and shortens the interval', () => {
    const c0 = newCard('grammar', 'g', now);
    const good = review(c0, 3, now, 5000, PARAMS).card;
    const later = new Date(good.due);
    const again = review(good, 1, later, 5000, PARAMS).card;
    expect(good.reps).toBe(1);
    expect(again.lapses).toBeGreaterThanOrEqual(good.lapses);
    expect(new Date(review(good, 4, later, 1000, PARAMS).card.due).getTime())
      .toBeGreaterThan(new Date(again.due).getTime());
  });

  it('review produces a log row with the pre-review state and elapsed_ms', () => {
    const c0 = newCard('grammar', 'g', now);
    const { log } = review(c0, 3, now, 4200, PARAMS);
    expect(log.state_before).toBe(0);
    expect(log.rating).toBe(3);
    expect(log.elapsed_ms).toBe(4200);
    expect(log.reviewed_at).toBe(now.toISOString());
    expect(log.day_key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(log.item_id).toBe('g');
  });

  it('statusOf thresholds at 7 and 30', () => {
    expect(statusOf({ reps: 1, stability: 6.99 })).toBe('learning');
    expect(statusOf({ reps: 1, stability: 7 })).toBe('learned');
    expect(statusOf({ reps: 1, stability: 29.99 })).toBe('learned');
    expect(statusOf({ reps: 1, stability: 30 })).toBe('mastered');
    expect(statusOf({ reps: 0, stability: 999 })).toBe('new');
  });

  it('previewIntervals returns a human string per rating, Easy >= Good >= Hard', () => {
    const c0 = newCard('grammar', 'g', now);
    const p = previewIntervals(c0, now, PARAMS);
    expect(Object.keys(p).map(Number).sort()).toEqual([1, 2, 3, 4]);
    for (const k of [1, 2, 3, 4]) expect(typeof p[k as 1]).toBe('string');
  });
});
