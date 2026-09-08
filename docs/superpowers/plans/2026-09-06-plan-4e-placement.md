# Plan 4e — Placement (Intro Test) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the adaptive intro placement test the main design spec calls for: an
optional first-launch offer that runs a short binary-search quiz over grammar and
marks whatever the user already knows as SRS cards in a "known" state, so they don't
have to re-learn material they've already mastered.

**Architecture:** The canonical ordered list of grammar ids (level → layer → id) that
the daily scheduler already builds internally (`availableItemIds` in `scheduler.ts`)
becomes the candidate list for a pure binary-search adaptive test in a new
`src/core/placement.ts` module — no new ordering logic, no new question generator
(reuses `generateForCard`, the same one the daily grammar review already uses). A new
`PlacementScreen` drives one question at a time exactly like `ReviewScreen` does, and
on completion creates real `CardRow`s via the real FSRS engine (`review()` with a
single simulated "Good" rating) — never touching `review_log`, never overwriting a
card that already exists. `TodayScreen` gains a conditional first-launch offer branch;
`SettingsScreen` gains a plain link to retake the test.

**Tech Stack:** Unchanged — TypeScript, React 18, Vitest, Playwright, sql.js, ts-fsrs.

**Spec:** `docs/superpowers/specs/2026-09-06-plan-4e-placement-design.md` — this plan
implements that spec in full, including its documented deviation from the "15-20
questions" figure in the original app-wide design spec (see that plan's spec §3 for the
reasoning: a correct binary search converges in `⌈log₂(N+1)⌉` questions, which is ≤7
for the current N5+N4 grammar corpus — padding the count artificially was rejected).

## Global Constraints

- **Grammar only.** Kanji and vocab are not part of this test (explicit user
  decision) — do not touch their scheduling/onboarding.
- **No `review_log` writes from placement.** Marking a grammar point "known" must call
  `user.upsertCard(card)` only — never `user.insertReviewLog(...)`. This isn't a real
  study session and must not inflate the streak/reviewed-today counters.
- **Never overwrite an existing card.** Before creating a card for a frontier id,
  check `user.getCard('grammar', id)` — if it already exists (any status), skip it.
  This applies both on first run and on every retake from Settings.
- **`placement_offered` is a one-way flag.** Once set to `true` (by skipping the offer
  OR by completing the test, including a test that marks zero cards), the first-launch
  offer never shows again. Retaking from Settings does not depend on or reset this flag.
- **No new question-generation code.** Reuse `generateForCard` from
  `@/core/quiz/registry` exactly as `session.ts` already does for grammar review.
- **No new ordering logic.** Reuse `availableItemIds` from `@/core/scheduler` (exported
  as part of Task 1) — do not re-implement the level→layer→id sort a second time.
- **Node not on PATH**: prefix every `npm`/`npx` run with
  `export PATH="$PATH:/c/Program Files/nodejs" &&` (Bash) as established in this repo.

---

## File Structure

**Created:**
- `src/core/placement.ts` — `initPlacement`, `nextPlacementQuestion`,
  `applyPlacementAnswer`, `isPlacementDone`, `placementFrontierIds`.
- `src/ui/screens/PlacementScreen.tsx` — drives the test, persists results on completion.
- `tests/core/placement.test.ts`
- `tests/ui/PlacementScreen.test.tsx`
- `tests/e2e/placement.spec.ts`

**Modified:**
- `src/core/scheduler.ts` — `availableItemIds` becomes `export`ed (was module-private).
  No behavior change.
- `src/ui/screens/TodayScreen.tsx` — gains a first-launch offer branch.
- `src/ui/screens/SettingsScreen.tsx` — gains a "Пройти вступительный тест заново" link.
- `src/ui/routes.tsx` — `/placement` route added.
- `src/ui/theme.css` — `.placement*`/`.placement-offer*`/`.settings-placement` rules.
- `tests/ui/TodayScreen.test.tsx` — mock for `@/ui/useUserDb` upgraded from a bare `{}`
  to a stateful fake (needed because `TodayScreen` now calls `getSetting`/`allCards`/
  `setSetting`); 3 new tests for the offer branch.
- `tests/ui/SettingsScreen.test.tsx` — every `render(<SettingsScreen />)` call replaces
  with a `MemoryRouter`-wrapped `renderScreen()` helper (needed because `SettingsScreen`
  now renders a react-router `<Link>`, which throws outside a Router context); 1 new
  test for the retake link.

**Not modified:** `src/core/session.ts`, `src/core/quiz/**`, `src/storage/**` (no schema
change — `placement_offered` is a plain new `settings` key, same free-string column used
by every other setting), `src/ui/components/QuestionView.tsx`, `Nav.tsx` (the new route
is linked from `TodayScreen`/`SettingsScreen`, not added as a persistent nav tab — same
treatment `/review` already gets).

---

## Task 1: `src/core/placement.ts` — binary-search adaptive test core

**Files:**
- Modify: `src/core/scheduler.ts` (one-line export change)
- Create: `src/core/placement.ts`
- Test: `tests/core/placement.test.ts`

**Interfaces:**
- Produces: `PlacementState { ids: string[]; lo: number; hi: number; askedCount: number }`,
  `initPlacement(content: ContentDb): PlacementState`,
  `isPlacementDone(state): boolean`,
  `nextPlacementQuestion(state, content: ContentDb, seed: string): { itemId: string; question: Question } | null`,
  `applyPlacementAnswer(state, correct: boolean): PlacementState`,
  `placementFrontierIds(state): string[]` — all consumed by `PlacementScreen` in Task 2.

- [ ] **Step 1: Export `availableItemIds` from `scheduler.ts`**

In `src/core/scheduler.ts`, change:

```ts
function availableItemIds(content: ContentDb, itemType: ItemType): string[] {
```

to:

```ts
export function availableItemIds(content: ContentDb, itemType: ItemType): string[] {
```

That is the only change to this file. Run the existing scheduler suite to confirm
nothing broke: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/core/scheduler.test.ts` — expected PASS, 14/14 unchanged (adding an export never changes behavior).

- [ ] **Step 2: Write the failing tests**

Create `tests/core/placement.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  initPlacement,
  nextPlacementQuestion,
  applyPlacementAnswer,
  isPlacementDone,
  placementFrontierIds,
  type PlacementState,
} from '@/core/placement';
import type { ContentDb, GrammarPointFull } from '@/storage/content-db';

/**
 * `layer: i + 1` makes `availableItemIds`'s (level.ord, layer, id) sort return the
 * ids in exactly the given array order — the same fixture shape session.test.ts
 * already uses for exercising `generateForCard`.
 */
function fakeContent(ids: string[]): ContentDb {
  const points: GrammarPointFull[] = ids.map((id, i) => ({
    id, level: 'N5', title: id, layer: i + 1, tags: [], related: [], relatedTitles: [],
    bodyMarkdown: `## Кратко\nОписание пункта ${id} — что он выражает и когда употребляется.`,
    examples: [
      { jaRuby: `${id}は 毎日[まいにち] 日本語[にほんご]を 勉強[べんきょう]します。`, ru: `перевод ${id}` },
    ],
  }));
  const byId = new Map(points.map((p) => [p.id, p]));
  return {
    listLevels: () => [{ code: 'N5', status: 'available', ord: 1, titleRu: 'N5' }],
    listGrammar: () => points.map((p) => ({ id: p.id, level: p.level, title: p.title, layer: p.layer })),
    getGrammar: (id: string) => byId.get(id) ?? null,
  } as unknown as ContentDb;
}

function runToCompletion(
  content: ContentDb,
  correctFor: (itemId: string, state: PlacementState) => boolean,
): PlacementState {
  let state = initPlacement(content);
  while (!isPlacementDone(state)) {
    const step = nextPlacementQuestion(state, content, 'test');
    if (!step) break;
    state = applyPlacementAnswer(state, correctFor(step.itemId, state));
  }
  return state;
}

describe('core/placement', () => {
  const ids = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];

  it('converges to the full frontier when every answer is correct', () => {
    const content = fakeContent(ids);
    const final = runToCompletion(content, () => true);
    expect(placementFrontierIds(final)).toEqual(ids);
    expect(final.askedCount).toBeLessThanOrEqual(Math.ceil(Math.log2(ids.length + 1)));
  });

  it('converges to an empty frontier when every answer is wrong', () => {
    const content = fakeContent(ids);
    const final = runToCompletion(content, () => false);
    expect(placementFrontierIds(final)).toEqual([]);
    expect(final.askedCount).toBeLessThanOrEqual(Math.ceil(Math.log2(ids.length + 1)));
  });

  it('converges to a hand-traced middle boundary with mixed answers', () => {
    // Oracle: the first 3 ids (by canonical order) are "known". Hand trace for
    // ids.length=8, lo=0,hi=8:
    //   idx=4 -> "known"? p5 is index 4, not < 3 -> wrong -> hi=4
    //   idx=2 -> p3 is index 2, < 3 -> correct -> lo=3
    //   idx=3 -> p4 is index 3, not < 3 -> wrong -> hi=3
    //   lo=3, hi=3 -> done. frontier = ids[0..3) = ['p1','p2','p3']. 3 questions.
    const content = fakeContent(ids);
    const final = runToCompletion(content, (itemId) => ids.indexOf(itemId) < 3);
    expect(placementFrontierIds(final)).toEqual(['p1', 'p2', 'p3']);
    expect(final.askedCount).toBe(3);
  });

  it('terminates within the theoretical bound for a larger corpus', () => {
    const bigIds = Array.from({ length: 93 }, (_, i) => `g${i}`);
    const content = fakeContent(bigIds);
    // Alternating answers -- not a special case for binary search, which halves
    // the [lo,hi) interval every step regardless of the answer sequence.
    let toggle = true;
    const final = runToCompletion(content, () => {
      toggle = !toggle;
      return toggle;
    });
    expect(final.askedCount).toBeLessThanOrEqual(Math.ceil(Math.log2(bigIds.length + 1)));
  });

  it('nextPlacementQuestion returns null once the test is done', () => {
    const content = fakeContent(ids);
    const final = runToCompletion(content, () => true);
    expect(isPlacementDone(final)).toBe(true);
    expect(nextPlacementQuestion(final, content, 'test')).toBeNull();
  });

  it('generates a real grammar question via generateForCard', () => {
    const content = fakeContent(ids);
    const state = initPlacement(content);
    const step = nextPlacementQuestion(state, content, 'test');
    expect(step).not.toBeNull();
    expect(step!.question.itemType).toBe('grammar');
    expect(['cloze', 'choice', 'assemble']).toContain(step!.question.kind);
    expect(step!.itemId).toBe(ids[Math.floor(ids.length / 2)]);
  });

  it('is immediately done with an empty frontier when no grammar is available', () => {
    const content = fakeContent([]);
    const state = initPlacement(content);
    expect(isPlacementDone(state)).toBe(true);
    expect(nextPlacementQuestion(state, content, 'test')).toBeNull();
    expect(placementFrontierIds(state)).toEqual([]);
  });
});
```

- [ ] **Step 3: Run — expect failure**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/core/placement.test.ts`
Expected: FAIL — `src/core/placement.ts` does not exist yet.

- [ ] **Step 4: Implement**

Create `src/core/placement.ts`:

```ts
import type { ContentDb } from '@/storage/content-db';
import type { Question } from '@/core/quiz/types';
import { availableItemIds } from '@/core/scheduler';
import { generateForCard } from '@/core/quiz/registry';
import { levelPointsFor } from '@/core/session';

export interface PlacementState {
  ids: string[];
  lo: number;
  hi: number;
  askedCount: number;
}

/**
 * Строит состояние теста: список кандидатов — тот же канонический порядок
 * грамматики (level.ord -> layer -> id), что уже использует ежедневная очередь.
 * Только грамматика — кандзи/слова не участвуют (см. спеку плана 4e).
 */
export function initPlacement(content: ContentDb): PlacementState {
  const ids = availableItemIds(content, 'grammar');
  return { ids, lo: 0, hi: ids.length, askedCount: 0 };
}

export function isPlacementDone(state: PlacementState): boolean {
  return state.lo >= state.hi;
}

function probeIndex(state: PlacementState): number {
  return Math.floor((state.lo + state.hi) / 2);
}

/**
 * Следующий вопрос теста (`null`, если тест завершён или контент недоступен).
 * Переиспользует `generateForCard` -- тот же генератор, что использует обычная
 * сессия повторения грамматики, с `reps=0`.
 */
export function nextPlacementQuestion(
  state: PlacementState,
  content: ContentDb,
  seed: string,
): { itemId: string; question: Question } | null {
  if (isPlacementDone(state)) return null;
  const idx = probeIndex(state);
  const itemId = state.ids[idx]!;
  const point = content.getGrammar(itemId);
  if (!point) return null;
  const question = generateForCard(
    point,
    levelPointsFor(content, point.level),
    0,
    `${seed}:${itemId}:${state.askedCount}`,
  );
  return { itemId, question };
}

/**
 * Бинарный поиск: `lo`/`hi` -- границы диапазона, где проходит граница
 * "знает/не знает" среди `ids` (`ids[0,lo)` подтверждено известно, `ids[hi,length)`
 * подтверждено неизвестно). Верно -> граница минимум `idx+1`; неверно -> граница
 * максимум `idx`. Сходится за `ceil(log2(ids.length+1))` вопросов при любой
 * последовательности ответов -- каждый шаг ровно вдвое сокращает `hi-lo`.
 */
export function applyPlacementAnswer(state: PlacementState, correct: boolean): PlacementState {
  const idx = probeIndex(state);
  const askedCount = state.askedCount + 1;
  return correct
    ? { ...state, lo: idx + 1, askedCount }
    : { ...state, hi: idx, askedCount };
}

/** id всех пунктов ниже найденной границы -- то, что тест считает уже известным. */
export function placementFrontierIds(state: PlacementState): string[] {
  return state.ids.slice(0, state.lo);
}
```

- [ ] **Step 5: Run — expect pass**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/core/placement.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 6: Commit**

```bash
git add src/core/scheduler.ts src/core/placement.ts tests/core/placement.test.ts
git commit -m "feat: binary-search placement test core, reusing scheduler ordering and grammar question generation"
```

---

## Task 2: `PlacementScreen`

**Files:**
- Create: `src/ui/screens/PlacementScreen.tsx`
- Modify: `src/ui/routes.tsx`, `src/ui/theme.css`
- Test: `tests/ui/PlacementScreen.test.tsx`

**Interfaces:**
- Consumes: everything from Task 1's `@/core/placement`; `QuestionView`, `grade`,
  `newCard`, `review` (all pre-existing, used exactly as `ReviewScreen.tsx` already
  uses them).

- [ ] **Step 1: Write the failing test**

Create `tests/ui/PlacementScreen.test.tsx`:

```tsx
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ChoiceQuestion } from '@/core/quiz/types';

const upsertCard = vi.fn();
const insertReviewLog = vi.fn();
const getCard = vi.fn((_type: string, _id: string) => null as unknown);
const setSetting = vi.fn();
vi.mock('@/ui/useUserDb', () => ({
  useUserDb: () => ({
    getCard,
    upsertCard,
    insertReviewLog,
    setSetting,
    getSetting: (_k: string, d: unknown) => d,
  }),
}));
vi.mock('@/ui/useContentDb', () => ({ useContentDb: () => ({}) }));

function choiceQ(id: string, itemId: string): ChoiceQuestion {
  return {
    id, itemType: 'grammar', itemId, kind: 'choice',
    prompt: 'Вопрос?', choices: ['A', 'B', 'C', 'D'], answerIndex: 0,
  };
}

interface FakeState { step: number; }
const script: { value: { itemId: string; question: ChoiceQuestion }[] } = { value: [] };
const frontier: { value: string[] } = { value: [] };
vi.mock('@/core/placement', () => ({
  initPlacement: (): FakeState => ({ step: 0 }),
  nextPlacementQuestion: (state: FakeState) => script.value[state.step] ?? null,
  applyPlacementAnswer: (state: FakeState) => ({ step: state.step + 1 }),
  isPlacementDone: (state: FakeState) => state.step >= script.value.length,
  placementFrontierIds: () => frontier.value,
}));

import { PlacementScreen } from '@/ui/screens/PlacementScreen';
const renderScreen = () => render(<MemoryRouter><PlacementScreen /></MemoryRouter>);

describe('PlacementScreen', () => {
  beforeEach(() => {
    upsertCard.mockClear();
    insertReviewLog.mockClear();
    getCard.mockClear();
    getCard.mockImplementation(() => null);
    setSetting.mockClear();
  });

  it('answering every question marks the frontier ids as known and shows the summary', () => {
    script.value = [
      { itemId: 'p1', question: choiceQ('p1:0', 'p1') },
      { itemId: 'p2', question: choiceQ('p2:1', 'p2') },
    ];
    frontier.value = ['p1', 'p2'];
    renderScreen();

    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    fireEvent.click(screen.getByRole('button', { name: /далее/i }));
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    fireEvent.click(screen.getByRole('button', { name: /далее/i }));

    expect(screen.getByText(/Отмечено как уже известные: 2/)).toBeInTheDocument();
    expect(upsertCard).toHaveBeenCalledTimes(2);
    expect(insertReviewLog).not.toHaveBeenCalled();
    expect(setSetting).toHaveBeenCalledWith('placement_offered', true);
  });

  it('skips creating a card for a frontier item that already has one', () => {
    script.value = [{ itemId: 'p1', question: choiceQ('p1:0', 'p1') }];
    frontier.value = ['p1', 'p2'];
    getCard.mockImplementation((_type: string, id: string) => (id === 'p2' ? { item_id: 'p2' } : null));
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    fireEvent.click(screen.getByRole('button', { name: /далее/i }));
    expect(screen.getByText(/Отмечено как уже известные: 1/)).toBeInTheDocument();
    expect(upsertCard).toHaveBeenCalledTimes(1);
  });

  it('applies immediately when the test has nothing to ask (already done at mount)', () => {
    script.value = [];
    frontier.value = [];
    renderScreen();
    expect(screen.getByText(/Отмечено как уже известные: 0/)).toBeInTheDocument();
    expect(upsertCard).not.toHaveBeenCalled();
    expect(setSetting).toHaveBeenCalledWith('placement_offered', true);
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/ui/PlacementScreen.test.tsx`
Expected: FAIL — `src/ui/screens/PlacementScreen.tsx` does not exist yet.

- [ ] **Step 3: Implement the screen**

Create `src/ui/screens/PlacementScreen.tsx`:

```tsx
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserDb } from '@/ui/useUserDb';
import { useContentDb } from '@/ui/useContentDb';
import {
  initPlacement,
  nextPlacementQuestion,
  applyPlacementAnswer,
  isPlacementDone,
  placementFrontierIds,
  type PlacementState,
} from '@/core/placement';
import { QuestionView } from '@/ui/components/QuestionView';
import { grade } from '@/core/quiz/grade';
import { newCard, review } from '@/core/srs';
import type { Answer, GradedAnswer } from '@/core/quiz/types';

export function PlacementScreen() {
  const user = useUserDb();
  const content = useContentDb();
  const navigate = useNavigate();

  const [state, setState] = useState<PlacementState>(() => initPlacement(content));
  const [graded, setGraded] = useState<GradedAnswer | null>(null);
  const [markedCount, setMarkedCount] = useState<number | null>(null);
  const appliedRef = useRef(false);

  const current = useMemo(
    () => nextPlacementQuestion(state, content, 'placement'),
    [state, content],
  );

  useLayoutEffect(() => {
    setGraded(null);
  }, [state]);

  useEffect(() => {
    if (!isPlacementDone(state) || appliedRef.current) return;
    appliedRef.current = true;
    const now = new Date();
    const params = {
      requestRetention: user.getSetting('fsrs_request_retention', 0.9),
      maximumInterval: user.getSetting('fsrs_maximum_interval', 365),
      enableFuzz: user.getSetting('fsrs_enable_fuzz', true),
    };
    let marked = 0;
    for (const itemId of placementFrontierIds(state)) {
      if (user.getCard('grammar', itemId)) continue;
      const { card } = review(newCard('grammar', itemId, now), 3, now, 0, params);
      user.upsertCard(card);
      marked += 1;
    }
    user.setSetting('placement_offered', true);
    setMarkedCount(marked);
  }, [state, user]);

  const answer = useCallback(
    (a: Answer) => {
      if (!current || graded) return;
      setGraded(grade(current.question, a));
    },
    [current, graded],
  );

  const next = useCallback(() => {
    if (!current || !graded) return;
    setState((s) => applyPlacementAnswer(s, graded.correct));
  }, [current, graded]);

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

  if (!current) return null;

  return (
    <section className="screen placement">
      <QuestionView
        key={current.question.id}
        question={current.question}
        onAnswer={answer}
        revealed={graded}
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

- [ ] **Step 4: Wire the route**

In `src/ui/routes.tsx`, add the import:

```tsx
import { PlacementScreen } from './screens/PlacementScreen';
```

and add the route entry (anywhere in the array; placed after `/review` for readability):

```tsx
  { path: '/placement', element: <PlacementScreen /> },
```

- [ ] **Step 5: Add styles**

Add to `src/ui/theme.css`, at the end of the file:

```css
.placement { max-width: 40rem; margin: 0 auto; padding: 2rem 1rem;
  display: flex; flex-direction: column; align-items: center; text-align: center; }
.placement-done p { font-size: 1.1rem; margin: 1rem 0; }
```

- [ ] **Step 6: Run — expect pass**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/ui/PlacementScreen.test.tsx`
Expected: PASS — 3 tests.

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx tsc --noEmit`
Expected: PASS — 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/ui/screens/PlacementScreen.tsx src/ui/routes.tsx src/ui/theme.css tests/ui/PlacementScreen.test.tsx
git commit -m "feat: PlacementScreen drives the adaptive test and persists results"
```

---

## Task 3: `TodayScreen` first-launch offer

**Files:**
- Modify: `src/ui/screens/TodayScreen.tsx`
- Test: `tests/ui/TodayScreen.test.tsx` (extend + upgrade the `useUserDb` mock)

**Interfaces:**
- Consumes: `user.getSetting('placement_offered', false)`, `user.allCards('grammar')`,
  `user.setSetting('placement_offered', true)` — all pre-existing `UserDb` methods.

This task's real risk: `TodayScreen`'s current test mocks `useUserDb` as a bare `{}`
(`vi.mock('@/ui/useUserDb', () => ({ useUserDb: () => ({}) }));`). Once `TodayScreen`
calls `getSetting`/`allCards`/`setSetting` on it, every pre-existing test in that file
would throw "not a function" unless the mock is upgraded — this is done in the same
step as the component change, not discovered later by a failing regression run.

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `tests/ui/TodayScreen.test.tsx` with:

```tsx
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const summary = {
  value: {
    dueCount: 3, newCount: 5, reviewedToday: 0,
    queueOverCap: false, allDone: false, nextDueAt: null, miniTestEligible: false,
  },
};

const userState: { settings: Record<string, unknown>; grammarCards: unknown[] } = {
  settings: {},
  grammarCards: [],
};
const setSetting = vi.fn((key: string, value: unknown) => {
  userState.settings[key] = value;
});
vi.mock('@/ui/useUserDb', () => ({
  useUserDb: () => ({
    getSetting: (key: string, fallback: unknown) => userState.settings[key] ?? fallback,
    setSetting,
    allCards: (_itemType: string) => userState.grammarCards,
  }),
}));
vi.mock('@/ui/useContentDb', () => ({ useContentDb: () => ({}) }));
vi.mock('@/core/scheduler', () => ({ daySummary: () => summary.value }));
vi.mock('@/core/progress', () => ({ streak: () => ({ current: 4, best: 9 }) }));

import { TodayScreen } from '@/ui/screens/TodayScreen';
const renderScreen = () => render(<MemoryRouter><TodayScreen /></MemoryRouter>);

describe('TodayScreen', () => {
  beforeEach(() => {
    userState.settings = {};
    // Non-empty by default so the existing "normal day" tests below keep exercising
    // the day-summary branch, not the placement offer -- tests that need the offer
    // branch override this explicitly.
    userState.grammarCards = [{ item_id: 'p1' }];
    setSetting.mockClear();
  });

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

  it('offers the placement test on a fresh db with no grammar cards and no prior decision', () => {
    userState.grammarCards = [];
    renderScreen();
    expect(screen.getByText(/вступительный тест/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /пройти/i })).toHaveAttribute(
      'href', expect.stringContaining('/placement'),
    );
  });

  it('does not offer the placement test once placement_offered is set, even with zero cards', () => {
    userState.grammarCards = [];
    userState.settings['placement_offered'] = true;
    renderScreen();
    expect(screen.queryByText(/вступительный тест/i)).toBeNull();
  });

  it('skipping the offer sets placement_offered and shows the normal Today content', () => {
    userState.grammarCards = [];
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: /пропустить/i }));
    expect(setSetting).toHaveBeenCalledWith('placement_offered', true);
    expect(screen.queryByText(/вступительный тест/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/ui/TodayScreen.test.tsx`
Expected: FAIL — the 3 new tests fail (no offer branch exists yet); the 3 pre-existing
tests should still PASS at this point since the mock upgrade is backward-compatible
with the current component (it doesn't call `getSetting`/`allCards` yet).

- [ ] **Step 3: Implement**

Replace the full contents of `src/ui/screens/TodayScreen.tsx` with:

```tsx
import { useState } from 'react';
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
  const [skipped, setSkipped] = useState(false);

  const showPlacementOffer =
    !skipped &&
    !user.getSetting('placement_offered', false) &&
    user.allCards('grammar').length === 0;

  if (showPlacementOffer) {
    return (
      <section className="today placement-offer">
        <h1>Сегодня</h1>
        <p className="today-line">Хотите пройти вступительный тест?</p>
        <p className="today-hint">
          Он определит, что вы уже знаете, и пропустит это при изучении.
        </p>
        <div className="placement-offer-actions">
          <Link className="btn-primary" to="/placement">
            Пройти
          </Link>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              user.setSetting('placement_offered', true);
              setSkipped(true);
            }}
          >
            Пропустить
          </button>
        </div>
      </section>
    );
  }

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

- [ ] **Step 4: Add styles**

Add to `src/ui/theme.css`, at the end of the file:

```css
.placement-offer-actions { display: flex; gap: 0.8rem; justify-content: center; margin-top: 1rem; }
```

- [ ] **Step 5: Run — expect pass**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/ui/TodayScreen.test.tsx`
Expected: PASS — 6 tests (3 pre-existing + 3 new).

- [ ] **Step 6: Commit**

```bash
git add src/ui/screens/TodayScreen.tsx src/ui/theme.css tests/ui/TodayScreen.test.tsx
git commit -m "feat: TodayScreen offers the placement test on a fresh db"
```

---

## Task 4: `SettingsScreen` retake link

**Files:**
- Modify: `src/ui/screens/SettingsScreen.tsx`, `src/ui/theme.css`
- Test: `tests/ui/SettingsScreen.test.tsx` (extend + wrap renders in a Router)

**Interfaces:**
- No new exports — this is a leaf UI addition.

This task's real risk: `SettingsScreen.tsx` currently renders no react-router
component, so its test file calls `render(<SettingsScreen />)` directly with no
`MemoryRouter`. Once the screen renders a `<Link>`, every one of the file's 8 existing
`render(<SettingsScreen />)` calls throws ("useHref() may be used only in the context
of a `<Router>`") unless wrapped — fixed in the same commit as the component change,
via a shared `renderScreen()` helper.

- [ ] **Step 1: Write the failing test**

Replace the full contents of `tests/ui/SettingsScreen.test.tsx` with:

```tsx
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const settings: Record<string, unknown> = {
  new_per_day: 5,
  review_queue_cap: 100,
  furigana_enabled: true,
};
const setSetting = vi.fn((key: string, value: unknown) => {
  settings[key] = value;
});
const exportBytes = new Uint8Array([1, 2, 3]);
const validateImportBytes = vi.fn(async (bytes: Uint8Array) => bytes.length > 0);
vi.mock('@/ui/useUserDb', () => ({
  useUserDb: () => ({
    getSetting: (key: string, fallback: unknown) => settings[key] ?? fallback,
    setSetting,
    export: () => exportBytes,
    validateImportBytes,
  }),
}));

const exportUserDb = vi.fn(async () => true);
const importUserDb = vi.fn(async (): Promise<Uint8Array | null> => null);
const writeUserDb = vi.fn(async () => {});
vi.mock('@/platform', () => ({
  getPlatformAdapter: () => ({ exportUserDb, importUserDb, writeUserDb }),
}));

import { SettingsScreen } from '@/ui/screens/SettingsScreen';
const renderScreen = () => render(<MemoryRouter><SettingsScreen /></MemoryRouter>);

describe('SettingsScreen', () => {
  beforeEach(() => {
    settings['new_per_day'] = 5;
    settings['review_queue_cap'] = 100;
    settings['furigana_enabled'] = true;
    setSetting.mockClear();
    exportUserDb.mockClear();
    importUserDb.mockClear();
    writeUserDb.mockClear();
    validateImportBytes.mockClear();
    vi.stubGlobal('confirm', vi.fn(() => true));
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: vi.fn() },
      writable: true,
    });
  });

  it('renders current setting values', () => {
    renderScreen();
    expect(screen.getByLabelText(/новых карточек в день/i)).toHaveValue(5);
    expect(screen.getByLabelText(/предел повторений/i)).toHaveValue(100);
    expect(screen.getByLabelText(/показывать фуригану/i)).toBeChecked();
  });

  it('changing the daily-limit field calls setSetting with the new value', () => {
    renderScreen();
    fireEvent.change(screen.getByLabelText(/новых карточек в день/i), { target: { value: '8' } });
    expect(setSetting).toHaveBeenCalledWith('new_per_day', 8);
  });

  it('toggling furigana calls setSetting', () => {
    renderScreen();
    fireEvent.click(screen.getByLabelText(/показывать фуригану/i));
    expect(setSetting).toHaveBeenCalledWith('furigana_enabled', false);
  });

  it('export button calls adapter.exportUserDb with the current db bytes', async () => {
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: /экспортировать/i }));
    await waitFor(() => expect(exportUserDb).toHaveBeenCalledWith(exportBytes));
  });

  it('shows an error status when export fails', async () => {
    exportUserDb.mockRejectedValueOnce(new Error('disk full'));
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: /экспортировать/i }));
    await waitFor(() => expect(screen.getByText(/не удалось сохранить/i)).toBeInTheDocument());
  });

  it('import asks for confirmation, and does nothing further if it is declined', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: /импортировать/i }));
    await waitFor(() => expect(importUserDb).not.toHaveBeenCalled());
  });

  it('import writes valid bytes and reloads the page', async () => {
    importUserDb.mockResolvedValueOnce(new Uint8Array([9, 9]));
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: /импортировать/i }));
    await waitFor(() => expect(writeUserDb).toHaveBeenCalledWith(new Uint8Array([9, 9])));
    expect(window.location.reload).toHaveBeenCalled();
  });

  it('shows an error and does not write when imported bytes fail validation', async () => {
    importUserDb.mockResolvedValueOnce(new Uint8Array([])); // length 0 -> fails the fake validator
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: /импортировать/i }));
    await waitFor(() => expect(screen.getByText(/повреждён/i)).toBeInTheDocument());
    expect(writeUserDb).not.toHaveBeenCalled();
    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it('links to the placement test for a retake', () => {
    renderScreen();
    expect(screen.getByRole('link', { name: /вступительный тест/i })).toHaveAttribute(
      'href', expect.stringContaining('/placement'),
    );
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/ui/SettingsScreen.test.tsx`
Expected: FAIL — only the new last test fails (no such link exists yet); the other 8
should PASS unchanged (the `MemoryRouter` wrap is a no-op for a screen with no router
components yet).

- [ ] **Step 3: Implement**

In `src/ui/screens/SettingsScreen.tsx`, add the import:

```tsx
import { Link } from 'react-router-dom';
```

and add this block right after the closing `</div>` of the existing `settings-backup`
div, before the closing `</section>`:

```tsx
      <div className="settings-placement">
        <h2>Вступительный тест</h2>
        <Link className="btn-ghost" to="/placement">
          Пройти вступительный тест заново
        </Link>
      </div>
```

- [ ] **Step 4: Add styles**

Add to `src/ui/theme.css`, at the end of the file:

```css
.settings-placement { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--border); }
```

- [ ] **Step 5: Run — expect pass**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/ui/SettingsScreen.test.tsx`
Expected: PASS — 9 tests (8 pre-existing + 1 new).

- [ ] **Step 6: Commit**

```bash
git add src/ui/screens/SettingsScreen.tsx src/ui/theme.css tests/ui/SettingsScreen.test.tsx
git commit -m "feat: Settings screen links to retake the placement test"
```

---

## Task 5: e2e coverage + final regression

**Files:**
- Create: `tests/e2e/placement.spec.ts`

**Interfaces:**
- Consumes: the full stack built by Tasks 1-4, exercised through the real Electron app.

- [ ] **Step 1: Write the e2e test**

Create `tests/e2e/placement.spec.ts`:

```ts
import { test, expect, _electron as electron } from '@playwright/test';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

test('taking the placement test on first launch creates known grammar cards and never offers again', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'jlpt-e2e-placement-'));
  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/main.js'), `--user-data-dir=${userData}`],
  });
  const win = await app.firstWindow();
  await win.waitForSelector('[data-testid="user-db-ready"]', { state: 'attached', timeout: 20_000 });

  await expect(win.getByText(/вступительный тест/i)).toBeVisible();
  await win.getByRole('link', { name: /пройти/i }).click();

  // Answer every question with whatever the first choice is (deterministic:
  // answerIndex is seeded, but we don't need to answer correctly -- either way
  // the test converges to SOME frontier and the completion screen appears).
  for (let guard = 0; guard < 20; guard++) {
    if (await win.getByText(/Отмечено как уже известные/).count()) break;
    const opt = win.locator('.q-options .q-opt').first();
    if (await opt.count()) { await opt.click(); }
    const done = win.getByRole('button', { name: /далее/i });
    if (await done.count()) { await done.click(); continue; }
    break;
  }
  await expect(win.getByText(/Отмечено как уже известные/)).toBeVisible({ timeout: 20_000 });
  await win.getByRole('button', { name: /на сегодня/i }).click();

  // The offer must not reappear once the test has been taken.
  await expect(win.getByText(/Сегодня/)).toBeVisible();
  await expect(win.getByText(/вступительный тест/i)).toHaveCount(0);

  await app.close();

  const app2 = await electron.launch({
    args: [join(process.cwd(), 'out/main/main.js'), `--user-data-dir=${userData}`],
  });
  const win2 = await app2.firstWindow();
  await win2.waitForSelector('[data-testid="user-db-ready"]', { state: 'attached', timeout: 20_000 });
  // Confirms the offer flag persisted across a restart, not just in-session state.
  await expect(win2.getByText(/вступительный тест/i)).toHaveCount(0);
  await app2.close();
});
```

- [ ] **Step 2: Build and run the e2e test**

Run:
```bash
export PATH="$PATH:/c/Program Files/nodejs" && npm run build:desktop
export PATH="$PATH:/c/Program Files/nodejs" && npx playwright test tests/e2e/placement.spec.ts
```
Expected: PASS. (`build:desktop`, not `build`, is required first — this e2e test
launches `out/main/main.js` the same way every other Electron e2e spec in this repo does.)

- [ ] **Step 3: Full regression**

Run:
```bash
export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run
```
Expected: PASS — 250 tests (236 baseline + 7 new in `placement.test.ts` + 3 new in
`PlacementScreen.test.tsx` + 3 new in `TodayScreen.test.tsx` (3 pre-existing + 3 new)
+ 1 new in `SettingsScreen.test.tsx` (8 pre-existing + 1 new) =
236 + 7 + 3 + 3 + 1 = 250).

Then run the full e2e suite once to confirm no regression in the pre-existing specs:
```bash
export PATH="$PATH:/c/Program Files/nodejs" && npx playwright test
```
Expected: PASS — all specs green, including `settings.spec.ts`, `kanji-review.spec.ts`,
`vocab-review.spec.ts`, `minitest.spec.ts`, and the new `placement.spec.ts`.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/placement.spec.ts
git commit -m "test: e2e coverage for the placement test offer, completion, and one-time-only behavior"
```

---

## Self-Review

- **Spec coverage:** §2 (grammar-only scope, cards created via one simulated Good
  review, no `review_log`, retake doesn't touch existing cards) — Tasks 1-2. §3
  (binary-search algorithm, reused ordering/generation, documented question-count
  deviation) — Task 1. §4 (first-launch offer, `/placement` screen, retake link) —
  Tasks 2-4. §5 (unit + e2e coverage plan) — all tasks. §6 (out of scope: kanji/vocab,
  scheduled re-offering, retroactive card changes) — respected, none of these appear
  in any task.
- **Placeholder scan:** no TBD/TODO; every step has complete, runnable code.
- **Type consistency:** `PlacementState`'s shape is defined once in `placement.ts`
  (Task 1) and only ever imported (as a type) elsewhere — `PlacementScreen.tsx` never
  redeclares or duplicates its fields. `generateForCard`'s signature
  `(point, levelPoints, reps, seed)` is used identically to how `session.ts` already
  calls it.
- **Blast-radius check (the two non-obvious risks in this plan):** (1) `TodayScreen`'s
  test mock for `useUserDb` was a bare `{}` — upgrading it to a stateful fake happens
  in the same task/commit as the component change (Task 3), not discovered later by a
  failing regression run. (2) `SettingsScreen`'s test file never wrapped its renders in
  a `MemoryRouter` because the screen had no router-aware children before this plan —
  fixed in the same task/commit that adds the first `<Link>` to that screen (Task 4).
  Both were found by reading each target test file's current render setup before
  writing this plan, not by trial and error.
