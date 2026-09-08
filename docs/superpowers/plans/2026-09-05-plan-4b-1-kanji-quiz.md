# Plan 4b-1 — Kanji Quiz Types + SRS Integration (infra generalization) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kanji becomes a fully reviewable SRS item type — two new choice-question generators
(meaning/reading), and the scheduler/session/UI layer generalized from grammar-only to a
`ItemType = 'grammar' | 'kanji'` union, so kanji cards get learned, scheduled, and reviewed
exactly like grammar today.

**Architecture:** `user-db.ts`/`srs.ts` are already item-type-agnostic (verified: `cards.item_type`
is a free `TEXT` column, `getCard`/`allCards`/`introducedOnOrAfter`/`newCard` already take
`itemType` as a plain string parameter) — zero schema migration. The work is entirely in
`scheduler.ts`/`session.ts` (widen from a single hardcoded `'grammar'` literal to a small,
closed `ItemType` union processed uniformly) and in the UI (`ReviewScreen`/`QuestionView`
dispatch by `itemType` instead of assuming grammar). Vocab is deliberately NOT added to the
`ItemType` union in this plan — Plan 4b-2 extends the same, now-generic machinery by adding
`'vocab'` to one array and one dispatch branch per file, mirroring how kanji N4 was a cheap
addition once N5's pipeline existed.

**Tech Stack:** Unchanged — TypeScript, React 18, Vitest, Playwright, sql.js, ts-fsrs.

**Spec:** `docs/superpowers/specs/2026-09-05-plan-4b-kanji-vocab-quiz-design.md` — this plan
implements that spec's §3.1-3.6 restricted to `'grammar' | 'kanji'` (no `'vocab'` yet, per the
spec's own §1 "Разбивка на подпланы": 4b-1 = infra + kanji, 4b-2 = vocab on top).

## Global Constraints

- **No `user.db` schema migration.** `cards`/`review_log`.`item_type` are already free-string
  columns (`src/storage/migrations.ts`) — every new card row uses `item_type = 'kanji'` and
  needs no `ALTER TABLE`.
- **Choice-only for kanji.** No cloze/assemble analogue exists for kanji (no example
  sentences in `kanji_points`) — both new generators always return a `ChoiceQuestion`, never
  `null` (unlike grammar's generators, which can fail and fall back — kanji has no fallback
  chain because `validateKanji` already guarantees every kanji has ≥1 reading and a non-empty
  `meaningRu`, so both new generators always succeed).
- **Mini-test and `progress.ts` stay grammar-only.** Do not touch `daySummary.miniTestEligible`,
  the mini-test block in `session.ts`, or anything in `src/core/progress.ts` — explicitly out
  of scope per the spec.
- **`review_queue_cap` is one shared cap across item types**, not per type — due cards from
  grammar and kanji are merged into one globally-sorted-by-due list before the cap is applied.
- **`new_per_day` is one shared budget, water-filled across active item types** — see Task 4's
  `allocateBudget` for the exact algorithm. A type with zero available content (e.g. a test
  fixture that doesn't stub kanji) gets zero budget and never steals it from the other type —
  this is what keeps every existing grammar-only test passing unchanged once kanji stubs are
  added to the fakes.
- **Node not on PATH**: prefix every `npm`/`npx` run with
  `export PATH="$PATH:/c/Program Files/nodejs" &&` (Bash) as established in this repo.

---

## File Structure

**Created:**
- `src/core/quiz/kanji-questions.ts` — `genKanjiMeaning`, `genKanjiReading`, `generateKanjiQuestion`.
- `src/ui/components/KanjiLearnCard.tsx` — compact "learn" card for a new kanji.
- `tests/core/quiz/kanji-questions.test.ts`
- `tests/ui/KanjiLearnCard.test.tsx`

**Modified:**
- `src/core/quiz/distractors.ts` — gains generic `distractorPool`, `shuffleWithAnswer` (moved
  from `grammar-questions.ts`, generalized to `<T extends {id:string}>`).
- `src/core/quiz/grammar-questions.ts` — imports `distractorPool`/`shuffleWithAnswer` from
  `distractors.ts` instead of defining them locally. No behavior change.
- `src/core/quiz/types.ts` — `QuestionBase.itemType: 'grammar' | 'kanji'`.
- `src/core/scheduler.ts` — `ItemType` union, `QueueItem.itemType` widened, grammar-specific
  `availableGrammarIds`/`knownGrammarIds`/`split` generalized to loop over `ItemType`.
- `src/core/session.ts` — `SessionStep`'s `learn` variant gains `itemType`; `review` variant's
  `itemType` widened; `buildDailySession` dispatches by `itemType` to fetch the right point
  and call the right generator.
- `src/ui/components/QuestionView.tsx` — "Подробнее" link uses `question.itemType` instead of
  a hardcoded `grammar`.
- `src/ui/screens/ReviewScreen.tsx` — point-fetch and `getCard`/`newCard` calls dispatch by
  the current step's `itemType`; learn-phase render branches to `KanjiLearnCard` for kanji.
- `src/ui/theme.css` — `.learn-kanji*` rules for `KanjiLearnCard`.
- `tests/core/quiz/distractors.test.ts` — one new test for the generic signature.
- `tests/core/scheduler.test.ts` — existing fakes gain a `listKanji: () => []` stub (behavior-
  preserving); two new cross-type tests.
- `tests/core/session.test.ts` — existing fake gains kanji stubs; one new kanji-session test.
- `tests/ui/QuestionView.test.tsx` — one new test for a kanji-itemType link.
- `tests/ui/ReviewScreen.test.tsx` — mock gains kanji stubs; one new kanji learn→review test.
- New e2e: `tests/e2e/kanji-review.spec.ts`.

**Not modified:** `src/storage/user-db.ts`, `src/core/srs.ts` (already generic), `src/core/progress.ts`,
`src/storage/migrations.ts`, `src/core/quiz/rng.ts`, `src/core/quiz/grade.ts` (already
dispatches on `question.kind`, not `itemType` — no change needed), `content/**`, `scripts/build-content/**`.

---

## Task 1: Generalize distractor helpers

**Files:**
- Modify: `src/core/quiz/distractors.ts`, `src/core/quiz/grammar-questions.ts`
- Test: `tests/core/quiz/distractors.test.ts` (extend)

**Interfaces:**
- Produces: `distractorPool<T extends { id: string }>(levelPoints: readonly T[], excludeId: string, extract: (p: T) => string[]): string[]`, `shuffleWithAnswer(correctFirst: string[], seed: string): { list: string[]; answerIndex: number }` — both exported from `src/core/quiz/distractors.ts`, used by `grammar-questions.ts` (Task 1) and `kanji-questions.ts` (Task 3).

- [ ] **Step 1: Write the failing test**

Append to `tests/core/quiz/distractors.test.ts`, inside `describe('core/quiz/distractors', ...)`:

```ts
  it('distractorPool works over any {id:string}-shaped point, generically', () => {
    const points = [
      { id: 'a', tag: 'x' }, { id: 'b', tag: 'y' }, { id: 'c', tag: 'z' },
    ];
    expect(distractorPool(points, 'a', (p) => [p.tag])).toEqual(['y', 'z']);
  });

  it('shuffleWithAnswer keeps the correct value findable at the returned index', () => {
    const { list, answerIndex } = shuffleWithAnswer(['は', 'を', 'に', 'も'], 'seed-1');
    expect(list).toHaveLength(4);
    expect(list[answerIndex]).toBe('は');
    expect(new Set(list)).toEqual(new Set(['は', 'を', 'に', 'も']));
  });
```

Add the import at the top: `import { pickDistractors, distractorPool, shuffleWithAnswer } from '@/core/quiz/distractors';` (replacing the existing `import { pickDistractors } from '@/core/quiz/distractors';`).

- [ ] **Step 2: Run — expect failure**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/core/quiz/distractors.test.ts`
Expected: FAIL — `distractorPool`/`shuffleWithAnswer` are not exported from `distractors.ts` yet.

- [ ] **Step 3: Implement**

Replace the full contents of `src/core/quiz/distractors.ts` with:

```ts
import { seededShuffle } from '@/core/quiz/rng';

export function pickDistractors(
  pool: readonly string[],
  correct: string,
  n: number,
  seed: string,
): string[] {
  const seen = new Set<string>([correct]);
  const unique: string[] = [];
  for (const c of pool) {
    const t = c.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    unique.push(t);
  }

  // Seeded shuffle first so ties below resolve deterministically but not by
  // original pool order. Include n in seed so different counts produce different shuffles.
  const shuffled = seededShuffle(unique, `${seed}:${n}`);
  shuffled.sort((a, b) => {
    const sharedA = a[0] === correct[0] ? 0 : 1;
    const sharedB = b[0] === correct[0] ? 0 : 1;
    if (sharedA !== sharedB) return sharedA - sharedB;
    return Math.abs(a.length - correct.length) - Math.abs(b.length - correct.length);
  });

  const out = shuffled.slice(0, n);
  while (out.length < n) out.push('—');
  return out;
}

/** Flattens every other level point's `extract(p)` strings into one candidate pool. */
export function distractorPool<T extends { id: string }>(
  levelPoints: readonly T[],
  excludeId: string,
  extract: (p: T) => string[],
): string[] {
  return levelPoints.filter((p) => p.id !== excludeId).flatMap(extract);
}

export function shuffleWithAnswer(
  correctFirst: string[],
  seed: string,
): { list: string[]; answerIndex: number } {
  const indexed = correctFirst.map((text, i) => ({ text, correct: i === 0 }));
  const shuffled = seededShuffle(indexed, seed);
  return {
    list: shuffled.map((x) => x.text),
    answerIndex: shuffled.findIndex((x) => x.correct),
  };
}
```

In `src/core/quiz/grammar-questions.ts`:
- Change the import line to: `import { pickDistractors, distractorPool, shuffleWithAnswer } from '@/core/quiz/distractors';`
- Delete the local `function shuffleWithAnswer(...)` definition (lines 43-53 of the current file).
- Delete the local `function distractorPool(...)` definition (lines 55-61 of the current file).

(Every call site — `genCloze`, `genChoice` — already calls `distractorPool(...)`/`shuffleWithAnswer(...)` by bare name, so no call-site changes are needed once the imports resolve to the new location.)

- [ ] **Step 4: Run — expect pass**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/core/quiz/distractors.test.ts tests/core/quiz/grammar-questions.test.ts`
Expected: PASS — all existing `grammar-questions.test.ts` tests unaffected (pure refactor), 2 new `distractors.test.ts` tests pass.

- [ ] **Step 5: Regression + commit**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npm run typecheck && npm run lint && npm test`

```bash
git add src/core/quiz/distractors.ts src/core/quiz/grammar-questions.ts tests/core/quiz/distractors.test.ts
git commit -m "refactor: generalize distractorPool/shuffleWithAnswer for reuse beyond grammar

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: Widen `QuestionBase.itemType`

**Files:**
- Modify: `src/core/quiz/types.ts`

**Interfaces:**
- Produces: `QuestionBase.itemType: 'grammar' | 'kanji'` (was `'grammar'`).

- [ ] **Step 1: Implement** (no separate failing-test step — this is a type widening with no
  runtime behavior; the "test" is that everything downstream still typechecks and all existing
  tests, which construct objects with `itemType: 'grammar'`, keep compiling since `'grammar'`
  remains a valid member of the widened union)

In `src/core/quiz/types.ts`, change:
```ts
export interface QuestionBase {
  id: string;
  itemType: 'grammar';
  itemId: string;
  kind: QuestionKind;
  prompt: string;
}
```
to:
```ts
export interface QuestionBase {
  id: string;
  itemType: 'grammar' | 'kanji';
  itemId: string;
  kind: QuestionKind;
  prompt: string;
}
```

- [ ] **Step 2: Run — expect pass (no red step, but verify nothing’s broken)**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npm run typecheck && npx vitest run tests/core/quiz/`
Expected: PASS — every existing `Question` literal already used `itemType: 'grammar'`, which is
still assignable to the widened union.

- [ ] **Step 3: Commit**

```bash
git add src/core/quiz/types.ts
git commit -m "feat: widen QuestionBase.itemType to grammar|kanji

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Kanji question generators

**Files:**
- Create: `src/core/quiz/kanji-questions.ts`
- Test: `tests/core/quiz/kanji-questions.test.ts`

**Interfaces:**
- Consumes: `KanjiPoint` (`src/core/types.ts`), `pickDistractors`/`distractorPool`/`shuffleWithAnswer` (`src/core/quiz/distractors.ts`, Task 1), `seededPick` (`src/core/quiz/rng.ts`).
- Produces: `genKanjiMeaning(point: KanjiPoint, levelPoints: readonly KanjiPoint[], seed: string): ChoiceQuestion`, `genKanjiReading(point, levelPoints, seed): ChoiceQuestion`, `generateKanjiQuestion(point, levelPoints, reps: number, seed: string): Question` — the last one is what `session.ts` (Task 5) calls.

- [ ] **Step 1: Write the failing test**

Create `tests/core/quiz/kanji-questions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { genKanjiMeaning, genKanjiReading, generateKanjiQuestion } from '@/core/quiz/kanji-questions';
import type { KanjiPoint } from '@/core/types';

const gaku: KanjiPoint = {
  id: 'n5-学', level: 'N5', char: '学', onyomi: ['ガク'], kunyomi: ['まな.ぶ'], strokeCount: 8, meaningRu: 'учиться',
};
const others: KanjiPoint[] = [
  { id: 'n5-一', level: 'N5', char: '一', onyomi: ['イチ'], kunyomi: ['ひと.つ'], strokeCount: 1, meaningRu: 'один' },
  { id: 'n5-水', level: 'N5', char: '水', onyomi: ['スイ'], kunyomi: ['みず'], strokeCount: 4, meaningRu: 'вода' },
  { id: 'n5-木', level: 'N5', char: '木', onyomi: ['モク', 'ボク'], kunyomi: ['き'], strokeCount: 4, meaningRu: 'дерево' },
];

describe('genKanjiMeaning', () => {
  it('correct answer is the point meaning, distractors from other points', () => {
    const q = genKanjiMeaning(gaku, others, 's');
    expect(q.kind).toBe('choice');
    expect(q.itemType).toBe('kanji');
    expect(q.itemId).toBe('n5-学');
    expect(q.prompt).toContain('学');
    expect(q.choices).toHaveLength(4);
    expect(q.choices[q.answerIndex]).toBe('учиться');
    const distractors = q.choices.filter((_, i) => i !== q.answerIndex);
    distractors.forEach((d) => expect(['один', 'вода', 'дерево']).toContain(d));
  });

  it('is deterministic for a seed', () => {
    expect(genKanjiMeaning(gaku, others, 's')).toEqual(genKanjiMeaning(gaku, others, 's'));
  });
});

describe('genKanjiReading', () => {
  it('correct answer is one of the point readings (on or kun), distractors from other points', () => {
    const q = genKanjiReading(gaku, others, 's');
    expect(q.kind).toBe('choice');
    expect(q.choices).toHaveLength(4);
    expect(['ガク', 'まな.ぶ']).toContain(q.choices[q.answerIndex]);
    const distractors = q.choices.filter((_, i) => i !== q.answerIndex);
    const otherReadings = ['イチ', 'ひと.つ', 'スイ', 'みず', 'モク', 'ボク', 'き'];
    distractors.forEach((d) => expect(otherReadings).toContain(d));
  });

  it('is deterministic for a seed', () => {
    expect(genKanjiReading(gaku, others, 's')).toEqual(genKanjiReading(gaku, others, 's'));
  });
});

describe('generateKanjiQuestion', () => {
  it('alternates meaning/reading by reps parity', () => {
    const meaning = genKanjiMeaning(gaku, others, 'x:0');
    const reading = genKanjiReading(gaku, others, 'x:0');
    expect(generateKanjiQuestion(gaku, others, 0, 'x:0')).toEqual(meaning);
    expect(generateKanjiQuestion(gaku, others, 1, 'x:0')).toEqual(reading);
    expect(generateKanjiQuestion(gaku, others, 2, 'x:0')).toEqual(meaning);
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/core/quiz/kanji-questions.test.ts`
Expected: FAIL — `src/core/quiz/kanji-questions.ts` doesn't exist.

- [ ] **Step 3: Implement**

Create `src/core/quiz/kanji-questions.ts`:

```ts
import type { KanjiPoint } from '@/core/types';
import type { ChoiceQuestion, Question } from '@/core/quiz/types';
import { pickDistractors, distractorPool, shuffleWithAnswer } from '@/core/quiz/distractors';
import { seededPick } from '@/core/quiz/rng';

export const genKanjiMeaning = (
  point: KanjiPoint,
  levelPoints: readonly KanjiPoint[],
  seed: string,
): ChoiceQuestion => {
  const pool = distractorPool(levelPoints, point.id, (p) => [p.meaningRu]);
  const distractors = pickDistractors(pool, point.meaningRu, 3, `${seed}:d`);
  const { list, answerIndex } = shuffleWithAnswer([point.meaningRu, ...distractors], `${seed}:c`);
  return {
    id: seed, itemType: 'kanji', itemId: point.id, kind: 'choice',
    prompt: `Что означает «${point.char}»?`,
    choices: list, answerIndex,
  };
};

export const genKanjiReading = (
  point: KanjiPoint,
  levelPoints: readonly KanjiPoint[],
  seed: string,
): ChoiceQuestion => {
  const readings = [...point.onyomi, ...point.kunyomi];
  const correct = seededPick(readings, `${seed}:r`);
  const pool = distractorPool(levelPoints, point.id, (p) => [...p.onyomi, ...p.kunyomi]);
  const distractors = pickDistractors(pool, correct, 3, `${seed}:d`);
  const { list, answerIndex } = shuffleWithAnswer([correct, ...distractors], `${seed}:c`);
  return {
    id: seed, itemType: 'kanji', itemId: point.id, kind: 'choice',
    prompt: `Как читается «${point.char}»?`,
    choices: list, answerIndex,
  };
};

/**
 * Kanji has no cloze/assemble analogue (no example sentences), and both
 * generators above always succeed (validateKanji guarantees ≥1 reading and a
 * non-empty meaning) -- so there's no rotation/fallback chain like grammar's,
 * just a 2-way alternation by reps parity.
 */
export function generateKanjiQuestion(
  point: KanjiPoint,
  levelPoints: readonly KanjiPoint[],
  reps: number,
  seed: string,
): Question {
  const wantReading = ((reps % 2) + 2) % 2 === 1;
  return wantReading ? genKanjiReading(point, levelPoints, seed) : genKanjiMeaning(point, levelPoints, seed);
}
```

- [ ] **Step 4: Run — expect pass**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/core/quiz/kanji-questions.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Regression + commit**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npm run typecheck && npm run lint && npm test`

```bash
git add src/core/quiz/kanji-questions.ts tests/core/quiz/kanji-questions.test.ts
git commit -m "feat: kanji meaning/reading choice-question generators

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: Scheduler generalization

**Files:**
- Modify: `src/core/scheduler.ts`
- Test: `tests/core/scheduler.test.ts` (extend)

**Interfaces:**
- Consumes: `ContentDb.listKanji(level)` (already exists, returns full `KanjiPoint[]`), `UserDb.allCards(itemType)`/`introducedOnOrAfter(iso, itemType)` (already generic).
- Produces: `export type ItemType = 'grammar' | 'kanji'`, `QueueItem.itemType: ItemType`, `buildQueue`/`daySummary` unchanged signatures but now consider both item types.

- [ ] **Step 1: Update the test fakes (behavior-preserving) and write the new failing tests**

In `tests/core/scheduler.test.ts`, update `fakeContent` and `fakeMultiLevelContent` to add a
`listKanji` stub returning `[]` (kanji has zero capacity in every existing test — this is what
keeps all 11 existing tests passing unchanged once the implementation loops over both types):

```ts
function fakeContent(points: { id: string; layer: number }[]) {
  return {
    listLevels: () => [{ code: 'N5', status: 'available', ord: 1, titleRu: 'N5' }],
    listGrammar: () =>
      points.map((p) => ({ id: p.id, level: 'N5', title: p.id, layer: p.layer })),
    listKanji: () => [],
  } as unknown as import('@/storage/content-db').ContentDb;
}
```

```ts
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
    listKanji: () => [],
  } as unknown as import('@/storage/content-db').ContentDb;
}
```

Then append, inside `describe('core/scheduler', ...)`, after the `'buildQueue is idempotent...'` test:

```ts
  it('splits the shared new_per_day budget between grammar and kanji when both have content', () => {
    const content = {
      listLevels: () => [{ code: 'N5', status: 'available', ord: 1, titleRu: 'N5' }],
      listGrammar: () => POINTS.map((p) => ({ id: p.id, level: 'N5', title: p.id, layer: p.layer })),
      listKanji: () =>
        ['k1', 'k2', 'k3', 'k4', 'k5', 'k6'].map((id) => ({
          id, level: 'N5', char: id, onyomi: ['ア'], kunyomi: [], strokeCount: 1, meaningRu: id,
        })),
    } as unknown as import('@/storage/content-db').ContentDb;

    const q = buildQueue(user, content, now);
    const byType = { grammar: 0, kanji: 0 };
    q.forEach((i) => { byType[i.itemType] += 1; });
    expect(byType.grammar).toBe(3);
    expect(byType.kanji).toBe(2);
    expect(byType.grammar + byType.kanji).toBe(5); // default new_per_day
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
```

- [ ] **Step 2: Run — expect failure**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/core/scheduler.test.ts`
Expected: FAIL — `daySummary`/`buildQueue` don't yet consider kanji, and `QueueItem.itemType`
is still hardcoded to `'grammar'` so `byType[i.itemType]` on a `'kanji'` item type-errors /
the two new tests fail their assertions (kanji count will be 0, not 2; dueCount will only
reflect grammar's 2, not the merged 3).

- [ ] **Step 3: Implement**

Replace the full contents of `src/core/scheduler.ts` with:

```ts
import type { UserDb } from '@/storage/user-db';
import type { ContentDb } from '@/storage/content-db';
import { startOfLocalDay, endOfLocalDay, toUtcIso, localDayKey } from '@/core/time';
import { statusOf } from '@/core/srs';

export type ItemType = 'grammar' | 'kanji';
const ITEM_TYPES: readonly ItemType[] = ['grammar', 'kanji'];

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

/** Every id of `itemType` in an `available` level, in new-card introduction order. */
function availableItemIds(content: ContentDb, itemType: ItemType): string[] {
  if (itemType === 'grammar') {
    const ids: { id: string; ord: number; layer: number }[] = [];
    for (const lvl of content.listLevels()) {
      if (lvl.status !== 'available') continue;
      for (const g of content.listGrammar(lvl.code)) ids.push({ id: g.id, ord: lvl.ord, layer: g.layer });
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
  // Kanji has no `layer` (no sub-level pedagogical ordering data) -- order by
  // level ord then plain id.
  const ids: { id: string; ord: number }[] = [];
  for (const lvl of content.listLevels()) {
    if (lvl.status !== 'available') continue;
    for (const p of content.listKanji(lvl.code)) ids.push({ id: p.id, ord: lvl.ord });
  }
  ids.sort((a, b) => a.ord - b.ord || a.id.localeCompare(b.id));
  return ids.map((x) => x.id);
}

/** Every id of `itemType` the content db can actually resolve, regardless of level status. */
function knownItemIds(content: ContentDb, itemType: ItemType): Set<string> {
  const s = new Set<string>();
  for (const lvl of content.listLevels()) {
    const points = itemType === 'grammar' ? content.listGrammar(lvl.code) : content.listKanji(lvl.code);
    for (const p of points) s.add(p.id);
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
 * still-hungry type an equal (ceil) share of what's left, capped by its
 * remaining room, then drops types that hit their room and repeats. A type
 * with zero room from the start (no available content, e.g. a level not
 * shipped yet, or a test fixture that doesn't stub it) never enters a round
 * and never steals budget from the others -- this is what keeps a
 * grammar-only fixture's full new_per_day budget landing entirely on
 * grammar once kanji reports zero capacity.
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
    const share = Math.ceil(remaining / active.length);
    for (const t of active) {
      if (remaining <= 0) break;
      const room = capacity(t) - alloc[t];
      const take = Math.min(share, room, remaining);
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

- [ ] **Step 4: Run — expect pass**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/core/scheduler.test.ts`
Expected: PASS — all 11 pre-existing tests unchanged in behavior, 2 new tests pass (13 total).

- [ ] **Step 5: Regression + commit**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npm run typecheck && npm run lint && npm test`

```bash
git add src/core/scheduler.ts tests/core/scheduler.test.ts
git commit -m "feat: generalize scheduler to a grammar|kanji ItemType union

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: Session generalization

**Files:**
- Modify: `src/core/session.ts`
- Test: `tests/core/session.test.ts` (extend)

**Interfaces:**
- Consumes: `buildQueue`/`QueueItem`/`ItemType` (Task 4), `generateKanjiQuestion` (Task 3), `ContentDb.getKanji(id)`/`listKanji(level)` (already exist).
- Produces: `SessionStep`'s `learn` variant now `{ phase: 'learn'; itemType: ItemType; itemId: string }`; `review` variant's `item.itemType: ItemType`.

- [ ] **Step 1: Update the test fake and write the new failing test**

In `tests/core/session.test.ts`, add `listKanji`/`getKanji` stubs to `fakeContent()` (returning
empty/null — kanji has zero capacity in every existing test, preserving their behavior):

```ts
function fakeContent(): ContentDb {
  const byId = new Map(POINTS.map((p) => [p.id, p]));
  return {
    listLevels: () => [{ code: 'N5', status: 'available', ord: 1, titleRu: 'N5' }],
    listGrammar: () => POINTS.map((p) => ({ id: p.id, level: 'N5', title: p.title, layer: p.layer })),
    getGrammar: (id: string) => byId.get(id) ?? null,
    listKanji: () => [],
    getKanji: () => null,
  } as unknown as ContentDb;
}
```

Then append, inside `describe('core/session', ...)`, after the `'is idempotent for the same now'` test:

```ts
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
```

- [ ] **Step 2: Run — expect failure**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/core/session.test.ts`
Expected: FAIL — `buildDailySession` doesn't yet dispatch to kanji at all.

- [ ] **Step 3: Implement**

Replace the full contents of `src/core/session.ts` with:

```ts
import type { UserDb } from '@/storage/user-db';
import type { ContentDb, GrammarPointFull } from '@/storage/content-db';
import type { KanjiPoint } from '@/core/types';
import type { Question } from '@/core/quiz/types';
import { buildQueue, type ItemType } from '@/core/scheduler';
import { generateForCard, generateOfKind, ROTATION } from '@/core/quiz/registry';
import { generateKanjiQuestion } from '@/core/quiz/kanji-questions';
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
  const levelCache = new Map<string, GrammarPointFull[]>();
  const levelPoints = (level: string): GrammarPointFull[] => {
    if (!levelCache.has(level)) levelCache.set(level, levelPointsFor(content, level));
    return levelCache.get(level)!;
  };
  const kanjiLevelCache = new Map<string, KanjiPoint[]>();
  const kanjiLevelPoints = (level: string): KanjiPoint[] => {
    if (!kanjiLevelCache.has(level)) kanjiLevelCache.set(level, content.listKanji(level));
    return kanjiLevelCache.get(level)!;
  };

  for (const qi of buildQueue(user, content, now)) {
    const reps = user.getCard(qi.itemType, qi.itemId)?.reps ?? 0;
    let question: Question | null = null;

    if (qi.itemType === 'grammar') {
      const point = getGrammarPoint(qi.itemId);
      if (!point) continue;
      question = generateForCard(point, levelPoints(point.level), reps, dayKey);
    } else {
      const point = content.getKanji(qi.itemId);
      if (!point) continue;
      question = generateKanjiQuestion(point, kanjiLevelPoints(point.level), reps, dayKey);
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
      const question = generateOfKind(kind, point, levelPoints(point.level), `${srcId}:mt:${index}`);
      steps.push({ phase: 'minitest', question, sourceItemId: srcId, index });
    });
  }

  return steps;
}
```

- [ ] **Step 4: Run — expect pass**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/core/session.test.ts`
Expected: PASS — 6 pre-existing tests unchanged, 1 new test passes (7 total).

- [ ] **Step 5: Regression + commit**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npm run typecheck && npm run lint && npm test`

```bash
git add src/core/session.ts tests/core/session.test.ts
git commit -m "feat: buildDailySession dispatches grammar/kanji by itemType

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: `QuestionView` — itemType-aware detail link

**Files:**
- Modify: `src/ui/components/QuestionView.tsx`
- Test: `tests/ui/QuestionView.test.tsx` (extend)

**Interfaces:**
- Consumes: `question.itemType` (already on every `Question`, Task 2).
- Produces: the "Подробнее" link now points at `#/${question.itemType}/${question.itemId}`.

- [ ] **Step 1: Write the failing test**

Append to `tests/ui/QuestionView.test.tsx`, inside `describe('QuestionView', ...)`, after the
`'cloze: revealed marks the correct and the wrong-picked options'` test:

```ts
  it('the detail link is itemType-aware, not hardcoded to grammar', () => {
    const kanjiChoice: ChoiceQuestion = {
      id: 'k:d:choice', itemType: 'kanji', itemId: 'n5-学', kind: 'choice',
      prompt: 'Что означает «学»?', choices: ['учиться', 'вода', 'один', 'дерево'], answerIndex: 0,
    };
    render(<QuestionView question={kanjiChoice} onAnswer={vi.fn()} revealed={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'учиться' }));
    const { rerender } = render(
      <QuestionView question={kanjiChoice} onAnswer={vi.fn()} revealed={{ correct: true, rating: 3 }} />,
    );
    rerender(
      <QuestionView question={kanjiChoice} onAnswer={vi.fn()} revealed={{ correct: true, rating: 3 }} />,
    );
    expect(screen.getByRole('link', { name: /подробнее/i })).toHaveAttribute('href', '#/kanji/n5-学');
  });
```

Add `ChoiceQuestion` to the existing type-only import at the top of the file:
`import type { ClozeQuestion, AssembleQuestion, ChoiceQuestion } from '@/core/quiz/types';`

- [ ] **Step 2: Run — expect failure**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/ui/QuestionView.test.tsx`
Expected: FAIL — the link is hardcoded to `#/grammar/n5-学`, not `#/kanji/n5-学`.

- [ ] **Step 3: Implement**

In `src/ui/components/QuestionView.tsx`, change:
```tsx
      <a className="q-more" href={`#/grammar/${question.itemId}`}>
```
to:
```tsx
      <a className="q-more" href={`#/${question.itemType}/${question.itemId}`}>
```

- [ ] **Step 4: Run — expect pass**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/ui/QuestionView.test.tsx`
Expected: PASS (4 tests — the pre-existing grammar-link test still passes since `#/grammar/n5-wa` is what `${question.itemType}` produces for a grammar question too).

- [ ] **Step 5: Regression + commit**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npm run typecheck && npm run lint && npm test`

```bash
git add src/ui/components/QuestionView.tsx tests/ui/QuestionView.test.tsx
git commit -m "feat: QuestionView detail link is itemType-aware

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: `KanjiLearnCard` component

**Files:**
- Create: `src/ui/components/KanjiLearnCard.tsx`
- Test: `tests/ui/KanjiLearnCard.test.tsx`
- Modify: `src/ui/theme.css`

**Interfaces:**
- Consumes: `KanjiPoint` (`src/core/types.ts`).
- Produces: `KanjiLearnCard({ point }: { point: KanjiPoint })` — a presentational component, no internal state, no data fetching.

- [ ] **Step 1: Write the failing test**

Create `tests/ui/KanjiLearnCard.test.tsx`:

```tsx
import '@testing-library/jest-dom/vitest';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KanjiLearnCard } from '@/ui/components/KanjiLearnCard';
import type { KanjiPoint } from '@/core/types';

const gaku: KanjiPoint = {
  id: 'n5-学', level: 'N5', char: '学', onyomi: ['ガク'], kunyomi: ['まな.ぶ'], strokeCount: 8, meaningRu: 'учиться',
};
const noReadings: KanjiPoint = {
  id: 'n5-亜', level: 'N5', char: '亜', onyomi: [], kunyomi: [], strokeCount: 7, meaningRu: 'Азия',
};

describe('KanjiLearnCard', () => {
  it('shows the character, both readings, stroke count and meaning', () => {
    render(<KanjiLearnCard point={gaku} />);
    expect(screen.getByText('学')).toBeInTheDocument();
    expect(screen.getByText('ガク')).toBeInTheDocument();
    expect(screen.getByText('まな.ぶ')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('учиться')).toBeInTheDocument();
  });

  it('shows an em-dash fallback for a missing reading kind', () => {
    render(<KanjiLearnCard point={noReadings} />);
    expect(screen.getAllByText('—')).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/ui/KanjiLearnCard.test.tsx`
Expected: FAIL — `src/ui/components/KanjiLearnCard.tsx` doesn't exist.

- [ ] **Step 3: Implement**

Create `src/ui/components/KanjiLearnCard.tsx`:

```tsx
import type { KanjiPoint } from '@/core/types';

export function KanjiLearnCard({ point }: { point: KanjiPoint }) {
  return (
    <div className="learn-kanji">
      <div className="learn-kanji-char">{point.char}</div>
      <dl className="learn-kanji-readings">
        <dt>Онное чтение</dt>
        <dd>{point.onyomi.length ? point.onyomi.join('、') : '—'}</dd>
        <dt>Кунное чтение</dt>
        <dd>{point.kunyomi.length ? point.kunyomi.join('、') : '—'}</dd>
        <dt>Количество черт</dt>
        <dd>{point.strokeCount}</dd>
      </dl>
      <p className="learn-kanji-meaning">{point.meaningRu}</p>
    </div>
  );
}
```

In `src/ui/theme.css`, after the existing `.kanji-detail-readings dd { margin: 0 0 4px; }` rule:

```css
.learn-kanji { text-align: center; }
.learn-kanji-char { font-size: 3.5rem; }
.learn-kanji-readings { text-align: left; max-width: 260px; margin: 12px auto; }
.learn-kanji-readings dt { font-weight: 600; margin-top: 8px; }
.learn-kanji-readings dd { margin: 0 0 4px; }
.learn-kanji-meaning { font-size: 1.1rem; }
```

- [ ] **Step 4: Run — expect pass**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/ui/KanjiLearnCard.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Regression + commit**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npm run typecheck && npm run lint && npm test`

```bash
git add src/ui/components/KanjiLearnCard.tsx tests/ui/KanjiLearnCard.test.tsx src/ui/theme.css
git commit -m "feat: KanjiLearnCard presentational component for the learn phase

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: `ReviewScreen` — dispatch by itemType

**Files:**
- Modify: `src/ui/screens/ReviewScreen.tsx`
- Test: `tests/ui/ReviewScreen.test.tsx` (extend)

**Interfaces:**
- Consumes: `KanjiLearnCard` (Task 7), `ContentDb.getKanji`/`listKanji` (already exist), `SessionStep.itemType`/`item.itemType` (Task 5).
- Produces: `ReviewScreen` renders and persists kanji steps exactly like grammar steps, using the step's own `itemType` to pick the fetch method, the learn-phase renderer, and the `getCard`/`newCard` call.

- [ ] **Step 1: Update the test mock and write the new failing test**

In `tests/ui/ReviewScreen.test.tsx`, extend the `useContentDb` mock to add kanji stubs:

```ts
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
  }),
}));
```

Then append, inside `describe('ReviewScreen', ...)`, after the `'a review step persists exactly one card and one log row'` test:

```ts
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
```

- [ ] **Step 2: Run — expect failure**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/ui/ReviewScreen.test.tsx`
Expected: FAIL — `ReviewScreen` still hardcodes `content.getGrammar`/`'grammar'` everywhere, so the
kanji step's point never resolves (the screen renders nothing, or throws).

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
import type { KanjiPoint } from '@/core/types';
import { GrammarMarkdown } from '@/ui/components/GrammarMarkdown';
import { Furigana } from '@/ui/components/Furigana';
import { QuestionView } from '@/ui/components/QuestionView';
import { KanjiLearnCard } from '@/ui/components/KanjiLearnCard';

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
  const point: GrammarPointFull | KanjiPoint | null =
    !stepItemId || !stepItemType
      ? null
      : stepItemType === 'grammar'
        ? content.getGrammar(stepItemId)
        : content.getKanji(stepItemId);
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
Expected: PASS — 3 pre-existing tests unchanged, 1 new kanji test passes (4 total).

- [ ] **Step 5: Regression + commit**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npm run typecheck && npm run lint && npm test && npm run build`

```bash
git add src/ui/screens/ReviewScreen.tsx tests/ui/ReviewScreen.test.tsx
git commit -m "feat: ReviewScreen dispatches learn/review/persist by step itemType

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9: E2E — a full kanji review session + final regression

**Files:**
- Create: `tests/e2e/kanji-review.spec.ts`

**Interfaces:** none (black-box UI test through the real Electron app + real `content.db`).

- [ ] **Step 1: Write `tests/e2e/kanji-review.spec.ts`**

This seeds a `user.db` with zero cards (fresh learner) so the very first N5 kanji (whichever
`buildQueue` picks first, deterministic by day-key) is guaranteed to appear as a `learn` step
followed by a `review` step, then walks through it exactly like `minitest.spec.ts`/`review.spec.ts`
already do for grammar.

```ts
import { test, expect, _electron as electron } from '@playwright/test';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

test('a kanji new card is learned and reviewed, and persists as item_type kanji', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'jlpt-e2e-kanji-review-'));
  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/main.js'), `--user-data-dir=${userData}`],
  });
  const win = await app.firstWindow();
  await win.waitForSelector('[data-testid="user-db-ready"]', { state: 'attached', timeout: 20_000 });

  await win.getByRole('link', { name: /начать/i }).click();

  // Walk through the whole base session (grammar + whatever kanji share the
  // shared new_per_day budget landed) the same generic way minitest.spec.ts
  // does: keep clicking whatever control is available until the summary shows.
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

  // Re-launch on the SAME userData dir and confirm at least one kanji card
  // was actually persisted (item_type = 'kanji') -- proves the whole
  // learn -> review -> grade -> upsertCard round trip really happened for
  // kanji, not just grammar.
  const app2 = await electron.launch({
    args: [join(process.cwd(), 'out/main/main.js'), `--user-data-dir=${userData}`],
  });
  const win2 = await app2.firstWindow();
  const hasKanjiCard: boolean = await win2.evaluate(async () => {
    const bytes = await window.jlmpBridge!.readUserDb();
    if (!bytes) return false;
    // Cheap sniff: the raw sqlite bytes contain the literal string "kanji"
    // as a stored item_type value once at least one kanji card exists.
    const text = new TextDecoder('latin1').decode(new Uint8Array(bytes));
    return text.includes('kanji');
  });
  expect(hasKanjiCard).toBe(true);
  await app2.close();
});
```

- [ ] **Step 2: Run — expect failure, then confirm pass once Tasks 1-8 are in place**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npm run build:desktop && npx playwright test tests/e2e/kanji-review.spec.ts`
Expected: since Tasks 1-8 should already be committed and merged by the time this task runs
(this is the last task in the plan), this should PASS immediately. If it fails, that means an
earlier task's implementation has a real defect — stop and fix the root cause, don't work
around it here.

- [ ] **Step 3: Full regression**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npm run typecheck && npm run lint && npm test && npm run build:desktop && npx playwright test`

Expected: typecheck/lint clean; Vitest all green (baseline 196 + 2 distractors + 5 kanji-questions
+ 2 scheduler + 1 session + 1 QuestionView + 2 KanjiLearnCard + 1 ReviewScreen = 210 — confirm the
exact number from actual `npm test` output rather than trusting this arithmetic blindly). Playwright
e2e baseline 19 + 1 new = 20, all green.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/kanji-review.spec.ts
git commit -m "test: e2e coverage for a full kanji learn->review->persist session

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:** §3.1 (types widened, Task 2), §3.2 (shared helpers generalized, Task 1),
§3.3 (kanji generators, Task 3 — vocab generators explicitly deferred to 4b-2 per the spec's own
decomposition), §3.4 (scheduler, Task 4), §3.5 (session, Task 5), §3.6 (QuestionView link Task 6,
ReviewScreen dispatch + KanjiLearnCard Tasks 7-8). Mini-test/progress explicitly untouched
throughout, matching the spec's "Вне рамок" section.

**2. Placeholder scan:** every task has full, concrete code (no "TODO"/"similar to Task N") —
scheduler.ts and ReviewScreen.tsx are given as complete file replacements since the diffs touch
most of both files; smaller files use before/after snippets against exact current content quoted
in this plan's research.

**3. Type consistency:** `ItemType` is defined once in `scheduler.ts` (Task 4) and imported by
`session.ts` (Task 5) — not redefined. `QueueItem.itemType`/`SessionStep`'s `itemType`/`item.itemType`
all use the same `ItemType` alias. `generateKanjiQuestion`'s signature
`(point: KanjiPoint, levelPoints: readonly KanjiPoint[], reps: number, seed: string): Question`
matches exactly how Task 5's `buildDailySession` calls it. `KanjiLearnCard`'s prop name (`point`)
matches how Task 8's `ReviewScreen` invokes it (`<KanjiLearnCard point={point as KanjiPoint} />`).
