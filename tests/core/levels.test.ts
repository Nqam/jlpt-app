import { describe, it, expect } from 'vitest';
import { UserDb } from '@/storage/user-db';
import { newCard, review } from '@/core/srs';
import {
  effectiveLevelStatus,
  availableLevelCodes,
  unlockLevel,
  backfillUnlockedFromProgress,
  UNLOCK_THRESHOLD,
} from '@/core/levels';
import type { ContentDb } from '@/storage/content-db';

const PARAMS = { requestRetention: 0.9, maximumInterval: 365, enableFuzz: false };
const now = new Date('2026-04-01T09:00:00.000Z');

// N5 available, N4 available (content ready), N3 coming_soon.
// N4 carries a small fixed set of ids so the grandfather-backfill tests have
// real n4 content ids to attach cards to.
const N4G = ['n4-g1'];
const N4K = ['n4-k1', 'n4-k2'];
const N4V = ['n4-v1'];
function fakeContent(n5g: string[], n5k: string[], n5v: string[]): ContentDb {
  const pick = <T,>(lvl: string, n5: T[], n4: T[]) => (lvl === 'N5' ? n5 : lvl === 'N4' ? n4 : []);
  return {
    listLevels: () => [
      { code: 'N5', ord: 1, status: 'available', titleRu: 'N5' },
      { code: 'N4', ord: 2, status: 'available', titleRu: 'N4' },
      { code: 'N3', ord: 3, status: 'coming_soon', titleRu: 'N3' },
    ],
    listGrammar: (lvl: string) => pick(lvl, n5g, N4G).map((id) => ({ id, level: lvl, title: id, layer: 1 })),
    grammarCountByLevel: (lvl: string) => pick(lvl, n5g, N4G).length,
    listKanji: (lvl: string) => pick(lvl, n5k, N4K).map((id) => ({ id, level: lvl, char: id, onyomi: [], kunyomi: [], meaningRu: '', strokeCount: 1 })),
    listVocab: (lvl: string) => pick(lvl, n5v, N4V).map((id) => ({ id, level: lvl, headword: id, reading: id, pos: '', meaningRu: '' })),
  } as unknown as ContentDb;
}

// consolidate `frac` of N5 in every type -> levelCompletion(N5) ~= frac
async function seed(frac: number): Promise<{ user: UserDb; content: ContentDb }> {
  const g = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g8', 'g9', 'g10'];
  const k = ['k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8', 'k9', 'k10'];
  const v = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8', 'v9', 'v10'];
  const content = fakeContent(g, k, v);
  const user = await UserDb.open(
    { platform: 'desktop', async readBundledContentDb() { throw new Error('x'); },
      async readSqlWasm() { const { readFileSync } = await import('node:fs');
        const { createRequire } = await import('node:module');
        return new Uint8Array(readFileSync(createRequire(import.meta.url).resolve('sql.js/dist/sql-wasm.wasm'))); },
      async readUserDb() { return null; }, async writeUserDb() {},
      async exportUserDb() { return false; }, async importUserDb() { return null; },
      async checkForUpdate() { return null; }, async openExternal() {}, async autoBackupUserDb() {} },
    '0.2.0', now,
  );
  const nConsolidate = Math.round(frac * 10);
  for (const list of [g, k, v] as const) {
    const type = list === g ? 'grammar' : list === k ? 'kanji' : 'vocab';
    for (let i = 0; i < nConsolidate; i++) {
      user.upsertCard(review(newCard(type, list[i]!, now), 4, now, 3000, PARAMS).card);
    }
  }
  return { user, content };
}

describe('core/levels', () => {
  it('the lowest level is always available', async () => {
    const { user, content } = await seed(0);
    expect(effectiveLevelStatus(user, content, 'N5', now)).toBe('available');
  });

  it('a coming_soon level stays coming_soon regardless of progress', async () => {
    const { user, content } = await seed(1);
    expect(effectiveLevelStatus(user, content, 'N3', now)).toBe('coming_soon');
  });

  it('N4 is locked below the threshold and available at/above it', async () => {
    const below = await seed(0.8);
    expect(effectiveLevelStatus(below.user, below.content, 'N4', now)).toBe('locked');
    const at = await seed(0.9);
    expect(effectiveLevelStatus(at.user, at.content, 'N4', now)).toBe('available');
  });

  it('a manual unlock opens N4 even at zero progress', async () => {
    const { user, content } = await seed(0);
    expect(effectiveLevelStatus(user, content, 'N4', now)).toBe('locked');
    unlockLevel(user, 'N4');
    expect(effectiveLevelStatus(user, content, 'N4', now)).toBe('available');
    expect(user.getSetting<string[]>('unlocked_levels', [])).toEqual(['N4']);
  });

  it('unlockLevel is idempotent', async () => {
    const { user } = await seed(0);
    unlockLevel(user, 'N4');
    unlockLevel(user, 'N4');
    expect(user.getSetting<string[]>('unlocked_levels', [])).toEqual(['N4']);
  });

  it('availableLevelCodes excludes a locked level, includes it after unlock', async () => {
    const { user, content } = await seed(0);
    expect([...availableLevelCodes(user, content, now)].sort()).toEqual(['N5']);
    unlockLevel(user, 'N4');
    expect([...availableLevelCodes(user, content, now)].sort()).toEqual(['N4', 'N5']);
  });

  it('UNLOCK_THRESHOLD is 0.9', () => {
    expect(UNLOCK_THRESHOLD).toBe(0.9);
  });

  describe('backfillUnlockedFromProgress', () => {
    it('a fresh user with no cards gets nothing unlocked; N4 stays locked', async () => {
      const { user, content } = await seed(0);
      backfillUnlockedFromProgress(user, content);
      expect(user.getSetting<string[]>('unlocked_levels', [])).toEqual([]);
      expect(effectiveLevelStatus(user, content, 'N4', now)).toBe('locked');
    });

    it('a user with an existing N4 card keeps N4 open after the backfill', async () => {
      const { user, content } = await seed(0);
      user.upsertCard(newCard('kanji', 'n4-k1', now));
      expect(effectiveLevelStatus(user, content, 'N4', now)).toBe('locked');
      backfillUnlockedFromProgress(user, content);
      expect(user.getSetting<string[]>('unlocked_levels', [])).toContain('N4');
      expect(effectiveLevelStatus(user, content, 'N4', now)).toBe('available');
    });

    it('never adds the lowest level even when it has cards', async () => {
      const { user, content } = await seed(0.5); // seeds N5 cards in all three types
      backfillUnlockedFromProgress(user, content);
      expect(user.getSetting<string[]>('unlocked_levels', [])).not.toContain('N5');
    });

    it('is idempotent', async () => {
      const { user, content } = await seed(0);
      user.upsertCard(newCard('grammar', 'n4-g1', now));
      backfillUnlockedFromProgress(user, content);
      backfillUnlockedFromProgress(user, content);
      expect(user.getSetting<string[]>('unlocked_levels', [])).toEqual(['N4']);
    });
  });
});
