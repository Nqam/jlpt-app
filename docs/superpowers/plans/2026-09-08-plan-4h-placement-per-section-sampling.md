# Plan 4h — Placement as Per-Section Sampling + "learned" markers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the grammar-only binary-search placement test with one algorithm for all three
sections (grammar / kanji / vocab): a no-extrapolation random sample sized by the user in percent,
where a correct answer marks that point "known" and everything else stays a normal new card; and
show per-item SRS status dots in the three reference-list screens.

**Architecture:** `src/core/placement.ts` is rewritten from scratch: `PlacementState` becomes a
fixed list of sampled ids plus a cursor, `initPlacement` splits the available pool into
not-yet-passed / passed halves (by SRS card status), seeded-shuffles each and concatenates
`[not-passed] ++ [passed]`, then takes the first `count`. Questions reuse the three existing
generators (`generateForCard`, `generateKanjiQuestion`, `generateVocabQuestion`) with `reps=0`.
On completion the screen creates real "Easy" (rating 4) FSRS cards for correct ids that have no
card yet, exactly as plan 4e did, but tags them per-type (`placement_marked_{type}_ids`). The
route becomes `/placement/:type`; the old `/placement` redirects to `/placement/grammar`. A new
`StatusDot` component reuses the existing heat palette to color list items by card status. Entry
points: a "Пройти тест по разделу" link in each reference-list header, three links in Settings,
the first-run offer on `TodayScreen`.

**Tech Stack:** Unchanged — TypeScript, React 18, react-router-dom 6, Vitest, Playwright, sql.js,
ts-fsrs. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-08-plan-4h-placement-per-section-sampling-design.md` —
this plan implements that spec in full.

## Global Constraints

- **No extrapolation.** A point is marked "known" if and only if the user answered its own
  question correctly. "Answered 19/20 — mark the rest?" is deliberately not built.
- **No `review_log` writes from placement.** Marking a point "known" calls `user.upsertCard(card)`
  only — never `user.insertReviewLog(...)`. Placement must not inflate streak / reviewed-today.
- **Never overwrite an existing card.** Before creating a card for a correct id, check
  `user.getCard(type, id)` — if it exists (any status), skip it.
- **Correct answer → rating 4 ("Легко"), never 3.** Rating 3 puts the card in Learning due in
  ~10 min and floods today's queue; rating 4 lands it in Review with a multi-day interval. This
  was the plan-4e review finding — do not regress it.
- **`placement_offered` is a one-way flag** (unchanged from 4e): set `true` on completion
  (including a run that marks zero cards) and on skipping the offer; the first-run offer never
  shows again. Retaking from Settings or a list header does not depend on or reset it.
- **`placementCount` formula, verbatim from spec §Решение п.1:**
  `count = clamp(round(pct/100 * total), min(total, 10), min(total, 100))`.
- **Locked levels have no per-section test.** `initPlacement`'s pool is
  `availableItemIds(content, type, availableCodes)`, which already excludes `locked` levels.
  Entry-point links are shown only when the active level is effectively `available`.
- **Reuse, don't reinvent.** Ordering: `availableItemIds` from `@/core/scheduler` (already
  exported). Questions: the three existing generators. Shuffle: `seededShuffle` from
  `@/core/quiz/rng`. Status: `statusOf` from `@/core/srs`.
- **Node not on PATH:** prefix every `npm`/`npx` run with
  `export PATH="$PATH:/c/Program Files/nodejs" &&` (Bash), as established in this repo.
- **Working tree is `jlpt-app/`** — a git repo with default branch `main` (public, orphan
  history). All commits land on `main`.

---

## File Structure

**Created:**
- `src/ui/components/StatusDot.tsx` — one small presentational component, `{status: Status}` → a
  colored dot (or `null` for `'new'`).
- `tests/ui/StatusDot.test.tsx`
- `tests/e2e/placement-kanji.spec.ts` — new e2e: kanji-section test reached from the Kanji header.

**Rewritten (whole file):**
- `src/core/placement.ts` — sampling algorithm; all binary-search code removed.
- `src/ui/screens/PlacementScreen.tsx` — `/placement/:type`, volume-choice screen, per-type tags.
- `tests/core/placement.test.ts`
- `tests/ui/PlacementScreen.test.tsx`
- `tests/e2e/placement.spec.ts` — first-run grammar flow through the new volume screen.

**Modified:**
- `src/ui/routes.tsx` — `/placement/:type` + a redirect element for the bare `/placement`.
- `src/ui/UserDbProvider.tsx` — call `migratePlacementMarks(db)` next to `backfillUnlockedFromProgress`.
- `src/ui/screens/GrammarListScreen.tsx` / `KanjiListScreen.tsx` / `VocabListScreen.tsx` — status
  dots on list items + search results, "Пройти тест по разделу" header link.
- `src/ui/screens/SettingsScreen.tsx` — three test links + per-type reset buttons (drop per-level).
- `src/ui/screens/TodayScreen.tsx` — offer link → `/placement/grammar`, extra hint line.
- `src/ui/theme.css` — `.status-dot*` rules, `.placement-entry` rule.
- `tests/ui/GrammarListScreen.test.tsx` / `KanjiListScreen.test.tsx` / `VocabListScreen.test.tsx`
  — add a `useUserDb` mock; assert dots + header link.
- `tests/ui/SettingsScreen.test.tsx` — three links + per-type reset.
- `tests/ui/TodayScreen.test.tsx` — offer link href + hint line.
- `package.json` — version `1.3.0` → `1.4.0` (Task 6 only).

---

## Task 1: Rewrite `src/core/placement.ts` (sampling algorithm)

**Files:**
- Rewrite: `src/core/placement.ts` (whole file — 102 lines of binary-search code replaced)
- Rewrite: `tests/core/placement.test.ts` (whole file)

**Interfaces:**
- Consumes: `availableItemIds(content, itemType, availableCodes: ReadonlySet<string>): string[]`
  from `@/core/scheduler`; `statusOf(card: Pick<CardRow,'reps'|'stability'>): Status` from
  `@/core/srs`; `seededShuffle<T>(arr: readonly T[], seed: string): T[]` from `@/core/quiz/rng`;
  `generateForCard(point, levelPoints, reps, dayKey)` from `@/core/quiz/registry`;
  `generateKanjiQuestion(point, levelPoints, reps, seed)` from `@/core/quiz/kanji-questions`;
  `generateVocabQuestion(point, levelPoints, reps, seed)` from `@/core/quiz/vocab-questions`;
  `levelPointsFor(content, level): GrammarPointFull[]` from `@/core/session`;
  `UserDb.getCard(itemType, itemId): CardRow | null`,
  `UserDb.getSetting<T>(key, fallback): T`, `UserDb.setSetting(key, value): void`;
  `ContentDb.getGrammar/getKanji/getVocab`, `ContentDb.listKanji/listVocab`.
- Produces (consumed by Task 2, exact signatures):
  ```ts
  export type PlacementPercent = 10 | 25 | 50 | 100;
  export interface PlacementState {
    itemType: ItemType;
    ids: string[];        // the sample, length = placementCount(pool.length, pct)
    index: number;        // 0-based cursor over ids
    correctIds: string[]; // ids answered correctly so far
  }
  export function placementCount(total: number, pct: PlacementPercent): number;
  export function initPlacement(
    content: ContentDb, user: UserDb, itemType: ItemType,
    availableCodes: ReadonlySet<string>, pct: PlacementPercent, seed: string,
  ): PlacementState;
  export function isPlacementDone(s: PlacementState): boolean;
  export function placementQuestionNumber(s: PlacementState): number; // s.index + 1
  export function placementTotal(s: PlacementState): number;          // s.ids.length
  export function nextPlacementQuestion(
    s: PlacementState, content: ContentDb, seed: string,
  ): { itemId: string; question: Question } | null;
  export function applyPlacementAnswer(s: PlacementState, correct: boolean): PlacementState;
  export function placementKnownIds(s: PlacementState): string[];     // s.correctIds
  export function migratePlacementMarks(user: UserDb): void;
  ```
- Removed (Task 2 must not import): `placementFrontierIds`, `placementRemaining`, the old
  `PlacementState` shape (`lo`/`hi`/`askedCount`), the old two-arg `initPlacement`, the old
  three-arg `nextPlacementQuestion` semantics (signature stays but behavior changes).

---

- [ ] **Step 1: Write the failing test — whole new `tests/core/placement.test.ts`**

Replace the entire file with:

```ts
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
  it('caps at 100 for large sections', () => {
    expect(placementCount(681, 25)).toBe(100); // round(170.25)=170 -> ceil 100
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
  it('copies the old grammar-only key into the per-type grammar key, once', () => {
    const user = fakeUser();
    user._settings['placement_marked_ids'] = ['g1', 'g2'];
    migratePlacementMarks(user);
    expect(user._settings['placement_marked_grammar_ids']).toEqual(['g1', 'g2']);
  });

  it('is idempotent — a second call does not double or clobber', () => {
    const user = fakeUser();
    user._settings['placement_marked_ids'] = ['g1'];
    migratePlacementMarks(user);
    user._settings['placement_marked_grammar_ids'] = ['g1', 'earned-later'];
    migratePlacementMarks(user); // must not overwrite the now-populated key
    expect(user._settings['placement_marked_grammar_ids']).toEqual(['g1', 'earned-later']);
  });

  it('does nothing when there is no old key', () => {
    const user = fakeUser();
    migratePlacementMarks(user);
    expect(user._settings['placement_marked_grammar_ids']).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/core/placement.test.ts`
Expected: FAIL — `placementCount` / `placementTotal` / `migratePlacementMarks` not exported;
old exports referenced nowhere so the import line itself throws.

- [ ] **Step 3: Rewrite `src/core/placement.ts` (whole file)**

```ts
import type { ItemType } from '@/core/types';
import type { ContentDb } from '@/storage/content-db';
import type { UserDb } from '@/storage/user-db';
import type { Question } from '@/core/quiz/types';
import { availableItemIds } from '@/core/scheduler';
import { statusOf } from '@/core/srs';
import { seededShuffle } from '@/core/quiz/rng';
import { generateForCard } from '@/core/quiz/registry';
import { generateKanjiQuestion } from '@/core/quiz/kanji-questions';
import { generateVocabQuestion } from '@/core/quiz/vocab-questions';
import { levelPointsFor } from '@/core/session';

export type PlacementPercent = 10 | 25 | 50 | 100;

export interface PlacementState {
  itemType: ItemType;
  /** The sampled points, in ask order. Length === placementCount(pool.length, pct). */
  ids: string[];
  /** Cursor over `ids`, 0-based. */
  index: number;
  /** Ids the user answered correctly — the only ones that get marked "known". */
  correctIds: string[];
}

/**
 * Question count for a section size and chosen percentage:
 * `clamp(round(pct/100 * total), min(total, 10), min(total, 100))`.
 * So a tiny section (<=10) is always tested whole, a huge one is capped at 100,
 * and anything in between gets at least 10 questions.
 */
export function placementCount(total: number, pct: PlacementPercent): number {
  const raw = Math.round((pct / 100) * total);
  const lo = Math.min(total, 10);
  const hi = Math.min(total, 100);
  return Math.min(Math.max(raw, lo), hi);
}

/**
 * Builds a placement test. The pool is `availableItemIds(content, itemType,
 * availableCodes)` — the same canonical order the daily scheduler uses, already
 * excluding locked levels. The pool is split into "not yet passed" (no card, or a
 * card still in status `new`) and "passed" (card in learning/learned/mastered),
 * each part is seeded-shuffled, the parts are concatenated `[not passed] ++
 * [passed]`, and the first `placementCount(pool.length, pct)` are taken. A retake
 * therefore tops up the untested points first and only repeats tested ones once
 * those run out.
 */
export function initPlacement(
  content: ContentDb,
  user: UserDb,
  itemType: ItemType,
  availableCodes: ReadonlySet<string>,
  pct: PlacementPercent,
  seed: string,
): PlacementState {
  const pool = availableItemIds(content, itemType, availableCodes);
  const notPassed: string[] = [];
  const passed: string[] = [];
  for (const id of pool) {
    const card = user.getCard(itemType, id);
    if (!card || statusOf(card) === 'new') notPassed.push(id);
    else passed.push(id);
  }
  const ordered = [
    ...seededShuffle(notPassed, `${seed}:np`),
    ...seededShuffle(passed, `${seed}:p`),
  ];
  const count = placementCount(pool.length, pct);
  return { itemType, ids: ordered.slice(0, count), index: 0, correctIds: [] };
}

export function isPlacementDone(s: PlacementState): boolean {
  return s.index >= s.ids.length;
}

export function placementQuestionNumber(s: PlacementState): number {
  return s.index + 1;
}

export function placementTotal(s: PlacementState): number {
  return s.ids.length;
}

/**
 * The question for the point at the cursor. `null` if the test is done or the id
 * does not resolve to content. Dispatches to the section's own generator with
 * `reps=0`, seeded `${seed}:${id}` so a given run is deterministic.
 */
export function nextPlacementQuestion(
  s: PlacementState,
  content: ContentDb,
  seed: string,
): { itemId: string; question: Question } | null {
  if (isPlacementDone(s)) return null;
  const itemId = s.ids[s.index]!;
  const qSeed = `${seed}:${itemId}`;
  if (s.itemType === 'grammar') {
    const point = content.getGrammar(itemId);
    if (!point) return null;
    return { itemId, question: generateForCard(point, levelPointsFor(content, point.level), 0, qSeed) };
  }
  if (s.itemType === 'kanji') {
    const point = content.getKanji(itemId);
    if (!point) return null;
    return { itemId, question: generateKanjiQuestion(point, content.listKanji(point.level), 0, qSeed) };
  }
  const point = content.getVocab(itemId);
  if (!point) return null;
  return { itemId, question: generateVocabQuestion(point, content.listVocab(point.level), 0, qSeed) };
}

export function applyPlacementAnswer(s: PlacementState, correct: boolean): PlacementState {
  const itemId = s.ids[s.index]!;
  return {
    ...s,
    index: s.index + 1,
    correctIds: correct ? [...s.correctIds, itemId] : s.correctIds,
  };
}

export function placementKnownIds(s: PlacementState): string[] {
  return s.correctIds;
}

/**
 * One-time migration of the plan-4e grammar-only `placement_marked_ids` key into
 * the per-type `placement_marked_grammar_ids` key. Idempotent: does nothing once
 * the per-type key is non-empty (whether from a prior migration or a real
 * grammar retake under the new code) and nothing when there is no old key.
 */
export function migratePlacementMarks(user: UserDb): void {
  const old = user.getSetting<string[]>('placement_marked_ids', []);
  if (old.length === 0) return;
  if (user.getSetting<string[]>('placement_marked_grammar_ids', []).length > 0) return;
  user.setSetting('placement_marked_grammar_ids', old);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/core/placement.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Typecheck — the old exports are gone, so stale importers surface here**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npm run typecheck`
Expected: FAIL, and only in `src/ui/screens/PlacementScreen.tsx` (still imports
`placementFrontierIds` / `placementRemaining` / old `initPlacement` arity). That file is
rewritten in Task 2 — leave it. If typecheck reports errors in any **other** file, stop and
reconcile before continuing (nothing else should import those symbols).

- [ ] **Step 6: Commit**

```bash
git add src/core/placement.ts tests/core/placement.test.ts
git commit -m "feat(placement): rewrite core as per-section sampling, drop binary search

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: Rewrite `PlacementScreen` — `/placement/:type`, volume choice, per-type tags

**Files:**
- Rewrite: `src/ui/screens/PlacementScreen.tsx` (whole file)
- Modify: `src/ui/routes.tsx` (add `/placement/:type`, redirect bare `/placement`)
- Modify: `src/ui/UserDbProvider.tsx` (call `migratePlacementMarks`)
- Rewrite: `tests/ui/PlacementScreen.test.tsx` (whole file)

**Interfaces:**
- Consumes from Task 1: `PlacementPercent`, `PlacementState`, `placementCount`, `initPlacement`,
  `isPlacementDone`, `placementQuestionNumber`, `placementTotal`, `nextPlacementQuestion`,
  `applyPlacementAnswer`, `placementKnownIds`, `migratePlacementMarks` (all from `@/core/placement`).
- Consumes existing: `availableItemIds` from `@/core/scheduler`; `availableLevelCodes` from
  `@/core/levels`; `newCard`, `review` from `@/core/srs`; `grade` from `@/core/quiz/grade`;
  `QuestionView` (prop `showExplainLink={false}`); `useParams`, `useNavigate`, `Navigate` from
  `react-router-dom`.
- Produces: the route `/placement/:type` where `type ∈ 'grammar' | 'kanji' | 'vocab'`; a
  `PlacementRedirect` element for the bare `/placement`. Settings string keys written:
  `placement_marked_grammar_ids`, `placement_marked_kanji_ids`, `placement_marked_vocab_ids`
  (used by Task 4's Settings screen), plus `placement_offered` (bool).

---

- [ ] **Step 1: Write the failing test — whole new `tests/ui/PlacementScreen.test.tsx`**

```tsx
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { ChoiceQuestion } from '@/core/quiz/types';

const upsertCard = vi.fn();
const insertReviewLog = vi.fn();
const getCard = vi.fn<(type: string, id: string) => unknown>(() => null);
const setSetting = vi.fn();
const settings: Record<string, unknown> = {};
vi.mock('@/ui/useUserDb', () => ({
  useUserDb: () => ({
    getCard,
    upsertCard,
    insertReviewLog,
    setSetting,
    getSetting: (k: string, d: unknown) => (k in settings ? settings[k] : d),
  }),
}));
vi.mock('@/ui/useContentDb', () => ({ useContentDb: () => ({}) }));
vi.mock('@/core/levels', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  availableLevelCodes: () => new Set(['N5', 'N4', 'N3', 'N2', 'N1']),
}));

// availableItemIds decides the volume-screen total; mock it to a fixed pool.
const pool: { value: string[] } = { value: [] };
vi.mock('@/core/scheduler', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  availableItemIds: () => pool.value,
}));

function choiceQ(id: string, itemId: string): ChoiceQuestion {
  return {
    id, itemType: 'grammar', itemId, kind: 'choice',
    prompt: 'Вопрос?', choices: ['A', 'B', 'C', 'D'], answerIndex: 0,
  };
}

interface FakeState { itemType: string; ids: string[]; index: number; correctIds: string[]; }
const known: { value: string[] } = { value: [] };
vi.mock('@/core/placement', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  return {
    ...real,
    initPlacement: (_c: unknown, _u: unknown, type: string, _a: unknown, pct: number): FakeState => ({
      itemType: type, ids: scriptFor(pct), index: 0, correctIds: [],
    }),
    nextPlacementQuestion: (s: FakeState) =>
      s.index < s.ids.length
        ? { itemId: s.ids[s.index], question: choiceQ(`${s.ids[s.index]}:${s.index}`, s.ids[s.index]!) }
        : null,
    applyPlacementAnswer: (s: FakeState, correct: boolean): FakeState => ({
      ...s, index: s.index + 1,
      correctIds: correct ? [...s.correctIds, s.ids[s.index]!] : s.correctIds,
    }),
    isPlacementDone: (s: FakeState) => s.index >= s.ids.length,
    placementQuestionNumber: (s: FakeState) => s.index + 1,
    placementTotal: (s: FakeState) => s.ids.length,
    placementKnownIds: () => known.value,
    // real placementCount used by the volume screen
  };
});
// pct -> id list the fake initPlacement returns
function scriptFor(pct: number): string[] {
  return pct === 10 ? ['p1', 'p2'] : ['p1', 'p2', 'p3', 'p4'];
}

import { PlacementScreen } from '@/ui/screens/PlacementScreen';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/placement/:type" element={<PlacementScreen />} />
        <Route path="/" element={<div>СЕГОДНЯ</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PlacementScreen', () => {
  beforeEach(() => {
    upsertCard.mockClear();
    insertReviewLog.mockClear();
    getCard.mockClear();
    getCard.mockImplementation(() => null);
    setSetting.mockClear();
    for (const k of Object.keys(settings)) delete settings[k];
    pool.value = Array.from({ length: 43 }, (_, i) => `g${i}`);
    known.value = [];
  });

  it('shows a volume-choice screen with four percentage buttons', () => {
    renderAt('/placement/grammar');
    expect(screen.getByRole('button', { name: /10\s*%/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /25\s*%/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /50\s*%/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /100\s*%/ })).toBeInTheDocument();
  });

  it('shows one "whole section" button when the pool is 10 or fewer', () => {
    pool.value = ['g0', 'g1', 'g2'];
    renderAt('/placement/grammar');
    expect(screen.getByRole('button', { name: /весь раздел \(3\)/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /10\s*%/ })).toBeNull();
  });

  it('picking a percentage starts the questions with a "N из M" counter', () => {
    renderAt('/placement/grammar');
    fireEvent.click(screen.getByRole('button', { name: /10\s*%/ }));
    expect(screen.getByText(/Вопрос 1 из 2/)).toBeInTheDocument();
  });

  it('completing a kanji test upserts a card per known id, tags placement_marked_kanji_ids, writes no review log', () => {
    known.value = ['p1', 'p2'];
    renderAt('/placement/kanji');
    fireEvent.click(screen.getByRole('button', { name: /10\s*%/ }));
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    fireEvent.click(screen.getByRole('button', { name: /далее/i }));
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    fireEvent.click(screen.getByRole('button', { name: /далее/i }));

    expect(screen.getByText(/Отмечено как уже известные: 2/)).toBeInTheDocument();
    expect(upsertCard).toHaveBeenCalledTimes(2);
    expect(insertReviewLog).not.toHaveBeenCalled();
    expect(setSetting).toHaveBeenCalledWith('placement_offered', true);
    expect(setSetting).toHaveBeenCalledWith(
      'placement_marked_kanji_ids', expect.arrayContaining(['p1', 'p2']),
    );
    expect(setSetting).not.toHaveBeenCalledWith('placement_marked_grammar_ids', expect.anything());
  });

  it('does not create a card for a known id that already has one', () => {
    known.value = ['p1', 'p2'];
    getCard.mockImplementation((_t: string, id: string) => (id === 'p2' ? { item_id: 'p2' } : null));
    renderAt('/placement/grammar');
    fireEvent.click(screen.getByRole('button', { name: /10\s*%/ }));
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    fireEvent.click(screen.getByRole('button', { name: /далее/i }));
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    fireEvent.click(screen.getByRole('button', { name: /далее/i }));
    expect(screen.getByText(/Отмечено как уже известные: 1/)).toBeInTheDocument();
    expect(upsertCard).toHaveBeenCalledTimes(1);
  });

  it('redirects an unknown :type to the grammar volume screen', () => {
    renderAt('/placement/bogus');
    // grammar volume screen still renders its buttons (no crash, no blank)
    expect(screen.getByRole('button', { name: /10\s*%/ })).toBeInTheDocument();
  });
});
```

Note for the implementer: the redirect test relies on the screen rendering `<Navigate
to="/placement/grammar" replace />` for a bad `:type`; with the single `<Route path="/placement/:type">`
above, `Navigate` re-enters the same element with `type='grammar'`, so the grammar volume screen
shows. That is the intended behavior.

- [ ] **Step 2: Run the test to verify it fails**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/ui/PlacementScreen.test.tsx`
Expected: FAIL — current screen has no volume-choice screen and reads `:type` from nowhere.

- [ ] **Step 3: Rewrite `src/ui/screens/PlacementScreen.tsx` (whole file)**

```tsx
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { useUserDb } from '@/ui/useUserDb';
import { useContentDb } from '@/ui/useContentDb';
import {
  initPlacement,
  nextPlacementQuestion,
  applyPlacementAnswer,
  isPlacementDone,
  placementKnownIds,
  placementQuestionNumber,
  placementTotal,
  placementCount,
  type PlacementPercent,
  type PlacementState,
} from '@/core/placement';
import type { ItemType } from '@/core/types';
import { availableItemIds } from '@/core/scheduler';
import { availableLevelCodes } from '@/core/levels';
import { QuestionView } from '@/ui/components/QuestionView';
import { grade } from '@/core/quiz/grade';
import { newCard, review } from '@/core/srs';
import type { Answer, GradedAnswer } from '@/core/quiz/types';

const SECTION_LABEL: Record<ItemType, string> = {
  grammar: 'грамматика',
  kanji: 'кандзи',
  vocab: 'слова',
};
const PERCENTS: PlacementPercent[] = [10, 25, 50, 100];

function isItemType(v: string | undefined): v is ItemType {
  return v === 'grammar' || v === 'kanji' || v === 'vocab';
}

export function PlacementScreen() {
  const { type } = useParams();
  const user = useUserDb();
  const content = useContentDb();
  const navigate = useNavigate();

  // A stable per-mount seed: the sample and every question are derived from it.
  const [seed] = useState(() => Date.now().toString());
  const [state, setState] = useState<PlacementState | null>(null);
  const [graded, setGraded] = useState<GradedAnswer | null>(null);
  const [markedCount, setMarkedCount] = useState<number | null>(null);
  const appliedRef = useRef(false);

  const availableCodes = useMemo(
    () => (isItemType(type) ? availableLevelCodes(user, content, new Date()) : new Set<string>()),
    [user, content, type],
  );
  const total = useMemo(
    () => (isItemType(type) ? availableItemIds(content, type, availableCodes).length : 0),
    [content, type, availableCodes],
  );

  const current = useMemo(
    () => (state ? nextPlacementQuestion(state, content, seed) : null),
    [state, content, seed],
  );

  useLayoutEffect(() => {
    setGraded(null);
  }, [state]);

  useEffect(() => {
    if (!state || !isItemType(type)) return;
    if (!isPlacementDone(state) || appliedRef.current) return;
    appliedRef.current = true;
    const now = new Date();
    const params = {
      requestRetention: user.getSetting('fsrs_request_retention', 0.9),
      maximumInterval: user.getSetting('fsrs_maximum_interval', 365),
      enableFuzz: user.getSetting('fsrs_enable_fuzz', true),
    };
    // Rating 4 ("Легко") — see plan 4e: rating 3 lands the card in Learning due
    // in ~10 min and floods today's queue right after the test.
    const newlyMarked: string[] = [];
    for (const itemId of placementKnownIds(state)) {
      if (user.getCard(type, itemId)) continue;
      const { card } = review(newCard(type, itemId, now), 4, now, 0, params);
      user.upsertCard(card);
      newlyMarked.push(itemId);
    }
    if (newlyMarked.length > 0) {
      const key = `placement_marked_${type}_ids`;
      const existing = user.getSetting<string[]>(key, []);
      user.setSetting(key, [...new Set([...existing, ...newlyMarked])]);
    }
    user.setSetting('placement_offered', true);
    setMarkedCount(newlyMarked.length);
  }, [state, type, user]);

  const answer = useCallback(
    (a: Answer) => {
      if (!current || graded) return;
      setGraded(grade(current.question, a));
    },
    [current, graded],
  );

  const next = useCallback(() => {
    if (!current || !graded) return;
    setState((s) => (s ? applyPlacementAnswer(s, graded.correct) : s));
  }, [current, graded]);

  const startWith = useCallback(
    (pct: PlacementPercent) => {
      if (!isItemType(type)) return;
      setState(initPlacement(content, user, type, availableCodes, pct, seed));
    },
    [content, user, type, availableCodes, seed],
  );

  if (!isItemType(type)) return <Navigate to="/placement/grammar" replace />;

  if (markedCount !== null) {
    return (
      <section className="screen placement placement-done">
        <h1>Готово</h1>
        <p>Отмечено как уже известные: {markedCount}.</p>
        <button type="button" className="btn-primary" onClick={() => navigate('/')}>
          На сегодня
        </button>
      </section>
    );
  }

  // Volume-choice screen: shown until a percentage is picked.
  if (state === null) {
    return (
      <section className="screen placement placement-volume">
        <h1>Тест: {SECTION_LABEL[type]}</h1>
        {total === 0 ? (
          <p className="muted">В этом разделе пока нет материала для теста.</p>
        ) : total <= 10 ? (
          <button type="button" className="btn-primary" onClick={() => startWith(100)}>
            Весь раздел ({total})
          </button>
        ) : (
          <div className="placement-volume-buttons">
            {PERCENTS.map((p) => (
              <button
                key={p}
                type="button"
                className="btn-ghost"
                onClick={() => startWith(p)}
              >
                {p}% · ≈{placementCount(total, p)}
              </button>
            ))}
          </div>
        )}
        <p className="today-hint">
          Верные ответы отметят пункты как известные. Остальные останутся в ежедневном повторении.
        </p>
      </section>
    );
  }

  if (!current) return null;

  return (
    <section className="screen placement">
      <p className="placement-counter">
        Вопрос {placementQuestionNumber(state)} из {placementTotal(state)}
      </p>
      <QuestionView
        key={current.question.id}
        question={current.question}
        onAnswer={answer}
        revealed={graded}
        showExplainLink={false}
      />
      {graded && (
        <button type="button" className="btn-primary" onClick={next}>
          Далее
        </button>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Update `src/ui/routes.tsx`**

Replace the placement import and route. Change:

```tsx
import { PlacementScreen } from './screens/PlacementScreen';
```
to add the redirect helper right after it:

```tsx
import { PlacementScreen } from './screens/PlacementScreen';
import { Navigate } from 'react-router-dom';

function PlacementRedirect() {
  return <Navigate to="/placement/grammar" replace />;
}
```

and replace the route line `{ path: '/placement', element: <PlacementScreen /> },` with:

```tsx
  { path: '/placement', element: <PlacementRedirect /> },
  { path: '/placement/:type', element: <PlacementScreen /> },
```

- [ ] **Step 5: Wire `migratePlacementMarks` into `src/ui/UserDbProvider.tsx`**

Add the import next to the existing `backfillUnlockedFromProgress` import:

```tsx
import { migratePlacementMarks } from '@/core/placement';
```

and inside `UserDb.open(...).then((db) => { ... })`, right after the existing
`if (contentRef.current) backfillUnlockedFromProgress(db, contentRef.current);` line:

```tsx
        // Одноразовая миграция grammar-only ключа теста в per-type. Идемпотентна.
        migratePlacementMarks(db);
```

- [ ] **Step 6: Run the screen test to verify it passes**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/ui/PlacementScreen.test.tsx`
Expected: PASS.

- [ ] **Step 7: Typecheck + lint**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npm run typecheck && npm run lint`
Expected: PASS. (Task 1's stale-importer error in `PlacementScreen.tsx` is now resolved.)

- [ ] **Step 8: Commit**

```bash
git add src/ui/screens/PlacementScreen.tsx src/ui/routes.tsx src/ui/UserDbProvider.tsx tests/ui/PlacementScreen.test.tsx
git commit -m "feat(placement): /placement/:type screen with volume choice and per-type tags

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: `StatusDot` + "learned" markers in the three reference-list screens

**Files:**
- Create: `src/ui/components/StatusDot.tsx`
- Create: `tests/ui/StatusDot.test.tsx`
- Modify: `src/ui/theme.css` (append `.status-dot*` rules)
- Modify: `src/ui/screens/GrammarListScreen.tsx`, `KanjiListScreen.tsx`, `VocabListScreen.tsx`
- Modify: `tests/ui/GrammarListScreen.test.tsx`, `KanjiListScreen.test.tsx`, `VocabListScreen.test.tsx`

**Interfaces:**
- Consumes: `statusOf` and `type Status` from `@/core/srs`; `useUserDb` from `@/ui/useUserDb`
  (`UserDb.allCards(itemType): CardRow[]`).
- Produces: `<StatusDot status={Status} />` — renders `null` for `'new'`, else
  `<span className="status-dot status-dot-{status}" title="{label}" />`. Labels: `learning` →
  «изучается», `learned` → «изучено», `mastered` → «освоено».

---

- [ ] **Step 1: Write the failing test — `tests/ui/StatusDot.test.tsx`**

```tsx
import '@testing-library/jest-dom/vitest';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { StatusDot } from '@/ui/components/StatusDot';

describe('StatusDot', () => {
  it('renders nothing for status "new"', () => {
    const { container } = render(<StatusDot status="new" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a titled, classed dot for each non-new status', () => {
    for (const [status, label, cls] of [
      ['learning', 'изучается', 'status-dot-learning'],
      ['learned', 'изучено', 'status-dot-learned'],
      ['mastered', 'освоено', 'status-dot-mastered'],
    ] as const) {
      const { container } = render(<StatusDot status={status} />);
      const dot = container.querySelector('span.status-dot')!;
      expect(dot).toHaveClass(cls);
      expect(dot).toHaveAttribute('title', label);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/ui/StatusDot.test.tsx`
Expected: FAIL — module `@/ui/components/StatusDot` does not exist.

- [ ] **Step 3: Create `src/ui/components/StatusDot.tsx`**

```tsx
import type { Status } from '@/core/srs';

const LABEL: Record<Exclude<Status, 'new'>, string> = {
  learning: 'изучается',
  learned: 'изучено',
  mastered: 'освоено',
};

/** Small SRS-status dot for a reference-list item. `new` renders nothing. */
export function StatusDot({ status }: { status: Status }) {
  if (status === 'new') return null;
  return <span className={`status-dot status-dot-${status}`} title={LABEL[status]} />;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/ui/StatusDot.test.tsx`
Expected: PASS.

- [ ] **Step 5: Append CSS to `src/ui/theme.css`**

Add after the `.heat-4` block (around line 153):

```css
.status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex: none; }
.status-dot-learning { background: var(--heat-2); }
.status-dot-learned { background: var(--heat-3); }
.status-dot-mastered { background: var(--heat-4); }
.placement-entry { margin: 0 0 12px; }
```

- [ ] **Step 6: Wire markers into `src/ui/screens/GrammarListScreen.tsx`**

Add imports:

```tsx
import { useUserDb } from '@/ui/useUserDb';
import { statusOf } from '@/core/srs';
import { StatusDot } from '@/ui/components/StatusDot';
```

Inside the component, after `const db = useContentDb();`:

```tsx
  const user = useUserDb();
  const cardStatus = useMemo(() => {
    const m = new Map<string, ReturnType<typeof statusOf>>();
    for (const c of user.allCards('grammar')) m.set(c.item_id, statusOf(c));
    return m;
  }, [user]);
```

In the list item, add a `<StatusDot>` before the title span:

```tsx
              <Link to={`/grammar/${p.id}`} className="grammar-list-item">
                <StatusDot status={cardStatus.get(p.id) ?? 'new'} />
                <span className="grammar-list-title">{p.title}</span>
                {query ? <LevelBadge level={p.level} /> : null}
                <span className="grammar-list-layer">слой {p.layer}</span>
              </Link>
```

- [ ] **Step 7: Wire markers into `KanjiListScreen.tsx` and `VocabListScreen.tsx`**

Same three imports. In `KanjiListScreen`, after `const db = useContentDb();`:

```tsx
  const user = useUserDb();
  const cardStatus = useMemo(() => {
    const m = new Map<string, ReturnType<typeof statusOf>>();
    for (const c of user.allCards('kanji')) m.set(c.item_id, statusOf(c));
    return m;
  }, [user]);
```

and in the grid item, before `<span className="kanji-grid-char">`:

```tsx
              <Link to={`/kanji/${p.id}`} className="kanji-grid-item">
                <StatusDot status={cardStatus.get(p.id) ?? 'new'} />
                <span className="kanji-grid-char">{p.char}</span>
```

In `VocabListScreen`, the same with `user.allCards('vocab')`, and in the list item before
`<span className="vocab-headword">`:

```tsx
              <Link to={`/vocab/${p.id}`} className="vocab-list-item">
                <StatusDot status={cardStatus.get(p.id) ?? 'new'} />
                <span className="vocab-headword">{p.headword}</span>
```

- [ ] **Step 8: Update the three list-screen tests — add a `useUserDb` mock and a dot assertion**

In each of `tests/ui/GrammarListScreen.test.tsx`, `KanjiListScreen.test.tsx`,
`VocabListScreen.test.tsx`, add this mock next to the existing `vi.mock('@/ui/useContentDb', ...)`
block (adjust `allCards` fixture per type):

```tsx
const userCards: { value: { item_id: string; reps: number; stability: number }[] } = { value: [] };
vi.mock('@/ui/useUserDb', () => ({
  useUserDb: () => ({ allCards: () => userCards.value }),
}));
```

and in the existing `beforeEach`, add `userCards.value = [];`.

Then add one test per screen. For `KanjiListScreen.test.tsx` (fixture ids `n5-一` / `n5-学`):

```tsx
  it('shows a status dot for a kanji with a learned card', () => {
    userCards.value = [{ item_id: 'n5-学', reps: 5, stability: 15 }]; // stability 7..30 -> "learned"
    const { container } = renderScreen();
    expect(container.querySelector('.status-dot-learned')).toBeInTheDocument();
    // exactly one item has a dot; the other ('n5-一') has none
    expect(container.querySelectorAll('.status-dot')).toHaveLength(1);
  });
```

For `GrammarListScreen.test.tsx` (fixture ids `n5-wa-particle` / `n5-mo-particle`):

```tsx
  it('shows a status dot for a grammar point with a learned card', () => {
    userCards.value = [{ item_id: 'n5-mo-particle', reps: 5, stability: 15 }];
    const { container } = renderScreen();
    expect(container.querySelector('.status-dot-learned')).toBeInTheDocument();
    expect(container.querySelectorAll('.status-dot')).toHaveLength(1);
  });
```

For `VocabListScreen.test.tsx` (fixture ids `n5-一つ-ひとつ` / `n5-学校-がっこう`):

```tsx
  it('shows a status dot for a vocab point with a learned card', () => {
    userCards.value = [{ item_id: 'n5-学校-がっこう', reps: 5, stability: 15 }];
    const { container } = renderScreen();
    expect(container.querySelector('.status-dot-learned')).toBeInTheDocument();
    expect(container.querySelectorAll('.status-dot')).toHaveLength(1);
  });
```

- [ ] **Step 9: Run the affected UI tests**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/ui/StatusDot.test.tsx tests/ui/GrammarListScreen.test.tsx tests/ui/KanjiListScreen.test.tsx tests/ui/VocabListScreen.test.tsx`
Expected: PASS. (The pre-existing "shows a level badge only on search results" tests still pass —
`.status-dot` is a different selector from `.level-badge`.)

- [ ] **Step 10: Typecheck + lint, then commit**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npm run typecheck && npm run lint`
Expected: PASS.

```bash
git add src/ui/components/StatusDot.tsx tests/ui/StatusDot.test.tsx src/ui/theme.css \
  src/ui/screens/GrammarListScreen.tsx src/ui/screens/KanjiListScreen.tsx src/ui/screens/VocabListScreen.tsx \
  tests/ui/GrammarListScreen.test.tsx tests/ui/KanjiListScreen.test.tsx tests/ui/VocabListScreen.test.tsx
git commit -m "feat(reference): SRS status dots in grammar/kanji/vocab lists

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: Test entry points — list headers, Settings, first-run offer

**Files:**
- Modify: `src/ui/screens/GrammarListScreen.tsx`, `KanjiListScreen.tsx`, `VocabListScreen.tsx`
- Modify: `src/ui/screens/SettingsScreen.tsx`
- Modify: `src/ui/screens/TodayScreen.tsx`
- Modify: `tests/ui/SettingsScreen.test.tsx`, `tests/ui/TodayScreen.test.tsx`, and the three
  list-screen tests

**Interfaces:**
- Consumes: `useEffectiveLevels()` (already imported in the list screens) — the active level's
  `.status` (`'available' | 'locked' | 'coming_soon'`); `user.getSetting`/`setSetting`/`deleteCard`;
  the settings keys `placement_marked_grammar_ids` / `_kanji_ids` / `_vocab_ids` written by Task 2.
- Produces: no new exports. Removes the per-grammar-level reset block from `SettingsScreen`.

---

- [ ] **Step 1: Add the header link to each list screen**

In `GrammarListScreen.tsx`, right after the `</div>` that closes `<div role="tablist"
className="level-tabs">`:

```tsx
      {activeLevelObj?.status === 'available' && (
        <Link className="btn-ghost placement-entry" to="/placement/grammar">
          Пройти тест по разделу
        </Link>
      )}
```

Same in `KanjiListScreen.tsx` (`to="/placement/kanji"`) and `VocabListScreen.tsx`
(`to="/placement/vocab"`). `Link` and `activeLevelObj` are already in scope in all three.

- [ ] **Step 2: Add the header-link assertion to the three list-screen tests**

Add to `tests/ui/KanjiListScreen.test.tsx`:

```tsx
  it('links to the section placement test when the active level is available', () => {
    const { getByRole } = renderScreen();
    expect(getByRole('link', { name: /пройти тест по разделу/i })).toHaveAttribute(
      'href', expect.stringContaining('/placement/kanji'),
    );
  });

  it('hides the section-test link for a locked active level', () => {
    effLevels.value = [
      { code: 'N5', ord: 1, titleRu: 'N5', status: 'locked', rawStatus: 'available' },
      ...defaultEff.slice(1),
    ];
    const { queryByRole } = renderScreen();
    expect(queryByRole('link', { name: /пройти тест по разделу/i })).toBeNull();
  });
```

Add the analogous pair to `GrammarListScreen.test.tsx` (`/placement/grammar`) and
`VocabListScreen.test.tsx` (`/placement/vocab`).

- [ ] **Step 3: Run the list-screen tests**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/ui/GrammarListScreen.test.tsx tests/ui/KanjiListScreen.test.tsx tests/ui/VocabListScreen.test.tsx`
Expected: PASS.

- [ ] **Step 4: Rewrite the placement block in `SettingsScreen.tsx`**

Replace the derived `markedIds` / `markedByLevel` computation (the block starting
`// Which grammar levels have placement-marked cards` down through the `resetLevel` function) with:

```tsx
  // Per-type placement-marked ids — recomputed every render (cheap, small lists).
  const TYPES: { type: 'grammar' | 'kanji' | 'vocab'; label: string }[] = [
    { type: 'grammar', label: 'грамматика' },
    { type: 'kanji', label: 'кандзи' },
    { type: 'vocab', label: 'слова' },
  ];
  const markedByType = new Map<'grammar' | 'kanji' | 'vocab', string[]>();
  for (const { type } of TYPES) {
    markedByType.set(type, user.getSetting<string[]>(`placement_marked_${type}_ids`, []));
  }
  void resetTick; // referenced only to justify the re-render it triggers

  const resetType = (type: 'grammar' | 'kanji' | 'vocab', label: string) => {
    const ids = markedByType.get(type) ?? [];
    if (ids.length === 0) return;
    if (!window.confirm(`Сбросить результаты теста по разделу «${label}»?`)) return;
    for (const id of ids) user.deleteCard(type, id);
    user.setSetting(`placement_marked_${type}_ids`, []);
    setResetTick((t) => t + 1);
  };
```

`content` (from `useContentDb()`) is no longer used by this block; if it is unused everywhere else
in the file, drop the `const content = useContentDb();` line and its import to keep lint clean —
check first with the editor.

Replace the `.settings-placement` JSX block with:

```tsx
      <div className="settings-placement">
        <h2>Вступительный тест</h2>
        {TYPES.map(({ type, label }) => (
          <Link key={type} className="btn-ghost" to={`/placement/${type}`}>
            Тест: {label}
          </Link>
        ))}
        <div className="settings-placement-reset">
          {TYPES.filter(({ type }) => (markedByType.get(type) ?? []).length > 0).map(
            ({ type, label }) => (
              <button
                key={type}
                type="button"
                className="btn-ghost"
                onClick={() => resetType(type, label)}
              >
                Сбросить тест: {label} ({markedByType.get(type)!.length})
              </button>
            ),
          )}
        </div>
      </div>
```

- [ ] **Step 5: Rewrite the placement tests in `tests/ui/SettingsScreen.test.tsx`**

The current mock `useContentDb` exposes `getGrammar`; keep it (harmless). In `beforeEach`, replace
`settings['placement_marked_ids'] = [];` with:

```tsx
    settings['placement_marked_grammar_ids'] = [];
    settings['placement_marked_kanji_ids'] = [];
    settings['placement_marked_vocab_ids'] = [];
```

Replace the three placement tests (`links to the placement test for a retake`,
`shows no reset buttons when nothing was placement-marked`,
`shows a reset button per level with placement-marked ids`,
`resetting a level deletes only that level's marked cards`,
`resetting a level asks for confirmation first`) with:

```tsx
  it('shows a link for each section test', () => {
    renderScreen();
    expect(screen.getByRole('link', { name: /тест: грамматика/i })).toHaveAttribute(
      'href', expect.stringContaining('/placement/grammar'),
    );
    expect(screen.getByRole('link', { name: /тест: кандзи/i })).toHaveAttribute(
      'href', expect.stringContaining('/placement/kanji'),
    );
    expect(screen.getByRole('link', { name: /тест: слова/i })).toHaveAttribute(
      'href', expect.stringContaining('/placement/vocab'),
    );
  });

  it('shows no reset buttons when nothing was placement-marked', () => {
    renderScreen();
    expect(screen.queryByRole('button', { name: /сбросить тест/i })).toBeNull();
  });

  it('shows a reset button only for types with marked ids', () => {
    settings['placement_marked_kanji_ids'] = ['n5-一', 'n5-学'];
    renderScreen();
    expect(screen.getByRole('button', { name: /сбросить тест: кандзи \(2\)/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /сбросить тест: грамматика/i })).toBeNull();
  });

  it('resetting a type deletes its marked cards and clears its id list', () => {
    settings['placement_marked_kanji_ids'] = ['n5-一', 'n5-学'];
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: /сбросить тест: кандзи/i }));
    expect(deleteCard).toHaveBeenCalledWith('kanji', 'n5-一');
    expect(deleteCard).toHaveBeenCalledWith('kanji', 'n5-学');
    expect(setSetting).toHaveBeenCalledWith('placement_marked_kanji_ids', []);
    expect(screen.queryByRole('button', { name: /сбросить тест: кандзи/i })).toBeNull();
  });

  it('resetting a type asks for confirmation first, and does nothing if declined', () => {
    settings['placement_marked_vocab_ids'] = ['v1'];
    vi.stubGlobal('confirm', vi.fn(() => false));
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: /сбросить тест: слова/i }));
    expect(deleteCard).not.toHaveBeenCalled();
  });
```

- [ ] **Step 6: Update `TodayScreen.tsx` — offer link + hint line**

Change the offer `<Link className="btn-primary" to="/placement">` to `to="/placement/grammar"`.
Add a line inside `.placement-offer`, after the existing `today-hint` paragraph:

```tsx
        <p className="today-hint">
          Тесты по кандзи и словам — в их разделах или в Настройках.
        </p>
```

- [ ] **Step 7: Update `tests/ui/TodayScreen.test.tsx`**

The existing test `offers the placement test on first launch` asserts
`stringContaining('/placement')` — still true for `/placement/grammar`, no change needed. Tighten
it and add the hint assertion:

```tsx
    expect(screen.getByRole('link', { name: /пройти/i })).toHaveAttribute(
      'href', expect.stringContaining('/placement/grammar'),
    );
    expect(screen.getByText(/тесты по кандзи и словам/i)).toBeInTheDocument();
```

- [ ] **Step 8: Run the affected tests**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/ui/SettingsScreen.test.tsx tests/ui/TodayScreen.test.tsx`
Expected: PASS.

- [ ] **Step 9: Typecheck + lint, then commit**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npm run typecheck && npm run lint`
Expected: PASS.

```bash
git add src/ui/screens/GrammarListScreen.tsx src/ui/screens/KanjiListScreen.tsx src/ui/screens/VocabListScreen.tsx \
  src/ui/screens/SettingsScreen.tsx src/ui/screens/TodayScreen.tsx \
  tests/ui/GrammarListScreen.test.tsx tests/ui/KanjiListScreen.test.tsx tests/ui/VocabListScreen.test.tsx \
  tests/ui/SettingsScreen.test.tsx tests/ui/TodayScreen.test.tsx
git commit -m "feat(placement): section-test entry points in list headers, Settings, offer

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: e2e + full regression

**Files:**
- Rewrite: `tests/e2e/placement.spec.ts`
- Create: `tests/e2e/placement-kanji.spec.ts`
- Possibly touch: any list-browsing e2e spec that breaks on the new `.status-dot` node (fix
  selectors only — see Step 4)

**Interfaces:** none exported. e2e specs drive the built Electron app.

---

- [ ] **Step 1: Rewrite `tests/e2e/placement.spec.ts` — first-run grammar flow via the volume screen**

```ts
import { test, expect, _electron as electron } from '@playwright/test';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

test('first-run grammar placement: pick 10%, answer the sample, never offered again', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'jlpt-e2e-placement-'));
  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/main.js'), `--user-data-dir=${userData}`],
  });
  const win = await app.firstWindow();
  await win.waitForSelector('[data-testid="user-db-ready"]', { state: 'attached', timeout: 20_000 });

  await expect(win.getByText(/вступительный тест/i)).toBeVisible();
  await win.getByRole('link', { name: /пройти/i }).click();

  // Volume-choice screen: pick the smallest sample.
  await expect(win.getByRole('heading', { name: /тест: грамматика/i })).toBeVisible();
  await win.getByRole('button', { name: /10\s*%/ }).click();

  // Fixed-length sample. Answer each question with the first option (correctness
  // does not matter — the run converges to the summary either way). Handles
  // choice/cloze (click first .q-opt) and assemble (place every bank token).
  for (let guard = 0; guard < 60; guard++) {
    if (await win.getByText(/Отмечено как уже известные/).count()) break;

    const opt = win.locator('.q-options .q-opt').first();
    if (await opt.count()) await opt.click();

    const assembleDone = win.getByRole('button', { name: /^готово$/i });
    if (await assembleDone.count()) {
      for (let n = await win.locator('.q-bank .q-tok').count(); n > 0;
           n = await win.locator('.q-bank .q-tok').count()) {
        await win.locator('.q-bank .q-tok').first().click();
      }
      await assembleDone.click();
    }

    const next = win.getByRole('button', { name: /далее/i });
    if (await next.count()) { await next.click(); continue; }
    break;
  }
  await expect(win.getByText(/Отмечено как уже известные/)).toBeVisible({ timeout: 20_000 });

  const summaryText = await win.getByText(/Отмечено как уже известные: \d+/).textContent();
  const markedCount = Number(summaryText?.match(/\d+/)?.[0] ?? 0);

  await win.getByRole('button', { name: /на сегодня/i }).click();
  await expect(win.getByRole('heading', { name: /Сегодня/ })).toBeVisible();
  await expect(win.getByText(/вступительный тест/i)).toHaveCount(0);

  await app.close();

  const app2 = await electron.launch({
    args: [join(process.cwd(), 'out/main/main.js'), `--user-data-dir=${userData}`],
  });
  const win2 = await app2.firstWindow();
  await win2.waitForSelector('[data-testid="user-db-ready"]', { state: 'attached', timeout: 20_000 });
  await expect(win2.getByText(/вступительный тест/i)).toHaveCount(0);

  if (markedCount > 0) {
    const hasGrammarCard: boolean = await win2.evaluate(async () => {
      const bytes = await window.jlmpBridge!.readUserDb();
      if (!bytes) return false;
      return new TextDecoder('latin1').decode(new Uint8Array(bytes)).includes('grammar');
    });
    expect(hasGrammarCard).toBe(true);
  }

  await app2.close();
});
```

- [ ] **Step 2: Create `tests/e2e/placement-kanji.spec.ts` — reach the kanji test from the Kanji header**

```ts
import { test, expect, _electron as electron } from '@playwright/test';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

test('the Kanji reference header opens the kanji section test', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'jlpt-e2e-placement-kanji-'));
  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/main.js'), `--user-data-dir=${userData}`],
  });
  const win = await app.firstWindow();
  await win.waitForSelector('[data-testid="user-db-ready"]', { state: 'attached', timeout: 20_000 });

  // Dismiss the first-run offer so the nav is usable.
  if (await win.getByRole('button', { name: /пропустить/i }).count()) {
    await win.getByRole('button', { name: /пропустить/i }).click();
  }

  await win.getByRole('link', { name: /^кандзи$/i }).first().click();
  await win.getByRole('link', { name: /пройти тест по разделу/i }).click();

  await expect(win.getByRole('heading', { name: /тест: кандзи/i })).toBeVisible();
  await expect(win.getByRole('button', { name: /10\s*%/ })).toBeVisible();
  await expect(win.getByRole('button', { name: /100\s*%/ })).toBeVisible();

  await app.close();
});
```

If the nav link name for the Kanji section is not literally "Кандзи", read `src/ui/App.tsx` (or
wherever `Nav` is) and use the actual label. Adjust the `.first()` / role as needed.

- [ ] **Step 3: Build and run the two placement e2e specs**

Run:
```
export PATH="$PATH:/c/Program Files/nodejs" && npm run build && npx playwright test placement.spec.ts placement-kanji.spec.ts
```
Expected: PASS (both). Run `placement.spec.ts` **3 times** to confirm it is not flaky:
`npx playwright test placement.spec.ts --repeat-each=3`.

- [ ] **Step 4: Run the full e2e suite; fix only list-selector breakage**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx playwright test`
Expected: all green. If a kanji/vocab list-browsing spec fails **because** the new `.status-dot`
span shifts a `.kanji-grid-item` / `.grammar-list-item` / `.vocab-list-item` text or count
assertion, fix the selector in that spec (the dot is an extra leading `<span>`, it must not
change item counts). Do not change app behavior to satisfy an e2e selector — adjust the spec.

- [ ] **Step 5: Full regression**

Run each; all must pass:
```
export PATH="$PATH:/c/Program Files/nodejs" && npm run typecheck
export PATH="$PATH:/c/Program Files/nodejs" && npm run lint
export PATH="$PATH:/c/Program Files/nodejs" && npm test
export PATH="$PATH:/c/Program Files/nodejs" && npx playwright test
export PATH="$PATH:/c/Program Files/nodejs" && npm run build:desktop:installer
```
Expected: typecheck 0, lint 0, vitest all green (count up from 361 by the new tests), playwright
all green, and `dist/Kotsukotsu Setup 1.3.0.exe` builds (version bump is Task 6). Record the final
vitest / playwright counts in the commit message.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/placement.spec.ts tests/e2e/placement-kanji.spec.ts
git commit -m "test(e2e): placement volume screen flow + kanji-section entry

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

(If Step 4 required a fix to another e2e spec, add it to this commit.)

---

## Task 6: Release v1.4.0

**Files:**
- Modify: `package.json` (`version`)
- Memory files (outside the repo): `jlpt-desktop-app.md`, `jlpt-app-github.md`, `MEMORY.md`

This task performs outward-facing actions (git push, GitHub release, file deletion). **Do not run
Steps 4–7 without an explicit go-ahead from the user in this session.** Steps 1–3 (bump, commit,
build) are safe to do first and show the result.

---

- [ ] **Step 1: Bump the version**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npm version 1.4.0 --no-git-tag-version`
Expected: `package.json` `"version": "1.4.0"`, no git tag created.

- [ ] **Step 2: Commit the bump**

```bash
git add package.json
git commit -m "chore(release): v1.4.0 — per-section placement sampling + status markers

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 3: Build the installer with the new version**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npm run build:desktop:installer`
Expected: `dist/Kotsukotsu Setup 1.4.0.exe` produced.

- [ ] **Step 4: Push `main` (needs user go-ahead)**

```bash
git push origin main
```

- [ ] **Step 5: Create the GitHub release (needs user go-ahead)**

```bash
export PATH="$PATH:/c/Program Files/GitHub CLI" && gh release create v1.4.0 \
  "dist/Kotsukotsu Setup 1.4.0.exe" \
  --repo Nqam/jlpt-app --title v1.4.0 \
  --notes "Вступительный тест переработан: отдельные тесты по грамматике, кандзи и словам; объём выбирается в процентах; верный ответ отмечает пункт известным, остальные остаются в ежедневном повторении. В справочниках грамматики/кандзи/слов появились отметки статуса изучения."
```

- [ ] **Step 6: Delete superseded release artifacts from `dist/` (needs user go-ahead)**

Only after v1.4.0 is uploaded. Remove old installers and their `.blockmap` sidecars:

```bash
rm -f "dist/JLPT Setup "*.exe "dist/JLPT Setup "*.exe.blockmap
rm -f "dist/Kotsukotsu Setup 1.0."* "dist/Kotsukotsu Setup 1.1."* \
      "dist/Kotsukotsu Setup 1.2."* "dist/Kotsukotsu Setup 1.3."*
```

Then `ls dist/` and confirm only `Kotsukotsu Setup 1.4.0.exe` (+ its `.blockmap` and
electron-builder's `latest.yml` / `builder-*` files) remain. `dist/` is gitignored — this only
touches local disk.

- [ ] **Step 7: Update memory**

- `jlpt-app/../memory/jlpt-desktop-app.md` — add a "### План 4h — ЗАВЕРШЁН" section (mirroring the
  4g/4e entries): what shipped, final vitest/e2e counts, any rulings made during execution, and
  flip the "⏳ План 4h — СОГЛАСОВАН, НЕ НАЧАТ" block to done. Note the next step is 4d (Android).
- `.../memory/jlpt-app-github.md` — add `→ v1.4.0` to the releases line with a one-line summary.
- `.../memory/MEMORY.md` — update the JLPT desktop-app line's "след:" pointer to 4d.

---

## Self-Review

**1. Spec coverage:**

| Spec section | Task |
|---|---|
| §Решение п.1 (percent → count, `placementCount`, volume screen, `total<=10` single button) | 1 (fn), 2 (screen) |
| §Решение п.2 (retake priority: not-passed before passed, seeded shuffle, concat) | 1 (`initPlacement`) |
| §Решение п.3 (existing generators, `reps=0`) | 1 (`nextPlacementQuestion`) |
| §Решение п.4 (correct → rating-4 card + `placement_marked_{type}_ids` tag) | 2 (completion effect) |
| §Решение п.5 (wrong / not-sampled → nothing created) | 1 (`applyPlacementAnswer` only records correct), 2 |
| "Бинарный поиск … удаляются; placement.ts переписывается целиком" | 1 |
| §1 exact signatures + `migratePlacementMarks` + removals | 1 |
| §2 three per-type settings keys + `migratePlacementMarks` in `UserDbProvider`; `placement_offered` unchanged | 1, 2 |
| §3 `/placement/:type`, redirect old route, volume screen, question screen, summary, completion effect | 2 |
| §4 `StatusDot` (+ `new` renders nothing), heat palette, 3 list screens + search, `useUserDb` added, CSS | 3 |
| §5 header links (only when active level `available`), 3 Settings links + generalized reset, `TodayScreen` offer + hint | 4 |
| §6 vitest core + UI tests, Playwright updates | 1, 2, 3, 4, 5 |
| §7 task order 1→5 + release | 1–6 |
| §Не входит (no extrapolation; no "Учить" mode; no test for locked level) | Global Constraints; `availableItemIds` excludes locked; header links gated |

No gaps.

**2. Placeholder scan:** every code step contains full code; every run step names the command and
the expected result. No "TBD" / "handle edge cases" / "similar to Task N". The one soft spot —
Task 5 Step 2's "if the nav link name is not literally Кандзи" — is a genuine environment check
with a concrete fallback (read `App.tsx`, use the real label), not a deferred decision.

**3. Type consistency:**
- `PlacementState` = `{ itemType, ids, index, correctIds }` everywhere (Task 1 defines, Task 2's
  test fake mirrors the same four fields).
- `placementCount(total, pct)`, `initPlacement(content, user, itemType, availableCodes, pct, seed)`,
  `nextPlacementQuestion(s, content, seed)`, `applyPlacementAnswer(s, correct)`,
  `placementKnownIds(s)`, `placementQuestionNumber(s)`, `placementTotal(s)` — signatures identical
  in Task 1 definition, Task 1 tests, Task 2 screen, Task 2 test.
- Settings keys: `placement_marked_grammar_ids` / `placement_marked_kanji_ids` /
  `placement_marked_vocab_ids` — same spelling in Task 1 (`migratePlacementMarks`), Task 2
  (completion effect writes `placement_marked_${type}_ids`), Task 4 (Settings reads/clears the
  same), Task 4 tests.
- `StatusDot` prop is `status: Status` (from `@/core/srs`), consumed as
  `cardStatus.get(id) ?? 'new'` in all three list screens; `statusOf(c)` returns `Status`.
- Route `/placement/:type` with `type ∈ grammar|kanji|vocab` — Task 2 route, `isItemType` guard,
  Task 4 links (`/placement/grammar` etc.), redirect target `/placement/grammar` consistent.
