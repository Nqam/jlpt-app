# Plan 4b-2 — Vocab Quiz Type + SRS Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vocab becomes a fully reviewable SRS item type — two new choice-question generators
(meaning/reading, with a kana-only guard that skips a trivial reading question), and the
`scheduler.ts`/`session.ts`/UI layer widened from `ItemType = 'grammar' | 'kanji'` to
`'grammar' | 'kanji' | 'vocab'`, so vocab cards get learned, scheduled, and reviewed exactly
like grammar and kanji today.

**Architecture:** Plan 4b-1 already generalized the scheduler/session/UI to dispatch on
`ItemType` instead of a hardcoded `'grammar'` literal, and `ContentDb.listVocab`/`getVocab`
already exist (Plan 4a-3). Adding vocab is therefore mostly mechanical — BUT Plan 4b-1's final
whole-branch review flagged two forward-looking bugs in `scheduler.ts` that would silently
misbehave the moment a third `ItemType` is added: (1) `allocateBudget`'s per-round `Math.ceil`
share can let early types in `ITEM_TYPES` consume a whole round's budget before later types are
ever considered, once 3+ types compete; (2) `availableItemIds`/`knownItemIds` used an
`itemType === 'grammar' ? ... : ...` two-way ternary that treated ANY non-grammar type
(including a future `'vocab'`) as kanji — a silent-data-corruption risk, not just a
budget-fairness one. Task 1 fixes both BEFORE `'vocab'` is added to `ItemType`, replacing the
ternary with a `Record<ItemType, ...>` dispatch table so TypeScript itself refuses to compile if
a new `ItemType` member is ever added without a matching table entry. Task 1 also moves the
`ItemType` type itself to `src/core/types.ts` (next to `GrammarPoint`/`KanjiPoint`/`VocabPoint`,
the three kinds it names) so `src/core/quiz/types.ts`'s `QuestionBase.itemType` can import it
instead of re-declaring its own, separate, unlinked literal union (Plan 4b-1's Minor finding).

**Tech Stack:** Unchanged — TypeScript, React 18, Vitest, Playwright, sql.js, ts-fsrs.

**Spec:** `docs/superpowers/specs/2026-09-05-plan-4b-kanji-vocab-quiz-design.md` — this plan
implements that spec's §3.1-3.6 for `'vocab'`, completing the `'grammar' | 'kanji' | 'vocab'`
union that Plan 4b-1 deliberately left at two members (see that spec's §1 "Разбивка на
подпланы").

## Global Constraints

- **No `user.db` schema migration.** `cards`/`review_log`.`item_type` are already free-string
  columns — every new card row uses `item_type = 'vocab'` and needs no `ALTER TABLE`.
- **Choice-only for vocab.** No cloze/assemble analogue exists for vocab (no example sentences
  in `vocab_points`) — both new generators always return a `ChoiceQuestion`, never `null`.
  `validateVocab` (already in `scripts/build-content/vocab.ts`) guarantees every vocab point has
  a non-empty `headword`, `reading`, and `meaningRu`, so both generators always succeed.
- **Kana-only reading guard.** When `headword === reading` (e.g. "あんな", "ああ" — words with no
  kanji at all), a reading question ("how is this read?") is trivial/nonsensical since the
  headword already IS the reading. `generateVocabQuestion` must always return a meaning question
  for such a point, regardless of reps parity — never call `genVocabReading` for it.
- **Mini-test and `progress.ts` stay grammar-only.** Do not touch `daySummary.miniTestEligible`,
  the mini-test block in `session.ts`, or anything in `src/core/progress.ts`.
- **`review_queue_cap` and `new_per_day` stay one shared cap/budget across ALL item types**
  (now three), not per type — this was already true for two types after Plan 4b-1; Task 1
  extends the same merge/water-fill to three without changing its meaning.
- **Fix before extend.** Task 1 fixes `allocateBudget`'s ceil-based unfairness and the
  ternary's implicit-else-means-kanji dispatch BEFORE `'vocab'` is added to `ItemType` — so at
  no point does a build exist where three types are live on top of the known-buggy two-type-era
  code.
- **Node not on PATH**: prefix every `npm`/`npx` run with
  `export PATH="$PATH:/c/Program Files/nodejs" &&` (Bash) as established in this repo.

---

## File Structure

**Created:**
- `src/core/quiz/vocab-questions.ts` — `genVocabMeaning`, `genVocabReading`, `generateVocabQuestion`.
- `src/ui/components/VocabLearnCard.tsx` — compact "learn" card for a new vocab word.
- `tests/core/quiz/vocab-questions.test.ts`
- `tests/ui/VocabLearnCard.test.tsx`
- `tests/e2e/vocab-review.spec.ts`

**Modified:**
- `src/core/types.ts` — gains `export type ItemType = 'grammar' | 'kanji' | 'vocab';`.
- `src/core/quiz/types.ts` — `QuestionBase.itemType` imports `ItemType` from `@/core/types`
  instead of re-declaring a separate `'grammar' | 'kanji'` literal.
- `src/core/scheduler.ts` — re-exports `ItemType` from `@/core/types`; `ITEM_TYPES` gains
  `'vocab'`; `availableItemIds`/`knownItemIds` generalized via a `Record<ItemType, ...>`
  dispatch table (replaces the two-way ternary); `allocateBudget` switched from a per-round
  `Math.ceil` share to floor+remainder.
- `src/core/session.ts` — `buildDailySession` gains a `'vocab'` branch (fetch via
  `content.getVocab`, generate via `generateVocabQuestion`); `levelCache`/`levelPoints` renamed
  to `grammarLevelCache`/`grammarLevelPoints` for consistency with the existing
  `kanjiLevelCache`/`kanjiLevelPoints`, plus new `vocabLevelCache`/`vocabLevelPoints`.
- `src/ui/screens/ReviewScreen.tsx` — `point`'s type widens to include `VocabPoint`; point-fetch
  dispatch gains a `'vocab'` branch calling `content.getVocab`; learn-phase render gains a
  `{stepItemType === 'vocab' && <VocabLearnCard .../>}` branch.
- `src/ui/theme.css` — `.learn-vocab*` rules for `VocabLearnCard`.
- `tests/core/scheduler.test.ts` — existing fakes gain a `listVocab: () => []` stub
  (behavior-preserving); two new cross-type tests (3-way budget fairness, 3-way due merge).
- `tests/core/session.test.ts` — existing fakes gain vocab stubs; one new vocab-session test.
- `tests/ui/ReviewScreen.test.tsx` — mock gains vocab stubs; one new vocab learn→review test.

**Not modified:** `src/storage/user-db.ts`, `src/core/srs.ts`, `src/core/progress.ts`,
`src/storage/migrations.ts`, `src/core/quiz/rng.ts`, `src/core/quiz/grade.ts`,
`src/core/quiz/distractors.ts`, `src/ui/components/QuestionView.tsx` (its `#/${question.itemType}/...`
link already reads `question.itemType` generically — no vocab-specific change needed, and
`/vocab/:id` already resolves via the existing `VocabDetailScreen` route from Plan 4a-3),
`content/**`, `scripts/build-content/**` (`listVocab`/`getVocab`/`VocabPoint` already exist).

---

## Task 1: Fix scheduler bugs, unify `ItemType`, and extend to vocab

**Files:**
- Modify: `src/core/types.ts`, `src/core/quiz/types.ts`, `src/core/scheduler.ts`
- Test: `tests/core/scheduler.test.ts` (extend)

**Interfaces:**
- Consumes: `ContentDb.listVocab(level: LevelCode): VocabPoint[]` (already exists).
- Produces: `ItemType` now lives in `src/core/types.ts` as `'grammar' | 'kanji' | 'vocab'`,
  re-exported (not re-declared) from `src/core/scheduler.ts` so `session.ts`'s existing
  `import { buildQueue, type ItemType } from '@/core/scheduler';` keeps working unchanged.
  `QueueItem.itemType` and `buildQueue`'s return type both cover all three.

- [ ] **Step 1: Add `ItemType` to `src/core/types.ts`**

Add this near the top, after the `LevelCode` type:

```ts
/** The three kinds of reviewable SRS content. */
export type ItemType = 'grammar' | 'kanji' | 'vocab';
```

- [ ] **Step 2: Point `quiz/types.ts` at the shared `ItemType`**

In `src/core/quiz/types.ts`, add the import and use it:

```ts
import type { ItemType } from '@/core/types';

export type QuestionKind = 'cloze' | 'choice' | 'assemble';

export interface QuestionBase {
  /** Детерминированный id вопроса — совпадает с seed-строкой генерации. */
  id: string;
  itemType: ItemType;
  itemId: string;
  kind: QuestionKind;
  /** Текст задания на русском. */
  prompt: string;
}
```

(Everything below `QuestionBase` in that file — `ClozeQuestion`, `ChoiceQuestion`,
`AssembleQuestion`, `Question`, `Answer`, `GradedAnswer` — is unchanged.)

- [ ] **Step 3: Write the failing tests**

Replace the full contents of `tests/core/scheduler.test.ts` with:

```ts
import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import type { PlatformAdapter } from '@/platform/adapter';
import { UserDb } from '@/storage/user-db';
import { daySummary, buildQueue } from '@/core/scheduler';
import { newCard } from '@/core/srs';
import { endOfLocalDay } from '@/core/time';

const wasm = readFileSync(createRequire(import.meta.url).resolve('sql.js/dist/sql-wasm.wasm'));

function fakeAdapter() {
  let store: Uint8Array | null = null;
  return {
    platform: 'desktop',
    async readBundledContentDb() { throw new Error('unused'); },
    async readSqlWasm() { return new Uint8Array(wasm); },
    async readUserDb() { return store; },
    async writeUserDb(b: Uint8Array) { store = b.slice(); },
  } as PlatformAdapter;
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
 * "n4-..." sorts before "n5-..." lexicographically. availableGrammarIds
 * must sort by level ord first so N5 (ord 1) is always exhausted as "new"
 * material before N4 (ord 2) is ever offered.
 */
function fakeMultiLevelContent() {
  // 6 N5 items (> newPerDay's default budget of 5) so a correct level-ord-first
  // sort never needs to dip into N4 at all; the bug this guards against would
  // let two of these six-plus N4's layer-1 items outrank some of them instead.
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
    listKanji: () => [],
    listVocab: () => [],
  } as unknown as import('@/storage/content-db').ContentDb;
}

const now = new Date('2026-03-10T09:00:00.000Z');
// Layer-ascending and id-ascending deliberately DIVERGE so ordering-by-layer is
// actually observable: low layer = p6,p7,p8 / p3,p4,p5 ; low id = p1,p2,p3...
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

  it('offers new_per_day new cards on a fresh db', () => {
    const s = daySummary(user, fakeContent(POINTS), now);
    expect(s.dueCount).toBe(0);
    expect(s.newCount).toBe(5);
    expect(s.allDone).toBe(false);
  });

  it('buildQueue selects new items by layer, not by id', () => {
    const q = buildQueue(user, fakeContent(POINTS), now);
    expect(q).toHaveLength(5);
    const ids = q.map((i) => i.itemId).sort();
    // layer-then-id picks the three layer-1 ids (p6,p7,p8) + two layer-2 (p3,p4),
    // NOT the five lowest ids (p1..p5).
    expect(ids).toEqual(['p3', 'p4', 'p6', 'p7', 'p8']);
    expect(ids).not.toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
  });

  it('exhausts an earlier level (by ord) before offering a later level, even when ids tie by layer', () => {
    const q = buildQueue(user, fakeMultiLevelContent(), now);
    const ids = q.map((i) => i.itemId);
    expect(ids).toHaveLength(5); // default new_per_day
    expect(ids.every((id) => id.startsWith('n5-'))).toBe(true);
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
    expect(q[0]!.kind).not.toBe('new'); // due exists -> not new first
    expect(q.some((i) => i.itemId === 'p1' && i.kind === 'due')).toBe(true);
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

  it('suppresses new cards when due queue exceeds the cap', () => {
    user.setSetting('review_queue_cap', 2);
    for (const id of ['p1', 'p2', 'p3']) {
      const c = newCard('grammar', id, now);
      c.reps = 1; c.due = new Date(now.getTime() - 3600_000).toISOString();
      user.upsertCard(c);
    }
    const s = daySummary(user, fakeContent(POINTS), now);
    expect(s.queueOverCap).toBe(true);
    expect(s.newCount).toBe(0);
    expect(s.dueCount).toBe(2); // capped
  });

  it('daily new limit accounts for cards already introduced today', () => {
    for (const id of ['p1', 'p2']) user.upsertCard(newCard('grammar', id, now));
    const s = daySummary(user, fakeContent(POINTS), now);
    expect(s.newCount).toBe(3); // 5 - 2 already introduced today
  });

  it('buildQueue is idempotent for the same inputs', () => {
    const a = buildQueue(user, fakeContent(POINTS), now).map((i) => i.itemId);
    const b = buildQueue(user, fakeContent(POINTS), now).map((i) => i.itemId);
    expect(a).toEqual(b);
  });

  it('splits the shared new_per_day budget between grammar and kanji when both have content', () => {
    const content = {
      listLevels: () => [{ code: 'N5', status: 'available', ord: 1, titleRu: 'N5' }],
      listGrammar: () => POINTS.map((p) => ({ id: p.id, level: 'N5', title: p.id, layer: p.layer })),
      listKanji: () =>
        ['k1', 'k2', 'k3', 'k4', 'k5', 'k6'].map((id) => ({
          id, level: 'N5', char: id, onyomi: ['ア'], kunyomi: [], strokeCount: 1, meaningRu: id,
        })),
      listVocab: () => [],
    } as unknown as import('@/storage/content-db').ContentDb;

    const q = buildQueue(user, content, now);
    const byType = { grammar: 0, kanji: 0, vocab: 0 };
    q.forEach((i) => { byType[i.itemType] += 1; });
    expect(byType.grammar).toBe(3);
    expect(byType.kanji).toBe(2);
    expect(byType.grammar + byType.kanji).toBe(5); // default new_per_day
  });

  it('splits the shared new_per_day budget across three item types without ceil-based bias', () => {
    user.setSetting('new_per_day', 7);
    const content = {
      listLevels: () => [{ code: 'N5', status: 'available', ord: 1, titleRu: 'N5' }],
      listGrammar: () => POINTS.map((p) => ({ id: p.id, level: 'N5', title: p.id, layer: p.layer })),
      listKanji: () =>
        ['k1', 'k2', 'k3', 'k4', 'k5', 'k6'].map((id) => ({
          id, level: 'N5', char: id, onyomi: ['ア'], kunyomi: [], strokeCount: 1, meaningRu: id,
        })),
      listVocab: () =>
        ['v1', 'v2', 'v3', 'v4', 'v5', 'v6'].map((id) => ({
          id, level: 'N5', headword: id, reading: id, pos: '', meaningRu: id,
        })),
    } as unknown as import('@/storage/content-db').ContentDb;

    const q = buildQueue(user, content, now);
    const byType = { grammar: 0, kanji: 0, vocab: 0 };
    q.forEach((i) => { byType[i.itemType] += 1; });
    // 7 across 3 types with plenty of room each: floor(7/3)=2 for everyone,
    // +1 leftover to the first type in ITEM_TYPES order (grammar). The OLD
    // per-round Math.ceil share rounded EVERY type in the round up to
    // ceil(7/3)=3, so grammar(3)+kanji(3) exhausted the budget to 1 before
    // vocab's turn -- producing grammar:3/kanji:3/vocab:1 instead.
    expect(byType).toEqual({ grammar: 3, kanji: 2, vocab: 2 });
    expect(byType.grammar + byType.kanji + byType.vocab).toBe(7);
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
    const dueInQueue = q.filter((i) => i.kind === 'due');
    expect(dueInQueue).toHaveLength(3);
    expect(dueInQueue.some((i) => i.itemType === 'kanji')).toBe(true);
    expect(dueInQueue.some((i) => i.itemType === 'grammar')).toBe(true);
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
    const dueInQueue = q.filter((i) => i.kind === 'due');
    expect(dueInQueue).toHaveLength(4);
    expect(new Set(dueInQueue.map((i) => i.itemType))).toEqual(new Set(['grammar', 'kanji', 'vocab']));
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
```

- [ ] **Step 4: Run — expect failure**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/core/scheduler.test.ts`
Expected: FAIL — the new 3-way budget test asserts `{ grammar: 3, kanji: 2, vocab: 2 }` but the
current `scheduler.ts` neither knows about `'vocab'` (so `byType.vocab` never gets incremented)
nor produces that split even for two types under the old ceil-based algorithm once `new_per_day`
is 7. The new 3-way due-merge test fails too (`vocab` cards are invisible to the scheduler).

- [ ] **Step 5: Implement**

Replace the full contents of `src/core/scheduler.ts` with:

```ts
import type { UserDb } from '@/storage/user-db';
import type { ContentDb } from '@/storage/content-db';
import type { ItemType } from '@/core/types';
import { startOfLocalDay, endOfLocalDay, toUtcIso, localDayKey } from '@/core/time';
import { statusOf } from '@/core/srs';

export type { ItemType };
const ITEM_TYPES: readonly ItemType[] = ['grammar', 'kanji', 'vocab'];

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

/** Every id of `itemType` in an `available` level, in new-card introduction order. */
function availableItemIds(content: ContentDb, itemType: ItemType): string[] {
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
```

- [ ] **Step 6: Run — expect pass**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/core/scheduler.test.ts`
Expected: PASS — 14 tests (12 pre-existing + 2 new).

- [ ] **Step 7: Type-check the whole project**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx tsc --noEmit`
Expected: PASS. This is the step that proves the `Record<ItemType, ...>` dispatch tables and
the `QuestionBase.itemType` re-typing compile cleanly everywhere `ItemType`/`Question` are used
(`session.ts`, `ReviewScreen.tsx`, `QuestionView.tsx`, every quiz generator).

- [ ] **Step 8: Commit**

```bash
git add src/core/types.ts src/core/quiz/types.ts src/core/scheduler.ts tests/core/scheduler.test.ts
git commit -m "fix: floor+remainder budget split and exhaustive item-type dispatch, extend to vocab"
```

---

## Task 2: Vocab quiz generators

**Files:**
- Create: `src/core/quiz/vocab-questions.ts`
- Test: `tests/core/quiz/vocab-questions.test.ts`

**Interfaces:**
- Consumes: `VocabPoint` from `@/core/types` (`{id, level, headword, reading, pos, meaningRu}`,
  already exists); `pickDistractors`/`distractorPool`/`shuffleWithAnswer` from
  `@/core/quiz/distractors` (already generic, unchanged since Plan 4b-1).
- Produces: `genVocabMeaning(point, levelPoints, seed): ChoiceQuestion`,
  `genVocabReading(point, levelPoints, seed): ChoiceQuestion`,
  `generateVocabQuestion(point, levelPoints, reps, seed): Question` — consumed by `session.ts`
  in Task 3.

- [ ] **Step 1: Write the failing test**

Create `tests/core/quiz/vocab-questions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { genVocabMeaning, genVocabReading, generateVocabQuestion } from '@/core/quiz/vocab-questions';
import type { VocabPoint } from '@/core/types';

const aisatsu: VocabPoint = {
  id: 'n5-挨拶-あいさつ', level: 'N5', headword: '挨拶', reading: 'あいさつ', pos: 'сущ.', meaningRu: 'приветствие',
};
const others: VocabPoint[] = [
  { id: 'n5-味-あじ', level: 'N5', headword: '味', reading: 'あじ', pos: 'сущ.', meaningRu: 'вкус' },
  { id: 'n5-遊び-あそび', level: 'N5', headword: '遊び', reading: 'あそび', pos: 'сущ.', meaningRu: 'игра' },
  { id: 'n5-案内-あんない', level: 'N5', headword: '案内', reading: 'あんない', pos: 'сущ.', meaningRu: 'сопровождение' },
];
const kanaOnly: VocabPoint = {
  id: 'n5-あんな', level: 'N5', headword: 'あんな', reading: 'あんな', pos: '', meaningRu: 'такой',
};

describe('genVocabMeaning', () => {
  it('correct answer is the point meaning, distractors from other points', () => {
    const q = genVocabMeaning(aisatsu, others, 's');
    expect(q.kind).toBe('choice');
    expect(q.itemType).toBe('vocab');
    expect(q.itemId).toBe('n5-挨拶-あいさつ');
    expect(q.prompt).toContain('挨拶');
    expect(q.choices).toHaveLength(4);
    expect(q.choices[q.answerIndex]).toBe('приветствие');
    const distractors = q.choices.filter((_, i) => i !== q.answerIndex);
    distractors.forEach((d) => expect(['вкус', 'игра', 'сопровождение']).toContain(d));
  });

  it('is deterministic for a seed', () => {
    expect(genVocabMeaning(aisatsu, others, 's')).toEqual(genVocabMeaning(aisatsu, others, 's'));
  });
});

describe('genVocabReading', () => {
  it('correct answer is the point reading, distractors from other points', () => {
    const q = genVocabReading(aisatsu, others, 's');
    expect(q.kind).toBe('choice');
    expect(q.choices).toHaveLength(4);
    expect(q.choices[q.answerIndex]).toBe('あいさつ');
    const distractors = q.choices.filter((_, i) => i !== q.answerIndex);
    const otherReadings = ['あじ', 'あそび', 'あんない'];
    distractors.forEach((d) => expect(otherReadings).toContain(d));
  });

  it('is deterministic for a seed', () => {
    expect(genVocabReading(aisatsu, others, 's')).toEqual(genVocabReading(aisatsu, others, 's'));
  });
});

describe('generateVocabQuestion', () => {
  it('alternates meaning/reading by reps parity for a word with a distinct reading', () => {
    const meaning = genVocabMeaning(aisatsu, others, 'x:0');
    const reading = genVocabReading(aisatsu, others, 'x:0');
    expect(generateVocabQuestion(aisatsu, others, 0, 'x:0')).toEqual(meaning);
    expect(generateVocabQuestion(aisatsu, others, 1, 'x:0')).toEqual(reading);
    expect(generateVocabQuestion(aisatsu, others, 2, 'x:0')).toEqual(meaning);
  });

  it('always asks meaning for a kana-only word, regardless of reps parity', () => {
    const meaning = genVocabMeaning(kanaOnly, others, 'y:0');
    expect(generateVocabQuestion(kanaOnly, others, 0, 'y:0')).toEqual(meaning);
    expect(generateVocabQuestion(kanaOnly, others, 1, 'y:0')).toEqual(meaning);
    expect(generateVocabQuestion(kanaOnly, others, 2, 'y:0')).toEqual(meaning);
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/core/quiz/vocab-questions.test.ts`
Expected: FAIL — `src/core/quiz/vocab-questions.ts` does not exist yet.

- [ ] **Step 3: Implement**

Create `src/core/quiz/vocab-questions.ts`:

```ts
import type { VocabPoint } from '@/core/types';
import type { ChoiceQuestion, Question } from '@/core/quiz/types';
import { pickDistractors, distractorPool, shuffleWithAnswer } from '@/core/quiz/distractors';

export const genVocabMeaning = (
  point: VocabPoint,
  levelPoints: readonly VocabPoint[],
  seed: string,
): ChoiceQuestion => {
  const pool = distractorPool(levelPoints, point.id, (p) => [p.meaningRu]);
  const distractors = pickDistractors(pool, point.meaningRu, 3, `${seed}:d`);
  const { list, answerIndex } = shuffleWithAnswer([point.meaningRu, ...distractors], `${seed}:c`);
  return {
    id: seed,
    itemType: 'vocab',
    itemId: point.id,
    kind: 'choice',
    prompt: `Что означает «${point.headword}»?`,
    choices: list,
    answerIndex,
  };
};

export const genVocabReading = (
  point: VocabPoint,
  levelPoints: readonly VocabPoint[],
  seed: string,
): ChoiceQuestion => {
  const pool = distractorPool(levelPoints, point.id, (p) => [p.reading]);
  const distractors = pickDistractors(pool, point.reading, 3, `${seed}:d`);
  const { list, answerIndex } = shuffleWithAnswer([point.reading, ...distractors], `${seed}:c`);
  return {
    id: seed,
    itemType: 'vocab',
    itemId: point.id,
    kind: 'choice',
    prompt: `Как читается «${point.headword}»?`,
    choices: list,
    answerIndex,
  };
};

/**
 * Alternates meaning/reading by reps parity, same as kanji -- EXCEPT a
 * kana-only word (headword === reading, e.g. "あんな") has no reading
 * question worth asking ("how is it read?" when the headword already IS the
 * reading is trivial), so it always gets a meaning question.
 */
export function generateVocabQuestion(
  point: VocabPoint,
  levelPoints: readonly VocabPoint[],
  reps: number,
  seed: string,
): Question {
  if (point.headword === point.reading) return genVocabMeaning(point, levelPoints, seed);
  const wantReading = ((reps % 2) + 2) % 2 === 1;
  return wantReading ? genVocabReading(point, levelPoints, seed) : genVocabMeaning(point, levelPoints, seed);
}
```

- [ ] **Step 4: Run — expect pass**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/core/quiz/vocab-questions.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/quiz/vocab-questions.ts tests/core/quiz/vocab-questions.test.ts
git commit -m "feat: vocab meaning/reading question generators with a kana-only reading guard"
```

---

## Task 3: `buildDailySession` dispatches vocab

**Files:**
- Modify: `src/core/session.ts`
- Test: `tests/core/session.test.ts` (extend)

**Interfaces:**
- Consumes: `generateVocabQuestion` from Task 2; `ContentDb.getVocab(id): VocabPoint | null` and
  `ContentDb.listVocab(level): VocabPoint[]` (already exist).
- Produces: `buildDailySession` now emits `SessionStep`s with `itemType: 'vocab'` for vocab queue
  items, consumed by `ReviewScreen.tsx` in Task 4.

- [ ] **Step 1: Write the failing test**

Replace the full contents of `tests/core/session.test.ts` with:

```ts
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
  } as PlatformAdapter;
}

function mkPoint(id: string, layer: number): GrammarPointFull {
  return {
    id, level: 'N5', title: `${id} (частица)`, layer, tags: [], related: [], relatedTitles: [],
    bodyMarkdown: `## Кратко\nОписание пункта ${id} — что он выражает и когда употребляется.`,
    examples: [
      { jaRuby: `${id}は 毎日[まいにち] 日本語[にほんご]を 勉強[べんきょう]します。`, ru: `перевод ${id}` },
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

  it('new card -> learn step then review step', () => {
    const steps = buildDailySession(user, fakeContent(), now);
    expect(steps.length).toBeGreaterThan(0);
    const firstNew = steps.findIndex((s) => s.phase === 'review' && s.item.kind === 'new');
    expect(steps[firstNew - 1]).toMatchObject({ phase: 'learn' });
    expect(steps[firstNew - 1]).toMatchObject({ itemId: (steps[firstNew] as { item: { itemId: string } }).item.itemId });
  });

  it('due card -> review step only, no learn', () => {
    const c = newCard('grammar', 'p1', now);
    c.reps = 4; c.stability = 10; c.due = new Date(now.getTime() - 3_600_000).toISOString();
    user.upsertCard(c);
    const steps = buildDailySession(user, fakeContent(), now);
    const p1Steps = steps.filter((s) =>
      (s.phase === 'learn' && s.itemId === 'p1') ||
      (s.phase === 'review' && s.item.itemId === 'p1'));
    expect(p1Steps).toHaveLength(1);
    expect(p1Steps[0]!.phase).toBe('review');
  });

  it('first step is never a review of a new card', () => {
    const c = newCard('grammar', 'p1', now);
    c.reps = 4; c.stability = 10; c.due = new Date(now.getTime() - 3_600_000).toISOString();
    user.upsertCard(c);
    const steps = buildDailySession(user, fakeContent(), now);
    expect(steps[0]!.phase === 'review' && steps[0]!.item.kind === 'new').toBe(false);
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

  it('a kanji new item produces a learn step (itemType kanji) then a kanji-generated review question', () => {
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

    const steps = buildDailySession(user, content, now);
    const reviewIdx = steps.findIndex(
      (s) => s.phase === 'review' && s.item.itemType === 'kanji' && s.item.itemId === 'n5-学',
    );
    expect(reviewIdx).toBeGreaterThanOrEqual(0);
    expect(steps[reviewIdx - 1]).toMatchObject({ phase: 'learn', itemType: 'kanji', itemId: 'n5-学' });
    const reviewStep = steps[reviewIdx] as Extract<(typeof steps)[number], { phase: 'review' }>;
    expect(reviewStep.question.itemType).toBe('kanji');
    expect(reviewStep.question.kind).toBe('choice');
  });

  it('a vocab new item produces a learn step (itemType vocab) then a vocab-generated review question', () => {
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

    const steps = buildDailySession(user, content, now);
    const reviewIdx = steps.findIndex(
      (s) => s.phase === 'review' && s.item.itemType === 'vocab' && s.item.itemId === 'n5-挨拶-あいさつ',
    );
    expect(reviewIdx).toBeGreaterThanOrEqual(0);
    expect(steps[reviewIdx - 1]).toMatchObject({ phase: 'learn', itemType: 'vocab', itemId: 'n5-挨拶-あいさつ' });
    const reviewStep = steps[reviewIdx] as Extract<(typeof steps)[number], { phase: 'review' }>;
    expect(reviewStep.question.itemType).toBe('vocab');
    expect(reviewStep.question.kind).toBe('choice');
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/core/session.test.ts`
Expected: FAIL — the new vocab test fails because `buildDailySession` never fetches or generates
for `itemType === 'vocab'`.

- [ ] **Step 3: Implement**

Replace the full contents of `src/core/session.ts` with:

```ts
import type { UserDb } from '@/storage/user-db';
import type { ContentDb, GrammarPointFull } from '@/storage/content-db';
import type { KanjiPoint, VocabPoint } from '@/core/types';
import type { Question } from '@/core/quiz/types';
import { buildQueue, type ItemType } from '@/core/scheduler';
import { generateForCard, generateOfKind, ROTATION } from '@/core/quiz/registry';
import { generateKanjiQuestion } from '@/core/quiz/kanji-questions';
import { generateVocabQuestion } from '@/core/quiz/vocab-questions';
import { statusOf } from '@/core/srs';
import { localDayKey } from '@/core/time';
import { seededShuffle } from '@/core/quiz/rng';

export type SessionStep =
  | { phase: 'learn'; itemType: ItemType; itemId: string }
  | {
      phase: 'review';
      item: { itemType: ItemType; itemId: string; kind: 'due' | 'new' };
      question: Question;
    }
  | { phase: 'minitest'; question: Question; sourceItemId: string; index: number };

/** All grammar points of a level, fully loaded — shared with ReviewScreen's retry round. */
export function levelPointsFor(content: ContentDb, level: string): GrammarPointFull[] {
  return content
    .listGrammar(level)
    .map((g) => content.getGrammar(g.id))
    .filter((p): p is GrammarPointFull => p !== null);
}

export function buildDailySession(user: UserDb, content: ContentDb, now: Date): SessionStep[] {
  const dayKey = localDayKey(now);
  const steps: SessionStep[] = [];

  const grammarPointCache = new Map<string, GrammarPointFull | null>();
  const getGrammarPoint = (id: string): GrammarPointFull | null => {
    if (!grammarPointCache.has(id)) grammarPointCache.set(id, content.getGrammar(id));
    return grammarPointCache.get(id)!;
  };
  const grammarLevelCache = new Map<string, GrammarPointFull[]>();
  const grammarLevelPoints = (level: string): GrammarPointFull[] => {
    if (!grammarLevelCache.has(level)) grammarLevelCache.set(level, levelPointsFor(content, level));
    return grammarLevelCache.get(level)!;
  };
  const kanjiLevelCache = new Map<string, KanjiPoint[]>();
  const kanjiLevelPoints = (level: string): KanjiPoint[] => {
    if (!kanjiLevelCache.has(level)) kanjiLevelCache.set(level, content.listKanji(level));
    return kanjiLevelCache.get(level)!;
  };
  const vocabLevelCache = new Map<string, VocabPoint[]>();
  const vocabLevelPoints = (level: string): VocabPoint[] => {
    if (!vocabLevelCache.has(level)) vocabLevelCache.set(level, content.listVocab(level));
    return vocabLevelCache.get(level)!;
  };

  for (const qi of buildQueue(user, content, now)) {
    const reps = user.getCard(qi.itemType, qi.itemId)?.reps ?? 0;
    let question: Question | null = null;

    if (qi.itemType === 'grammar') {
      const point = getGrammarPoint(qi.itemId);
      if (!point) continue;
      question = generateForCard(point, grammarLevelPoints(point.level), reps, dayKey);
    } else if (qi.itemType === 'kanji') {
      const point = content.getKanji(qi.itemId);
      if (!point) continue;
      question = generateKanjiQuestion(point, kanjiLevelPoints(point.level), reps, dayKey);
    } else {
      const point = content.getVocab(qi.itemId);
      if (!point) continue;
      question = generateVocabQuestion(point, vocabLevelPoints(point.level), reps, dayKey);
    }

    if (qi.kind === 'new') steps.push({ phase: 'learn', itemType: qi.itemType, itemId: qi.itemId });
    steps.push({
      phase: 'review',
      item: { itemType: qi.itemType, itemId: qi.itemId, kind: qi.kind },
      question,
    });
  }

  // Mini-test stays grammar-only (out of scope for this plan).
  const learned = user.allCards('grammar').filter((c) => {
    const s = statusOf(c);
    return s === 'learned' || s === 'mastered';
  });

  if (learned.length >= 5) {
    const count = Math.min(8, Math.max(5, Math.floor(learned.length / 2)));
    const sources = seededShuffle(
      learned.map((c) => c.item_id).filter((id) => getGrammarPoint(id) !== null),
      `mt:${dayKey}`,
    ).slice(0, count);
    sources.forEach((srcId, index) => {
      const point = getGrammarPoint(srcId)!;
      const kind = ROTATION[index % 3]!;
      const question = generateOfKind(kind, point, grammarLevelPoints(point.level), `${srcId}:mt:${index}`);
      steps.push({ phase: 'minitest', question, sourceItemId: srcId, index });
    });
  }

  return steps;
}
```

- [ ] **Step 4: Run — expect pass**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/core/session.test.ts`
Expected: PASS — 8 tests (7 pre-existing + 1 new).

- [ ] **Step 5: Commit**

```bash
git add src/core/session.ts tests/core/session.test.ts
git commit -m "feat: buildDailySession dispatches vocab by itemType"
```

---

## Task 4: `VocabLearnCard` component

**Files:**
- Create: `src/ui/components/VocabLearnCard.tsx`
- Modify: `src/ui/theme.css`
- Test: `tests/ui/VocabLearnCard.test.tsx`

**Interfaces:**
- Consumes: `VocabPoint` from `@/core/types`.
- Produces: `VocabLearnCard({ point: VocabPoint })` — a presentational component, consumed by
  `ReviewScreen.tsx` in Task 5.

- [ ] **Step 1: Write the failing test**

Create `tests/ui/VocabLearnCard.test.tsx`:

```tsx
import '@testing-library/jest-dom/vitest';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VocabLearnCard } from '@/ui/components/VocabLearnCard';
import type { VocabPoint } from '@/core/types';

const aisatsu: VocabPoint = {
  id: 'n5-挨拶-あいさつ', level: 'N5', headword: '挨拶', reading: 'あいさつ', pos: 'сущ.', meaningRu: 'приветствие',
};
const kanaOnly: VocabPoint = {
  id: 'n5-あんな', level: 'N5', headword: 'あんな', reading: 'あんな', pos: '', meaningRu: 'такой',
};

describe('VocabLearnCard', () => {
  it('shows headword, reading, part of speech and meaning', () => {
    render(<VocabLearnCard point={aisatsu} />);
    expect(screen.getByText('挨拶')).toBeInTheDocument();
    expect(screen.getByText('Чтение')).toBeInTheDocument();
    expect(screen.getByText('あいさつ')).toBeInTheDocument();
    expect(screen.getByText('сущ.')).toBeInTheDocument();
    expect(screen.getByText('приветствие')).toBeInTheDocument();
  });

  it('hides the reading field for a kana-only word and falls back to an em-dash for empty part of speech', () => {
    render(<VocabLearnCard point={kanaOnly} />);
    expect(screen.queryByText('Чтение')).toBeNull();
    expect(screen.getAllByText('あんな')).toHaveLength(1); // headword only, reading line suppressed
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('такой')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/ui/VocabLearnCard.test.tsx`
Expected: FAIL — `src/ui/components/VocabLearnCard.tsx` does not exist yet.

- [ ] **Step 3: Implement**

Create `src/ui/components/VocabLearnCard.tsx`:

```tsx
import type { VocabPoint } from '@/core/types';

export function VocabLearnCard({ point }: { point: VocabPoint }) {
  const showReading = point.headword !== point.reading;
  return (
    <div className="learn-vocab">
      <div className="learn-vocab-headword">{point.headword}</div>
      <dl className="learn-vocab-fields">
        {showReading && (
          <>
            <dt>Чтение</dt>
            <dd>{point.reading}</dd>
          </>
        )}
        <dt>Часть речи</dt>
        <dd>{point.pos || '—'}</dd>
      </dl>
      <p className="learn-vocab-meaning">{point.meaningRu}</p>
    </div>
  );
}
```

Add to `src/ui/theme.css`, immediately after the existing `.learn-kanji-meaning { font-size: 1.1rem; }` rule:

```css
.learn-vocab { text-align: center; }
.learn-vocab-headword { font-size: 2.4rem; }
.learn-vocab-fields { text-align: left; max-width: 260px; margin: 12px auto; }
.learn-vocab-fields dt { font-weight: 600; margin-top: 8px; }
.learn-vocab-fields dd { margin: 0 0 4px; }
.learn-vocab-meaning { font-size: 1.1rem; }
```

- [ ] **Step 4: Run — expect pass**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/ui/VocabLearnCard.test.tsx`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/VocabLearnCard.tsx src/ui/theme.css tests/ui/VocabLearnCard.test.tsx
git commit -m "feat: VocabLearnCard presentational component for the learn phase"
```

---

## Task 5: `ReviewScreen` dispatches vocab

**Files:**
- Modify: `src/ui/screens/ReviewScreen.tsx`
- Test: `tests/ui/ReviewScreen.test.tsx` (extend)

**Interfaces:**
- Consumes: `VocabLearnCard` from Task 4; `ContentDb.getVocab` (already exists).
- Produces: no new exports — this is the last integration point; after this task a vocab card
  can be learned, reviewed, graded, and persisted end-to-end through the UI.

- [ ] **Step 1: Write the failing test**

Replace the full contents of `tests/ui/ReviewScreen.test.tsx` with:

```tsx
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { SessionStep } from '@/core/session';
import type { ChoiceQuestion } from '@/core/quiz/types';

const upsertCard = vi.fn();
const insertReviewLog = vi.fn();
vi.mock('@/ui/useUserDb', () => ({
  useUserDb: () => ({
    getCard: () => null,
    upsertCard,
    insertReviewLog,
    getSetting: (_k: string, d: unknown) => d,
  }),
}));
vi.mock('@/ui/useContentDb', () => ({
  useContentDb: () => ({
    getGrammar: (id: string) => ({
      id, title: `${id} (частица)`, level: 'N5', layer: 1, tags: [], related: [], relatedTitles: [],
      bodyMarkdown: '## Кратко\nОписание.',
      examples: [{ jaRuby: '私[わたし]', ru: 'я' }],
    }),
    listGrammar: () => [{ id: 'p1', level: 'N5', title: 'p1', layer: 1 }],
    getKanji: (id: string) =>
      id === 'n5-学'
        ? { id: 'n5-学', level: 'N5', char: '学', onyomi: ['ガク'], kunyomi: ['まな.ぶ'], strokeCount: 8, meaningRu: 'учиться' }
        : null,
    listKanji: () => [
      { id: 'n5-学', level: 'N5', char: '学', onyomi: ['ガク'], kunyomi: ['まな.ぶ'], strokeCount: 8, meaningRu: 'учиться' },
    ],
    getVocab: (id: string) =>
      id === 'n5-挨拶-あいさつ'
        ? { id: 'n5-挨拶-あいさつ', level: 'N5', headword: '挨拶', reading: 'あいさつ', pos: 'сущ.', meaningRu: 'приветствие' }
        : null,
    listVocab: () => [
      { id: 'n5-挨拶-あいさつ', level: 'N5', headword: '挨拶', reading: 'あいさつ', pos: 'сущ.', meaningRu: 'приветствие' },
    ],
  }),
}));

function choiceQ(id: string): ChoiceQuestion {
  return {
    id, itemType: 'grammar', itemId: id.split(':')[0]!, kind: 'choice',
    prompt: 'Вопрос?', choices: ['A', 'B', 'C', 'D'], answerIndex: 0,
  };
}

const steps: { value: SessionStep[] } = { value: [] };
vi.mock('@/core/session', async (orig) => {
  const real = await orig<typeof import('@/core/session')>();
  return { ...real, buildDailySession: () => steps.value };
});

vi.mock('@/core/quiz/registry', () => ({
  generateOfKind: (_kind: string, point: { id: string }) => choiceQ(`${point.id}:retry:0`),
}));

import { ReviewScreen } from '@/ui/screens/ReviewScreen';

const renderScreen = () =>
  render(<MemoryRouter><ReviewScreen /></MemoryRouter>);

describe('ReviewScreen', () => {
  beforeEach(() => {
    upsertCard.mockClear();
    insertReviewLog.mockClear();
  });

  it('a review step persists exactly one card and one log row', () => {
    steps.value = [{
      phase: 'review',
      item: { itemType: 'grammar', itemId: 'p1', kind: 'due' },
      question: choiceQ('p1:d:choice'),
    }];
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'A' })); // correct
    fireEvent.click(screen.getByRole('button', { name: /далее/i }));
    expect(upsertCard).toHaveBeenCalledTimes(1);
    expect(insertReviewLog).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Верно 1\/1/)).toBeInTheDocument();
    expect(screen.getByText(/мини-тест —/)).toBeInTheDocument();
  });

  it('a mini-test step never persists, and a failure triggers a retry round', () => {
    steps.value = [{
      phase: 'minitest', sourceItemId: 'p1', index: 0, question: choiceQ('p1:mt:0'),
    }];
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'B' })); // wrong
    fireEvent.click(screen.getByRole('button', { name: /далее/i }));
    // retry round: one more question appears, still no persistence
    expect(screen.getByRole('button', { name: 'A' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    fireEvent.click(screen.getByRole('button', { name: /далее/i }));
    expect(insertReviewLog).not.toHaveBeenCalled();
    expect(upsertCard).not.toHaveBeenCalled();
    expect(screen.getByText(/мини-тест 0\/1/)).toBeInTheDocument();
  });

  it('advancing steps does not flash the previous breakdown', () => {
    steps.value = [
      { phase: 'review', item: { itemType: 'grammar', itemId: 'p1', kind: 'due' }, question: choiceQ('p1:d:choice') },
      { phase: 'review', item: { itemType: 'grammar', itemId: 'p2', kind: 'due' }, question: choiceQ('p2:d:choice') },
    ];
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    fireEvent.click(screen.getByRole('button', { name: /далее/i }));
    // now on step 2: no "Далее", no verdict text
    expect(screen.queryByRole('button', { name: /далее/i })).toBeNull();
    expect(screen.queryByText('Верно')).toBeNull();
  });

  it('a kanji learn step renders KanjiLearnCard, and a kanji review step persists under item_type "kanji"', () => {
    steps.value = [
      { phase: 'learn', itemType: 'kanji', itemId: 'n5-学' },
      {
        phase: 'review',
        item: { itemType: 'kanji', itemId: 'n5-学', kind: 'new' },
        question: { id: 'n5-学:d:choice', itemType: 'kanji', itemId: 'n5-学', kind: 'choice', prompt: 'Что означает «学»?', choices: ['A', 'B', 'C', 'D'], answerIndex: 0 },
      },
    ];
    renderScreen();
    expect(screen.getByText('学')).toBeInTheDocument();
    expect(screen.getByText('учиться')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /понятно/i }));
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    fireEvent.click(screen.getByRole('button', { name: /далее/i }));
    expect(upsertCard).toHaveBeenCalledTimes(1);
    const cardArg = upsertCard.mock.calls[0]![0] as { item_type: string; item_id: string };
    expect(cardArg.item_type).toBe('kanji');
    expect(cardArg.item_id).toBe('n5-学');
  });

  it('a vocab learn step renders VocabLearnCard, and a vocab review step persists under item_type "vocab"', () => {
    steps.value = [
      { phase: 'learn', itemType: 'vocab', itemId: 'n5-挨拶-あいさつ' },
      {
        phase: 'review',
        item: { itemType: 'vocab', itemId: 'n5-挨拶-あいさつ', kind: 'new' },
        question: { id: 'n5-挨拶-あいさつ:d:choice', itemType: 'vocab', itemId: 'n5-挨拶-あいさつ', kind: 'choice', prompt: 'Что означает «挨拶»?', choices: ['A', 'B', 'C', 'D'], answerIndex: 0 },
      },
    ];
    renderScreen();
    expect(screen.getByText('挨拶')).toBeInTheDocument();
    expect(screen.getByText('приветствие')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /понятно/i }));
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    fireEvent.click(screen.getByRole('button', { name: /далее/i }));
    expect(upsertCard).toHaveBeenCalledTimes(1);
    const cardArg = upsertCard.mock.calls[0]![0] as { item_type: string; item_id: string };
    expect(cardArg.item_type).toBe('vocab');
    expect(cardArg.item_id).toBe('n5-挨拶-あいさつ');
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/ui/ReviewScreen.test.tsx`
Expected: FAIL — the new vocab test fails: `ReviewScreen` doesn't fetch via `getVocab` or render
`VocabLearnCard`, so `point` resolves to `null` and the learn/review steps get skipped.

- [ ] **Step 3: Implement**

Replace the full contents of `src/ui/screens/ReviewScreen.tsx` with:

```tsx
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserDb } from '@/ui/useUserDb';
import { useContentDb } from '@/ui/useContentDb';
import { buildDailySession, levelPointsFor, type SessionStep } from '@/core/session';
import { generateOfKind } from '@/core/quiz/registry';
import { grade } from '@/core/quiz/grade';
import { newCard, review } from '@/core/srs';
import type { Answer, GradedAnswer } from '@/core/quiz/types';
import type { GrammarPointFull } from '@/storage/content-db';
import type { KanjiPoint, VocabPoint } from '@/core/types';
import { GrammarMarkdown } from '@/ui/components/GrammarMarkdown';
import { Furigana } from '@/ui/components/Furigana';
import { QuestionView } from '@/ui/components/QuestionView';
import { KanjiLearnCard } from '@/ui/components/KanjiLearnCard';
import { VocabLearnCard } from '@/ui/components/VocabLearnCard';

export function ReviewScreen() {
  const user = useUserDb();
  const content = useContentDb();
  const navigate = useNavigate();

  const baseSteps = useMemo(
    () => buildDailySession(user, content, new Date()),
    [user, content],
  );
  const params = useMemo(
    () => ({
      requestRetention: user.getSetting('fsrs_request_retention', 0.9),
      maximumInterval: user.getSetting('fsrs_maximum_interval', 365),
      enableFuzz: user.getSetting('fsrs_enable_fuzz', true),
    }),
    [user],
  );

  const [tail, setTail] = useState<SessionStep[]>([]);
  const steps = useMemo(() => [...baseSteps, ...tail], [baseSteps, tail]);

  const [idx, setIdx] = useState(0);
  const [graded, setGraded] = useState<GradedAnswer | null>(null);
  const [, setLastAnswer] = useState<Answer | null>(null);
  const shownAt = useRef(Date.now());
  const initedIdx = useRef(-1);
  const retryIds = useRef<Set<string>>(new Set());
  const retryBuilt = useRef(false);
  const [tally, setTally] = useState({ rc: 0, rt: 0, mc: 0, mt: 0 });

  const step: SessionStep | undefined = steps[idx];

  // Skip a step whose content id no longer resolves.
  const stepItemId =
    step?.phase === 'learn'
      ? step.itemId
      : step?.phase === 'review'
        ? step.item.itemId
        : step?.phase === 'minitest'
          ? step.sourceItemId
          : null;
  // Minitest steps are always grammar-sourced (mini-test stays grammar-only, Plan 4b-1).
  const stepItemType =
    step?.phase === 'learn' ? step.itemType
    : step?.phase === 'review' ? step.item.itemType
    : step?.phase === 'minitest' ? 'grammar'
    : null;
  const point: GrammarPointFull | KanjiPoint | VocabPoint | null =
    !stepItemId || !stepItemType
      ? null
      : stepItemType === 'grammar'
        ? content.getGrammar(stepItemId)
        : stepItemType === 'kanji'
          ? content.getKanji(stepItemId)
          : content.getVocab(stepItemId);
  useEffect(() => {
    if (step && !point) setIdx((i) => i + 1);
  }, [step, point]);

  // Reset per-step state once per position, before paint (Plan 2 lesson:
  // a passive effect flashes a frame of the previous answer).
  useLayoutEffect(() => {
    if (!step || initedIdx.current === idx) return;
    initedIdx.current = idx;
    setGraded(null);
    setLastAnswer(null);
    shownAt.current = Date.now();
  }, [idx, step]);

  // Build the retry round when the base session ends with unresolved mini-test fails.
  useEffect(() => {
    if (idx < baseSteps.length || retryBuilt.current || retryIds.current.size === 0) return;
    retryBuilt.current = true;
    const built: SessionStep[] = [];
    [...retryIds.current].forEach((id, n) => {
      const p = content.getGrammar(id);
      if (!p) return;
      built.push({
        phase: 'minitest',
        sourceItemId: id,
        index: 1000 + n,
        question: generateOfKind('choice', p, levelPointsFor(content, p.level), `${id}:retry:${n}`),
      });
    });
    if (built.length) setTail(built);
  }, [idx, baseSteps.length, content]);

  const answer = useCallback(
    (a: Answer) => {
      if (!step || step.phase === 'learn' || graded) return;
      setLastAnswer(a);
      setGraded(grade(step.question, a));
    },
    [step, graded],
  );

  const next = useCallback(() => {
    if (!step) return;
    if (step.phase === 'review' && graded) {
      const now = new Date();
      const elapsedMs = Date.now() - shownAt.current;
      const { itemType, itemId } = step.item;
      const base = user.getCard(itemType, itemId) ?? newCard(itemType, itemId, now);
      const { card, log } = review(base, graded.rating, now, elapsedMs, params);
      user.upsertCard(card);
      user.insertReviewLog(log);
      setTally((t) => ({ ...t, rc: t.rc + (graded.correct ? 1 : 0), rt: t.rt + 1 }));
    } else if (step.phase === 'minitest' && graded) {
      if (step.index < 1000) {
        if (!graded.correct) retryIds.current.add(step.sourceItemId);
        setTally((t) => ({ ...t, mc: t.mc + (graded.correct ? 1 : 0), mt: t.mt + 1 }));
      }
    }
    setIdx((i) => i + 1);
  }, [step, graded, user, params]);

  const proceedLearn = useCallback(() => setIdx((i) => i + 1), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        navigate('/');
        return;
      }
      if (!step) return;
      if (step.phase === 'learn' && e.key === 'Enter') {
        proceedLearn();
        return;
      }
      if (graded && e.key === 'Enter') {
        next();
        return;
      }
      if (
        !graded &&
        (step.phase === 'review' || step.phase === 'minitest') &&
        (step.question.kind === 'cloze' || step.question.kind === 'choice') &&
        ['1', '2', '3', '4'].includes(e.key)
      ) {
        answer({ kind: 'index', value: Number(e.key) - 1 });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, graded, answer, next, proceedLearn, navigate]);

  if (idx >= steps.length && (retryBuilt.current || retryIds.current.size === 0)) {
    const mt = tally.mt === 0 ? 'мини-тест —' : `мини-тест ${tally.mc}/${tally.mt}`;
    return (
      <section className="review review-done">
        <h1>Готово</h1>
        <p className="review-summary">
          Верно {tally.rc}/{tally.rt} · {mt}
        </p>
        <button type="button" className="btn-primary" onClick={() => navigate('/')}>
          Готово
        </button>
      </section>
    );
  }

  if (!step || !point) return null;

  return (
    <section className="review">
      <div className="review-progress">
        {idx + 1} / {steps.length}
      </div>

      {step.phase === 'learn' && (
        <div className="review-learn">
          {stepItemType === 'grammar' && (
            <>
              <h2>{(point as GrammarPointFull).title}</h2>
              <GrammarMarkdown source={(point as GrammarPointFull).bodyMarkdown} />
              <ul className="examples">
                {(point as GrammarPointFull).examples.map((ex, i) => (
                  <li key={i} className="example">
                    <div className="example-ja">
                      <Furigana text={ex.jaRuby} />
                    </div>
                    <div className="example-ru">{ex.ru}</div>
                  </li>
                ))}
              </ul>
            </>
          )}
          {stepItemType === 'kanji' && <KanjiLearnCard point={point as KanjiPoint} />}
          {stepItemType === 'vocab' && <VocabLearnCard point={point as VocabPoint} />}
          <button type="button" className="btn-primary" onClick={proceedLearn}>
            Понятно
          </button>
        </div>
      )}

      {(step.phase === 'review' || step.phase === 'minitest') && (
        <div className="review-question">
          <QuestionView
            key={step.question.id}
            question={step.question}
            onAnswer={answer}
            revealed={graded}
          />
          {graded && (
            <button type="button" className="btn-primary" onClick={next}>
              Далее
            </button>
          )}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run — expect pass**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/ui/ReviewScreen.test.tsx`
Expected: PASS — 5 tests (4 pre-existing + 1 new).

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/ReviewScreen.tsx tests/ui/ReviewScreen.test.tsx
git commit -m "feat: ReviewScreen dispatches learn/review/persist to vocab by itemType"
```

---

## Task 6: Vocab e2e coverage + final regression

**Files:**
- Create: `tests/e2e/vocab-review.spec.ts`

**Interfaces:**
- Consumes: the full stack built by Tasks 1-5, exercised through the real Electron app and a
  real `content.db` built from `content/vocab/n5.tsv`.

- [ ] **Step 1: Write the e2e test**

Create `tests/e2e/vocab-review.spec.ts`:

```ts
import { test, expect, _electron as electron } from '@playwright/test';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

test('a vocab new card is learned and reviewed, and persists as item_type vocab', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'jlpt-e2e-vocab-review-'));
  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/main.js'), `--user-data-dir=${userData}`],
  });
  const win = await app.firstWindow();
  await win.waitForSelector('[data-testid="user-db-ready"]', { state: 'attached', timeout: 20_000 });

  await win.getByRole('link', { name: /начать/i }).click();

  // Walk through the whole base session (grammar + whatever kanji/vocab share
  // the shared new_per_day budget landed) the same generic way
  // kanji-review.spec.ts does: keep clicking whatever control is available
  // until the summary shows.
  for (let guard = 0; guard < 120; guard++) {
    if (await win.getByText(/Верно \d+\/\d+/).count()) break;

    const learn = win.getByRole('button', { name: /понятно/i });
    if (await learn.count()) { await learn.click(); continue; }

    const next = win.getByRole('button', { name: /далее/i });
    if (await next.count()) { await next.click(); continue; }

    const opt = win.locator('.q-options .q-opt').first();
    if (await opt.count()) { await opt.click(); continue; }
    break;
  }
  await expect(win.getByText(/Верно \d+\/\d+/)).toBeVisible({ timeout: 20_000 });

  await app.close();

  // Re-launch on the SAME userData dir and confirm at least one vocab card
  // was actually persisted (item_type = 'vocab') -- proves the whole
  // learn -> review -> grade -> upsertCard round trip really happened for
  // vocab, not just grammar/kanji.
  const app2 = await electron.launch({
    args: [join(process.cwd(), 'out/main/main.js'), `--user-data-dir=${userData}`],
  });
  const win2 = await app2.firstWindow();
  await win2.waitForSelector('[data-testid="user-db-ready"]', { state: 'attached', timeout: 20_000 });
  const hasVocabCard: boolean = await win2.evaluate(async () => {
    const bytes = await window.jlmpBridge!.readUserDb();
    if (!bytes) return false;
    // Cheap sniff: the raw sqlite bytes contain the literal string "vocab"
    // as a stored item_type value once at least one vocab card exists.
    const text = new TextDecoder('latin1').decode(new Uint8Array(bytes));
    return text.includes('vocab');
  });
  expect(hasVocabCard).toBe(true);
  await app2.close();
});
```

- [ ] **Step 2: Build and run the e2e test**

Run:
```bash
export PATH="$PATH:/c/Program Files/nodejs" && npm run build:desktop
export PATH="$PATH:/c/Program Files/nodejs" && npx playwright test tests/e2e/vocab-review.spec.ts
```
Expected: PASS. (`build:desktop`, not `build`, is required first — `packaged.spec.ts`-style e2e
tests run against a separately-packaged `dist/win-unpacked` build, and this new spec launches
`out/main/main.js` the same way `kanji-review.spec.ts` does.)

- [ ] **Step 3: Full regression**

Run:
```bash
export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run
```
Expected: PASS — 222 tests (210 baseline + 14 in `scheduler.test.ts` counted as +2 over its
prior 12, +6 new in `vocab-questions.test.ts`, +1 in `session.test.ts`, +2 new in
`VocabLearnCard.test.tsx`, +1 in `ReviewScreen.test.tsx` — 2+6+1+2+1 = 12 net new tests).

Then run the full e2e suite once to confirm no regression in the existing kanji/grammar/minitest
specs:
```bash
export PATH="$PATH:/c/Program Files/nodejs" && npx playwright test
```
Expected: PASS — all specs green, including the pre-existing `kanji-review.spec.ts`,
`minitest.spec.ts`, and the new `vocab-review.spec.ts`.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/vocab-review.spec.ts
git commit -m "test: e2e coverage for a full vocab learn->review->persist session"
```

---

## Self-Review

- **Spec coverage:** §3.1 (vocab question generators) — Task 2. §3.2 (kana-only reading guard)
  — Task 2's `generateVocabQuestion`. §3.3 (`ItemType` extension) — Task 1. §3.4 (scheduler
  water-fill across 3 types) — Task 1. §3.5 (session dispatch) — Task 3. §3.6 (UI: learn card +
  ReviewScreen dispatch) — Tasks 4-5. Both of Plan 4b-1's final-review findings (ceil-based
  budget bias, implicit-else dispatch) are fixed in Task 1, before `'vocab'` is added to
  `ItemType`, per that review's own recommendation.
- **Placeholder scan:** no TBD/TODO; every step has complete, runnable code; no "similar to
  Task N" references — kanji's file is used only as documented prior art, every new file's full
  content is given in place.
- **Type consistency:** `ItemType` is now declared once (`src/core/types.ts`) and imported
  everywhere else (`scheduler.ts` re-exports it, `session.ts` imports it via `scheduler.ts` as
  before, `quiz/types.ts` imports it directly) — no drift possible between the scheduler's
  three-member union and the quiz layer's question type. `VocabPoint`'s field names
  (`headword`, `reading`, `pos`, `meaningRu`) are used identically in `vocab-questions.ts`,
  `VocabLearnCard.tsx`, and every test fixture.
