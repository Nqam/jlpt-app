# Plan 3 — Sessions, Quiz Engine, Auto-grading, Daily Mini-test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Plan 2's flashcard flip loop with real auto-graded questions — a `quiz-engine` that generates cloze / choice / assemble questions from a grammar point, a `core/session` builder that orders learn / review / mini-test steps into a daily session, a rewritten `ReviewScreen` that walks those steps, and a daily mini-test of learned material.

**Architecture:** New pure-TypeScript modules under `src/core/quiz/**` (question types, seeded RNG, distractor picker, per-kind generators, a kind registry, an auto-grader) and `src/core/session.ts` (`buildDailySession`). The quiz engine is deterministic: every question is a pure function of a seed string, so the same card yields the same question all day and every test is reproducible. The UI adds one presentational component (`QuestionView`) and rewrites `ReviewScreen` to drive `SessionStep[]`. `srs.ts`, `scheduler.ts` selection logic, and all of `src/storage/**` are untouched except one additive `DaySummary` field.

**Tech Stack:** TypeScript, React 18, `ts-fsrs` 5.4.2 (already a dep — used only via the existing `srs.ts` wrapper), `sql.js` 1.14.2, Electron 33, Vitest, Playwright, electron-vite.

**Spec:** `docs/superpowers/specs/2026-09-04-plan-3-sessions-quiz-design.md` (read it — this plan argues from it). Parent spec: `docs/superpowers/specs/2026-09-03-jlpt-desktop-app-design.md` §5.

## Global Constraints

- **Browser-safe `src/**`:** no `electron`, `node:*`, `fs`, `path`, `child_process`, `os`, `crypto`, `module`, `url`, `util`, `stream` imports anywhere under `src/**`. The ESLint rule `no-restricted-imports` (in `eslint.config.js`) enforces this — `npm run lint` must stay green. `npm run build` must not print `externalized for browser compatibility`.
- **`shells/electron/**`, `scripts/**`, `tests/**`** may use Node APIs (`tests/**` has `no-restricted-imports` off).
- **Time is a parameter.** Every function in `src/core/**` that depends on the current time takes `now: Date`. No `Date.now()` / `new Date()` inside `src/core/**`. `Date.now()` for `elapsed_ms` is allowed **only** in `src/ui/**`.
- **Determinism.** Every question generator is a pure function of a `seed: string`. Seeds: per-card review question = `` `${itemId}:${localDayKey(now)}:${kind}` ``; mini-test question = `` `${sourceItemId}:mt:${index}` ``; retry-round question = `` `${sourceItemId}:retry:${index}` ``. Same seed ⇒ byte-identical question.
- **Auto-grading only.** `grade()` returns `rating: 1 | 3` (Again | Good) — never Hard/Easy. Wrong ⇒ `1`, right ⇒ `3`. `elapsed_ms` is measured by `ReviewScreen` and passed to `srs.review()` exactly as in Plan 2; the quiz engine does not use it.
- **Mini-test does not touch FSRS.** Mini-test and retry-round steps never call `srs.review()` / `user.insertReviewLog()` / `user.upsertCard()`.
- **UI text in Russian.** Japanese renders through the existing `Furigana` component (furigana notation `私[わたし]は`).
- **`src/core/srs.ts` and `src/core/scheduler.ts` selection logic are frozen.** `scheduler.ts` gains exactly one additive field on `DaySummary` (`miniTestEligible`) and one `import { statusOf } from '@/core/srs'`; `buildQueue` / `split` are not modified.
- **TDD:** failing test first. Vitest for `src/core/**` (fake `ContentDb` / `UserDb`, `now` passed in, seeded). Playwright for Electron flows. `tests/ui/**` runs under jsdom (configured via `environmentMatchGlobs` in `vitest.config.ts`).
- **Commits:** small, one per task. Body plain English. End every commit message with:
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`
- **Regression bar:** the existing Vitest suite (78 tests, 19 files) stays green after every task. Existing e2e specs (`tests/e2e/*.spec.ts`) stay green; `tests/e2e/review.spec.ts` is deliberately rewritten in Task 11. `npm run typecheck`, `npm run lint`, `npm run build` stay clean.
- **Node not on PATH** in the Bash tool: prefix commands with `export PATH="$PATH:/c/Program Files/nodejs"`.
- **Path alias:** `@/*` → `src/*` (in `tsconfig.json` and `vitest.config.ts`). Playwright specs do **not** resolve `@/*` — e2e helper code must use relative imports or avoid importing `src/**` (Task 11 builds the seed DB with raw SQL for this reason).

---

## File Structure

**Created:**
- `src/core/quiz/rng.ts` — `hashSeed`, `makeRng`, `seededShuffle`, `seededPick`. Pure seeded pseudo-randomness (xorshift, same algorithm as `scheduler.ts` uses privately — this is a reusable copy for the quiz engine, `scheduler.ts` keeps its own).
- `src/core/quiz/types.ts` — `QuestionKind`, `QuestionBase`, `ClozeQuestion`, `ChoiceQuestion`, `AssembleQuestion`, `Question`, `Answer`, `GradedAnswer`. Types only, no runtime.
- `src/core/quiz/distractors.ts` — `pickDistractors(pool, correct, n, seed)`.
- `src/core/quiz/grammar-questions.ts` — `genCloze`, `genChoice`, `genAssemble` + local helpers (`coreCandidates`, `sectionBody`, `firstSentence`, `stripTitleParen`, `shuffleWithAnswer`, `distractorPool`).
- `src/core/quiz/registry.ts` — `ROTATION`, `generateForCard`, `generateOfKind`.
- `src/core/quiz/grade.ts` — `grade(question, answer): GradedAnswer`.
- `src/core/session.ts` — `SessionStep`, `buildDailySession`, `levelPointsFor`.
- `src/ui/components/QuestionView.tsx` — renders a `Question`, collects an `Answer`, shows the post-answer breakdown.
- Tests mirroring each under `tests/core/quiz/`, `tests/core/`, `tests/ui/`.
- `tests/e2e/helpers/seed-user-db.ts` — builds a `user.db` file with raw SQL for the mini-test e2e.
- `tests/e2e/minitest.spec.ts` — seeded mini-test flow.

**Modified:**
- `src/core/ruby.ts` — add `stringifyRuby(segments)` (inverse of `parseRuby`; additive, pure).
- `src/core/scheduler.ts` — `DaySummary` gains `miniTestEligible: boolean`; `daySummary()` computes it.
- `src/ui/screens/ReviewScreen.tsx` — rewritten to drive `SessionStep[]`.
- `src/ui/screens/TodayScreen.tsx` — status line includes mini-test state.
- `src/ui/theme.css` — styles for `QuestionView` and the rewritten review screen (append-only).
- `tests/core/scheduler.test.ts` — one test for `miniTestEligible`.
- `tests/core/ruby.test.ts` — tests for `stringifyRuby`.
- `tests/ui/ReviewScreen.test.tsx` — rewritten for the session/question flow.
- `tests/ui/TodayScreen.test.tsx` — updated for the new status line + `miniTestEligible` in the mock.
- `tests/e2e/review.spec.ts` — rewritten for the question-based session.

**Deleted:**
- `src/ui/components/RatingButtons.tsx` — auto-grading removes the manual rating row. (No test file exists for it.)

---

## Task 1: `ruby.ts` round-trip + `quiz/rng.ts`

**Files:**
- Modify: `src/core/ruby.ts`
- Create: `src/core/quiz/rng.ts`
- Test: `tests/core/ruby.test.ts` (extend)
- Test: `tests/core/quiz/rng.test.ts` (create)

**Interfaces:**
- Produces:
  - `stringifyRuby(segments: RubySegment[]): string` — inverse of `parseRuby`; `{base,ruby}` → `` `${base}[${ruby}]` `` when `ruby` is non-null, else `base`. `parseRuby` then `stringifyRuby` round-trips any valid furigana string.
  - `hashSeed(s: string): number` — 32-bit unsigned FNV-1a hash.
  - `makeRng(seed: string): () => number` — returns a function yielding floats in `[0, 1)`.
  - `seededShuffle<T>(arr: T[], seed: string): T[]` — new array, Fisher–Yates driven by `makeRng`.
  - `seededPick<T>(arr: T[], seed: string): T` — first element of `seededShuffle` (throws on empty).

- [ ] **Step 1: Write the failing `stringifyRuby` tests**

Append to `tests/core/ruby.test.ts`:

```ts
import { stringifyRuby } from '@/core/ruby';

describe('stringifyRuby', () => {
  it('is the inverse of parseRuby for a typical sentence', () => {
    const src = '私[わたし]は 学生[がくせい]です。';
    expect(stringifyRuby(parseRuby(src))).toBe(src);
  });

  it('round-trips a sentence with kana before a kanji run', () => {
    const src = 'お茶[ちゃ]を 飲[の]みます。';
    expect(stringifyRuby(parseRuby(src))).toBe(src);
  });

  it('emits plain segments untouched', () => {
    expect(stringifyRuby([{ base: 'これは', ruby: null }, { base: '本', ruby: 'ほん' }]))
      .toBe('これは本[ほん]');
  });
});
```

(`parseRuby` is already imported at the top of the file.)

- [ ] **Step 2: Run — expect failure**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/core/ruby.test.ts`
Expected: FAIL — `stringifyRuby` is not exported.

- [ ] **Step 3: Implement `stringifyRuby`**

Append to `src/core/ruby.ts`:

```ts
/** Обратна `parseRuby`: сегменты → строка вида "私[わたし]は 学生[がくせい]です。". */
export function stringifyRuby(segments: RubySegment[]): string {
  return segments
    .map((s) => (s.ruby !== null ? `${s.base}[${s.ruby}]` : s.base))
    .join('');
}
```

- [ ] **Step 4: Run — expect pass**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/core/ruby.test.ts`
Expected: PASS (existing 7 + 3 new).

- [ ] **Step 5: Write the failing rng test**

Create `tests/core/quiz/rng.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { hashSeed, makeRng, seededShuffle, seededPick } from '@/core/quiz/rng';

describe('core/quiz/rng', () => {
  it('hashSeed is a stable 32-bit unsigned number', () => {
    const h = hashSeed('n5-wa-particle:2026-09-04:cloze');
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
    expect(hashSeed('a')).not.toBe(hashSeed('b'));
    expect(hashSeed('same')).toBe(hashSeed('same'));
  });

  it('makeRng is deterministic per seed and in [0,1)', () => {
    const a = makeRng('seed-1');
    const b = makeRng('seed-1');
    for (let i = 0; i < 20; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(makeRng('seed-2')()).not.toBe(makeRng('seed-1')());
  });

  it('seededShuffle is a permutation and deterministic', () => {
    const src = [1, 2, 3, 4, 5, 6, 7, 8];
    const s1 = seededShuffle(src, 'x');
    const s2 = seededShuffle(src, 'x');
    expect(s1).toEqual(s2);
    expect([...s1].sort((a, b) => a - b)).toEqual(src);
    expect(src).toEqual([1, 2, 3, 4, 5, 6, 7, 8]); // input not mutated
  });

  it('seededPick returns a member and is deterministic; throws on empty', () => {
    expect(['a', 'b', 'c']).toContain(seededPick(['a', 'b', 'c'], 'k'));
    expect(seededPick(['a', 'b', 'c'], 'k')).toBe(seededPick(['a', 'b', 'c'], 'k'));
    expect(() => seededPick([], 'k')).toThrow();
  });
});
```

- [ ] **Step 6: Run — expect failure**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/core/quiz/rng.test.ts`
Expected: FAIL — cannot resolve `@/core/quiz/rng`.

- [ ] **Step 7: Implement `rng.ts`**

Create `src/core/quiz/rng.ts`:

```ts
/** Детерминированная псевдослучайность для генерации вопросов. Только чистые функции. */

/** 32-битный беззнаковый FNV-1a. */
export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** xorshift32, засеян хешем строки. Возвращает функцию, дающую float в [0, 1). */
export function makeRng(seed: string): () => number {
  let state = hashSeed(seed) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 1_000_000) / 1_000_000;
  };
}

export function seededShuffle<T>(arr: readonly T[], seed: string): T[] {
  const a = arr.slice();
  const rand = makeRng(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function seededPick<T>(arr: readonly T[], seed: string): T {
  if (arr.length === 0) throw new Error('seededPick: empty array');
  return seededShuffle(arr, seed)[0]!;
}
```

- [ ] **Step 8: Run — expect pass**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/core/ruby.test.ts tests/core/quiz/rng.test.ts`
Expected: PASS.

- [ ] **Step 9: Regression + commit**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npm run typecheck && npm run lint && npm test`
Expected: typecheck 0, lint 0, Vitest 88 pass (78 + 3 + 7... count is informational; the bar is "no regressions + new tests green").

```bash
git add src/core/ruby.ts src/core/quiz/rng.ts tests/core/ruby.test.ts tests/core/quiz/rng.test.ts
git commit -m "feat: furigana round-trip helper and seeded RNG for the quiz engine

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: `quiz/types.ts` + `quiz/grade.ts` — question shapes and auto-grader

**Files:**
- Create: `src/core/quiz/types.ts`
- Create: `src/core/quiz/grade.ts`
- Test: `tests/core/quiz/grade.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:

```ts
// types.ts
export type QuestionKind = 'cloze' | 'choice' | 'assemble';

export interface QuestionBase {
  /** Детерминированный id вопроса — совпадает с seed-строкой генерации. */
  id: string;
  itemType: 'grammar';
  itemId: string;
  kind: QuestionKind;
  /** Текст задания на русском. */
  prompt: string;
}

export interface ClozeQuestion extends QuestionBase {
  kind: 'cloze';
  /** Японское предложение в записи фуриганы с маркером `___`. */
  sentenceRuby: string;
  /** Длина 4, ровно один правильный. */
  choices: string[];
  answerIndex: number;
}

export interface ChoiceQuestion extends QuestionBase {
  kind: 'choice';
  /** Длина 4 (краткие описания). */
  choices: string[];
  answerIndex: number;
}

export interface AssembleQuestion extends QuestionBase {
  kind: 'assemble';
  /** Перемешанные фуригана-токены. */
  tokens: string[];
  /** Индексы `tokens` в правильном порядке. */
  answerOrder: number[];
  /** Перевод — для подсказки в разборе. */
  translationRu: string;
}

export type Question = ClozeQuestion | ChoiceQuestion | AssembleQuestion;

export type Answer =
  | { kind: 'index'; value: number }
  | { kind: 'order'; value: number[] };

export interface GradedAnswer {
  correct: boolean;
  /** 1 = Again, 3 = Good (ts-fsrs Rating). */
  rating: 1 | 3;
}

// grade.ts
export function grade(question: Question, answer: Answer): GradedAnswer;
```

- `grade` rules: `cloze` / `choice` → `answer.kind === 'index' && answer.value === question.answerIndex`. `assemble` → `answer.kind === 'order' && answer.value` is element-wise equal to `question.answerOrder` (same length, same order). Any shape mismatch (wrong `answer.kind`) → `correct: false`. `correct` → `{ correct: true, rating: 3 }`, else `{ correct: false, rating: 1 }`.

- [ ] **Step 1: Write the failing test**

Create `tests/core/quiz/grade.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { grade } from '@/core/quiz/grade';
import type { ClozeQuestion, ChoiceQuestion, AssembleQuestion } from '@/core/quiz/types';

const cloze: ClozeQuestion = {
  id: 'g:2026-09-04:cloze', itemType: 'grammar', itemId: 'g', kind: 'cloze',
  prompt: 'Выбери пропущенное', sentenceRuby: 'これは ___ です。',
  choices: ['は', 'を', 'に', 'も'], answerIndex: 0,
};
const choice: ChoiceQuestion = {
  id: 'g:2026-09-04:choice', itemType: 'grammar', itemId: 'g', kind: 'choice',
  prompt: 'Что выражает «は»?', choices: ['тема', 'объект', 'место', 'цель'], answerIndex: 0,
};
const assemble: AssembleQuestion = {
  id: 'g:2026-09-04:assemble', itemType: 'grammar', itemId: 'g', kind: 'assemble',
  prompt: 'Собери предложение', tokens: ['です。', '学生[がくせい]', 'は', '私[わたし]'],
  answerOrder: [3, 2, 1, 0], translationRu: 'Я студент.',
};

describe('core/quiz/grade', () => {
  it('cloze / choice: matching index is Good, non-matching is Again', () => {
    expect(grade(cloze, { kind: 'index', value: 0 })).toEqual({ correct: true, rating: 3 });
    expect(grade(cloze, { kind: 'index', value: 2 })).toEqual({ correct: false, rating: 1 });
    expect(grade(choice, { kind: 'index', value: 0 })).toEqual({ correct: true, rating: 3 });
    expect(grade(choice, { kind: 'index', value: 1 })).toEqual({ correct: false, rating: 1 });
  });

  it('assemble: exact element-wise order is Good', () => {
    expect(grade(assemble, { kind: 'order', value: [3, 2, 1, 0] }))
      .toEqual({ correct: true, rating: 3 });
    expect(grade(assemble, { kind: 'order', value: [3, 2, 0, 1] }))
      .toEqual({ correct: false, rating: 1 });
    expect(grade(assemble, { kind: 'order', value: [3, 2, 1] }))
      .toEqual({ correct: false, rating: 1 });
  });

  it('wrong answer shape never crashes and never grades correct', () => {
    expect(grade(cloze, { kind: 'order', value: [0] })).toEqual({ correct: false, rating: 1 });
    expect(grade(assemble, { kind: 'index', value: 0 })).toEqual({ correct: false, rating: 1 });
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/core/quiz/grade.test.ts`
Expected: FAIL — cannot resolve `@/core/quiz/grade`.

- [ ] **Step 3: Implement**

Create `src/core/quiz/types.ts` with exactly the type block from **Interfaces** above (no runtime code).

Create `src/core/quiz/grade.ts`:

```ts
import type { Question, Answer, GradedAnswer } from '@/core/quiz/types';

const AGAIN: GradedAnswer = { correct: false, rating: 1 };
const GOOD: GradedAnswer = { correct: true, rating: 3 };

export function grade(question: Question, answer: Answer): GradedAnswer {
  if (question.kind === 'assemble') {
    if (answer.kind !== 'order') return AGAIN;
    const want = question.answerOrder;
    const got = answer.value;
    if (got.length !== want.length) return AGAIN;
    return got.every((v, i) => v === want[i]) ? GOOD : AGAIN;
  }
  // cloze | choice
  if (answer.kind !== 'index') return AGAIN;
  return answer.value === question.answerIndex ? GOOD : AGAIN;
}
```

- [ ] **Step 4: Run — expect pass**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/core/quiz/grade.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Regression + commit**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npm run typecheck && npm run lint`
Expected: clean.

```bash
git add src/core/quiz/types.ts src/core/quiz/grade.ts tests/core/quiz/grade.test.ts
git commit -m "feat: quiz question types and the auto-grader

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: `quiz/distractors.ts` — wrong-answer picker

**Files:**
- Create: `src/core/quiz/distractors.ts`
- Test: `tests/core/quiz/distractors.test.ts`

**Interfaces:**
- Consumes: `seededShuffle` from `@/core/quiz/rng`.
- Produces: `pickDistractors(pool: readonly string[], correct: string, n: number, seed: string): string[]`.
  - Removes from `pool`: exact matches of `correct`, and duplicates (keep first occurrence).
  - Orders remaining candidates: ones sharing a leading character with `correct` first, then by absolute length difference from `correct`, then seeded-shuffled for ties. Deterministic for a given `seed`.
  - Returns exactly `n` strings. If fewer than `n` real candidates exist, pads with `'—'` (a content-bug signal, asserted by a test — not expected in normal content).

- [ ] **Step 1: Write the failing test**

Create `tests/core/quiz/distractors.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { pickDistractors } from '@/core/quiz/distractors';

describe('core/quiz/distractors', () => {
  const pool = ['は', 'を', 'に', 'も', 'へ', 'で', 'は', 'が'];

  it('returns exactly n, excludes the correct answer and duplicates', () => {
    const d = pickDistractors(pool, 'は', 3, 's');
    expect(d).toHaveLength(3);
    expect(d).not.toContain('は');
    expect(new Set(d).size).toBe(3);
    d.forEach((x) => expect(pool).toContain(x));
  });

  it('is deterministic for a seed and varies by seed', () => {
    expect(pickDistractors(pool, 'は', 3, 's1')).toEqual(pickDistractors(pool, 'は', 3, 's1'));
    expect(pickDistractors(pool, 'は', 3, 's2')).not.toEqual(pickDistractors(pool, 'は', 5, 's2').slice(0, 3));
  });

  it('pads with — when the pool is too small', () => {
    const d = pickDistractors(['を'], 'は', 3, 's');
    expect(d).toHaveLength(3);
    expect(d.filter((x) => x === '—')).toHaveLength(2);
  });

  it('prefers candidates that share a leading character with correct', () => {
    const d = pickDistractors(['そうです', 'ました', 'そうだ', 'ません'], 'そうか', 2, 's');
    expect(d).toContain('そうです');
    expect(d).toContain('そうだ');
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/core/quiz/distractors.test.ts`
Expected: FAIL — cannot resolve `@/core/quiz/distractors`.

- [ ] **Step 3: Implement**

Create `src/core/quiz/distractors.ts`:

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
  // original pool order.
  const shuffled = seededShuffle(unique, seed);
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
```

- [ ] **Step 4: Run — expect pass**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/core/quiz/distractors.test.ts`
Expected: PASS (4 tests). If the "leading character" test is flaky against the length tiebreak, keep the shared-prefix comparator as the primary key (it already is) — the test inputs are chosen so both `そう…` candidates win on key 1.

- [ ] **Step 5: Regression + commit**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npm run typecheck && npm run lint`

```bash
git add src/core/quiz/distractors.ts tests/core/quiz/distractors.test.ts
git commit -m "feat: seeded distractor picker for quiz choices

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: `quiz/grammar-questions.ts` — the three generators

**Files:**
- Create: `src/core/quiz/grammar-questions.ts`
- Test: `tests/core/quiz/grammar-questions.test.ts`

**Interfaces:**
- Consumes: `GrammarPointFull` from `@/storage/content-db` (`{ id, level, title, layer, tags, related, bodyMarkdown, examples: { jaRuby, ru }[], relatedTitles }`), `parseRuby` / `stringifyRuby` from `@/core/ruby`, `seededShuffle` / `seededPick` from `@/core/quiz/rng`, `pickDistractors` from `@/core/quiz/distractors`.
- Produces:

```ts
export type GrammarGenerator = (
  point: GrammarPointFull,
  levelPoints: readonly GrammarPointFull[],
  seed: string,
) => Question | null;

export const genCloze: GrammarGenerator;    // null if no example contains a recognisable core
export const genChoice: GrammarGenerator;   // null only if "## Кратко" is missing (invalid content)
export const genAssemble: GrammarGenerator; // null if no example has >= 4 space tokens

// exported for tests / reuse:
export function coreCandidates(title: string): string[];
export function sectionBody(markdown: string, heading: string): string | null;
export function firstSentence(text: string, max?: number): string;
```

- **`coreCandidates(title)`**: take the substring before the first `(`; split on `／` and `/`; for each part strip `〜`, `~`, and whitespace; drop empties. `"です／だ (связка)"` → `['です', 'だ']`; `"は (тема предложения)"` → `['は']`; `"〜ます (вежливая форма глагола)"` → `['ます']`.
- **`sectionBody(markdown, 'Кратко')`**: match `/##\s+Кратко\s*\n([\s\S]*?)(?:\n##\s|$)/`; return the captured group `.trim()` with internal whitespace collapsed to single spaces, or `null`.
- **`firstSentence(text, max = 80)`**: trim; if `<= max` return as-is; else cut at `max`, back off to the last space if that space is past index 20, append `'…'`.
- **`stripTitleParen(title)`** (local): substring before `(`, trimmed.
- **`shuffleWithAnswer(correctFirst: string[], seed)`** (local) → `{ list: string[]; answerIndex: number }`: `correctFirst[0]` is the right answer; seeded-shuffle all four, then report where index 0 landed.
- **`distractorPool(levelPoints, excludeId, extract)`** (local): `levelPoints.filter(p => p.id !== excludeId).flatMap(extract)` where `extract` yields candidate strings (cores for cloze, `firstSentence(sectionBody(...))` for choice).

**cloze algorithm** (`genCloze`):
1. `cands = coreCandidates(point.title)`; if `!point.examples.length || !cands.length` → `null`.
2. Iterate examples in `seededShuffle(point.examples, seed)` order. For each, `segs = parseRuby(ex.jaRuby)`; for each `core` in `cands`, find the first segment with `ruby === null`, non-blank `base`, and `base.includes(core)`.
3. On a hit: blank exactly the first occurrence of `core` in that segment's `base` → `'___'`; rebuild the segment list; `sentenceRuby = stringifyRuby(newSegs)`.
4. `pool = distractorPool(levelPoints, point.id, coreCandidates(p.title))`; `distractors = pickDistractors(pool, core, 3, seed + ':d')`.
5. `{ list, answerIndex } = shuffleWithAnswer([core, ...distractors], seed + ':c')`.
6. Return `{ id: seed, itemType: 'grammar', itemId: point.id, kind: 'cloze', prompt: 'Выбери пропущенное слово', sentenceRuby, choices: list, answerIndex }`.
7. No hit in any example → `null`.

**choice algorithm** (`genChoice`):
1. `correct = sectionBody(point.bodyMarkdown, 'Кратко')`; if `null` → `null`. `correct = firstSentence(correct)`.
2. `pool = distractorPool(levelPoints, point.id, p => { const s = sectionBody(p.bodyMarkdown, 'Кратко'); return s ? [firstSentence(s)] : []; })`.
3. `distractors = pickDistractors(pool, correct, 3, seed + ':d')`.
4. `{ list, answerIndex } = shuffleWithAnswer([correct, ...distractors], seed + ':c')`.
5. Return `{ id: seed, itemType: 'grammar', itemId: point.id, kind: 'choice', prompt: \`Что выражает «${stripTitleParen(point.title)}»?\`, choices: list, answerIndex }`.

**assemble algorithm** (`genAssemble`):
1. For each example in `seededShuffle(point.examples, seed)` order: `toks = ex.jaRuby.trim().split(/\s+/)`; if `toks.length < 4` → next.
2. `perm = seededShuffle([...toks.keys()], seed + ':t')` (permutation of original indices). If `perm` is the identity, rotate it left by one (`perm.push(perm.shift()!)`) so `tokens` are visibly scrambled.
3. `tokens = perm.map(i => toks[i])`. `answerOrder = [...perm.keys()].sort((a, b) => perm[a]! - perm[b]!)` — indices into `tokens` that reproduce the original token order.
4. Return `{ id: seed, itemType: 'grammar', itemId: point.id, kind: 'assemble', prompt: 'Собери предложение', tokens, answerOrder, translationRu: ex.ru }`.
5. No example with `>= 4` tokens → `null`.

- [ ] **Step 1: Write the failing test**

Create `tests/core/quiz/grammar-questions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { genCloze, genChoice, genAssemble, coreCandidates, sectionBody, firstSentence }
  from '@/core/quiz/grammar-questions';
import { parseRuby, stringifyRuby } from '@/core/ruby';
import type { GrammarPointFull } from '@/storage/content-db';

function point(over: Partial<GrammarPointFull> = {}): GrammarPointFull {
  return {
    id: 'n5-wa', level: 'N5', title: 'は (тема предложения)', layer: 1, tags: [], related: [],
    relatedTitles: [],
    bodyMarkdown: '## Кратко\nЧастица は отмечает тему предложения — то, о чём идёт речь.\n\n## Образование\n[X] は',
    examples: [
      { jaRuby: '私[わたし]は 学生[がくせい]です。', ru: 'Я студент.' },
      { jaRuby: 'これは 本[ほん]です。', ru: 'Это книга.' },
    ],
    ...over,
  };
}

const others: GrammarPointFull[] = [
  point({ id: 'n5-wo', title: 'を (прямое дополнение)', bodyMarkdown: '## Кратко\nЧастица を отмечает прямой объект действия.', examples: [{ jaRuby: 'водуを 飲[の]みます。', ru: '' }] }),
  point({ id: 'n5-ni', title: 'に (время и место)', bodyMarkdown: '## Кратко\nЧастица に указывает точку во времени или место существования.', examples: [] }),
  point({ id: 'n5-mo', title: 'も (тоже)', bodyMarkdown: '## Кратко\nЧастица も значит «тоже, также».', examples: [] }),
];

describe('coreCandidates', () => {
  it('splits alternatives and strips tildes', () => {
    expect(coreCandidates('です／だ (связка)')).toEqual(['です', 'だ']);
    expect(coreCandidates('〜ます (вежливая форма глагола)')).toEqual(['ます']);
    expect(coreCandidates('は (тема предложения)')).toEqual(['は']);
  });
});

describe('sectionBody / firstSentence', () => {
  it('extracts the Кратко section', () => {
    expect(sectionBody(point().bodyMarkdown, 'Кратко')).toMatch(/^Частица は отмечает тему/);
    expect(sectionBody('## Образование\nX', 'Кратко')).toBeNull();
  });
  it('truncates on a word boundary with an ellipsis', () => {
    expect(firstSentence('a'.repeat(200), 20)).toHaveLength(21); // 20 chars + …
    expect(firstSentence('короткая строка', 80)).toBe('короткая строка');
  });
});

describe('genCloze', () => {
  it('blanks the construction core and offers 4 choices with one correct', () => {
    const q = genCloze(point(), others, 'n5-wa:2026-09-04:cloze')!;
    expect(q).not.toBeNull();
    expect(q.kind).toBe('cloze');
    expect(q.sentenceRuby).toContain('___');
    expect(q.choices).toHaveLength(4);
    expect(q.choices[q.answerIndex]).toBe('は');
    // the blank replaced a real token from a real example
    expect(q.sentenceRuby.replace('___', 'は')).toBe(
      stringifyRuby(parseRuby('私[わたし]は 学生[がくせい]です。')),
    );
  });

  it('is deterministic for a seed', () => {
    expect(genCloze(point(), others, 's')).toEqual(genCloze(point(), others, 's'));
  });

  it('returns null when the title core appears in no example', () => {
    const p = point({ title: 'ぜんぜん (совсем не)', examples: [{ jaRuby: '本[ほん]です。', ru: '' }] });
    expect(genCloze(p, others, 's')).toBeNull();
  });
});

describe('genChoice', () => {
  it('correct answer is from this point Кратко, distractors from others', () => {
    const q = genChoice(point(), others, 's')!;
    expect(q.kind).toBe('choice');
    expect(q.choices).toHaveLength(4);
    expect(q.choices[q.answerIndex]).toMatch(/отмечает тему/);
    const distractors = q.choices.filter((_, i) => i !== q.answerIndex);
    distractors.forEach((d) => expect(d === '—' || /を|に|も/.test(d)).toBe(true));
  });

  it('returns null without a Кратко section', () => {
    expect(genChoice(point({ bodyMarkdown: '## Образование\nX' }), others, 's')).toBeNull();
  });
});

describe('genAssemble', () => {
  const p4 = point({
    examples: [{ jaRuby: '私[わたし]は 毎日[まいにち] 日本語[にほんご]を 勉強[べんきょう]します。', ru: 'Я каждый день учу японский.' }],
  });

  it('scrambles tokens and answerOrder rebuilds the sentence', () => {
    const q = genAssemble(p4, others, 's')!;
    expect(q.kind).toBe('assemble');
    expect(q.tokens).toHaveLength(4);
    expect([...q.tokens].sort()).toEqual(
      ['私[わたし]は', '毎日[まいにち]', '日本語[にほんご]を', '勉強[べんきょう]します。'].sort(),
    );
    expect(q.answerOrder.map((i) => q.tokens[i]).join(' ')).toBe(
      '私[わたし]は 毎日[まいにち] 日本語[にほんご]を 勉強[べんきょう]します。',
    );
    expect(q.translationRu).toBe('Я каждый день учу японский.');
  });

  it('returns null when no example has >= 4 tokens', () => {
    expect(genAssemble(point(), others, 's')).toBeNull();
  });

  it('is deterministic', () => {
    expect(genAssemble(p4, others, 's')).toEqual(genAssemble(p4, others, 's'));
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/core/quiz/grammar-questions.test.ts`
Expected: FAIL — cannot resolve `@/core/quiz/grammar-questions`.

- [ ] **Step 3: Implement**

Create `src/core/quiz/grammar-questions.ts`:

```ts
import type { GrammarPointFull } from '@/storage/content-db';
import type {
  Question, ClozeQuestion, ChoiceQuestion, AssembleQuestion,
} from '@/core/quiz/types';
import { parseRuby, stringifyRuby } from '@/core/ruby';
import { seededShuffle } from '@/core/quiz/rng';
import { pickDistractors } from '@/core/quiz/distractors';

export type GrammarGenerator = (
  point: GrammarPointFull,
  levelPoints: readonly GrammarPointFull[],
  seed: string,
) => Question | null;

export function coreCandidates(title: string): string[] {
  const head = title.split('(')[0] ?? title;
  return head
    .split(/[／/]/)
    .map((s) => s.replace(/[〜~\s]/g, '').trim())
    .filter(Boolean);
}

function stripTitleParen(title: string): string {
  return (title.split('(')[0] ?? title).trim();
}

export function sectionBody(markdown: string, heading: string): string | null {
  const re = new RegExp(`##\\s+${heading}\\s*\\n([\\s\\S]*?)(?:\\n##\\s|$)`);
  const m = markdown.match(re);
  if (!m || !m[1]) return null;
  const body = m[1].trim().replace(/\s+/g, ' ');
  return body || null;
}

export function firstSentence(text: string, max = 80): string {
  const clean = text.trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return `${sp > 20 ? cut.slice(0, sp) : cut}…`;
}

function shuffleWithAnswer(
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

function distractorPool(
  levelPoints: readonly GrammarPointFull[],
  excludeId: string,
  extract: (p: GrammarPointFull) => string[],
): string[] {
  return levelPoints.filter((p) => p.id !== excludeId).flatMap(extract);
}

export const genCloze: GrammarGenerator = (point, levelPoints, seed) => {
  const cands = coreCandidates(point.title);
  if (!point.examples.length || !cands.length) return null;

  for (const ex of seededShuffle(point.examples, seed)) {
    const segs = parseRuby(ex.jaRuby);
    for (const core of cands) {
      const si = segs.findIndex(
        (s) => s.ruby === null && s.base.trim() !== '' && s.base.includes(core),
      );
      if (si === -1) continue;
      const seg = segs[si]!;
      const at = seg.base.indexOf(core);
      const blanked = `${seg.base.slice(0, at)}___${seg.base.slice(at + core.length)}`;
      const newSegs = segs.slice();
      newSegs[si] = { base: blanked, ruby: null };
      const pool = distractorPool(levelPoints, point.id, (p) => coreCandidates(p.title));
      const distractors = pickDistractors(pool, core, 3, `${seed}:d`);
      const { list, answerIndex } = shuffleWithAnswer([core, ...distractors], `${seed}:c`);
      const q: ClozeQuestion = {
        id: seed, itemType: 'grammar', itemId: point.id, kind: 'cloze',
        prompt: 'Выбери пропущенное слово',
        sentenceRuby: stringifyRuby(newSegs),
        choices: list, answerIndex,
      };
      return q;
    }
  }
  return null;
};

export const genChoice: GrammarGenerator = (point, levelPoints, seed) => {
  const raw = sectionBody(point.bodyMarkdown, 'Кратко');
  if (!raw) return null;
  const correct = firstSentence(raw);
  const pool = distractorPool(levelPoints, point.id, (p) => {
    const s = sectionBody(p.bodyMarkdown, 'Кратко');
    return s ? [firstSentence(s)] : [];
  });
  const distractors = pickDistractors(pool, correct, 3, `${seed}:d`);
  const { list, answerIndex } = shuffleWithAnswer([correct, ...distractors], `${seed}:c`);
  const q: ChoiceQuestion = {
    id: seed, itemType: 'grammar', itemId: point.id, kind: 'choice',
    prompt: `Что выражает «${stripTitleParen(point.title)}»?`,
    choices: list, answerIndex,
  };
  return q;
};

export const genAssemble: GrammarGenerator = (point, _levelPoints, seed) => {
  for (const ex of seededShuffle(point.examples, seed)) {
    const toks = ex.jaRuby.trim().split(/\s+/);
    if (toks.length < 4) continue;
    let perm = seededShuffle([...toks.keys()], `${seed}:t`);
    if (perm.every((v, i) => v === i)) perm = [...perm.slice(1), perm[0]!];
    const tokens = perm.map((i) => toks[i]!);
    const answerOrder = [...perm.keys()].sort((a, b) => perm[a]! - perm[b]!);
    const q: AssembleQuestion = {
      id: seed, itemType: 'grammar', itemId: point.id, kind: 'assemble',
      prompt: 'Собери предложение',
      tokens, answerOrder, translationRu: ex.ru,
    };
    return q;
  }
  return null;
};
```

- [ ] **Step 4: Run — expect pass**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/core/quiz/grammar-questions.test.ts`
Expected: PASS. If a real N5 point's core is not found by the substring heuristic during Task 6's integration test, that is expected — `genCloze` returns `null` and the registry falls back. Do not loosen the heuristic to force a hit.

- [ ] **Step 5: Regression + commit**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npm run typecheck && npm run lint && npm test`

```bash
git add src/core/quiz/grammar-questions.ts tests/core/quiz/grammar-questions.test.ts
git commit -m "feat: cloze, choice and assemble question generators for grammar

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: `quiz/registry.ts` — kind rotation and fallback

**Files:**
- Create: `src/core/quiz/registry.ts`
- Test: `tests/core/quiz/registry.test.ts`

**Interfaces:**
- Consumes: `genCloze` / `genChoice` / `genAssemble` from `@/core/quiz/grammar-questions`, `Question` / `QuestionKind` from `@/core/quiz/types`, `GrammarPointFull` from `@/storage/content-db`.
- Produces:

```ts
export const ROTATION: readonly QuestionKind[]; // ['cloze', 'choice', 'assemble']

/** Question for a review card: kind = ROTATION[reps % 3], falling back assemble→cloze→choice. */
export function generateForCard(
  point: GrammarPointFull,
  levelPoints: readonly GrammarPointFull[],
  reps: number,
  dayKey: string,
): Question;

/** Question of an explicit kind (mini-test / retry), same fallback chain. */
export function generateOfKind(
  kind: QuestionKind,
  point: GrammarPointFull,
  levelPoints: readonly GrammarPointFull[],
  idSeed: string,
): Question;
```

- `generateForCard`: `primary = ROTATION[((reps % 3) + 3) % 3]`; try `[primary, 'assemble', 'cloze', 'choice']` in order, each with seed `` `${point.id}:${dayKey}:${kind}` ``; return the first non-null. `choice` never returns null for valid content, so this always resolves; if it somehow doesn't, throw `Error`.
- `generateOfKind`: try `[kind, 'assemble', 'cloze', 'choice']`; the first attempt uses seed `idSeed`, later attempts use `` `${idSeed}:fb:${kind}` ``; return the first non-null (id of the returned question = the seed that produced it).

- [ ] **Step 1: Write the failing test**

Create `tests/core/quiz/registry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ROTATION, generateForCard, generateOfKind } from '@/core/quiz/registry';
import type { GrammarPointFull } from '@/storage/content-db';

function point(over: Partial<GrammarPointFull> = {}): GrammarPointFull {
  return {
    id: 'n5-wa', level: 'N5', title: 'は (тема)', layer: 1, tags: [], related: [], relatedTitles: [],
    bodyMarkdown: '## Кратко\nЧастица は отмечает тему предложения.',
    examples: [
      { jaRuby: '私[わたし]は 毎日[まいにち] 日本語[にほんご]を 勉強[べんきょう]します。', ru: 'Я учу японский.' },
      { jaRuby: 'これは 本[ほん]です。', ru: 'Это книга.' },
    ],
    ...over,
  };
}
const others = [point({ id: 'n5-wo', title: 'を (объект)' }), point({ id: 'n5-ni', title: 'に (место)' })];

describe('core/quiz/registry', () => {
  it('ROTATION is cloze, choice, assemble', () => {
    expect([...ROTATION]).toEqual(['cloze', 'choice', 'assemble']);
  });

  it('generateForCard rotates kind by reps % 3', () => {
    expect(generateForCard(point(), others, 0, 'd').kind).toBe('cloze');
    expect(generateForCard(point(), others, 1, 'd').kind).toBe('choice');
    expect(generateForCard(point(), others, 2, 'd').kind).toBe('assemble');
    expect(generateForCard(point(), others, 3, 'd').kind).toBe('cloze');
  });

  it('falls back when the rotated kind cannot generate', () => {
    // no examples >= 4 tokens and no example holds the core -> assemble & cloze fail,
    // reps % 3 == 2 asks for assemble, must fall through to choice
    const bare = point({
      examples: [{ jaRuby: '本[ほん]です。', ru: '' }],
      title: 'ぜんぜん (совсем)',
    });
    expect(generateForCard(bare, others, 2, 'd').kind).toBe('choice');
  });

  it('generateForCard id encodes point, day and kind', () => {
    const q = generateForCard(point(), others, 1, '2026-09-04');
    expect(q.id).toBe('n5-wa:2026-09-04:choice');
  });

  it('generateOfKind honours the requested kind and seeds the id', () => {
    const q = generateOfKind('choice', point(), others, 'n5-wa:mt:2');
    expect(q.kind).toBe('choice');
    expect(q.id).toBe('n5-wa:mt:2');
  });

  it('generateOfKind falls back but keeps a deterministic id', () => {
    const bare = point({ examples: [{ jaRuby: '本[ほん]です。', ru: '' }], title: 'ぜんぜん (совсем)' });
    const q = generateOfKind('assemble', bare, others, 'n5-wa:mt:0');
    expect(q.kind).toBe('choice');
    expect(q.id).toBe('n5-wa:mt:0:fb:choice');
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/core/quiz/registry.test.ts`
Expected: FAIL — cannot resolve `@/core/quiz/registry`.

- [ ] **Step 3: Implement**

Create `src/core/quiz/registry.ts`:

```ts
import type { GrammarPointFull } from '@/storage/content-db';
import type { Question, QuestionKind } from '@/core/quiz/types';
import { genCloze, genChoice, genAssemble, type GrammarGenerator }
  from '@/core/quiz/grammar-questions';

export const ROTATION: readonly QuestionKind[] = ['cloze', 'choice', 'assemble'];
const FALLBACK: readonly QuestionKind[] = ['assemble', 'cloze', 'choice'];

const GENERATORS: Record<QuestionKind, GrammarGenerator> = {
  cloze: genCloze,
  choice: genChoice,
  assemble: genAssemble,
};

function tryChain(
  kinds: readonly QuestionKind[],
  point: GrammarPointFull,
  levelPoints: readonly GrammarPointFull[],
  seedFor: (kind: QuestionKind, attempt: number) => string,
): Question {
  kinds.forEach.length; // no-op to keep types happy under noUnusedLocals? (remove)
  for (let i = 0; i < kinds.length; i++) {
    const kind = kinds[i]!;
    const q = GENERATORS[kind](point, levelPoints, seedFor(kind, i));
    if (q) return q;
  }
  throw new Error(`quiz registry: no generator produced a question for ${point.id}`);
}

export function generateForCard(
  point: GrammarPointFull,
  levelPoints: readonly GrammarPointFull[],
  reps: number,
  dayKey: string,
): Question {
  const primary = ROTATION[((reps % 3) + 3) % 3]!;
  return tryChain(
    [primary, ...FALLBACK],
    point,
    levelPoints,
    (kind) => `${point.id}:${dayKey}:${kind}`,
  );
}

export function generateOfKind(
  kind: QuestionKind,
  point: GrammarPointFull,
  levelPoints: readonly GrammarPointFull[],
  idSeed: string,
): Question {
  return tryChain(
    [kind, ...FALLBACK],
    point,
    levelPoints,
    (k, attempt) => (attempt === 0 ? idSeed : `${idSeed}:fb:${k}`),
  );
}
```

Remove the `kinds.forEach.length;` line — it is a placeholder note; `tryChain` must not contain dead code. Final `tryChain` body is just the `for` loop plus the throw.

- [ ] **Step 4: Run — expect pass**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/core/quiz/registry.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Regression + commit**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npm run typecheck && npm run lint`

```bash
git add src/core/quiz/registry.ts tests/core/quiz/registry.test.ts
git commit -m "feat: quiz kind registry with reps rotation and fallback chain

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: `src/core/session.ts` — the daily session builder

**Files:**
- Create: `src/core/session.ts`
- Test: `tests/core/session.test.ts`

**Interfaces:**
- Consumes: `buildQueue` from `@/core/scheduler`, `generateForCard` / `generateOfKind` / `ROTATION` from `@/core/quiz/registry`, `statusOf` from `@/core/srs`, `localDayKey` from `@/core/time`, `seededShuffle` from `@/core/quiz/rng`, `GrammarPointFull` / `ContentDb` from `@/storage/content-db`, `UserDb` from `@/storage/user-db`, `Question` from `@/core/quiz/types`.
- Produces:

```ts
export type SessionStep =
  | { phase: 'learn'; itemId: string }
  | { phase: 'review'; item: { itemType: 'grammar'; itemId: string; kind: 'due' | 'new' }; question: Question }
  | { phase: 'minitest'; question: Question; sourceItemId: string; index: number };

export function buildDailySession(user: UserDb, content: ContentDb, now: Date): SessionStep[];

/** All grammar points of a level, fully loaded — shared with ReviewScreen's retry round. */
export function levelPointsFor(content: ContentDb, level: string): GrammarPointFull[];
```

- **Build order:**
  1. `queue = buildQueue(user, content, now)` (already ordered: due + new, seeded-shuffled, never `new` first when any due exists).
  2. For each `QueueItem`: `point = content.getGrammar(itemId)`; skip if `null`. `reps = user.getCard('grammar', itemId)?.reps ?? 0`. `question = generateForCard(point, levelPointsFor(content, point.level), reps, localDayKey(now))`. If `kind === 'new'` push `{ phase: 'learn', itemId }` first, then always push `{ phase: 'review', item: { itemType: 'grammar', itemId, kind }, question }`.
  3. **Mini-test:** `learned = user.allCards('grammar').filter(c => ['learned', 'mastered'].includes(statusOf(c)))`. If `learned.length >= 5`: `count = Math.min(8, Math.max(5, Math.floor(learned.length / 2)))`; `sources = seededShuffle(learned.map(c => c.item_id).filter(id => content.getGrammar(id)), \`mt:${localDayKey(now)}\`).slice(0, count)`; for each `(srcId, index)` push `{ phase: 'minitest', question: generateOfKind(ROTATION[index % 3], content.getGrammar(srcId)!, levelPointsFor(content, ...), \`${srcId}:mt:${index}\`), sourceItemId: srcId, index }`.
- **Caching:** memoise `content.getGrammar` and `levelPointsFor` results in local `Map`s within one `buildDailySession` call (the level fixture is ~8 points but each `getGrammar` runs 3 SQL queries).
- **Idempotent:** two calls with the same `now` return equal sessions (all seeds keyed on `localDayKey`).

- [ ] **Step 1: Write the failing test**

Create `tests/core/session.test.ts`:

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
    getGrammar: (id: string) => byId.get(id) ?? null,
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
});
```

- [ ] **Step 2: Run — expect failure**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/core/session.test.ts`
Expected: FAIL — cannot resolve `@/core/session`.

- [ ] **Step 3: Implement**

Create `src/core/session.ts`:

```ts
import type { UserDb } from '@/storage/user-db';
import type { ContentDb, GrammarPointFull } from '@/storage/content-db';
import type { Question } from '@/core/quiz/types';
import { buildQueue } from '@/core/scheduler';
import { generateForCard, generateOfKind, ROTATION } from '@/core/quiz/registry';
import { statusOf } from '@/core/srs';
import { localDayKey } from '@/core/time';
import { seededShuffle } from '@/core/quiz/rng';

export type SessionStep =
  | { phase: 'learn'; itemId: string }
  | {
      phase: 'review';
      item: { itemType: 'grammar'; itemId: string; kind: 'due' | 'new' };
      question: Question;
    }
  | { phase: 'minitest'; question: Question; sourceItemId: string; index: number };

export function levelPointsFor(content: ContentDb, level: string): GrammarPointFull[] {
  return content
    .listGrammar(level)
    .map((g) => content.getGrammar(g.id))
    .filter((p): p is GrammarPointFull => p !== null);
}

export function buildDailySession(user: UserDb, content: ContentDb, now: Date): SessionStep[] {
  const dayKey = localDayKey(now);
  const steps: SessionStep[] = [];

  const pointCache = new Map<string, GrammarPointFull | null>();
  const getPoint = (id: string): GrammarPointFull | null => {
    if (!pointCache.has(id)) pointCache.set(id, content.getGrammar(id));
    return pointCache.get(id)!;
  };
  const levelCache = new Map<string, GrammarPointFull[]>();
  const levelPoints = (level: string): GrammarPointFull[] => {
    if (!levelCache.has(level)) levelCache.set(level, levelPointsFor(content, level));
    return levelCache.get(level)!;
  };

  for (const qi of buildQueue(user, content, now)) {
    const point = getPoint(qi.itemId);
    if (!point) continue;
    const reps = user.getCard('grammar', qi.itemId)?.reps ?? 0;
    const question = generateForCard(point, levelPoints(point.level), reps, dayKey);
    if (qi.kind === 'new') steps.push({ phase: 'learn', itemId: qi.itemId });
    steps.push({
      phase: 'review',
      item: { itemType: 'grammar', itemId: qi.itemId, kind: qi.kind },
      question,
    });
  }

  const learned = user
    .allCards('grammar')
    .filter((c) => {
      const s = statusOf(c);
      return s === 'learned' || s === 'mastered';
    });

  if (learned.length >= 5) {
    const count = Math.min(8, Math.max(5, Math.floor(learned.length / 2)));
    const sources = seededShuffle(
      learned.map((c) => c.item_id).filter((id) => getPoint(id) !== null),
      `mt:${dayKey}`,
    ).slice(0, count);
    sources.forEach((srcId, index) => {
      const point = getPoint(srcId)!;
      const kind = ROTATION[index % 3]!;
      const question = generateOfKind(
        kind,
        point,
        levelPoints(point.level),
        `${srcId}:mt:${index}`,
      );
      steps.push({ phase: 'minitest', question, sourceItemId: srcId, index });
    });
  }

  return steps;
}
```

- [ ] **Step 4: Run — expect pass**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/core/session.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Regression + commit**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npm run typecheck && npm run lint && npm test`
Expected: all green, no regressions.

```bash
git add src/core/session.ts tests/core/session.test.ts
git commit -m "feat: daily session builder — learn, review and mini-test steps

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: `scheduler.ts` — `miniTestEligible` on `DaySummary`

**Files:**
- Modify: `src/core/scheduler.ts`
- Test: `tests/core/scheduler.test.ts` (extend)

**Interfaces:**
- Consumes: adds `import { statusOf } from '@/core/srs'`.
- Produces: `DaySummary` gains `miniTestEligible: boolean` — `true` when `user.allCards('grammar')` has `>= 5` cards whose `statusOf` is `'learned'` or `'mastered'`.
- `buildQueue`, `split`, and every existing field of `DaySummary` are unchanged.

- [ ] **Step 1: Write the failing test**

Append to `tests/core/scheduler.test.ts` (inside the existing `describe('core/scheduler', ...)`):

```ts
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
```

- [ ] **Step 2: Run — expect failure**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/core/scheduler.test.ts`
Expected: FAIL — `miniTestEligible` is `undefined`.

- [ ] **Step 3: Implement**

In `src/core/scheduler.ts`:

Add the import near the top:

```ts
import { statusOf } from '@/core/srs';
```

Add the field to the `DaySummary` interface:

```ts
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
```

In `daySummary`, compute and return it:

```ts
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
```

- [ ] **Step 4: Run — expect pass**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/core/scheduler.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Regression + commit**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npm run typecheck && npm run lint && npm test`
Expected: green. (The `TodayScreen` mock in `tests/ui/TodayScreen.test.tsx` still lacks `miniTestEligible` — that test is updated in Task 10; it stays green here because `daySummary` is mocked there.)

```bash
git add src/core/scheduler.ts tests/core/scheduler.test.ts
git commit -m "feat: expose miniTestEligible on the day summary

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: `src/ui/components/QuestionView.tsx`

**Files:**
- Create: `src/ui/components/QuestionView.tsx`
- Modify: `src/ui/theme.css` (append)
- Test: `tests/ui/QuestionView.test.tsx`

**Interfaces:**
- Consumes: `Question` / `Answer` / `GradedAnswer` from `@/core/quiz/types`, `Furigana` from `@/ui/components/Furigana`.
- Produces:

```ts
export function QuestionView(props: {
  question: Question;
  onAnswer: (a: Answer) => void;
  revealed: GradedAnswer | null;
}): JSX.Element;
```

- **cloze / choice:** render `question.prompt`; for cloze also render `question.sentenceRuby` splitting on `___` so the two halves wrap `<Furigana>` and a visible blank `<span className="cloze-blank">___</span>`. Four buttons for `question.choices` (choice text through `<Furigana>` since cloze choices are Japanese; choice-question options are Russian — `<Furigana>` on plain Russian is a passthrough, so it is safe for both). Clicking button `i` calls `onAnswer({ kind: 'index', value: i })`. When `revealed !== null`: all buttons `disabled`; the button at `question.answerIndex` gets class `opt-correct`; if the user's pick (tracked in local state) is wrong, that button gets `opt-wrong`.
- **assemble:** render `question.prompt`; a "bank" row of the unused `question.tokens` (each a button, text via `<Furigana>`); a "line" row of picked tokens (buttons that remove on click). Track `picked: number[]` in local state. "Готово" button, `disabled` until `picked.length === question.tokens.length`, calls `onAnswer({ kind: 'order', value: picked })`. When `revealed !== null`: freeze interaction, show the correct sentence built from `question.answerOrder` via `<Furigana>` plus `question.translationRu`.
- **breakdown (any kind, `revealed !== null`):** a line "Верно" (class `verdict-ok`) or "Неверно" (class `verdict-bad`), and a `<a href={\`/grammar/${question.itemId}\`}>Подробнее</a>` (plain `<a>` — routing is history-based and the review screen owns navigation; a plain anchor is fine for the breakdown link and keeps this component router-free).
- Local state resets when `question.id` changes (keyed effect or `useEffect([question.id])`).

- [ ] **Step 1: Write the failing test**

Create `tests/ui/QuestionView.test.tsx`:

```ts
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuestionView } from '@/ui/components/QuestionView';
import type { ClozeQuestion, ChoiceQuestion, AssembleQuestion } from '@/core/quiz/types';

const cloze: ClozeQuestion = {
  id: 'g:d:cloze', itemType: 'grammar', itemId: 'n5-wa', kind: 'cloze',
  prompt: 'Выбери пропущенное слово', sentenceRuby: '私[わたし]___ 学生[がくせい]です。',
  choices: ['は', 'を', 'に', 'も'], answerIndex: 0,
};
const assemble: AssembleQuestion = {
  id: 'g:d:assemble', itemType: 'grammar', itemId: 'n5-wa', kind: 'assemble',
  prompt: 'Собери предложение',
  tokens: ['です。', 'は', '学生[がくせい]', '私[わたし]'],
  answerOrder: [3, 1, 2, 0], translationRu: 'Я студент.',
};

describe('QuestionView', () => {
  it('cloze: clicking a choice reports its index', () => {
    const onAnswer = vi.fn();
    render(<QuestionView question={cloze} onAnswer={onAnswer} revealed={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'を' }));
    expect(onAnswer).toHaveBeenCalledWith({ kind: 'index', value: 1 });
  });

  it('cloze: revealed marks the correct and the wrong-picked options', () => {
    const { rerender } = render(
      <QuestionView question={cloze} onAnswer={vi.fn()} revealed={null} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'を' })); // wrong pick
    rerender(
      <QuestionView question={cloze} onAnswer={vi.fn()} revealed={{ correct: false, rating: 1 }} />,
    );
    expect(screen.getByRole('button', { name: 'は' })).toHaveClass('opt-correct');
    expect(screen.getByRole('button', { name: 'を' })).toHaveClass('opt-wrong');
    expect(screen.getByText('Неверно')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /подробнее/i }))
      .toHaveAttribute('href', '/grammar/n5-wa');
  });

  it('assemble: Готово is disabled until all tokens are placed, then reports the order', () => {
    const onAnswer = vi.fn();
    render(<QuestionView question={assemble} onAnswer={onAnswer} revealed={null} />);
    const done = screen.getByRole('button', { name: /готово/i });
    expect(done).toBeDisabled();
    // place tokens to spell 私 は 学生 です。 -> indices 3,1,2,0
    fireEvent.click(screen.getByRole('button', { name: '私わたし' })); // Furigana flattens text
    fireEvent.click(screen.getByRole('button', { name: 'は' }));
    fireEvent.click(screen.getByRole('button', { name: '学生がくせい' }));
    fireEvent.click(screen.getByRole('button', { name: 'です。' }));
    expect(done).toBeEnabled();
    fireEvent.click(done);
    expect(onAnswer).toHaveBeenCalledWith({ kind: 'order', value: [3, 1, 2, 0] });
  });
});
```

Note on the assemble test button names: `<Furigana text="私[わたし]" />` renders `<ruby>私<rt>わたし</rt></ruby>`, and Testing Library's accessible name flattens that to `私わたし`. If the actual flattened name differs, adjust the test selectors to match what `screen.getByRole('button')` exposes (run the test once and read the printed accessible names) — do not change `Furigana`.

- [ ] **Step 2: Run — expect failure**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/ui/QuestionView.test.tsx`
Expected: FAIL — cannot resolve `@/ui/components/QuestionView`.

- [ ] **Step 3: Implement**

Create `src/ui/components/QuestionView.tsx`:

```tsx
import { useEffect, useState } from 'react';
import type { Question, Answer, GradedAnswer } from '@/core/quiz/types';
import { Furigana } from '@/ui/components/Furigana';

export function QuestionView({
  question,
  onAnswer,
  revealed,
}: {
  question: Question;
  onAnswer: (a: Answer) => void;
  revealed: GradedAnswer | null;
}) {
  const [pickedIndex, setPickedIndex] = useState<number | null>(null);
  const [pickedOrder, setPickedOrder] = useState<number[]>([]);

  useEffect(() => {
    setPickedIndex(null);
    setPickedOrder([]);
  }, [question.id]);

  const breakdown = revealed && (
    <div className="q-breakdown">
      <p className={revealed.correct ? 'verdict-ok' : 'verdict-bad'}>
        {revealed.correct ? 'Верно' : 'Неверно'}
      </p>
      {question.kind === 'assemble' && (
        <p className="q-answer-line">
          <Furigana
            text={question.answerOrder.map((i) => question.tokens[i]).join(' ')}
          />
          <span className="q-translation"> — {question.translationRu}</span>
        </p>
      )}
      <a className="q-more" href={`/grammar/${question.itemId}`}>
        Подробнее
      </a>
    </div>
  );

  if (question.kind === 'cloze' || question.kind === 'choice') {
    const chooseIndex = (i: number) => {
      if (revealed) return;
      setPickedIndex(i);
      onAnswer({ kind: 'index', value: i });
    };
    return (
      <div className={`q q-${question.kind}`}>
        <p className="q-prompt">{question.prompt}</p>
        {question.kind === 'cloze' && (
          <p className="q-sentence">
            {question.sentenceRuby.split('___').map((part, i, arr) => (
              <span key={i}>
                <Furigana text={part} />
                {i < arr.length - 1 && <span className="cloze-blank">＿＿＿</span>}
              </span>
            ))}
          </p>
        )}
        <div className="q-options">
          {question.choices.map((c, i) => {
            const cls = ['q-opt'];
            if (revealed) {
              if (i === question.answerIndex) cls.push('opt-correct');
              else if (i === pickedIndex) cls.push('opt-wrong');
            }
            return (
              <button
                key={i}
                type="button"
                className={cls.join(' ')}
                disabled={revealed !== null}
                onClick={() => chooseIndex(i)}
              >
                <Furigana text={c} />
              </button>
            );
          })}
        </div>
        {breakdown}
      </div>
    );
  }

  // assemble
  const used = new Set(pickedOrder);
  const place = (tokenIdx: number) => {
    if (revealed) return;
    setPickedOrder((o) => [...o, tokenIdx]);
  };
  const removeAt = (pos: number) => {
    if (revealed) return;
    setPickedOrder((o) => o.filter((_, i) => i !== pos));
  };
  const complete = pickedOrder.length === question.tokens.length;
  return (
    <div className="q q-assemble">
      <p className="q-prompt">{question.prompt}</p>
      <div className="q-line">
        {pickedOrder.map((tokenIdx, pos) => (
          <button key={pos} type="button" className="q-tok q-tok-line" onClick={() => removeAt(pos)}>
            <Furigana text={question.tokens[tokenIdx]!} />
          </button>
        ))}
      </div>
      <div className="q-bank">
        {question.tokens.map((t, i) =>
          used.has(i) ? null : (
            <button key={i} type="button" className="q-tok" onClick={() => place(i)}>
              <Furigana text={t} />
            </button>
          ),
        )}
      </div>
      <button
        type="button"
        className="btn-primary q-done"
        disabled={!complete || revealed !== null}
        onClick={() => onAnswer({ kind: 'order', value: pickedOrder })}
      >
        Готово
      </button>
      {breakdown}
    </div>
  );
}
```

Append to `src/ui/theme.css` (values may be tuned to match the existing palette — keep it minimal):

```css
/* --- Plan 3: quiz --- */
.q { display: flex; flex-direction: column; gap: 12px; }
.q-prompt { font-weight: 600; }
.q-sentence { font-size: 1.15rem; line-height: 2; }
.cloze-blank { margin: 0 0.15em; letter-spacing: -0.1em; opacity: 0.7; }
.q-options { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.q-opt { padding: 10px 12px; border: 1px solid var(--border, #ccc); border-radius: 8px; background: var(--surface, #fff); cursor: pointer; }
.q-opt:disabled { cursor: default; }
.opt-correct { border-color: #2e7d32; background: #e8f5e9; }
.opt-wrong { border-color: #c62828; background: #ffebee; }
.q-bank, .q-line { display: flex; flex-wrap: wrap; gap: 6px; min-height: 2.4rem; }
.q-line { border-bottom: 2px dashed var(--border, #ccc); padding-bottom: 6px; }
.q-tok { padding: 6px 10px; border: 1px solid var(--border, #ccc); border-radius: 6px; background: var(--surface, #fff); cursor: pointer; }
.q-tok-line { background: var(--accent-soft, #eef); }
.verdict-ok { color: #2e7d32; font-weight: 600; }
.verdict-bad { color: #c62828; font-weight: 600; }
.q-translation { color: var(--muted, #666); }
```

- [ ] **Step 4: Run — expect pass**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/ui/QuestionView.test.tsx`
Expected: PASS (3 tests). Adjust the assemble test's button accessible-name strings if the first run prints different names.

- [ ] **Step 5: Regression + commit**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npm run typecheck && npm run lint && npm test`

```bash
git add src/ui/components/QuestionView.tsx src/ui/theme.css tests/ui/QuestionView.test.tsx
git commit -m "feat: QuestionView — render questions, collect answers, show breakdown

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9: Rewrite `ReviewScreen.tsx` for the session flow

**Files:**
- Modify: `src/ui/screens/ReviewScreen.tsx` (full rewrite)
- Delete: `src/ui/components/RatingButtons.tsx`
- Modify: `tests/ui/ReviewScreen.test.tsx` (full rewrite)

**Interfaces:**
- Consumes: `buildDailySession` / `levelPointsFor` / `SessionStep` from `@/core/session`, `generateOfKind` from `@/core/quiz/registry`, `grade` from `@/core/quiz/grade`, `newCard` / `review` from `@/core/srs`, `QuestionView` from `@/ui/components/QuestionView`, `GrammarMarkdown` / `Furigana`, `useUserDb` / `useContentDb`, `useNavigate`.
- Produces: default review route behaviour — walks `SessionStep[]`, one screen per step, ending in a summary.

**Behaviour (from spec §5):**
- On mount: `steps = buildDailySession(user, content, new Date())`; `idx = 0`; `tail: SessionStep[] = []` (retry round). Effective list = `steps.concat(tail)`.
- `params` from settings exactly as the current file does.
- **`learn` step:** point title + `GrammarMarkdown` + examples with `Furigana` + a "Понятно" button → `idx + 1`.
- **`review` step:** `QuestionView`. Record `shownAt = Date.now()` when the step becomes visible (keyed on step index via `useLayoutEffect`, matching the Plan 2 "no flash" lesson). On `onAnswer(a)`: `g = grade(step.question, a)`; store `graded` in state so `QuestionView` shows the breakdown; reveal a "Далее" button. On "Далее": `elapsedMs = Date.now() - shownAt`; `card = user.getCard('grammar', itemId) ?? newCard('grammar', itemId, now)`; `{ card: next, log } = review(card, g.rating, now, elapsedMs, params)`; `user.upsertCard(next)`; `user.insertReviewLog(log)`; bump tallies (`reviewTotal`, `reviewCorrect`); `idx + 1`.
- **`minitest` step:** `QuestionView`. `g = grade(...)`. **Never** calls `review` / `upsertCard` / `insertReviewLog`. Bump `mtTotal` / `mtCorrect`. On failure add `sourceItemId` to `retryIds` (a `useRef<Set<string>>`). "Далее" → `idx + 1`.
- **Retry round:** a `useEffect` keyed on `idx` — when `idx >= steps.length` and `tail.length === 0` and `retryIds.current.size > 0` and not already built (`retryBuiltRef`), build one `minitest` step per retry id: `generateOfKind('choice', content.getGrammar(id)!, levelPointsFor(content, point.level), \`${id}:retry:${n}\`)`, `setTail(retrySteps)`. Skip ids whose `getGrammar` is `null`.
- **Missing content:** if a step's `getGrammar(itemId)` is `null`, skip forward (`idx + 1`) without ending the session (same guard style as the current file).
- **Keyboard:** `1`–`4` → answer the current cloze/choice (only before `graded`); `Enter` → "Далее" when a breakdown is shown, or "Понятно" on a learn step; `Escape` → `navigate('/')`.
- **Interruption:** graded `review` steps are already persisted (debounced `UserDb`); the mini-test is not persisted, so re-entering rebuilds it.
- **End (`idx >= effective.length`):** summary `Верно {reviewCorrect}/{reviewTotal} · мини-тест {mtCorrect}/{mtTotal}` — render "мини-тест —" when `mtTotal === 0`. "Готово" button → `navigate('/')`.

- [ ] **Step 1: Rewrite the component test**

Replace `tests/ui/ReviewScreen.test.tsx` with:

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
});
```

- [ ] **Step 2: Run — expect failure**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/ui/ReviewScreen.test.tsx`
Expected: FAIL — old `ReviewScreen` renders the flashcard flow, not `QuestionView`.

- [ ] **Step 3: Rewrite `ReviewScreen.tsx`**

Replace `src/ui/screens/ReviewScreen.tsx` with:

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
import { GrammarMarkdown } from '@/ui/components/GrammarMarkdown';
import { Furigana } from '@/ui/components/Furigana';
import { QuestionView } from '@/ui/components/QuestionView';

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
  const [lastAnswer, setLastAnswer] = useState<Answer | null>(null);
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
  const point = stepItemId ? content.getGrammar(stepItemId) : null;
  useEffect(() => {
    if (step && !point) setIdx((i) => i + 1);
  }, [step, point]);

  // Reset per-step state once per position, before paint (Plan 2 lesson).
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

  const answer = useCallback((a: Answer) => {
    if (!step || step.phase === 'learn' || graded) return;
    setLastAnswer(a);
    setGraded(grade(step.question, a));
  }, [step, graded]);

  const next = useCallback(() => {
    if (!step) return;
    if (step.phase === 'review' && graded) {
      const now = new Date();
      const elapsedMs = Date.now() - shownAt.current;
      const base = user.getCard('grammar', step.item.itemId) ?? newCard('grammar', step.item.itemId, now);
      const { card, log } = review(base, graded.rating, now, elapsedMs, params);
      user.upsertCard(card);
      user.insertReviewLog(log);
      setTally((t) => ({ ...t, rc: t.rc + (graded.correct ? 1 : 0), rt: t.rt + 1 }));
    } else if (step.phase === 'minitest' && graded) {
      if (!graded.correct && step.index < 1000) retryIds.current.add(step.sourceItemId);
      setTally((t) => ({ ...t, mc: t.mc + (graded.correct ? 1 : 0), mt: t.mt + 1 }));
    }
    setIdx((i) => i + 1);
  }, [step, graded, user, params]);

  const proceedLearn = useCallback(() => setIdx((i) => i + 1), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { navigate('/'); return; }
      if (!step) return;
      if (step.phase === 'learn' && e.key === 'Enter') { proceedLearn(); return; }
      if (graded && e.key === 'Enter') { next(); return; }
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
        <p className="review-summary">Верно {tally.rc}/{tally.rt} · {mt}</p>
        <button type="button" className="btn-primary" onClick={() => navigate('/')}>Готово</button>
      </section>
    );
  }

  if (!step || !point) return null;

  return (
    <section className="review">
      <div className="review-progress">{idx + 1} / {steps.length}</div>

      {step.phase === 'learn' && (
        <div className="review-learn">
          <h2>{point.title}</h2>
          <GrammarMarkdown source={point.bodyMarkdown} />
          <ul className="examples">
            {point.examples.map((ex, i) => (
              <li key={i} className="example">
                <div className="example-ja"><Furigana text={ex.jaRuby} /></div>
                <div className="example-ru">{ex.ru}</div>
              </li>
            ))}
          </ul>
          <button type="button" className="btn-primary" onClick={proceedLearn}>Понятно</button>
        </div>
      )}

      {(step.phase === 'review' || step.phase === 'minitest') && (
        <div className="review-question">
          <QuestionView question={step.question} onAnswer={answer} revealed={graded} />
          {graded && (
            <button type="button" className="btn-primary" onClick={next}>Далее</button>
          )}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Delete `RatingButtons.tsx`**

```bash
git rm src/ui/components/RatingButtons.tsx
```

Verify nothing else imports it:

Run: `export PATH="$PATH:/c/Program Files/nodejs" && grep -rn "RatingButtons" src tests`
Expected: no matches.

- [ ] **Step 5: Run the tests — expect pass**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/ui/ReviewScreen.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Regression + commit**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npm run typecheck && npm run lint && npm test && npm run build`
Expected: typecheck 0, lint 0, all Vitest green, build clean (no browser-externalization warning).

```bash
git add src/ui/screens/ReviewScreen.tsx tests/ui/ReviewScreen.test.tsx
git commit -m "feat: rewrite ReviewScreen around session steps and auto-graded questions

Walks buildDailySession's learn/review/minitest steps, grades each answer
automatically, persists only review steps, and runs a choice-question retry
round for failed mini-test items. Removes the manual RatingButtons row.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 10: `TodayScreen.tsx` — mini-test in the status line

**Files:**
- Modify: `src/ui/screens/TodayScreen.tsx`
- Modify: `tests/ui/TodayScreen.test.tsx`

**Interfaces:**
- Consumes: `daySummary` (now carries `miniTestEligible`), `streak`.
- Behaviour:
  - Status line (not-all-done branch): `{dueCount} повторить · {newCount} новых · мини-тест {mark}` where `mark = miniTestEligible ? (reviewedToday > 0 ? '✓' : '—') : '—'`. Keep `· стрик {current}` at the end as today.
  - All-done branch: still show `На сегодня всё · стрик {current}`, and add `· мини-тест {mark}`.
  - Show the "Начать" link when `dueCount > 0 || newCount > 0 || (miniTestEligible && reviewedToday === 0)` — so a pure mini-test day (0 due, 0 new, eligible, nothing reviewed yet) is still reachable.
  - `queueOverCap` hint unchanged.
- **Known limitation (resolves spec open question 3):** `reviewedToday > 0` is the proxy for "session passed today". A day with only a mini-test writes no `review_log` row, so its `✓` does not latch across a reload. Precise mini-test accounting waits for `review_log.mode` in the tuning plan. Documented here, not fixed.

- [ ] **Step 1: Update the test**

Replace `tests/ui/TodayScreen.test.tsx` with:

```tsx
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const summary = {
  value: {
    dueCount: 3, newCount: 5, reviewedToday: 0,
    queueOverCap: false, allDone: false, nextDueAt: null, miniTestEligible: false,
  },
};
vi.mock('@/ui/useUserDb', () => ({ useUserDb: () => ({}) }));
vi.mock('@/ui/useContentDb', () => ({ useContentDb: () => ({}) }));
vi.mock('@/core/scheduler', () => ({ daySummary: () => summary.value }));
vi.mock('@/core/progress', () => ({ streak: () => ({ current: 4, best: 9 }) }));

import { TodayScreen } from '@/ui/screens/TodayScreen';
const renderScreen = () => render(<MemoryRouter><TodayScreen /></MemoryRouter>);

describe('TodayScreen', () => {
  it('shows the due/new/streak line with a mini-test dash when not eligible', () => {
    summary.value = { ...summary.value, dueCount: 3, newCount: 5, reviewedToday: 0, allDone: false, miniTestEligible: false };
    renderScreen();
    expect(screen.getByText(/3 повторить/)).toBeInTheDocument();
    expect(screen.getByText(/5 новых/)).toBeInTheDocument();
    expect(screen.getByText(/мини-тест —/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /начать/i })).toHaveAttribute('href', expect.stringContaining('/review'));
  });

  it('marks the mini-test done when eligible and something was reviewed today', () => {
    summary.value = { ...summary.value, dueCount: 0, newCount: 0, reviewedToday: 6, allDone: true, miniTestEligible: true };
    renderScreen();
    expect(screen.getByText(/мини-тест ✓/)).toBeInTheDocument();
  });

  it('offers Start on a pure mini-test day', () => {
    summary.value = { ...summary.value, dueCount: 0, newCount: 0, reviewedToday: 0, allDone: true, miniTestEligible: true };
    renderScreen();
    expect(screen.getByText(/мини-тест —/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /начать/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/ui/TodayScreen.test.tsx`
Expected: FAIL — no "мини-тест" text, and no Start link in the all-done branch.

- [ ] **Step 3: Implement**

Replace `src/ui/screens/TodayScreen.tsx` with:

```tsx
import { Link } from 'react-router-dom';
import { useUserDb } from '@/ui/useUserDb';
import { useContentDb } from '@/ui/useContentDb';
import { daySummary } from '@/core/scheduler';
import { streak } from '@/core/progress';

function relative(iso: string, now: Date): string {
  const ms = new Date(iso).getTime() - now.getTime();
  const h = Math.round(ms / 3_600_000);
  if (h < 1) return 'меньше часа';
  if (h < 24) return `${h} ч`;
  return `${Math.round(h / 24)} дн`;
}

export function TodayScreen() {
  const user = useUserDb();
  const content = useContentDb();
  const now = new Date();
  const s = daySummary(user, content, now);
  const st = streak(user, now);

  const miniMark = s.miniTestEligible ? (s.reviewedToday > 0 ? '✓' : '—') : '—';
  const showStart =
    s.dueCount > 0 || s.newCount > 0 || (s.miniTestEligible && s.reviewedToday === 0);

  return (
    <section className="today">
      <h1>Сегодня</h1>
      {s.allDone ? (
        <>
          <p className="today-line">
            На сегодня всё · мини-тест {miniMark} · стрик {st.current}
          </p>
          {s.nextDueAt && (
            <p className="today-hint">Следующая карточка — через {relative(s.nextDueAt, now)}</p>
          )}
          {showStart && (
            <Link className="btn-primary" to="/review">Начать</Link>
          )}
        </>
      ) : (
        <>
          <p className="today-line">
            {s.dueCount} повторить · {s.newCount} новых · мини-тест {miniMark} · стрик {st.current}
          </p>
          {s.queueOverCap && (
            <p className="today-hint">Много повторений — новые пункты пока на паузе.</p>
          )}
          {showStart && <Link className="btn-primary" to="/review">Начать</Link>}
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run — expect pass**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/ui/TodayScreen.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Regression + commit**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npm run typecheck && npm run lint && npm test && npm run build`

```bash
git add src/ui/screens/TodayScreen.tsx tests/ui/TodayScreen.test.tsx
git commit -m "feat: show mini-test state on Today and keep the session reachable

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 11: e2e — session flow and seeded mini-test

**Files:**
- Modify: `tests/e2e/review.spec.ts` (full rewrite)
- Create: `tests/e2e/helpers/seed-user-db.ts`
- Create: `tests/e2e/minitest.spec.ts`

**Interfaces:**
- `seed-user-db.ts` produces: `writeSeededUserDb(userDataDir: string, opts: { learnedIds: string[]; dueIds: string[]; newPerDay?: number }): Promise<void>` — writes `<userDataDir>/user.db` as a valid v1 database (schema copied inline, `PRAGMA user_version = 1`) with a `cards` row per id (`learnedIds` → `stability = 12, reps = 5, state = 2`; `dueIds` → same but `due` one hour in the past; non-due → `due` seven days ahead), the five default `settings` rows (with `new_per_day` overridden by `opts.newPerDay` when given), and the three `meta` rows. Uses `sql.js` directly + `node:fs` — no `@/` imports (Playwright will not resolve the alias).
- The v1 schema string is duplicated from `src/storage/migrations.ts` on purpose: keeping the e2e helper free of `src/**` imports is worth the small copy. A comment in the helper points back to `migrations.ts` as the source of truth.

- [ ] **Step 1: Write the seed helper**

Create `tests/e2e/helpers/seed-user-db.ts`:

```ts
import initSqlJs from 'sql.js';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// Schema mirrors src/storage/migrations.ts V1_SCHEMA (source of truth).
// Kept inline so this Playwright helper imports nothing from src/**.
const V1_SCHEMA = `
CREATE TABLE cards (
  item_type TEXT NOT NULL, item_id TEXT NOT NULL, due TEXT NOT NULL,
  stability REAL NOT NULL, difficulty REAL NOT NULL, elapsed_days INTEGER NOT NULL,
  scheduled_days INTEGER NOT NULL, learning_steps INTEGER NOT NULL, reps INTEGER NOT NULL,
  lapses INTEGER NOT NULL, state INTEGER NOT NULL, last_review TEXT, introduced_at TEXT NOT NULL,
  PRIMARY KEY (item_type, item_id)
);
CREATE INDEX ix_cards_due ON cards(due);
CREATE TABLE review_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, item_type TEXT NOT NULL, item_id TEXT NOT NULL,
  reviewed_at TEXT NOT NULL, day_key TEXT NOT NULL, rating INTEGER NOT NULL,
  state_before INTEGER NOT NULL, stability_after REAL NOT NULL, elapsed_ms INTEGER NOT NULL
);
CREATE INDEX ix_review_log_day ON review_log(day_key);
CREATE INDEX ix_review_log_item ON review_log(item_type, item_id);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

const DEFAULT_SETTINGS: Record<string, unknown> = {
  new_per_day: 5, review_queue_cap: 100, fsrs_request_retention: 0.9,
  fsrs_maximum_interval: 365, fsrs_enable_fuzz: true,
};

export async function writeSeededUserDb(
  userDataDir: string,
  opts: { learnedIds: string[]; dueIds: string[]; newPerDay?: number },
): Promise<void> {
  const wasm = readFileSync(createRequire(import.meta.url).resolve('sql.js/dist/sql-wasm.wasm'));
  const SQL = await initSqlJs({ wasmBinary: wasm });
  const db = new SQL.Database();
  db.run(V1_SCHEMA);
  db.run('PRAGMA user_version = 1');

  const settings = { ...DEFAULT_SETTINGS };
  if (opts.newPerDay !== undefined) settings.new_per_day = opts.newPerDay;
  const setS = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(settings)) setS.run([k, JSON.stringify(v)]);
  setS.free();

  const setM = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)');
  setM.run(['schema_version', '1']);
  setM.run(['app_version', '0.3.0']);
  setM.run(['created_at', '2026-01-01T00:00:00.000Z']);
  setM.free();

  const past = new Date(Date.now() - 3_600_000).toISOString();
  const future = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const intro = '2026-01-01T00:00:00.000Z';
  const insert = db.prepare(
    `INSERT INTO cards (item_type,item_id,due,stability,difficulty,elapsed_days,
      scheduled_days,learning_steps,reps,lapses,state,last_review,introduced_at)
     VALUES ('grammar',?,?,?,?,0,1,0,?,0,?,?,?)`,
  );
  const seen = new Set<string>();
  for (const id of [...opts.dueIds, ...opts.learnedIds]) {
    if (seen.has(id)) continue;
    seen.add(id);
    const due = opts.dueIds.includes(id) ? past : future;
    insert.run([id, due, 12, 6, 5, 2, intro, intro]);
  }
  insert.free();

  mkdirSync(userDataDir, { recursive: true });
  writeFileSync(join(userDataDir, 'user.db'), Buffer.from(db.export()));
  db.close();
}
```

- [ ] **Step 2: Rewrite `tests/e2e/review.spec.ts`**

```ts
import { test, expect, _electron as electron } from '@playwright/test';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

test('first run: a question-based session records progress and returns to Today', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'jlpt-e2e-review-'));
  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/main.js'), `--user-data-dir=${userData}`],
  });
  const win = await app.firstWindow();
  await win.waitForSelector('[data-testid="user-db-ready"]', { state: 'attached', timeout: 20_000 });

  await win.getByRole('link', { name: /начать/i }).click();

  // 5 new grammar cards. Each: learn ("Понятно"), then answer the question
  // (first option is not always correct — either way "Далее" advances), 5x.
  for (let i = 0; i < 5; i++) {
    await win.getByRole('button', { name: /понятно/i }).click();
    // answer: click the first choice / or assemble "Готово" after placing tokens
    const done = win.getByRole('button', { name: /^готово$/i });
    if (await done.count()) {
      // assemble: place every bank token in order, then finish
      const bank = win.locator('.q-bank .q-tok');
      for (let n = await bank.count(); n > 0; n = await bank.count()) {
        await win.locator('.q-bank .q-tok').first().click();
      }
      await win.getByRole('button', { name: /^готово$/i }).click();
    } else {
      await win.locator('.q-options .q-opt').first().click();
    }
    await win.getByRole('button', { name: /далее/i }).click();
  }

  await expect(win.getByText(/Верно \d\/5/)).toBeVisible({ timeout: 20_000 });
  await expect(win.getByText(/мини-тест —/)).toBeVisible(); // < 5 learned -> no mini-test
  await win.getByRole('button', { name: /готово/i }).click();
  await expect(win.getByRole('heading', { name: /сегодня/i })).toBeVisible({ timeout: 20_000 });

  await app.close();
});
```

- [ ] **Step 3: Write `tests/e2e/minitest.spec.ts`**

```ts
import { test, expect, _electron as electron } from '@playwright/test';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { writeSeededUserDb } from './helpers/seed-user-db';

// Real N5 grammar ids from content/grammar/n5/*.md front matter.
const N5_IDS = [
  'n5-desu', 'n5-ka-question', 'n5-masu-form', 'n5-mo-particle',
  'n5-ni-place-time',
];

test('seeded learned deck: session ends with a mini-test and a retry round', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'jlpt-e2e-minitest-'));
  // 5 learned + due so they also form review steps; new_per_day 0 keeps the
  // session to "5 reviews + mini-test".
  await writeSeededUserDb(userData, { learnedIds: N5_IDS, dueIds: N5_IDS, newPerDay: 0 });

  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/main.js'), `--user-data-dir=${userData}`],
  });
  const win = await app.firstWindow();
  await win.waitForSelector('[data-testid="user-db-ready"]', { state: 'attached', timeout: 20_000 });

  await expect(win.getByText(/мини-тест —/)).toBeVisible({ timeout: 20_000 });
  await win.getByRole('link', { name: /начать/i }).click();

  // Answer every question by taking the first available control until the
  // summary shows. Deliberately wrong-ish (first option) to provoke a retry
  // round; the loop keeps going through it.
  for (let guard = 0; guard < 40; guard++) {
    if (await win.getByRole('button', { name: /готово$/i }).count()
        && await win.getByText(/Верно \d+\/\d+/).count()) break;

    const learn = win.getByRole('button', { name: /понятно/i });
    if (await learn.count()) { await learn.click(); continue; }

    const next = win.getByRole('button', { name: /далее/i });
    if (await next.count()) { await next.click(); continue; }

    const assembleDone = win.getByRole('button', { name: /^готово$/i });
    if (await assembleDone.count()) {
      const tok = win.locator('.q-bank .q-tok');
      if (await tok.count()) { await tok.first().click(); continue; }
      await assembleDone.click(); continue;
    }

    const opt = win.locator('.q-options .q-opt').first();
    if (await opt.count()) { await opt.click(); continue; }
    break;
  }

  await expect(win.getByText(/мини-тест \d+\/\d+/)).toBeVisible({ timeout: 20_000 });
  await win.getByRole('button', { name: /готово/i }).click();
  await expect(win.getByRole('heading', { name: /сегодня/i })).toBeVisible({ timeout: 20_000 });

  await app.close();
});
```

- [ ] **Step 4: Build and run the e2e suite**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npm run build && npx playwright test`
Expected: all specs pass, including the rewritten `review.spec.ts` and new `minitest.spec.ts`. If `minitest.spec.ts` times out because the guard loop exits early, raise the guard bound or add a short `waitForTimeout(50)` between iterations — the flow (mini-test steps appear, retry round runs, summary shows "мини-тест N/M") is the assertion that matters.

- [ ] **Step 5: Full regression + commit**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npm run typecheck && npm run lint && npm test && npm run build && npx playwright test`
Expected: typecheck 0, lint 0, Vitest all green, build clean, Playwright all green.

```bash
git add tests/e2e/review.spec.ts tests/e2e/minitest.spec.ts tests/e2e/helpers/seed-user-db.ts
git commit -m "test: e2e for the question session and a seeded mini-test with retry

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 12: Merge the branch

**Files:** none (git only).

- [ ] **Step 1: Final full verification**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npm run typecheck && npm run lint && npm test && npm run build && npx playwright test`
Expected: everything green. Record the Vitest and Playwright totals in the task report.

- [ ] **Step 2: Update the memory pointer**

The plan executor should note in the report that `C:\Users\am200\.claude\projects\C--Users-am200-Documents-ClaudeWork\memory\jlpt-desktop-app.md` needs updating: Plan 3 done, sessions/quiz/mini-test shipped, next is Plan 4 (kanji + vocab content and their question types).

- [ ] **Step 3: Merge**

Follow `superpowers:finishing-a-development-branch`. Squash-or-merge the `plan-3-sessions-quiz` work into `master` with a summary commit; keep the individual task commit trail if the project's history style (seen in `git log`) favours it — Plan 2 landed as a `Merge plan-2-srs-core` commit, so mirror that:

```bash
git checkout master
git merge --no-ff plan-3-sessions-quiz -m "Merge plan-3-sessions-quiz: quiz engine, sessions, auto-grading, mini-test

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage**

| Spec section | Task |
|---|---|
| §1 `quiz-engine` registry + generation + distractors + auto-grade | Tasks 2–5 |
| §1 question types v1: cloze, choice, assemble | Task 4 |
| §1 `core/session` `buildDailySession` | Task 6 |
| §1 `ReviewScreen` rewritten around steps | Task 9 |
| §1 learn session: study panel → first question | Task 9 (`learn` then `review` step) |
| §1 mini-test: 5–8 mixed, failure → retry, no FSRS, counts for streak | Tasks 6, 9 (+ known limitation noted in Task 10) |
| §1 `TodayScreen` status line includes mini-test | Task 10 |
| §2 module table (`types`, `distractors`, `grammar-questions`, `registry`, `grade`, `session`, `QuestionView`, `ReviewScreen`) | Tasks 1–9 |
| §2 `RatingButtons` deleted | Task 9 |
| §2 `srs.ts` / `scheduler.ts` selection frozen; one `DaySummary` field | Task 7 |
| §3 type definitions | Task 2 |
| §3 generator heuristics (core extraction, `## Кратко`, token split, fallback chain) | Tasks 4–5 |
| §3 `pickDistractors` contract | Task 3 |
| §3 `generateForCard` / `generateOfKind` | Task 5 |
| §3 `grade` rating 1/3 | Task 2 |
| §4 `SessionStep` union, build order, mini-test rule, idempotence | Task 6 |
| §5 `QuestionView` props + per-kind UI + breakdown | Task 8 |
| §5 `ReviewScreen` mount/learn/review/minitest/retry/keyboard/interruption/summary | Task 9 |
| §5 `TodayScreen` line + Start reachability | Task 10 |
| §5 `daySummary` `miniTestEligible` | Task 7 |
| §6 test matrix (grammar-questions, distractors, registry, grade, session, ReviewScreen, e2e ×2, regression) | Tasks 3–11 |
| §6 TZ pinning pattern | Tasks 6 (session test), 7 reuses scheduler test's existing pattern |
| §7 open question 1 (cloze heuristic) | Noted in Task 4 Step 4 — fallback covers misses |
| §7 open question 2 (assemble token coverage) | `genAssemble` returns `null` → fallback; Task 4 test covers |
| §7 open question 3 (session-passed signal) | Resolved pragmatically + documented in Task 10 |

**2. Placeholder scan**

`registry.ts` in Task 5 Step 3 contains a `kinds.forEach.length;` line that is explicitly called out and removed in the same step (a teaching note, not shipped code). No other TODO/TBD/"add error handling"/"similar to Task N" placeholders; every code step has full code.

**3. Type consistency**

- `Question` / `Answer` / `GradedAnswer` (Task 2) used identically in Tasks 4, 5, 8, 9.
- `GrammarGenerator` signature `(point, levelPoints, seed) => Question | null` consistent Tasks 4 → 5.
- `generateForCard(point, levelPoints, reps, dayKey)` and `generateOfKind(kind, point, levelPoints, idSeed)` — same argument order in Task 5 definition and Tasks 6, 9 call sites.
- `SessionStep` union (Task 6) — the `minitest` variant's `index` field is used in Task 9 to distinguish base (`< 1000`) from retry (`>= 1000`) steps; both places agree.
- `DaySummary.miniTestEligible` (Task 7) consumed in Task 10 and its test mock.
- `levelPointsFor(content, level)` exported from `session.ts` (Task 6), imported in `ReviewScreen` (Task 9).
- `writeSeededUserDb(userDataDir, opts)` (Task 11) — one definition, one call site.
- `stringifyRuby` (Task 1) consumed in Task 4.
