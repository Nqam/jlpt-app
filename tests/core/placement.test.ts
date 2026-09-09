import { describe, it, expect } from 'vitest';
import {
  placementCount,
  initPlacement,
  nextPlacementQuestion,
  applyPlacementAnswer,
  isPlacementDone,
  placementKnownIds,
  placementQuestionNumber,
  placementTotal,
  migratePlacementMarks,
} from '@/core/placement';
import type { ContentDb } from '@/storage/content-db';
import type { UserDb } from '@/storage/user-db';
import type { CardRow } from '@/storage/user-db';
import type { ItemType } from '@/core/types';

const ALL = new Set(['N5', 'N4', 'N3', 'N2', 'N1']);

/**
 * Minimal ContentDb fake. `layer: i + 1` makes availableItemIds' (ord, layer, id)
 * sort return ids in array order. Kanji/vocab points carry just enough for their
 * generators (which pad distractors with '—' when the pool is thin).
 */
function fakeContent(opts: {
  grammar?: string[];
  kanji?: string[];
  vocab?: string[];
}): ContentDb {
  const grammar = (opts.grammar ?? []).map((id, i) => ({
    id, level: 'N5', title: 'は', layer: i + 1, tags: [], related: [], relatedTitles: [],
    bodyMarkdown: '## Кратко\nは выделяет тему предложения и ставится после неё.',
    examples: [{ jaRuby: 'これは 本[ほん]です。', ru: 'Это книга.' }],
  }));
  const kanji = (opts.kanji ?? []).map((id, i) => ({
    id, level: 'N5', char: '水', onyomi: ['スイ'], kunyomi: ['みず'], strokeCount: 4,
    meaningRu: `значение ${i}`,
  }));
  const vocab = (opts.vocab ?? []).map((id, i) => ({
    id, level: 'N5', headword: '水', reading: 'みず', pos: 'сущ.', meaningRu: `слово ${i}`,
  }));
  const gById = new Map(grammar.map((p) => [p.id, p]));
  const kById = new Map(kanji.map((p) => [p.id, p]));
  const vById = new Map(vocab.map((p) => [p.id, p]));
  return {
    listLevels: () => [{ code: 'N5', status: 'available', ord: 1, titleRu: 'N5' }],
    listGrammar: () => grammar.map((p) => ({ id: p.id, level: p.level, title: p.title, layer: p.layer })),
    getGrammar: (id: string) => gById.get(id) ?? null,
    listKanji: () => kanji,
    getKanji: (id: string) => kById.get(id) ?? null,
    listVocab: () => vocab,
    getVocab: (id: string) => vById.get(id) ?? null,
  } as unknown as ContentDb;
}

/** UserDb fake: only getCard/getSetting/setSetting. `cards` maps `${type}:${id}` → CardRow. */
function fakeUser(cards: Record<string, Partial<CardRow>> = {}): UserDb & {
  _settings: Record<string, unknown>;
} {
  const settings: Record<string, unknown> = {};
  return {
    _settings: settings,
    getCard: (type: string, id: string) => (cards[`${type}:${id}`] as CardRow) ?? null,
    getSetting: <T,>(key: string, fallback: T) => (key in settings ? (settings[key] as T) : fallback),
    setSetting: (key: string, value: unknown) => { settings[key] = value; },
  } as unknown as UserDb & { _settings: Record<string, unknown> };
}

/** A card row that statusOf() reads as the given status. */
function cardAt(status: 'new' | 'learning' | 'learned' | 'mastered'): Partial<CardRow> {
  const stability = { new: 0, learning: 3, learned: 15, mastered: 40 }[status];
  return { reps: status === 'new' ? 0 : 3, stability };
}

describe('placementCount', () => {
  it('clamps a small percentage up to the floor of min(total, 10)', () => {
    expect(placementCount(43, 10)).toBe(10); // round(4.3)=4 -> floor 10
  });
  it('returns the whole section at 100%', () => {
    expect(placementCount(43, 100)).toBe(43);
  });
  it('reflects the true fraction for large sections — no upper cap', () => {
    expect(placementCount(681, 10)).toBe(68); // round(68.1)
    expect(placementCount(681, 25)).toBe(170); // round(170.25)
    expect(placementCount(681, 50)).toBe(341); // round(340.5)
    expect(placementCount(681, 100)).toBe(681);
  });
  it('gives each percentage a distinct count for a large section', () => {
    const counts = ([10, 25, 50, 100] as const).map((p) => placementCount(681, p));
    expect(new Set(counts).size).toBe(4);
  });
  it('collapses to total when total <= 10', () => {
    expect(placementCount(5, 10)).toBe(5);
    expect(placementCount(5, 100)).toBe(5);
  });
  it('is 0 for an empty section', () => {
    expect(placementCount(0, 50)).toBe(0);
  });
});

describe('initPlacement', () => {
  const ids = Array.from({ length: 12 }, (_, i) => `g${i}`);

  it('samples exactly placementCount ids', () => {
    const content = fakeContent({ grammar: ids });
    const s = initPlacement(content, fakeUser(), 'grammar', ALL, 50, 'seed');
    expect(s.ids).toHaveLength(placementCount(12, 50)); // round(6)=6
    expect(new Set(s.ids).size).toBe(s.ids.length); // no duplicates
    for (const id of s.ids) expect(ids).toContain(id);
  });

  it('is deterministic for a given seed and varies by seed', () => {
    const content = fakeContent({ grammar: ids });
    const a = initPlacement(content, fakeUser(), 'grammar', ALL, 50, 'seed-A');
    const b = initPlacement(content, fakeUser(), 'grammar', ALL, 50, 'seed-A');
    const c = initPlacement(content, fakeUser(), 'grammar', ALL, 50, 'seed-B');
    expect(a.ids).toEqual(b.ids);
    expect(a.ids).not.toEqual(c.ids);
  });

  it('orders not-yet-passed ids before passed ones', () => {
    const content = fakeContent({ grammar: ids });
    // g0..g5 have a learning+ card (passed); g6..g11 have none (not passed).
    const cards: Record<string, Partial<CardRow>> = {};
    for (let i = 0; i < 6; i++) cards[`grammar:g${i}`] = cardAt('learning');
    const s = initPlacement(content, fakeUser(cards), 'grammar', ALL, 100, 'seed');
    expect(s.ids).toHaveLength(12);
    const firstSix = new Set(s.ids.slice(0, 6));
    const lastSix = new Set(s.ids.slice(6));
    for (const id of firstSix) expect(Number(id.slice(1))).toBeGreaterThanOrEqual(6); // not passed
    for (const id of lastSix) expect(Number(id.slice(1))).toBeLessThan(6);            // passed
  });

  it('treats a card in status "new" (reps 0) as not-yet-passed', () => {
    const content = fakeContent({ grammar: ['g0', 'g1'] });
    const cards = { 'grammar:g0': cardAt('new') };
    const s = initPlacement(content, fakeUser(cards), 'grammar', ALL, 100, 'seed');
    // both are "not passed" -> both eligible; nothing forced to the tail
    expect(new Set(s.ids)).toEqual(new Set(['g0', 'g1']));
  });

  it('carries the itemType through and starts at index 0 with no correct ids', () => {
    const content = fakeContent({ kanji: ['k0', 'k1'] });
    const s = initPlacement(content, fakeUser(), 'kanji', ALL, 100, 'seed');
    expect(s.itemType).toBe('kanji');
    expect(s.index).toBe(0);
    expect(s.correctIds).toEqual([]);
  });

  it('returns an empty sample and is immediately done when the pool is empty', () => {
    const content = fakeContent({ grammar: [] });
    const s = initPlacement(content, fakeUser(), 'grammar', ALL, 50, 'seed');
    expect(s.ids).toEqual([]);
    expect(isPlacementDone(s)).toBe(true);
  });
});

describe('nextPlacementQuestion', () => {
  it('uses the grammar generator for a grammar test', () => {
    const content = fakeContent({ grammar: ['g0', 'g1'] });
    const s = initPlacement(content, fakeUser(), 'grammar', ALL, 100, 'seed');
    const step = nextPlacementQuestion(s, content, 'seed')!;
    expect(step.itemId).toBe(s.ids[0]);
    expect(step.question.itemType).toBe('grammar');
  });

  it('uses the kanji generator for a kanji test', () => {
    const content = fakeContent({ kanji: ['k0', 'k1', 'k2'] });
    const s = initPlacement(content, fakeUser(), 'kanji', ALL, 100, 'seed');
    const step = nextPlacementQuestion(s, content, 'seed')!;
    expect(step.question.itemType).toBe('kanji');
  });

  it('uses the vocab generator for a vocab test', () => {
    const content = fakeContent({ vocab: ['v0', 'v1', 'v2'] });
    const s = initPlacement(content, fakeUser(), 'vocab', ALL, 100, 'seed');
    const step = nextPlacementQuestion(s, content, 'seed')!;
    expect(step.question.itemType).toBe('vocab');
  });

  it('is deterministic for a given seed', () => {
    const content = fakeContent({ grammar: ['g0', 'g1'] });
    const s = initPlacement(content, fakeUser(), 'grammar', ALL, 100, 'seed');
    const a = nextPlacementQuestion(s, content, 'seed')!;
    const b = nextPlacementQuestion(s, content, 'seed')!;
    expect(a.question.id).toBe(b.question.id);
  });

  it('returns null once the cursor passes the end', () => {
    const content = fakeContent({ grammar: ['g0'] });
    let s = initPlacement(content, fakeUser(), 'grammar', ALL, 100, 'seed');
    s = applyPlacementAnswer(s, true);
    expect(isPlacementDone(s)).toBe(true);
    expect(nextPlacementQuestion(s, content, 'seed')).toBeNull();
  });

  it('returns null when the current id does not resolve to content', () => {
    const content = fakeContent({ grammar: ['g0'] });
    const s = { itemType: 'grammar' as ItemType, ids: ['ghost'], index: 0, correctIds: [] };
    expect(nextPlacementQuestion(s, content, 'seed')).toBeNull();
  });
});

describe('applyPlacementAnswer / placementKnownIds / counters', () => {
  it('advances the cursor and records only correct ids', () => {
    const content = fakeContent({ grammar: ['g0', 'g1', 'g2'] });
    let s = initPlacement(content, fakeUser(), 'grammar', ALL, 100, 'seed');
    const asked: string[] = [];
    asked.push(s.ids[s.index]!);
    s = applyPlacementAnswer(s, true);
    asked.push(s.ids[s.index]!);
    s = applyPlacementAnswer(s, false);
    asked.push(s.ids[s.index]!);
    s = applyPlacementAnswer(s, true);
    expect(isPlacementDone(s)).toBe(true);
    expect(placementKnownIds(s)).toEqual([asked[0], asked[2]]);
  });

  it('reports a 1-based question number and a fixed total', () => {
    const content = fakeContent({ grammar: ['g0', 'g1', 'g2', 'g3'] });
    let s = initPlacement(content, fakeUser(), 'grammar', ALL, 100, 'seed');
    expect(placementTotal(s)).toBe(4);
    expect(placementQuestionNumber(s)).toBe(1);
    s = applyPlacementAnswer(s, true);
    expect(placementQuestionNumber(s)).toBe(2);
    expect(placementTotal(s)).toBe(4);
  });
});

describe('migratePlacementMarks', () => {
  it('copies the old grammar-only key into the per-type grammar key, then consumes the legacy key', () => {
    const user = fakeUser();
    user._settings['placement_marked_ids'] = ['g1', 'g2'];
    migratePlacementMarks(user);
    expect(user._settings['placement_marked_grammar_ids']).toEqual(['g1', 'g2']);
    expect(user._settings['placement_marked_ids']).toHaveLength(0);
  });

  it('is idempotent — a second call does not double or clobber', () => {
    const user = fakeUser();
    user._settings['placement_marked_ids'] = ['g1'];
    migratePlacementMarks(user);
    user._settings['placement_marked_grammar_ids'] = ['g1', 'earned-later'];
    migratePlacementMarks(user); // legacy key already [] -> must not overwrite the populated key
    expect(user._settings['placement_marked_grammar_ids']).toEqual(['g1', 'earned-later']);
  });

  it('does not resurrect marks after a Settings reset empties the per-type key', () => {
    const user = fakeUser();
    user._settings['placement_marked_ids'] = ['g1'];
    migratePlacementMarks(user); // consumes the legacy key
    user._settings['placement_marked_grammar_ids'] = []; // simulate a Settings "reset grammar"
    migratePlacementMarks(user);
    expect(user._settings['placement_marked_grammar_ids']).toEqual([]);
  });

  it('does nothing when there is no old key', () => {
    const user = fakeUser();
    migratePlacementMarks(user);
    expect(user._settings['placement_marked_grammar_ids']).toBeUndefined();
  });
});
