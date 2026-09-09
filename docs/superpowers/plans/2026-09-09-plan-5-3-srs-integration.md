# Plan 5-3: Lesson Course ↔ SRS Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the loop between the graded-reading course (plans 5-1/5-2) and the SRS: finishing a lesson creates FSRS cards for the grammar/kanji/vocab it introduces, the daily scheduler stops dripping "N new cards per day" (reading lessons are now the only way new material enters review), and "Сегодня"/"Прогресс" reflect course progress.

**Architecture:** Card creation is a small effect in `LessonScreen`'s existing step-4 (Summary) completion path — the same place that already calls `markLessonComplete`, guarded so it fires exactly once per lesson. The scheduler loses its entire "new items" path: `split()` returns only due cards, `allocateBudget`/`unknownAvailable`/`introducedToday` are deleted, `buildQueue` = due only, and `buildDailySession` stops emitting `learn` steps. `DaySummary` loses `newCount`. `TodayScreen` drops "N новых" and gains a "Продолжить курс" card; `ProgressScreen` gains a "Курс: X из Y" line; the dead `new_per_day` field leaves Settings. The e2e specs that seeded new material through the drip are re-seeded with ready-made cards via the existing `writeSeededUserDb` helper.

**Tech Stack:** No new dependencies. `ts-fsrs` (`review`/`newCard` from `@/core/srs`), `sql.js`-backed `UserDb`/`ContentDb`, React 18 + `react-router-dom` 6, `@/core/course` (plan 5-2), Vitest + Playwright + ESLint + `tsc`.

**Spec:** `docs/superpowers/specs/2026-09-08-plan-5-graded-reading-course-design.md` — §3 (Связь с SRS), §4 (Данные пользователя), §5 "План 5-3".

## Global Constraints

- **Card creation on lesson finale (spec §3.1):** in `LessonScreen`, the moment a lesson first reaches step 4, for every `lesson.introduces` entry with `role === 'introduce'` that has NO existing card (`user.getCard(type, id)` is null): `const { card } = review(newCard(type, id, now), 3, now, 0, params); user.upsertCard(card);`. **Rating is 3 ("Хорошо"), not 4** — the material was just taught, it should come back in ~10 min / next day. `insertReviewLog` is **NOT** called (not a real review session — same as `PlacementScreen`). FSRS params come from user settings exactly as `PlacementScreen` reads them: `{ requestRetention: user.getSetting('fsrs_request_retention', 0.9), maximumInterval: user.getSetting('fsrs_maximum_interval', 365), enableFuzz: user.getSetting('fsrs_enable_fuzz', true) }`. `reviews`-role entries with an existing card: do nothing (they surface on their own).
- **The card-creation effect MUST sit INSIDE the `if (!isLessonComplete(user, id))` branch** (carry-in "МИНА 3" from plan 5-2's final review): a re-visited Summary must not re-rate cards. The current step-4 effect is:
  ```ts
  useEffect(() => {
    if (step !== LAST_STEP || completedRef.current) return;
    completedRef.current = true;
    if (!isLessonComplete(user, id)) markLessonComplete(user, id);
  }, [step, user, id]);
  ```
  Card creation goes in the same `if (!isLessonComplete(...))` block, BEFORE `markLessonComplete`.
- **Scheduler: the drip is gone (spec §3.2):**
  - `split()` returns only due cards. `Split` interface loses `newItems`.
  - `TypeContext` loses `unknownAvailable` and `introducedToday`; `typeContext()` stops computing them.
  - `allocateBudget` is **deleted**.
  - `buildQueue` = `[...s.due]` (shuffled by day-key seed as today; the "swap a due to front" logic becomes moot but is harmless — remove it since there are no `new` items).
  - `DaySummary.newCount` is **removed** (not "always 0" — removed; every consumer is touched in this plan). `allDone` = `s.due.length === 0`.
  - `daySummary`/`buildQueue`/`buildDailySession` **signatures do not change**.
  - `availableItemIds` **stays** (the placement test — plan 4h — needs it). `settings(user)` keeps `cap`, drops `newPerDay`.
  - `QueueItem` narrows to `{ itemType: ItemType; itemId: string }` (no `kind`). `SessionStep`'s `review` phase `item` drops `kind`. `buildDailySession` stops pushing the `{ phase: 'learn', ... }` step.
  - `new_per_day` **key stays in user.db** (not deleted), just stops being read and leaves the Settings UI (spec §4).
- **"Сегодня" (spec §3.3):** the status line is `{due} повторить · мини-тест {✓/—} · стрик {n}` (no "N новых"). `showStart` = `s.dueCount > 0 || (s.miniTestEligible && s.reviewedToday === 0)`. A **"Продолжить курс"** card links to `/lesson/{currentMandatoryLessonId}` when one exists ("Урок {stage}: {title}"); when the course is not started (no completed, has a current) → "Начать курс"; when every mandatory lesson is done (or none exist) → a link to `/course` labelled "Курс" (with today's 0-mandatory content this is the only branch that renders).
- **"Прогресс" (spec §3.4):** add a "Курс: пройдено X из Y уроков" line — `X` = count of `courseCompletedIds(user)` that resolve to a real lesson, `Y` = `content.listLessons().length`. `levelCompletion` / level-unlock logic is unchanged (still card-status-driven; cards now accrue via lessons — same mechanism).
- **`migrateTextsRead` is already done** — plan 5-2 landed it in `UserDbProvider` (`src/core/course.ts` `migrateTextsRead`, wired at `UserDbProvider.tsx`). Spec §5's "План 5-3 task 1" is a no-op here. **Carry-in "МИНА 1":** migrated ids in `course_completed_ids` were never walked through the player, so NO cards exist for them. With today's content every migrated lesson is free-reading (0 introduces) so no cards are expected anyway — leave it. Do NOT retroactively create cards for migrated lessons.
- **e2e blast radius (spec §3.2):** these specs seed new material through the drip and must be re-seeded with ready-made cards (`writeSeededUserDb` already accepts `learnedIds`/`dueIds`) or driven through a lesson walk: `tests/e2e/today.spec.ts`, `review.spec.ts`, `progress.spec.ts`, `n4-unlocked.spec.ts`, `kanji-review.spec.ts`, `vocab-review.spec.ts`. `tests/e2e/minitest.spec.ts` may also depend on new-card seeding — check it.
- **Node/npm on PATH** — run `npm`/`npx` directly.
- **`content/**` and `resources/content.db` are git-ignored.** `pretest`/`build-content` rebuild `content.db` locally. No content files change.
- **Final regression (last task) must run:** `npm run typecheck && npm run lint && npx vitest run && npm run build && npx playwright test && npm run build:desktop:installer` — the full set.
- **Version:** `package.json` is already `1.5.0` (bumped this session for plans 5-1+5-2, pushed, no GitHub release yet). This plan bumps to **1.6.0** and cuts the GitHub release `v1.6.0` covering the whole course feature (5-1 + 5-2 + 5-3). Release process: `jlpt-app-github.md` memory — `npm version 1.6.0 --no-git-tag-version`, commit, `git push origin main`, `npm run build:desktop:installer` → `dist/Kotsukotsu Setup 1.6.0.exe`, `gh release create v1.6.0 "dist/Kotsukotsu Setup 1.6.0.exe" --repo Nqam/jlpt-app --title v1.6.0 --notes "..."`, then delete `dist/Kotsukotsu Setup 1.5.0.exe*` + `1.4.0.exe*` (already attached to their releases / never released).
- **Baseline (measured on `main` at `a2ca37d`):** `npx vitest run` → **59 files, 447 tests**. `npx playwright test` → **30 tests**. Each task states its delta; the final task re-measures.

---

## File Structure

```
src/core/
  scheduler.ts        # MOD — rip out the new-items path: TypeContext, typeContext, allocateBudget (delete),
                      #        Split, split, DaySummary.newCount (delete), buildQueue, QueueItem, settings
  session.ts          # MOD — drop the `learn` step + `kind` from the review-phase item; SessionStep type
  srs.ts              # (unchanged — `review`/`newCard` already export what Task 1 needs)

src/ui/
  screens/
    LessonScreen.tsx  # MOD — step-4 effect: create FSRS cards (rating 3) for introduces, inside !isLessonComplete
    TodayScreen.tsx   # MOD — drop "N новых"; add "Продолжить курс" card
    ProgressScreen.tsx# MOD — add "Курс: пройдено X из Y уроков"
    SettingsScreen.tsx# MOD — remove the new_per_day field + its state/handler
    ReviewScreen.tsx  # MOD (if it reads `step.item.kind`) — drop the reference

tests/
  core/
    scheduler.test.ts # MOD — delete every new-card / water-fill / introduced-today / over-cap-suppresses-new test;
                      #        keep due/cap/nextDueAt/miniTest/idempotence; adjust `kind` assertions
    session.test.ts   # MOD — delete learn-step tests; adjust remaining
    srs.test.ts       # (unchanged)
  ui/
    LessonScreen.test.tsx   # MOD — + card-creation test (upsertCard N times, insertReviewLog NOT called), once-only
    TodayScreen.test.tsx    # MOD — summary fixture drops newCount; + "Продолжить курс" card; line has no "новых"
    ProgressScreen.test.tsx # MOD — + "Курс: X из Y" assertion
    SettingsScreen.test.tsx # MOD — delete the new_per_day field tests
  e2e/
    today.spec.ts / review.spec.ts / progress.spec.ts / n4-unlocked.spec.ts /
    kanji-review.spec.ts / vocab-review.spec.ts / minitest.spec.ts   # MOD — re-seed via writeSeededUserDb ready cards
```

---

### Task 1: FSRS card creation on lesson finale

**Files:**
- Modify: `src/ui/screens/LessonScreen.tsx` (the step-4 `useEffect`, ~lines 43-47)
- Test: `tests/ui/LessonScreen.test.tsx`

**Interfaces:**
- Consumes: `review`, `newCard` from `@/core/srs` (`newCard(itemType: string, itemId: string, now: Date): CardRow`; `review(row: CardRow, rating: 1|2|3|4, now: Date, elapsedMs: number, params: {requestRetention:number;maximumInterval:number;enableFuzz:boolean}): { card: CardRow; log: ReviewLogRow }`); `UserDb.getCard(type, id)`, `UserDb.upsertCard(card)`, `UserDb.getSetting`; `isLessonComplete`, `markLessonComplete` from `@/core/course` (plan 5-2); `LessonFull.introduces: { type: 'grammar'|'kanji'|'vocab'; id: string; role: 'introduce'|'review' }[]`.
- Produces: after a lesson's first completion, one FSRS card per un-carded `introduce` item, at FSRS state resulting from a single rating-3 review of a fresh card; `insertReviewLog` never called from `LessonScreen`.

- [ ] **Step 1: Write the failing test**

Add to `tests/ui/LessonScreen.test.tsx`. The existing mock of `@/ui/useUserDb` (see the file's top) exposes `getSetting`/`setSetting` over a `store`. Extend it with `getCard`, `upsertCard`, `insertReviewLog` spies, and add a `LessonFull` fixture that introduces items:

```tsx
// --- add near the existing store/mocks ---
const cards = new Map<string, unknown>();
const getCard = vi.fn((t: string, i: string) => cards.get(`${t}:${i}`) ?? null);
const upsertCard = vi.fn((c: { item_type: string; item_id: string }) => {
  cards.set(`${c.item_type}:${c.item_id}`, c);
});
const insertReviewLog = vi.fn();
// extend the useUserDb mock object with: getCard, upsertCard, insertReviewLog
```

(If the file's `vi.mock('@/ui/useUserDb', ...)` returns an inline object, add the three fields there and reference the module-level spies.)

Fixture + fake db:

```tsx
const introLesson: LessonFull = {
  id: 'l-intro', stage: 5, kind: 'text', title: 'Урок с грамматикой',
  introducesCount: 2, isFreeReading: false,
  bodyRuby: '文[ぶん]です。', translationRu: 'Предложение.',
  questions: [{ prompt: 'Q?', choices: ['a', 'b', 'c'], answerIndex: 0 }],
  introduces: [
    { type: 'grammar', id: 'g1', role: 'introduce' },
    { type: 'vocab', id: 'v1', role: 'introduce' },
    { type: 'grammar', id: 'g-known', role: 'introduce' },
    { type: 'kanji', id: 'k-review', role: 'review' },
  ],
  markers: [],
};
// fakeDb.getLesson returns introLesson for 'l-intro'; listLessons includes its meta
```

Tests:

```tsx
it('on first completion, creates an FSRS card (rating 3) for each un-carded introduce, and no review log', () => {
  cards.clear();
  cards.set('grammar:g-known', { item_type: 'grammar', item_id: 'g-known' }); // already carded
  store.progress = { 'l-intro': { step: 4 } };
  store.completed = [];
  renderAt('/lesson/l-intro');
  expect(screen.getByText(/Урок пройден/)).toBeInTheDocument();
  // g1 + v1 get cards; g-known skipped (has card); k-review skipped (role review)
  expect(upsertCard).toHaveBeenCalledTimes(2);
  const carded = upsertCard.mock.calls.map((c) => `${c[0].item_type}:${c[0].item_id}`).sort();
  expect(carded).toEqual(['grammar:g1', 'vocab:v1']);
  expect(insertReviewLog).not.toHaveBeenCalled();
  expect(setSetting).toHaveBeenCalledWith('course_completed_ids', ['l-intro']);
});

it('does not create cards again when the lesson was already complete', () => {
  cards.clear();
  store.progress = { 'l-intro': { step: 4 } };
  store.completed = ['l-intro'];
  renderAt('/lesson/l-intro');
  expect(upsertCard).not.toHaveBeenCalled();
  expect(setSetting).not.toHaveBeenCalledWith('course_completed_ids', expect.anything());
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/ui/LessonScreen.test.tsx`
Expected: FAIL — `upsertCard` called 0 times (no card-creation code yet).

- [ ] **Step 3: Implement**

In `src/ui/screens/LessonScreen.tsx`, add imports:

```ts
import { review, newCard } from '@/core/srs';
```

Replace the step-4 effect body:

```ts
  useEffect(() => {
    if (step !== LAST_STEP || completedRef.current) return;
    completedRef.current = true;
    if (isLessonComplete(user, id)) return;

    const now = new Date();
    const params = {
      requestRetention: user.getSetting('fsrs_request_retention', 0.9),
      maximumInterval: user.getSetting('fsrs_maximum_interval', 365),
      enableFuzz: user.getSetting('fsrs_enable_fuzz', true),
    };
    for (const it of lesson?.introduces ?? []) {
      if (it.role !== 'introduce') continue;
      if (user.getCard(it.type, it.id)) continue;
      // Rating 3 ("Хорошо"): just taught — should resurface in ~10 min / next day.
      const { card } = review(newCard(it.type, it.id, now), 3, now, 0, params);
      user.upsertCard(card);
    }
    markLessonComplete(user, id);
  }, [step, user, id, lesson]);
```

(`lesson` is already a `useMemo` in the component; add it to the dep array. `completedRef` still guards the single-mount case; `isLessonComplete` guards remount / re-entry.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/ui/LessonScreen.test.tsx`
Expected: PASS — all `LessonScreen` tests including the 2 new ones.

- [ ] **Step 5: Typecheck + full suite**

Run: `npm run typecheck && npx vitest run`
Expected: typecheck clean; 447 prior + 2 new pass (nothing else touched yet).

- [ ] **Step 6: Commit**

```bash
git add src/ui/screens/LessonScreen.tsx tests/ui/LessonScreen.test.tsx
git commit -m "feat(course): create FSRS cards (rating 3) on lesson completion"
```

---

### Task 2: Remove the new-card drip from the scheduler

**Files:**
- Modify: `src/core/scheduler.ts`
- Modify: `src/core/session.ts`
- Modify: `src/ui/screens/ReviewScreen.tsx` (only if it reads `step.item.kind`)
- Test: `tests/core/scheduler.test.ts` (heavy edits — see below)
- Test: `tests/core/session.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces (consumed by Tasks 3-5):
  - `interface DaySummary { dueCount: number; reviewedToday: number; queueOverCap: boolean; allDone: boolean; nextDueAt: string | null; miniTestEligible: boolean }` — **no `newCount`**.
  - `interface QueueItem { itemType: ItemType; itemId: string }` — **no `kind`**.
  - `buildQueue(user, content, now): QueueItem[]` — due cards only, seeded-shuffled by day key.
  - `daySummary(user, content, now): DaySummary`; `availableItemIds(content, itemType, availableCodes): string[]` (unchanged).
  - `SessionStep` review phase: `{ phase: 'review'; item: { itemType: ItemType; itemId: string }; question: Question }` — **no `kind`**; **no `learn` phase** emitted (keep the `learn` variant in the union only if something else needs it — check; otherwise remove it).

- [ ] **Step 1: Rewrite `src/core/scheduler.ts`**

Apply exactly these deletions/changes:

1. `DaySummary`: delete the `newCount: number;` line.
2. `QueueItem`: change to `export interface QueueItem { itemType: ItemType; itemId: string; }` (delete `kind`).
3. `settings()`: delete `newPerDay: user.getSetting('new_per_day', 5),` — keep only `cap`.
4. `TypeContext`: delete `unknownAvailable: string[];` and `introducedToday: number;`.
5. `typeContext()`: delete the `known` / `unknownAvailable` / `introducedToday` computations; return `{ dueSorted, nextDueAt }`.
6. Delete the entire `allocateBudget` function and its doc comment.
7. `Split`: delete `newItems: QueueItem[];` and `dueTotalBeforeCap` is still used — keep it.
8. `split()`: delete everything from `const introducedToday = ...` through the `newItems` construction. `due` items drop `kind`:
   ```ts
   const due: QueueItem[] = allDue.slice(0, cap).map((d) => ({ itemType: d.itemType, itemId: d.itemId }));
   ```
   `return { due, dueTotalBeforeCap, queueOverCap, reviewedToday, nextDueAt };`
9. `daySummary()`: drop `newCount: s.newItems.length,`; `allDone: s.due.length === 0,`.
10. `buildQueue()`:
    ```ts
    export function buildQueue(user: UserDb, content: ContentDb, now: Date): QueueItem[] {
      const s = split(user, content, now);
      return seededShuffle([...s.due], hashSeed(localDayKey(now)));
    }
    ```
    (delete the "swap a due to front" block — no `new` items to sink.)

- [ ] **Step 2: Update `src/core/session.ts`**

In `buildDailySession`'s loop over `buildQueue(...)`:
- delete the line `if (qi.kind === 'new') steps.push({ phase: 'learn', itemType: qi.itemType, itemId: qi.itemId });`
- the review step becomes `item: { itemType: qi.itemType, itemId: qi.itemId }` (drop `kind: qi.kind`).
- `const reps = user.getCard(qi.itemType, qi.itemId)?.reps ?? 0;` stays.
In the `SessionStep` type: remove `| { phase: 'learn'; itemType: ItemType; itemId: string }` and remove `kind: 'due' | 'new'` from the `review` item. Run `grep -rn "phase: 'learn'\|\.kind\b\|kind:" src/ui/screens/ReviewScreen.tsx tests/ui/ReviewScreen.test.tsx` — if `ReviewScreen` branches on `phase === 'learn'` or reads `item.kind`, remove that branch (a learn step showed a "new card" intro card; there are none now).

- [ ] **Step 3: Fix `tests/core/scheduler.test.ts`**

DELETE these tests (they assert the drip):
- `'offers new_per_day new cards on a fresh db'`
- `'buildQueue selects new items by layer, not by id'` (and any variant asserting new-item ordering / water-fill)
- `'daily new limit accounts for cards already introduced today'`
- the `newCount` assertion inside `'suppresses new cards when due queue exceeds the cap'` → keep the test but drop the `expect(s.newCount)...` line and rename to `'caps the due queue at review_queue_cap'`
- any test named around `allocateBudget` / water-fill / 3-type budget split
KEEP and adjust:
- due-count / `nextDueAt` / ghost-card-exclusion / `queueOverCap` / `miniTestEligible` / `buildQueue` idempotence tests — remove `.kind` assertions (`expect(q[0]!.kind)...` → drop; `i.kind === 'due'` → just `i.itemId === ...`).
Run: `npx vitest run tests/core/scheduler.test.ts` — green.

- [ ] **Step 4: Fix `tests/core/session.test.ts`**

DELETE tests asserting a `{ phase: 'learn' }` step precedes a new card. KEEP tests about review-step generation, ordering, determinism — adjust any `item.kind` references.
Run: `npx vitest run tests/core/session.test.ts` — green.

- [ ] **Step 5: Typecheck + full vitest**

Run: `npm run typecheck && npx vitest run`
Expected: typecheck clean. `TodayScreen.test.tsx` and `SettingsScreen.test.tsx` and `ReviewScreen.test.tsx` may now FAIL (they reference `newCount` / the new-per-day field / learn steps) — that is expected; Tasks 3-4 fix them. **If they fail only on those grounds, proceed; if anything ELSE fails, stop and report.**

- [ ] **Step 6: Commit**

```bash
git add src/core/scheduler.ts src/core/session.ts src/ui/screens/ReviewScreen.tsx tests/core/scheduler.test.ts tests/core/session.test.ts
git commit -m "refactor(scheduler): remove the N-new-cards-per-day drip; lessons are the only new-material source"
```

---

### Task 3: "Сегодня" — drop "N новых", add the "Продолжить курс" card

**Files:**
- Modify: `src/ui/screens/TodayScreen.tsx`
- Test: `tests/ui/TodayScreen.test.tsx`

**Interfaces:**
- Consumes: `daySummary` (now without `newCount`, Task 2); `content.listLessons()`, `currentMandatoryLessonId`/`courseCompletedIds` from `@/core/course`.
- Produces: a `/` screen whose status line has no "новых", and a course card.

- [ ] **Step 1: Update the test**

In `tests/ui/TodayScreen.test.tsx`: the `summary` fixture object (`{ dueCount: 3, newCount: 5, ... }`) — delete `newCount`. The `@/core/scheduler` mock stays. Add a mock for the course helpers and content:

```tsx
vi.mock('@/core/course', () => ({
  currentMandatoryLessonId: () => courseState.currentId,
  courseCompletedIds: () => courseState.completed,
}));
const courseState = { currentId: null as string | null, completed: [] as string[] };
// useContentDb mock: listLessons: () => lessons.value  (fixture with meta rows)
```

Adjust/replace assertions:
- the "not all done" line test: assert it contains `3 повторить` and `стрик` and does **NOT** contain `новых`.
- add: `it('renders a course card linking to /course when no mandatory lesson is current')` → `getByRole('link', { name: /курс/i })` has `href` `/course`.
- add: `it('links the course card to the current mandatory lesson when one exists')` → set `courseState.currentId = 'l-5'`, lessons fixture has `l-5` at stage 5 title "Утро" → link href `/lesson/l-5`, text contains `Урок 5` and `Утро`.
- `showStart` no longer keys off `newCount` — keep the existing due>0 / minitest tests.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/ui/TodayScreen.test.tsx`
Expected: FAIL — `newCount` gone from fixture breaks the old line assertion / new course-card tests missing.

- [ ] **Step 3: Implement `TodayScreen.tsx`**

- Add imports: `import { currentMandatoryLessonId, courseCompletedIds } from '@/core/course';`
- Compute after `const s = daySummary(...)`:
  ```ts
  const lessons = content.listLessons();
  const completedSet = new Set(courseCompletedIds(user));
  const curId = currentMandatoryLessonId(lessons, completedSet);
  const curLesson = curId ? lessons.find((l) => l.id === curId) ?? null : null;
  ```
- Replace the two `today-line` strings:
  - all-done branch: `На сегодня всё · мини-тест {miniMark} · стрик {st.current}`
  - not-done branch: `{s.dueCount} повторить · мини-тест {miniMark} · стрик {st.current}`
- `showStart` = `s.dueCount > 0 || (s.miniTestEligible && s.reviewedToday === 0)`.
- After the `showStart` link (in BOTH branches, or once below the conditional block), render the course card:
  ```tsx
  {curLesson ? (
    <Link className="btn-ghost today-course" to={`/lesson/${curLesson.id}`}>
      Продолжить курс · Урок {curLesson.stage}: {curLesson.title}
    </Link>
  ) : (
    <Link className="btn-ghost today-course" to="/course">Курс</Link>
  )}
  ```
  (With today's 0-mandatory content only the `else` branch renders — a plain link into the reading list. The `curLesson` branch is exercised by tests + future content.)
- `.today-course { display: block; margin-top: 0.75rem; }` appended to `theme.css`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/ui/TodayScreen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/TodayScreen.tsx src/ui/theme.css tests/ui/TodayScreen.test.tsx
git commit -m "feat(today): drop the N-new counter, add a Continue-course card"
```

---

### Task 4: "Прогресс" course line + remove the dead `new_per_day` field from Settings

**Files:**
- Modify: `src/ui/screens/ProgressScreen.tsx`
- Modify: `src/ui/screens/SettingsScreen.tsx`
- Test: `tests/ui/ProgressScreen.test.tsx`
- Test: `tests/ui/SettingsScreen.test.tsx`

**Interfaces:**
- Consumes: `content.listLessons()`, `courseCompletedIds` from `@/core/course`.

- [ ] **Step 1: Update the ProgressScreen test**

In `tests/ui/ProgressScreen.test.tsx`: add a `courseCompletedIds` + `listLessons` mock (2 of 4 lessons completed) and:
```tsx
it('shows how many course lessons are done', () => {
  // completed = ['a','b'], listLessons length 4
  renderScreen();
  expect(screen.getByText(/Курс: пройдено 2 из 4/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Implement ProgressScreen**

Add `import { courseCompletedIds } from '@/core/course';`. Compute:
```ts
const allLessons = content.listLessons();
const lessonIds = new Set(allLessons.map((l) => l.id));
const doneCount = courseCompletedIds(user).filter((x) => lessonIds.has(x)).length;
```
Render a line just under `<h1>Прогресс</h1>` (or under the ribbon):
```tsx
<p className="course-progress-line">Курс: пройдено {doneCount} из {allLessons.length} уроков</p>
```

- [ ] **Step 3: Remove `new_per_day` from SettingsScreen**

Delete: the `newPerDay` `useState`, `changeNewPerDay`, and the entire `<div className="settings-field">` containing the `new-per-day` input (the FIRST settings-field block). Keep `review_queue_cap` and furigana. In `tests/ui/SettingsScreen.test.tsx` delete the tests `'renders current setting values'`'s `new-per-day` assertion (keep the review-cap + furigana ones — split or trim the test) and `'changing the daily-limit field calls setSetting with the new value'`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/ui/ProgressScreen.test.tsx tests/ui/SettingsScreen.test.tsx && npm run typecheck && npm run lint`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/ProgressScreen.tsx src/ui/screens/SettingsScreen.tsx tests/ui/ProgressScreen.test.tsx tests/ui/SettingsScreen.test.tsx
git commit -m "feat(progress): course-completion line; drop the dead new_per_day setting"
```

---

### Task 5: Re-seed the e2e specs that relied on the new-card drip

**Files:**
- Modify: `tests/e2e/today.spec.ts`, `review.spec.ts`, `progress.spec.ts`, `n4-unlocked.spec.ts`, `kanji-review.spec.ts`, `vocab-review.spec.ts`, and `minitest.spec.ts` (verify)
- Reference: `tests/e2e/helpers/seed-user-db.ts` (`writeSeededUserDb(userData, { learnedIds, dueIds, newPerDay?, placementOffered?, unlockedLevels? })`)

**Interfaces:**
- Consumes: `writeSeededUserDb` — already supports `learnedIds` (cards in learned status) and `dueIds` (cards due now). A fresh, unseeded launch now shows **zero** review items (no drip) and the placement offer.

- [ ] **Step 1: Audit each spec**

Run `grep -ln "новых\|new card\|kind === 'new'\|learn\|newPerDay\|first run shows new" tests/e2e/*.spec.ts` and read each hit. For every spec that expected "N новых" on Сегодня or a learn step in Review:
- if it needs review items: call `writeSeededUserDb(userData, { learnedIds: [...], dueIds: [...] })` before launch (mirror `n4-unlocked.spec.ts`'s existing pattern) with real content ids (grammar `n5-wa-particle`, kanji `n5-学`, vocab `n5-学校-がっこう` — verify against `content/*.tsv` / grammar dir).
- if it asserts the Сегодня line: change `/\d+ новых/` expectations to the new line format `/\d+ повторить · мини-тест/`.
- `today.spec.ts` `'first run shows new cards on Today and persists across restart'` → rewrite as `'seeded due cards show on Today and persist across restart'` using `dueIds`.

- [ ] **Step 2: Fix them one file at a time**

For each: edit, then `npm run build && npx playwright test tests/e2e/<file>` until green. (`npm run build` once up front, then re-run per file.)

- [ ] **Step 3: Full e2e**

Run: `npm run build-content && npm run build && npx playwright test`
Expected: all green — report the count (was 30; may shift ±1-2 with renamed/rescoped tests).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e
git commit -m "test(e2e): re-seed specs with ready-made cards now that the new-card drip is gone"
```

---

### Task 6: Full regression, version bump v1.6.0, GitHub release

**Files:**
- Modify: `package.json` (version)
- No code changes beyond the bump.

- [ ] **Step 1: Full regression**

Run: `npm run typecheck && npm run lint && npx vitest run && npm run build && npx playwright test`
Expected: all green. Record the vitest file/test counts and the playwright count.

- [ ] **Step 2: Bump the version**

```bash
npm version 1.6.0 --no-git-tag-version
```
Verify `package.json` `"version": "1.6.0"`.

- [ ] **Step 3: Installer**

```bash
npm run build:desktop:installer
```
Expected: `dist/Kotsukotsu Setup 1.6.0.exe` produced. (If it fails purely on the known winCodeSign `.7z`/symlink infra issue — `docs/RELEASE-CHECKLIST.md` — run `npm run build:desktop` and note it; any other failure is a real regression → stop.)

- [ ] **Step 4: Commit + push**

```bash
git add package.json
git commit -m "chore(release): v1.6.0 — graded-reading course wired to SRS (plans 5-1..5-3)"
git push origin main
```

- [ ] **Step 5: GitHub release**

```bash
export PATH="$PATH:/c/Program Files/GitHub CLI" && gh release create v1.6.0 \
  "dist/Kotsukotsu Setup 1.6.0.exe" \
  --repo Nqam/jlpt-app --title v1.6.0 \
  --notes "Погружающий курс градуированного чтения: раздел «Тексты» стал курсом уроков (Новое → Чтение → Понимание → Закрепление → Итог). Прохождение урока создаёт карточки для интервального повторения; «N новых карточек в день» больше не капает — новый материал приходит только через уроки. Плюс кнопка «Сбросить весь прогресс» в Настройках."
```

- [ ] **Step 6: Prune `dist/`**

Only after the release uploads: `rm -f "dist/Kotsukotsu Setup 1.5.0.exe" "dist/Kotsukotsu Setup 1.5.0.exe.blockmap" "dist/Kotsukotsu Setup 1.4.0.exe" "dist/Kotsukotsu Setup 1.4.0.exe.blockmap"` (1.4.0 is attached to its own release; 1.5.0 was never released). Keep only the 1.6.0 installer + blockmap.

- [ ] **Step 7: Update memory**

`C:\Users\am200\.claude\projects\C--Users-am200-Documents-ClaudeWork\memory\jlpt-desktop-app.md` and `jlpt-app-github.md`: план 5 ЗАВЕРШЁН, релиз **v1.6.0**, `releases/latest` = v1.6.0. Remove the "МИНА"/deferred lists that this plan closed; keep any still-open (FR-4b-resid back-nav polish; the memo-dep sweep if not done; `course_progress` GC). Next: план 4d (Android) + 🐞 placement vocab bug.

---

## Self-Review

**1. Spec coverage (§3):**

| Spec | Task |
|---|---|
| §3.1 cards on finale, rating 3, guard `getCard`, no `insertReviewLog`, FSRS params from user | 1 |
| §3.1 the effect inside `!isLessonComplete` (МИНА 3) | 1 (Global Constraints + Step 3) |
| §3.2 `scheduler.ts` — drop `unknownAvailable`/`introducedToday`/`allocateBudget`/`newItems`; `buildQueue` = due; `DaySummary.newCount` removed; `availableItemIds` kept; signatures unchanged | 2 |
| §3.2 `new_per_day` out of Settings UI, key kept in db | 4 (Step 3) |
| §3.2 big test blast-radius — `scheduler.test`, `session.test` | 2; e2e → 5 |
| §3.3 Сегодня line without "N новых"; `showStart` reworked | 3 |
| §3.3 "Продолжить курс" card (current mandatory / not-started / done) | 3 |
| §3.4 Прогресс "Курс: X из Y" | 4 |
| §3.4 `levelCompletion`/unlock unchanged | (no task — unchanged by construction) |
| §4 `course_completed_ids`/`course_progress` keys | (plan 5-2 — unchanged) |
| §4 `migrateTextsRead` | done in 5-2 (Global Constraints note); МИНА 1 addressed (no retro cards) |
| §5 task 6 — e2e fixes, full regression, version bump, release | 5, 6 |

**2. Placeholder scan:** Task 2's test edits are described by test-name (delete/keep/adjust) rather than pasted verbatim — acceptable because the instruction names each existing test and the exact assertion to drop; the implementer reads the file. Task 5 is inherently audit-then-fix (the specs' current seeding differs per file) — Step 1 says exactly what to grep and what each category becomes. Everything else has concrete code.

**3. Type consistency:** `DaySummary` (no `newCount`), `QueueItem` (`{itemType,itemId}`, no `kind`), `SessionStep` (no `learn`, no `item.kind`) are defined in Task 2's Produces block and consumed identically in Tasks 3 (`daySummary` fields) and via `buildDailySession` in `ReviewScreen`. `currentMandatoryLessonId(lessons, completedSet)` / `courseCompletedIds(user)` signatures match plan 5-2's `src/core/course.ts`. `review`/`newCard` signatures match `src/core/srs.ts` as quoted in Task 1.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-09-09-plan-5-3-srs-integration.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks. Task 2 is the risky one (big test blast-radius) — give it a capable model and a careful review.

**2. Inline Execution** — executing-plans, batch with checkpoints.

**Which approach?**
