import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import type { PlatformAdapter } from '@/platform/adapter';
import { UserDb } from '@/storage/user-db';
import { newCard, review } from '@/core/srs';
import {
  levelBars, statusCounts, levelCompletion, streak, heatmap, recordActivity, hasActivityToday,
} from '@/core/progress';

const wasm = readFileSync(createRequire(import.meta.url).resolve('sql.js/dist/sql-wasm.wasm'));
const PARAMS = { requestRetention: 0.9, maximumInterval: 365, enableFuzz: false };

function fakeAdapter(): PlatformAdapter {
  let store: Uint8Array | null = null;
  return {
    platform: 'desktop',
    async readBundledContentDb() { throw new Error('unused'); },
    async readSqlWasm() { return new Uint8Array(wasm); },
    async readUserDb() { return store; },
    async writeUserDb(b: Uint8Array) { store = b.slice(); },
    async exportUserDb() { throw new Error('unused'); },
    async importUserDb() { throw new Error('unused'); },
    async checkForUpdate() { return null; },
    async openExternal() {},
    async autoBackupUserDb() {},
  };
}
function fakeContent(grammarIds: string[], kanjiIds: string[] = [], vocabIds: string[] = []) {
  return {
    listLevels: () => [{ code: 'N5', ord: 1, status: 'available', titleRu: 'N5' }],
    listGrammar: () => grammarIds.map((id) => ({ id, level: 'N5', title: id, layer: 1 })),
    grammarCountByLevel: () => grammarIds.length,
    listKanji: () => kanjiIds.map((id) => ({ id, level: 'N5', char: id, onyomi: [], kunyomi: [], meaningRu: '', strokeCount: 1 })),
    listVocab: () => vocabIds.map((id) => ({ id, level: 'N5', headword: id, reading: id, pos: '', meaningRu: '' })),
  } as unknown as import('@/storage/content-db').ContentDb;
}

const now = new Date('2026-04-01T09:00:00.000Z');

describe('core/progress', () => {
  // Pin TZ: the tests hardcode day_key strings against fixed UTC instants.
  const savedTZ = process.env.TZ;
  beforeAll(() => { process.env.TZ = 'Europe/Moscow'; });
  afterAll(() => {
    if (savedTZ === undefined) delete process.env.TZ;
    else process.env.TZ = savedTZ;
  });

  let user: UserDb;
  const content = fakeContent(['p1', 'p2', 'p3', 'p4'], ['k1', 'k2'], ['v1', 'v2', 'v3', 'v4', 'v5']);
  beforeEach(async () => { user = await UserDb.open(fakeAdapter(), '0.2.0', now); });

  it('bars are zero on an empty db', () => {
    expect(levelBars(user, content, 'N5', 'grammar')).toEqual({ studied: 0, consolidated: 0, total: 4 });
    expect(statusCounts(user, content, 'N5', 'grammar')).toEqual({ new: 4, learning: 0, learned: 0, mastered: 0 });
  });

  it('a reviewed card moves into learning and lifts the studied bar', () => {
    const c = review(newCard('grammar', 'p1', now), 3, now, 3000, PARAMS).card;
    user.upsertCard(c);
    const b = levelBars(user, content, 'N5', 'grammar');
    expect(b.studied).toBeCloseTo(0.25);
    const sc = statusCounts(user, content, 'N5', 'grammar');
    expect(sc.new).toBe(3);
    expect(sc.learning + sc.learned + sc.mastered).toBe(1);
  });

  it('levelBars works for kanji and vocab item types', async () => {
    const u = await UserDb.open(fakeAdapter(), '0.2.0', now);
    u.upsertCard(review(newCard('kanji', 'k1', now), 4, now, 3000, PARAMS).card); // -> consolidated
    u.upsertCard(review(newCard('vocab', 'v1', now), 3, now, 3000, PARAMS).card); // -> learning
    expect(levelBars(u, content, 'N5', 'kanji')).toMatchObject({ total: 2, consolidated: 0.5 });
    const vb = levelBars(u, content, 'N5', 'vocab');
    expect(vb.total).toBe(5);
    expect(vb.studied).toBeCloseTo(0.2);
    expect(vb.consolidated).toBe(0);
  });

  it('levelCompletion averages the consolidated fraction across the three types', async () => {
    const u = await UserDb.open(fakeAdapter(), '0.2.0', now);
    expect(levelCompletion(u, content, 'N5')).toBe(0); // empty
    for (const id of ['p1', 'p2', 'p3', 'p4']) u.upsertCard(review(newCard('grammar', id, now), 4, now, 3000, PARAMS).card);
    // grammar 4/4 = 1, kanji 0, vocab 0 -> mean 1/3
    expect(levelCompletion(u, content, 'N5')).toBeCloseTo(1 / 3);
  });

  it('levelCompletion ignores a type with no content', async () => {
    const c = fakeContent(['p1', 'p2'], [], []); // only grammar has items
    const u = await UserDb.open(fakeAdapter(), '0.2.0', now);
    u.upsertCard(review(newCard('grammar', 'p1', now), 4, now, 3000, PARAMS).card);
    expect(levelCompletion(u, c, 'N5')).toBeCloseTo(0.5); // mean over the one non-empty type
  });

  it('streak: reviewed today = 1; gap yesterday = 0', () => {
    user.insertReviewLog({
      item_type: 'grammar', item_id: 'p1', reviewed_at: now.toISOString(),
      day_key: '2026-04-01', rating: 3, state_before: 0, stability_after: 3, elapsed_ms: 1000,
    });
    expect(streak(user, now)).toEqual({ current: 1, best: 1 });

    const later = new Date('2026-04-05T09:00:00.000Z');
    expect(streak(user, later).current).toBe(0); // last review 4 days ago
    expect(streak(user, later).best).toBe(1);
  });

  it('streak counts a run ending yesterday as still current', () => {
    for (const d of ['2026-03-30', '2026-03-31']) {
      user.insertReviewLog({
        item_type: 'grammar', item_id: 'p1', reviewed_at: `${d}T09:00:00.000Z`,
        day_key: d, rating: 3, state_before: 0, stability_after: 3, elapsed_ms: 1000,
      });
    }
    expect(streak(user, now)).toEqual({ current: 2, best: 2 }); // now = 2026-04-01, run ended yesterday
  });

  it('heatmap spans the window and marks today', () => {
    user.insertReviewLog({
      item_type: 'grammar', item_id: 'p1', reviewed_at: now.toISOString(),
      day_key: '2026-04-01', rating: 3, state_before: 0, stability_after: 3, elapsed_ms: 1000,
    });
    const cells = heatmap(user, now, 2);
    expect(cells).toHaveLength(14);
    expect(cells[cells.length - 1]).toEqual({ dayKey: '2026-04-01', count: 1 });
    expect(cells[0]!.count).toBe(0);
  });

  it('recordActivity: hasActivityToday is false until recorded, true after, and idempotent', () => {
    expect(hasActivityToday(user, now)).toBe(false);
    recordActivity(user, now);
    expect(hasActivityToday(user, now)).toBe(true);
    recordActivity(user, now); // second call same day: no-op, no duplicate entry
    expect(user.getSetting<string[]>('activity_days', [])).toEqual(['2026-04-01']);
  });

  it('recordActivity (no FSRS review) still builds a streak — course/text days count', () => {
    recordActivity(user, new Date('2026-03-31T09:00:00.000Z'));
    recordActivity(user, now); // 2026-04-01
    expect(streak(user, now)).toEqual({ current: 2, best: 2 });
  });

  it('streak merges review-log days and activity-only days into one run', () => {
    user.insertReviewLog({
      item_type: 'grammar', item_id: 'p1', reviewed_at: '2026-03-30T09:00:00.000Z',
      day_key: '2026-03-30', rating: 3, state_before: 0, stability_after: 3, elapsed_ms: 1000,
    });
    recordActivity(user, new Date('2026-03-31T09:00:00.000Z')); // course-only day, no review
    user.insertReviewLog({
      item_type: 'grammar', item_id: 'p1', reviewed_at: now.toISOString(),
      day_key: '2026-04-01', rating: 3, state_before: 0, stability_after: 3, elapsed_ms: 1000,
    });
    expect(streak(user, now)).toEqual({ current: 3, best: 3 });
  });

  it('heatmap counts an activity-only day as 1', () => {
    recordActivity(user, now);
    const cells = heatmap(user, now, 1);
    expect(cells[cells.length - 1]).toEqual({ dayKey: '2026-04-01', count: 1 });
  });
});
