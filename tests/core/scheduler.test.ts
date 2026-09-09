import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import type { PlatformAdapter } from '@/platform/adapter';
import { UserDb } from '@/storage/user-db';
import { daySummary, buildQueue, availableItemIds } from '@/core/scheduler';
import { newCard } from '@/core/srs';
import { endOfLocalDay } from '@/core/time';

const wasm = readFileSync(createRequire(import.meta.url).resolve('sql.js/dist/sql-wasm.wasm'));

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

/** Minimal fake ContentDb with the methods the scheduler uses. */
function fakeContent(points: { id: string; layer: number }[]) {
  return {
    listLevels: () => [{ code: 'N5', status: 'available', ord: 1, titleRu: 'N5' }],
    listGrammar: () =>
      points.map((p) => ({ id: p.id, level: 'N5', title: p.id, layer: p.layer })),
    listKanji: () => [],
    listVocab: () => [],
  } as unknown as import('@/storage/content-db').ContentDb;
}

/**
 * Two AVAILABLE levels, both with layer-1 content whose ids happen to tie
 * (or sort adjacently) across levels -- reproduces the real bug found when
 * N4 grammar landed and flipped to available: a layer/id-only sort let a
 * later level's layer-1 items outrank an earlier level's, because e.g.
 * "n4-..." sorts before "n5-..." lexicographically. `availableItemIds`
 * must sort by level ord first so every N5 (ord 1) id precedes every
 * N4 (ord 2) id.
 */
function fakeMultiLevelContent() {
  const n5 = [
    { id: 'n5-a', layer: 1 }, { id: 'n5-b', layer: 1 }, { id: 'n5-c', layer: 1 },
    { id: 'n5-d', layer: 1 }, { id: 'n5-e', layer: 1 }, { id: 'n5-f', layer: 1 },
  ];
  const n4 = [{ id: 'n4-a', layer: 1 }, { id: 'n4-b', layer: 1 }];
  return {
    listLevels: () => [
      { code: 'N5', status: 'available', ord: 1, titleRu: 'N5' },
      { code: 'N4', status: 'available', ord: 2, titleRu: 'N4' },
    ],
    listGrammar: (level: string) =>
      (level === 'N5' ? n5 : n4).map((p) => ({ id: p.id, level, title: p.id, layer: p.layer })),
    grammarCountByLevel: (lvl: string) => (lvl === 'N5' ? n5.length : n4.length),
    listKanji: () => [],
    listVocab: () => [],
  } as unknown as import('@/storage/content-db').ContentDb;
}

const now = new Date('2026-03-10T09:00:00.000Z');
// Layer-ascending and id-ascending deliberately DIVERGE so `availableItemIds`'
// ordering-by-layer is actually observable: low layer = p6,p7,p8 / p3,p4,p5 ;
// low id = p1,p2,p3...
const POINTS = [
  { id: 'p1', layer: 3 }, { id: 'p2', layer: 3 }, { id: 'p3', layer: 2 },
  { id: 'p4', layer: 2 }, { id: 'p5', layer: 2 }, { id: 'p6', layer: 1 },
  { id: 'p7', layer: 1 }, { id: 'p8', layer: 1 },
];

describe('core/scheduler', () => {
  const savedTZ = process.env.TZ;
  beforeAll(() => { process.env.TZ = 'Europe/Moscow'; });
  afterAll(() => {
    if (savedTZ === undefined) delete process.env.TZ;
    else process.env.TZ = savedTZ;
  });

  let user: UserDb;
  beforeEach(async () => { user = await UserDb.open(fakeAdapter(), '0.2.0', now); });

  it('a fresh db has nothing to do: new material now comes only from lessons', () => {
    const s = daySummary(user, fakeContent(POINTS), now);
    expect(s.dueCount).toBe(0);
    expect(s.allDone).toBe(true);
  });

  it('a card of a locked level still comes up for review (review is not level-gated)', () => {
    // N4 NOT unlocked -> effectiveLevelStatus('N4') is 'locked' for this 0%-completion user
    const content = fakeMultiLevelContent();
    // seed a due N4 card
    const c = newCard('grammar', 'n4-a', now);
    c.reps = 1;
    c.due = new Date(now.getTime() - 3600_000).toISOString();
    user.upsertCard(c);
    const q = buildQueue(user, content, now);
    expect(q.map((i) => i.itemId)).toEqual(['n4-a']);
  });

  it('availableItemIds gates by level code and keeps N5 ids ahead of N4 ids', () => {
    const content = fakeMultiLevelContent();
    const withoutN4 = availableItemIds(content, 'grammar', new Set(['N5']));
    expect(withoutN4.some((id) => id.startsWith('n4-'))).toBe(false);
    expect(withoutN4.every((id) => id.startsWith('n5-'))).toBe(true);

    const withN4 = availableItemIds(content, 'grammar', new Set(['N5', 'N4']));
    expect(withN4.some((id) => id.startsWith('n4-'))).toBe(true);
    const firstN4 = withN4.findIndex((id) => id.startsWith('n4-'));
    const lastN5 = withN4.map((id) => id.startsWith('n5-')).lastIndexOf(true);
    expect(lastN5).toBeLessThan(firstN4); // every N5 id sorts before any N4 id
  });

  it('due cards with past due are queued, future ones are not', () => {
    const c = newCard('grammar', 'p1', now);
    c.reps = 1; c.due = new Date(now.getTime() - 3600_000).toISOString();
    user.upsertCard(c);

    // due strictly after the end of the local day — must not be queued today,
    // but should surface as the next-due hint.
    const f = newCard('grammar', 'p2', now);
    f.reps = 1;
    f.due = new Date(endOfLocalDay(now).getTime() + 3600_000).toISOString();
    user.upsertCard(f);

    const s = daySummary(user, fakeContent(POINTS), now);
    expect(s.dueCount).toBe(1);
    expect(s.nextDueAt).toBe(f.due);

    const q = buildQueue(user, fakeContent(POINTS), now);
    expect(q.some((i) => i.itemId === 'p1')).toBe(true);
    expect(q.some((i) => i.itemId === 'p2')).toBe(false); // future, excluded
  });

  it('excludes cards whose content id is unknown from the queue and dueCount', () => {
    const ghost = newCard('grammar', 'ghost-point', now); // not in POINTS
    ghost.reps = 1;
    ghost.due = new Date(now.getTime() - 3600_000).toISOString();
    user.upsertCard(ghost);

    const s = daySummary(user, fakeContent(POINTS), now);
    expect(s.dueCount).toBe(0); // ghost card is not clearable, so not counted

    const q = buildQueue(user, fakeContent(POINTS), now);
    expect(q.some((i) => i.itemId === 'ghost-point')).toBe(false);
  });

  it('caps the due queue at review_queue_cap', () => {
    user.setSetting('review_queue_cap', 2);
    for (const id of ['p1', 'p2', 'p3']) {
      const c = newCard('grammar', id, now);
      c.reps = 1; c.due = new Date(now.getTime() - 3600_000).toISOString();
      user.upsertCard(c);
    }
    const s = daySummary(user, fakeContent(POINTS), now);
    expect(s.queueOverCap).toBe(true);
    expect(s.dueCount).toBe(2); // capped
  });

  it('buildQueue is idempotent for the same inputs', () => {
    for (const id of ['p1', 'p2', 'p3']) {
      const c = newCard('grammar', id, now);
      c.reps = 1; c.due = new Date(now.getTime() - 3600_000).toISOString();
      user.upsertCard(c);
    }
    const a = buildQueue(user, fakeContent(POINTS), now).map((i) => i.itemId);
    const b = buildQueue(user, fakeContent(POINTS), now).map((i) => i.itemId);
    expect(a).toEqual(b);
    expect(a.sort()).toEqual(['p1', 'p2', 'p3']);
  });

  it('merges due cards across grammar and kanji into one globally-capped queue', () => {
    user.setSetting('review_queue_cap', 3);
    for (const id of ['p1', 'p2']) {
      const c = newCard('grammar', id, now);
      c.reps = 1; c.due = new Date(now.getTime() - 3600_000).toISOString();
      user.upsertCard(c);
    }
    for (const id of ['k1', 'k2']) {
      const c = newCard('kanji', id, now);
      c.reps = 1; c.due = new Date(now.getTime() - 1800_000).toISOString();
      user.upsertCard(c);
    }
    const content = {
      listLevels: () => [{ code: 'N5', status: 'available', ord: 1, titleRu: 'N5' }],
      listGrammar: () => POINTS.map((p) => ({ id: p.id, level: 'N5', title: p.id, layer: p.layer })),
      listKanji: () =>
        ['k1', 'k2'].map((id) => ({
          id, level: 'N5', char: id, onyomi: ['ア'], kunyomi: [], strokeCount: 1, meaningRu: id,
        })),
      listVocab: () => [],
    } as unknown as import('@/storage/content-db').ContentDb;

    const s = daySummary(user, content, now);
    expect(s.dueCount).toBe(3); // 4 due total, capped at 3, across both types combined
    expect(s.queueOverCap).toBe(true);

    const q = buildQueue(user, content, now);
    expect(q).toHaveLength(3);
    expect(q.some((i) => i.itemType === 'kanji')).toBe(true);
    expect(q.some((i) => i.itemType === 'grammar')).toBe(true);
  });

  it('merges due cards across all three item types into one globally-capped queue', () => {
    user.setSetting('review_queue_cap', 4);
    for (const id of ['p1', 'p2']) {
      const c = newCard('grammar', id, now);
      c.reps = 1; c.due = new Date(now.getTime() - 3600_000).toISOString();
      user.upsertCard(c);
    }
    const k = newCard('kanji', 'k1', now);
    k.reps = 1; k.due = new Date(now.getTime() - 1800_000).toISOString();
    user.upsertCard(k);
    const v = newCard('vocab', 'v1', now);
    v.reps = 1; v.due = new Date(now.getTime() - 900_000).toISOString();
    user.upsertCard(v);

    const content = {
      listLevels: () => [{ code: 'N5', status: 'available', ord: 1, titleRu: 'N5' }],
      listGrammar: () => POINTS.map((p) => ({ id: p.id, level: 'N5', title: p.id, layer: p.layer })),
      listKanji: () => [{ id: 'k1', level: 'N5', char: 'k1', onyomi: ['ア'], kunyomi: [], strokeCount: 1, meaningRu: 'k1' }],
      listVocab: () => [{ id: 'v1', level: 'N5', headword: 'v1', reading: 'v1', pos: '', meaningRu: 'v1' }],
    } as unknown as import('@/storage/content-db').ContentDb;

    const q = buildQueue(user, content, now);
    expect(q).toHaveLength(4);
    expect(new Set(q.map((i) => i.itemType))).toEqual(new Set(['grammar', 'kanji', 'vocab']));
  });

  it('miniTestEligible flips true at 5 learned-or-better cards', () => {
    const s0 = daySummary(user, fakeContent(POINTS), now);
    expect(s0.miniTestEligible).toBe(false);

    for (let i = 0; i < 5; i++) {
      const c = newCard('grammar', `p${i + 1}`, now);
      c.reps = 3; c.stability = 12; // 'learned'
      user.upsertCard(c);
    }
    const s1 = daySummary(user, fakeContent(POINTS), now);
    expect(s1.miniTestEligible).toBe(true);
  });

  it('learning-only cards do not make the mini-test eligible', () => {
    for (let i = 0; i < 6; i++) {
      const c = newCard('grammar', `p${i + 1}`, now);
      c.reps = 1; c.stability = 2; // 'learning'
      user.upsertCard(c);
    }
    expect(daySummary(user, fakeContent(POINTS), now).miniTestEligible).toBe(false);
  });
});
