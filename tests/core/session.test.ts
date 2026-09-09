import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import type { PlatformAdapter } from '@/platform/adapter';
import type { ContentDb, GrammarPointFull } from '@/storage/content-db';
import { UserDb } from '@/storage/user-db';
import { newCard } from '@/core/srs';
import { buildDailySession } from '@/core/session';

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
  } as PlatformAdapter;
}

function mkPoint(id: string, layer: number): GrammarPointFull {
  return {
    id, level: 'N5', title: `${id}: は (частица темы)`, layer, tags: [], related: [], relatedTitles: [],
    bodyMarkdown: `## Кратко\nОписание пункта ${id} — что он выражает и когда употребляется.`,
    examples: [
      { jaRuby: `わたしは 毎日[まいにち] 日本語[にほんご]を 勉強[べんきょう]します。`, ru: `перевод ${id}` },
    ],
  };
}
const POINTS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'].map((id, i) => mkPoint(id, i + 1));

function fakeContent(): ContentDb {
  const byId = new Map(POINTS.map((p) => [p.id, p]));
  return {
    listLevels: () => [{ code: 'N5', status: 'available', ord: 1, titleRu: 'N5' }],
    listGrammar: () => POINTS.map((p) => ({ id: p.id, level: 'N5', title: p.title, layer: p.layer })),
    listKanji: () => [],
    listVocab: () => [],
    getGrammar: (id: string) => byId.get(id) ?? null,
    getKanji: () => null,
    getVocab: () => null,
  } as unknown as ContentDb;
}

const now = new Date('2026-03-10T09:00:00.000Z');

describe('core/session', () => {
  const savedTZ = process.env.TZ;
  beforeAll(() => { process.env.TZ = 'Europe/Moscow'; });
  afterAll(() => { if (savedTZ === undefined) delete process.env.TZ; else process.env.TZ = savedTZ; });

  let user: UserDb;
  beforeEach(async () => { user = await UserDb.open(fakeAdapter(), '0.3.0', now); });

  it('a fresh db yields no steps: new material comes only from lessons', () => {
    const steps = buildDailySession(user, fakeContent(), now);
    expect(steps).toHaveLength(0);
  });

  it('due card -> exactly one review step', () => {
    const c = newCard('grammar', 'p1', now);
    c.reps = 4; c.stability = 10; c.due = new Date(now.getTime() - 3_600_000).toISOString();
    user.upsertCard(c);
    const steps = buildDailySession(user, fakeContent(), now);
    const reviewSteps = steps.filter((s) => s.phase === 'review');
    expect(reviewSteps).toHaveLength(1);
    expect(reviewSteps[0]!.item.itemId).toBe('p1');
  });

  it('no mini-test steps when fewer than 5 cards are learned', () => {
    const steps = buildDailySession(user, fakeContent(), now);
    expect(steps.some((s) => s.phase === 'minitest')).toBe(false);
  });

  it('mini-test: 5..8 steps from learned points when >= 5 are learned', () => {
    for (const id of POINTS.map((p) => p.id)) {
      const c = newCard('grammar', id, now);
      c.reps = 5; c.stability = 12; // learned
      c.due = new Date(now.getTime() + 7 * 86_400_000).toISOString(); // not due
      user.upsertCard(c);
    }
    const steps = buildDailySession(user, fakeContent(), now);
    const mt = steps.filter((s) => s.phase === 'minitest');
    expect(mt.length).toBeGreaterThanOrEqual(5);
    expect(mt.length).toBeLessThanOrEqual(8);
    mt.forEach((s, i) => {
      if (s.phase !== 'minitest') return;
      expect(POINTS.map((p) => p.id)).toContain(s.sourceItemId);
      expect(s.index).toBe(i);
      expect(s.question.id).toBe(`${s.sourceItemId}:mt:${i}`);
    });
  });

  it('is idempotent for the same now', () => {
    for (const id of POINTS.map((p) => p.id)) {
      const c = newCard('grammar', id, now);
      c.reps = 5; c.stability = 12;
      c.due = new Date(now.getTime() + 7 * 86_400_000).toISOString();
      user.upsertCard(c);
    }
    const a = buildDailySession(user, fakeContent(), now);
    const b = buildDailySession(user, fakeContent(), now);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('a due kanji card produces a kanji-generated review question', () => {
    const kanjiPoint = {
      id: 'n5-学', level: 'N5', char: '学', onyomi: ['ガク'], kunyomi: ['まな.ぶ'],
      strokeCount: 8, meaningRu: 'учиться',
    };
    const content = {
      listLevels: () => [{ code: 'N5', status: 'available', ord: 1, titleRu: 'N5' }],
      listGrammar: () => [],
      getGrammar: () => null,
      listKanji: () => [kanjiPoint],
      getKanji: (id: string) => (id === 'n5-学' ? kanjiPoint : null),
      listVocab: () => [],
      getVocab: () => null,
    } as unknown as ContentDb;

    user.upsertCard(newCard('kanji', 'n5-学', now));
    const steps = buildDailySession(user, content, now);
    const reviewIdx = steps.findIndex(
      (s) => s.phase === 'review' && s.item.itemType === 'kanji' && s.item.itemId === 'n5-学',
    );
    expect(reviewIdx).toBeGreaterThanOrEqual(0);
    const reviewStep = steps[reviewIdx] as Extract<(typeof steps)[number], { phase: 'review' }>;
    expect(reviewStep.question.itemType).toBe('kanji');
    expect(reviewStep.question.kind).toBe('choice');
  });

  it('two same-day kanji items get distinct question ids (seed is per-item, not day-wide)', () => {
    const kanjiA = {
      id: 'n5-学', level: 'N5', char: '学', onyomi: ['ガク'], kunyomi: ['まな.ぶ'],
      strokeCount: 8, meaningRu: 'учиться',
    };
    const kanjiB = {
      id: 'n5-生', level: 'N5', char: '生', onyomi: ['セイ'], kunyomi: ['い.きる'],
      strokeCount: 5, meaningRu: 'жизнь',
    };
    const content = {
      listLevels: () => [{ code: 'N5', status: 'available', ord: 1, titleRu: 'N5' }],
      listGrammar: () => [],
      getGrammar: () => null,
      listKanji: () => [kanjiA, kanjiB],
      getKanji: (id: string) => [kanjiA, kanjiB].find((k) => k.id === id) ?? null,
      listVocab: () => [],
      getVocab: () => null,
    } as unknown as ContentDb;

    user.upsertCard(newCard('kanji', 'n5-学', now));
    user.upsertCard(newCard('kanji', 'n5-生', now));
    const steps = buildDailySession(user, content, now);
    const reviewSteps = steps.filter(
      (s): s is Extract<(typeof steps)[number], { phase: 'review' }> =>
        s.phase === 'review' && s.item.itemType === 'kanji',
    );
    expect(reviewSteps).toHaveLength(2);
    const ids = reviewSteps.map((s) => s.question.id).sort();
    // Before the fix, both questions were seeded with the bare `dayKey`, so
    // `question.id` (= seed) was identical for every kanji item on a given
    // day -- which in turn made `shuffleWithAnswer` produce the same
    // permutation (and thus the same `answerIndex`) for every question.
    expect(new Set(ids).size).toBe(2);
    expect(ids).toEqual(['n5-学:2026-03-10', 'n5-生:2026-03-10'].sort());
  });

  it('a due vocab card produces a vocab-generated review question', () => {
    const vocabPoint = {
      id: 'n5-挨拶-あいさつ', level: 'N5', headword: '挨拶', reading: 'あいさつ', pos: 'сущ.', meaningRu: 'приветствие',
    };
    const content = {
      listLevels: () => [{ code: 'N5', status: 'available', ord: 1, titleRu: 'N5' }],
      listGrammar: () => [],
      getGrammar: () => null,
      listKanji: () => [],
      getKanji: () => null,
      listVocab: () => [vocabPoint],
      getVocab: (id: string) => (id === 'n5-挨拶-あいさつ' ? vocabPoint : null),
    } as unknown as ContentDb;

    user.upsertCard(newCard('vocab', 'n5-挨拶-あいさつ', now));
    const steps = buildDailySession(user, content, now);
    const reviewIdx = steps.findIndex(
      (s) => s.phase === 'review' && s.item.itemType === 'vocab' && s.item.itemId === 'n5-挨拶-あいさつ',
    );
    expect(reviewIdx).toBeGreaterThanOrEqual(0);
    const reviewStep = steps[reviewIdx] as Extract<(typeof steps)[number], { phase: 'review' }>;
    expect(reviewStep.question.itemType).toBe('vocab');
    expect(reviewStep.question.kind).toBe('choice');
  });
});
