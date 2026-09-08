# Plan 5-2: Lesson Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the migrated `content/lessons` data into a walkable graded-reading course — a `/course` screen listing lessons by `stage` with sequential gating, and a 5-step `/lesson/:id` player (New → Read → Comprehension → Reinforce → Summary) whose progress persists step-by-step — while `/texts` becomes a redirect to `/course`.

**Architecture:** Plan 5-1 already delivers the `Lesson` model, the four `lesson*` content.db tables, `ContentDb.listLessons()`/`getLesson(id)`, and the two `/texts` screens reading lesson data through a level-tab shim. This plan replaces those screens with a course flow. A new pure-logic module `src/core/course.ts` owns course progress (two `settings` keys: `course_completed_ids: string[]`, `course_progress: Record<lessonId, {step:number}>`), the sequential-gating rule (a lesson with `introducesCount > 0` is "mandatory" and forms a spine; free-reading lessons never gate), and the one-shot `texts_read_ids → course_completed_ids` migration. `CourseScreen` renders the gated list. `LessonScreen` is a 0..4 step state machine keyed on the route param (same remount trick as `PlacementRoute`), persisting `course_progress[id].step` after every step and calling `markLessonComplete` on the Summary step. Steps reuse the quiz engine unchanged: step 3 ("Reinforce") builds `Question[]` from a lesson's `introduces` via a new `src/core/quiz/lesson-reinforce.ts` — synthetic `GrammarPointFull` objects whose `examples` are the marker context sentences, fed to the existing `generateOfKind`, plus `genVocab*`/`genKanji*` directly. **No SRS cards are created in this plan** — the Summary step only records completion; card creation is plan 5-3.

**Tech Stack:** No new dependencies. React 18 + `react-router-dom` 6 (hash router, `future` v7 flags), `sql.js`-backed `UserDb`/`ContentDb`, the existing quiz engine (`src/core/quiz/*`), `Furigana`/`parseRuby`, Vitest + Playwright + ESLint + `tsc`.

**Spec:** `docs/superpowers/specs/2026-09-08-plan-5-graded-reading-course-design.md` — sections "Решение", "Декомпозиция на подпланы" (the 5-2 bullet), §2 (Плеер урока), §4 (Данные пользователя), §5 (the "План 5-2" task list), §6 (Тесты).

## Global Constraints

- **Scope boundary — 5-2 does NOT create SRS cards.** Spec §2.2 step 4 describes card creation "(§3)", but the decomposition note is authoritative: *"Итог: курс можно пройти, но карточки ещё не создаются, планировщик не меняется."* The Summary step calls `markLessonComplete(user, id)` only. `src/core/scheduler.ts`, `src/core/session.ts`, `src/ui/screens/TodayScreen.tsx`, `src/core/srs.ts` are **not touched** by this plan.
- **User-data keys (spec §4), no schema migration** (same pattern as `texts_read_ids`, `placement_marked_*_ids` — plain `settings` rows via `user.getSetting`/`setSetting`):
  - `course_completed_ids: string[]` — ids of finished lessons.
  - `course_progress: Record<lessonId, { step: number }>` — current step (0..4) of *unfinished* lessons only; an entry is deleted when the lesson is completed.
- **`texts_read_ids` migration (spec §4):** one-shot idempotent `migrateTextsRead(user)` in `UserDbProvider`, next to `migratePlacementMarks(db)`. If `texts_read_ids` is non-empty and `course_completed_ids` is empty, copy the ids across, then set `texts_read_ids` to `[]` (consume it — the plan-4h lesson: one-way migrations must extinguish the old key or it resurrects a cleared list every launch).
- **Route changes (spec §2.1):** `/course` → `CourseScreen`; `/lesson/:id` → `<LessonScreen key={id} />` via a `LessonRoute` wrapper (mirrors `PlacementRoute`); `/texts` → `<Navigate to="/course" replace />`; `/texts/:id` → a wrapper that reads `:id` and renders `<Navigate to={\`/lesson/${id}\`} replace />`. Nav item "Тексты" 📖 → "Курс" 📖, `to="/course"`. The `texts_read_ids` **key name stays** (only its value is migrated); route path strings `/texts` remain only inside the two redirects.
- **Gating (spec §1.4):**
  - Course order is `listLessons()` order, i.e. `(stage, id)`.
  - A lesson is **mandatory** iff `introducesCount > 0` (equivalently `!isFreeReading`). Mandatory lessons form a spine in course order: a mandatory lesson is *unlocked* iff every earlier mandatory lesson is in `course_completed_ids`. The **current** lesson is the first mandatory lesson not in `course_completed_ids`.
  - A **free-reading** lesson (`isFreeReading`, includes all 15 migrated texts) never gates. It is *unlocked* iff its `stage` ≤ the current mandatory lesson's `stage` — or unconditionally when there is no current mandatory lesson (every mandatory lesson done, or none exist). It is labelled "чтение", not "урок".
  - With today's content (15 free-reading lessons, 0 mandatory) every lesson is unlocked and nothing is "current".
- **5-step player (spec §2.2), step index stored in `course_progress[id].step`:**
  - **0 New** — for each `introduces` entry with `role === 'introduce'`: grammar → read-only "Кратко" block (`sectionBody(bodyMarkdown, 'Кратко')`); vocab → `FlashCard` (`headword` → reveal `reading` + `meaningRu`); kanji → `FlashCard` (`char` → reveal `onyomi`/`kunyomi` + `meaningRu`). Step is done when every card is marked "Понятно". **Skipped entirely when `introduces` is empty** (free reading).
  - **1 Read** — lesson body via `Furigana`; for `kind === 'dialogue'` render each `\n\n`-separated line as a speaker bubble. Marked `surface` strings are tappable spans → a bottom card showing the item's meaning/reading/"Кратко". A "Показать перевод" button reveals `translationRu`.
  - **2 Comprehension** — `questions` one at a time: choices, a coloured **and** textual verdict (`role="status"`), "Далее". A wrong answer does not block progression.
  - **3 Reinforce** — 2–3 auto-questions built from `introduces` (see `lesson-reinforce.ts`). Auto-graded with the existing `grade()`. The result does **not** touch FSRS. **Skipped when `introduces` is empty.**
  - **4 Summary** — "Урок пройден", `markLessonComplete(user, id)`, buttons "К курсу" / "Следующий урок" (the next unlocked lesson in course order, if any).
- **Reinforce question construction (spec §2.2 step 3):**
  - grammar `introduce` whose matching `lesson_markers` row has non-empty `sentenceRuby` **and** non-empty `sentenceRu` → synthetic `GrammarPointFull` = the real `content.getGrammar(id)` with `examples` replaced by `[{ jaRuby: sentenceRuby, ru: sentenceRu }]`, then `generateOfKind('cloze', synthetic, [], seed)` (its fallback chain covers assemble/choice). Wrapped in try/catch — on throw, that item contributes no question.
  - vocab `introduce` → `genVocabMeaning` / `genVocabReading` (`content.getVocab(id)`, `content.listVocab(level)`), context sentence shown above the question when a marker sentence exists.
  - kanji `introduce` → `genKanjiMeaning` / `genKanjiReading`.
  - Take the first 2–3 that produced a question, in `introduces` order.
- **Component reuse (spec §2.3):** extract `LessonReader` (body + markers + translation toggle) and `ComprehensionQuiz` (one-at-a-time question walk + verdict) out of the current `TextDetailScreen`; step 3 uses the existing `QuestionView` + `grade`; `FlashCard` (front / back / self-grade) is new.
- **Deleted at the end of the plan:** `src/ui/screens/TextsListScreen.tsx`, `src/ui/screens/TextDetailScreen.tsx`, `tests/ui/TextsListScreen.test.tsx`, `tests/ui/TextDetailScreen.test.tsx`, `tests/e2e/texts-browse.spec.ts`. The `STAGE_LEVEL_SPLIT` level-tab shim dies with `TextsListScreen`.
- **Node is on PATH** — run `npm`/`npx` directly, no prefix.
- **`content/**` and `resources/content.db` are git-ignored** (public repo, content local-only, established plan 4f). `npm run build-content` / the `pretest` hook rebuild `content.db` locally; never commit it. No content files change in this plan.
- **Furigana notation** `кандзи[чтение]` is parsed by `src/core/ruby.ts` `parseRuby` — do not modify the parser. Paragraphs are `"\n\n"`-separated; a dialogue line is one paragraph.
- **Carry-in from plan 5-1's final review (record in the 5-2 spec decisions / handle here):**
  - **FR-4 — marker position:** `lesson_markers` matches the tap target by `surface` string only; there is no char offset. **Ruling for this plan:** the marker-tap splitter matches each marker's `surface` at its *first not-yet-consumed* occurrence in document order (markers are stored ordered by `ord`). If a `surface` string does not occur in `bodyRuby` at all, that marker renders no tap target (no throw). This is the documented "first occurrence" rule; revisit only if 5-3+ authoring needs finer control.
  - **T6-A — narrow-window e2e:** the new `tests/e2e/course.spec.ts` must include a narrow-window (380px) assertion on the **reinforce step** (`.q-options` grid of choice buttons) that genuinely fails without `.q-opt { min-width: 0 }` — use a seeded lesson with a long unbreakable choice, or assert the computed `grid-template-columns` collapses to one track at ≤448px.
- **Final regression (last task) must run:** `npm run typecheck && npm run lint && npx vitest run && npm run build && npx playwright test && npm run build:desktop:installer` — the full set, not just vitest+playwright (session lesson: typecheck/lint-only breaks have surfaced solely at final review; the installer packaging validates electron-builder against the changed renderer bundle).
- **Baseline (measured on `main` at `8263640`, plan-5-1 complete):** `npx vitest run` → **52 files, 411 tests, all passing**. `tests/e2e/*.spec.ts` → **20 files, 29 tests** (`npx playwright test` green). Every task below states the exact test delta it adds; the final task re-measures and reports the true totals.

---

## File Structure

```
src/core/
  course.ts                        # NEW — course progress + gating + texts_read_ids migration (pure, no React/DOM)
  quiz/
    lesson-reinforce.ts            # NEW — buildReinforceQuestions(lesson, content, seed): ReinforceItem[]

src/ui/
  routes.tsx                       # MOD — + /course, /lesson/:id (+ LessonRoute), /texts & /texts/:id → redirects, drop the 2 text routes
  UserDbProvider.tsx               # MOD — + migrateTextsRead(db) call
  theme.css                        # MOD — + .course-*, .lesson-*, .flashcard-*, .dialogue-* rules
  components/
    Nav.tsx                        # MOD — "Тексты"/📖//texts → "Курс"/📖//course
    FlashCard.tsx                  # NEW — front → reveal → back + "Понятно"/"Ещё раз"
    LessonReader.tsx               # NEW — body render (text/dialogue) + tappable markers + translation toggle
    ComprehensionQuiz.tsx          # NEW — questions one-at-a-time + verdict + "Далее"/"Завершить"
  screens/
    CourseScreen.tsx               # NEW — /course, lessons grouped by stage with gating state
    LessonScreen.tsx               # NEW — /lesson/:id, 0..4 step machine, persist, Summary → markLessonComplete
    TextsListScreen.tsx            # DELETE (task 6)
    TextDetailScreen.tsx           # DELETE (task 6)

tests/
  core/
    course.test.ts                 # NEW
    lesson-reinforce.test.ts       # NEW
  ui/
    FlashCard.test.tsx             # NEW
    LessonReader.test.tsx          # NEW
    ComprehensionQuiz.test.tsx     # NEW
    CourseScreen.test.tsx          # NEW
    LessonScreen.test.tsx          # NEW
    Nav.test.tsx                   # MOD — expect "Курс" → /course
    TextsListScreen.test.tsx       # DELETE (task 6)
    TextDetailScreen.test.tsx      # DELETE (task 6)
  e2e/
    course.spec.ts                 # NEW — full lesson walk, redirects, free-reading, narrow-window
    texts-browse.spec.ts           # DELETE (task 6)
```

---

### Task 1: `src/core/course.ts` — course progress, gating, and the `texts_read_ids` migration

**Files:**
- Create: `src/core/course.ts`
- Test: `tests/core/course.test.ts`

**Interfaces:**
- Consumes: `LessonMeta` from `@/core/types` (`{ id, stage, kind, title, introducesCount, isFreeReading }`); the `UserDb` shape — only `getSetting<T>(key, fallback): T` and `setSetting(key, value): void` (see `src/storage/user-db.ts`).
- Produces (used by Tasks 2 and 6):
  - `type CourseLessonState = 'done' | 'current' | 'unlocked-reading' | 'locked'`
  - `interface CourseProgress { step: number }`
  - `getCourseStep(user: UserLike, lessonId: string): number` — `course_progress[lessonId].step ?? 0`
  - `setCourseStep(user: UserLike, lessonId: string, step: number): void` — merges `{step}` into `course_progress`
  - `markLessonComplete(user: UserLike, lessonId: string): void` — adds to `course_completed_ids` (dedup), deletes the `course_progress` entry
  - `isLessonComplete(user: UserLike, lessonId: string): boolean`
  - `courseCompletedIds(user: UserLike): string[]`
  - `courseLessonStates(lessons: readonly LessonMeta[], completedIds: ReadonlySet<string>): Map<string, CourseLessonState>`
  - `currentMandatoryLessonId(lessons: readonly LessonMeta[], completedIds: ReadonlySet<string>): string | null`
  - `nextUnlockedLessonId(lessons: readonly LessonMeta[], completedIds: ReadonlySet<string>, afterId: string): string | null`
  - `migrateTextsRead(user: UserLike): void`
  - `type UserLike = Pick<import('@/storage/user-db').UserDb, 'getSetting' | 'setSetting'>`

- [ ] **Step 1: Write the failing test**

Create `tests/core/course.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { LessonMeta } from '@/core/types';
import {
  getCourseStep, setCourseStep, markLessonComplete, isLessonComplete,
  courseCompletedIds, courseLessonStates, currentMandatoryLessonId,
  nextUnlockedLessonId, migrateTextsRead,
} from '@/core/course';

/** Minimal in-memory UserDb stand-in: settings only. */
function fakeUser(initial: Record<string, unknown> = {}) {
  const store = new Map<string, unknown>(Object.entries(initial));
  return {
    getSetting<T>(key: string, fallback: T): T {
      return store.has(key) ? (store.get(key) as T) : fallback;
    },
    setSetting(key: string, value: unknown): void {
      store.set(key, value);
    },
    _dump: () => Object.fromEntries(store),
  };
}

const meta = (id: string, stage: number, mandatory: boolean): LessonMeta => ({
  id, stage, kind: 'text', title: id,
  introducesCount: mandatory ? 2 : 0,
  isFreeReading: !mandatory,
});

describe('course progress', () => {
  it('getCourseStep defaults to 0 and round-trips through setCourseStep', () => {
    const u = fakeUser();
    expect(getCourseStep(u, 'l1')).toBe(0);
    setCourseStep(u, 'l1', 3);
    expect(getCourseStep(u, 'l1')).toBe(3);
    setCourseStep(u, 'l2', 1);
    expect(getCourseStep(u, 'l1')).toBe(3); // l2 write does not clobber l1
    expect(getCourseStep(u, 'l2')).toBe(1);
  });

  it('markLessonComplete adds to completed ids (deduped) and drops the progress entry', () => {
    const u = fakeUser();
    setCourseStep(u, 'l1', 4);
    markLessonComplete(u, 'l1');
    markLessonComplete(u, 'l1');
    expect(courseCompletedIds(u)).toEqual(['l1']);
    expect(isLessonComplete(u, 'l1')).toBe(true);
    expect(getCourseStep(u, 'l1')).toBe(0); // progress entry removed
    expect((u._dump()['course_progress'] as Record<string, unknown>)['l1']).toBeUndefined();
  });
});

describe('courseLessonStates gating', () => {
  // spine: m1(stage2) m2(stage6) mandatory; r-a(stage3) r-b(stage8) free reading
  const lessons: LessonMeta[] = [
    meta('m1', 2, true), meta('r-a', 3, false),
    meta('m2', 6, true), meta('r-b', 8, false),
  ];

  it('first mandatory is current, later mandatory locked, reading gated by current stage', () => {
    const s = courseLessonStates(lessons, new Set());
    expect(s.get('m1')).toBe('current');
    expect(s.get('m2')).toBe('locked');
    expect(s.get('r-a')).toBe('unlocked-reading'); // stage 3 <= current m1 stage 2? no -> see note
    expect(s.get('r-b')).toBe('locked');           // stage 8 > 2
  });

  it('completing m1 makes m2 current and unlocks readings up to m2 stage', () => {
    const s = courseLessonStates(lessons, new Set(['m1']));
    expect(s.get('m1')).toBe('done');
    expect(s.get('m2')).toBe('current');
    expect(s.get('r-a')).toBe('unlocked-reading'); // stage 3 <= 6
    expect(s.get('r-b')).toBe('locked');           // stage 8 > 6
  });

  it('all mandatory done: every reading unlocked, no current', () => {
    const s = courseLessonStates(lessons, new Set(['m1', 'm2']));
    expect(s.get('m1')).toBe('done');
    expect(s.get('m2')).toBe('done');
    expect(s.get('r-a')).toBe('unlocked-reading');
    expect(s.get('r-b')).toBe('unlocked-reading');
    expect(currentMandatoryLessonId(lessons, new Set(['m1', 'm2']))).toBeNull();
  });

  it('no mandatory lessons at all: everything is unlocked reading (today\'s 15-lesson state)', () => {
    const free = [meta('a', 2, false), meta('b', 40, false), meta('c', 52, false)];
    const s = courseLessonStates(free, new Set());
    expect([...s.values()]).toEqual(['unlocked-reading', 'unlocked-reading', 'unlocked-reading']);
    expect(currentMandatoryLessonId(free, new Set())).toBeNull();
  });

  it('currentMandatoryLessonId is the first uncompleted mandatory in (stage,id) order', () => {
    expect(currentMandatoryLessonId(lessons, new Set())).toBe('m1');
    expect(currentMandatoryLessonId(lessons, new Set(['m1']))).toBe('m2');
  });
});

describe('nextUnlockedLessonId', () => {
  const lessons: LessonMeta[] = [
    meta('m1', 2, true), meta('r-a', 3, false), meta('m2', 6, true),
  ];
  it('returns the next lesson in course order that is not locked', () => {
    // after finishing r-a, from a state where m1 done: m2 is current (unlocked)
    expect(nextUnlockedLessonId(lessons, new Set(['m1']), 'r-a')).toBe('m2');
  });
  it('returns null when nothing after afterId is unlocked', () => {
    // m1 not done -> m2 locked; nothing unlocked after r-a
    expect(nextUnlockedLessonId(lessons, new Set(), 'r-a')).toBeNull();
  });
});

describe('migrateTextsRead', () => {
  it('copies texts_read_ids into course_completed_ids and consumes the old key', () => {
    const u = fakeUser({ texts_read_ids: ['n5-hanami', 'n4-onsen'] });
    migrateTextsRead(u);
    expect(courseCompletedIds(u)).toEqual(['n5-hanami', 'n4-onsen']);
    expect(u.getSetting('texts_read_ids', [])).toEqual([]);
  });

  it('is a no-op when texts_read_ids is empty', () => {
    const u = fakeUser({ course_completed_ids: ['x'] });
    migrateTextsRead(u);
    expect(courseCompletedIds(u)).toEqual(['x']);
  });

  it('does not overwrite a non-empty course_completed_ids (already migrated / real progress)', () => {
    const u = fakeUser({ texts_read_ids: ['a'], course_completed_ids: ['b'] });
    migrateTextsRead(u);
    expect(courseCompletedIds(u)).toEqual(['b']);
    expect(u.getSetting('texts_read_ids', [])).toEqual([]); // still consumed
  });
});
```

> **Ruling on the `r-a`/`stage 3` case:** in the first gating test `m1` is `current` (stage 2) and `r-a` is stage 3 — `3 > 2`, so by the strict rule `r-a` would be `locked`. That is unhelpful (a reading one stage past the current lesson is unreachable forever until you finish `m1`). **Decision:** a free-reading lesson is `unlocked-reading` iff its `stage` ≤ **the largest stage among {current mandatory lesson} ∪ {completed lessons}**, OR there is no current mandatory lesson. With `m1` current at stage 2 and nothing completed, that ceiling is 2, so `r-a` (stage 3) is `locked`. The test above asserts `unlocked-reading` for `r-a` in the *first* case — **that assertion is wrong; fix the test to expect `'locked'`** and keep the "completing m1" case (`r-a` stage 3 ≤ m2 stage 6 → `unlocked-reading`). Implementer: make the code match the ceiling rule and correct that one test line.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/core/course.test.ts`
Expected: FAIL — `Cannot find module '@/core/course'`.

- [ ] **Step 3: Implement `src/core/course.ts`**

```typescript
import type { LessonMeta } from '@/core/types';
import type { UserDb } from '@/storage/user-db';

export type UserLike = Pick<UserDb, 'getSetting' | 'setSetting'>;

export type CourseLessonState = 'done' | 'current' | 'unlocked-reading' | 'locked';

export interface CourseProgress {
  step: number;
}

type ProgressMap = Record<string, CourseProgress>;

const K_COMPLETED = 'course_completed_ids';
const K_PROGRESS = 'course_progress';

export function courseCompletedIds(user: UserLike): string[] {
  return user.getSetting<string[]>(K_COMPLETED, []);
}

export function isLessonComplete(user: UserLike, lessonId: string): boolean {
  return courseCompletedIds(user).includes(lessonId);
}

export function getCourseStep(user: UserLike, lessonId: string): number {
  const map = user.getSetting<ProgressMap>(K_PROGRESS, {});
  return map[lessonId]?.step ?? 0;
}

export function setCourseStep(user: UserLike, lessonId: string, step: number): void {
  const map = { ...user.getSetting<ProgressMap>(K_PROGRESS, {}) };
  map[lessonId] = { step };
  user.setSetting(K_PROGRESS, map);
}

export function markLessonComplete(user: UserLike, lessonId: string): void {
  const done = new Set(courseCompletedIds(user));
  done.add(lessonId);
  user.setSetting(K_COMPLETED, [...done]);
  const map = { ...user.getSetting<ProgressMap>(K_PROGRESS, {}) };
  delete map[lessonId];
  user.setSetting(K_PROGRESS, map);
}

/** Mandatory lessons (introducesCount > 0) in course order. */
function mandatory(lessons: readonly LessonMeta[]): LessonMeta[] {
  return lessons.filter((l) => !l.isFreeReading);
}

export function currentMandatoryLessonId(
  lessons: readonly LessonMeta[],
  completedIds: ReadonlySet<string>,
): string | null {
  return mandatory(lessons).find((l) => !completedIds.has(l.id))?.id ?? null;
}

export function courseLessonStates(
  lessons: readonly LessonMeta[],
  completedIds: ReadonlySet<string>,
): Map<string, CourseLessonState> {
  const out = new Map<string, CourseLessonState>();
  const currentId = currentMandatoryLessonId(lessons, completedIds);
  const current = currentId ? lessons.find((l) => l.id === currentId) ?? null : null;

  // Ceiling for free-reading unlock: max stage among the current mandatory
  // lesson and everything already completed. Null current => no ceiling.
  const completedStages = lessons
    .filter((l) => completedIds.has(l.id))
    .map((l) => l.stage);
  const ceiling = current
    ? Math.max(current.stage, ...completedStages, current.stage)
    : null;

  // A mandatory lesson is unlocked iff every earlier mandatory lesson is done.
  let priorMandatoryPending = false;
  for (const l of lessons) {
    if (completedIds.has(l.id)) {
      out.set(l.id, 'done');
      continue;
    }
    if (!l.isFreeReading) {
      out.set(l.id, priorMandatoryPending ? 'locked' : 'current');
      priorMandatoryPending = true;
      continue;
    }
    // free reading
    if (ceiling === null || l.stage <= ceiling) out.set(l.id, 'unlocked-reading');
    else out.set(l.id, 'locked');
  }
  return out;
}

export function nextUnlockedLessonId(
  lessons: readonly LessonMeta[],
  completedIds: ReadonlySet<string>,
  afterId: string,
): string | null {
  const states = courseLessonStates(lessons, completedIds);
  const idx = lessons.findIndex((l) => l.id === afterId);
  if (idx === -1) return null;
  for (let i = idx + 1; i < lessons.length; i++) {
    const st = states.get(lessons[i]!.id);
    if (st === 'current' || st === 'unlocked-reading' || st === 'done') return lessons[i]!.id;
  }
  return null;
}

/**
 * One-shot idempotent migration of the plan-4c-2 `texts_read_ids` key into
 * `course_completed_ids`. Copies only when the target is still empty (a prior
 * migration or real course progress leaves it populated), then always consumes
 * the old key so it never re-fires (plan-4h lesson).
 */
export function migrateTextsRead(user: UserLike): void {
  const old = user.getSetting<string[]>('texts_read_ids', []);
  if (old.length === 0) return;
  if (courseCompletedIds(user).length === 0) {
    user.setSetting(K_COMPLETED, [...new Set(old)]);
  }
  user.setSetting('texts_read_ids', []);
}
```

> Note the `Math.max(current.stage, ...completedStages, current.stage)` repeats `current.stage` so `Math.max` never sees an empty spread (`completedStages` can be `[]`). Keep it or write `Math.max(current.stage, ...completedStages)` — `Math.max(2)` is fine, the repeat is just defensive; either is acceptable.

- [ ] **Step 4: Correct the one wrong test assertion**

In `tests/core/course.test.ts`, the test `'first mandatory is current, later mandatory locked, reading gated by current stage'` — change `expect(s.get('r-a')).toBe('unlocked-reading')` to `expect(s.get('r-a')).toBe('locked')` and update the trailing comment to `// stage 3 > ceiling 2`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/core/course.test.ts`
Expected: PASS — all `describe` blocks green.

- [ ] **Step 6: Run typecheck + full suite**

Run: `npm run typecheck && npx vitest run`
Expected: typecheck clean; 411 prior tests + this file's new tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/core/course.ts tests/core/course.test.ts
git commit -m "feat(course): course progress, gating rule, and texts_read_ids migration"
```

---

### Task 2: `CourseScreen` at `/course`

**Files:**
- Create: `src/ui/screens/CourseScreen.tsx`
- Modify: `src/ui/routes.tsx` (add the `/course` route; leave `/texts*` untouched for now)
- Modify: `src/ui/theme.css` (append `.course-*` rules)
- Test: `tests/ui/CourseScreen.test.tsx`

**Interfaces:**
- Consumes: `db.listLessons(): LessonMeta[]` (Task 5-1); `courseLessonStates`, `courseCompletedIds`, `currentMandatoryLessonId` from `@/core/course` (Task 1); `useContentDb`, `useUserDb`.
- Produces (used by Task 6's e2e + nav): a `/course` screen — heading "Курс", lessons in `listLessons()` order, each a `<Link to={\`/lesson/${id}\`}>` when not locked and a disabled `<span>` when locked, carrying a state label ("✓ пройден" / "текущий" / "чтение" / "🔒 закрыт"); the current mandatory lesson (if any) also renders a prominent "Продолжить" link at the top.

- [ ] **Step 1: Write the failing test**

Create `tests/ui/CourseScreen.test.tsx`:

```typescript
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter as BaseMemoryRouter } from 'react-router-dom';
import type { ComponentProps } from 'react';
import { ContentDbContext } from '@/ui/ContentDbProvider';

const FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true } as const;
const MemoryRouter = (p: ComponentProps<typeof BaseMemoryRouter>) => (
  <BaseMemoryRouter future={FUTURE} {...p} />
);

const completed: { value: string[] } = { value: [] };
vi.mock('@/ui/useUserDb', () => ({
  useUserDb: () => ({
    getSetting: (key: string, fb: unknown) =>
      key === 'course_completed_ids' ? completed.value : fb,
  }),
}));

import { CourseScreen } from '@/ui/screens/CourseScreen';
import type { LessonMeta, Level } from '@/core/types';

const levels: Level[] = [{ code: 'N5', ord: 1, status: 'available', titleRu: 'N5' }];
const lm = (id: string, stage: number, mandatory: boolean): LessonMeta => ({
  id, stage, kind: 'text', title: id.toUpperCase(),
  introducesCount: mandatory ? 2 : 0, isFreeReading: !mandatory,
});
const lessons: LessonMeta[] = [lm('m1', 2, true), lm('r1', 4, false), lm('m2', 8, true)];

const fakeDb = { listLessons: () => lessons } as unknown as import('@/storage/content-db').ContentDb;

function renderScreen() {
  return render(
    <ContentDbContext.Provider value={{ db: fakeDb, levels }}>
      <MemoryRouter><CourseScreen /></MemoryRouter>
    </ContentDbContext.Provider>,
  );
}

describe('CourseScreen', () => {
  beforeEach(() => { completed.value = []; });

  it('lists every lesson in course order with a state label', () => {
    const { getByRole, container } = renderScreen();
    expect(getByRole('heading', { name: 'Курс' })).toBeInTheDocument();
    const items = [...container.querySelectorAll('.course-item')];
    expect(items.map((el) => el.getAttribute('data-lesson'))).toEqual(['m1', 'r1', 'm2']);
    expect(items[0]).toHaveAttribute('data-state', 'current');
    expect(items[1]).toHaveAttribute('data-state', 'locked'); // r1 stage 4 > ceiling 2
    expect(items[2]).toHaveAttribute('data-state', 'locked');
  });

  it('renders a "Продолжить" link to the current mandatory lesson', () => {
    const { getByRole } = renderScreen();
    expect(getByRole('link', { name: /Продолжить/ })).toHaveAttribute('href', '/lesson/m1');
  });

  it('after m1 is completed, m2 is current and r1 becomes a reading link', () => {
    completed.value = ['m1'];
    const { container } = renderScreen();
    const byId = (id: string) => container.querySelector(`.course-item[data-lesson="${id}"]`)!;
    expect(byId('m1')).toHaveAttribute('data-state', 'done');
    expect(byId('m2')).toHaveAttribute('data-state', 'current');
    expect(byId('r1')).toHaveAttribute('data-state', 'unlocked-reading');
    expect(byId('r1').querySelector('a')).toHaveAttribute('href', '/lesson/r1');
  });

  it('a locked lesson is not a link', () => {
    const { container } = renderScreen();
    const locked = container.querySelector('.course-item[data-state="locked"]')!;
    expect(locked.querySelector('a')).toBeNull();
  });

  it('with only free-reading lessons every item is a reading link and there is no "Продолжить"', () => {
    (fakeDb as unknown as { listLessons: () => LessonMeta[] }).listLessons = () => [
      lm('a', 2, false), lm('b', 40, false),
    ];
    const { queryByRole, container } = renderScreen();
    expect(queryByRole('link', { name: /Продолжить/ })).toBeNull();
    expect([...container.querySelectorAll('.course-item')].every(
      (el) => el.getAttribute('data-state') === 'unlocked-reading',
    )).toBe(true);
    (fakeDb as unknown as { listLessons: () => LessonMeta[] }).listLessons = () => lessons;
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/ui/CourseScreen.test.tsx`
Expected: FAIL — `Cannot find module '@/ui/screens/CourseScreen'`.

- [ ] **Step 3: Implement `src/ui/screens/CourseScreen.tsx`**

```typescript
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useContentDb } from '../useContentDb';
import { useUserDb } from '../useUserDb';
import {
  courseCompletedIds, courseLessonStates, currentMandatoryLessonId,
  type CourseLessonState,
} from '@/core/course';

const STATE_LABEL: Record<CourseLessonState, string> = {
  done: '✓ пройден',
  current: 'текущий',
  'unlocked-reading': 'чтение',
  locked: '🔒 закрыт',
};

export function CourseScreen() {
  const db = useContentDb();
  const user = useUserDb();
  const lessons = useMemo(() => db.listLessons(), [db]);
  const completed = user.getSetting<string[]>('course_completed_ids', []);
  const completedSet = useMemo(() => new Set(completed), [completed]);
  const states = useMemo(
    () => courseLessonStates(lessons, completedSet),
    [lessons, completedSet],
  );
  const currentId = useMemo(
    () => currentMandatoryLessonId(lessons, completedSet),
    [lessons, completedSet],
  );
  const current = currentId ? lessons.find((l) => l.id === currentId) ?? null : null;

  return (
    <section className="screen course">
      <h1>Курс</h1>

      {current && (
        <Link to={`/lesson/${current.id}`} className="btn-primary course-continue">
          Продолжить · этап {current.stage}: {current.title}
        </Link>
      )}

      <ul className="course-list">
        {lessons.map((l) => {
          const state = states.get(l.id) ?? 'locked';
          const label = STATE_LABEL[state];
          const inner = (
            <>
              <span className="course-item-title">{l.title}</span>
              <span className="course-item-state" data-state={state}>{label}</span>
            </>
          );
          return (
            <li key={l.id} className="course-item" data-lesson={l.id} data-state={state}>
              {state === 'locked' ? (
                <span className="course-item-link course-item-link--locked" aria-disabled>
                  {inner}
                </span>
              ) : (
                <Link to={`/lesson/${l.id}`} className="course-item-link">{inner}</Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Add the `/course` route**

In `src/ui/routes.tsx`: add the import `import { CourseScreen } from './screens/CourseScreen';` and, in the `routes` array, add `{ path: '/course', element: <CourseScreen /> },` immediately before the `{ path: '/texts', ... }` line. Leave `/texts` and `/texts/:id` exactly as they are for now (Task 6 converts them).

- [ ] **Step 5: Append CSS**

Append to the end of `src/ui/theme.css`:

```css
/* --- Plan 5-2: course + lesson player --- */
.course-continue { display: block; margin: 0.5rem 0 1.25rem; text-align: center; }
.course-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem; }
.course-item-link {
  display: flex; justify-content: space-between; align-items: center; gap: 0.75rem;
  padding: 0.75rem 1rem; border: 1px solid var(--border); border-radius: 0.5rem;
  text-decoration: none; color: var(--text);
}
.course-item-link--locked { opacity: 0.55; }
.course-item-title { flex: 1; font-weight: 500; overflow-wrap: anywhere; }
.course-item-state { font-size: 0.85rem; color: var(--muted); white-space: nowrap; }
.course-item-state[data-state='current'] { color: var(--accent); font-weight: 600; }
.course-item-state[data-state='done'] { color: var(--ok); }
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/ui/CourseScreen.test.tsx && npm run typecheck && npm run lint`
Expected: CourseScreen tests pass; typecheck + lint clean.

- [ ] **Step 7: Commit**

```bash
git add src/ui/screens/CourseScreen.tsx src/ui/routes.tsx src/ui/theme.css tests/ui/CourseScreen.test.tsx
git commit -m "feat(course): CourseScreen at /course with gated lesson list"
```

---

### Task 3: `FlashCard` component + the "New" step (`LessonNewStep`)

**Files:**
- Create: `src/ui/components/FlashCard.tsx`
- Create: `src/ui/components/LessonNewStep.tsx`
- Modify: `src/ui/theme.css` (append `.flashcard-*`, `.lesson-new-*` rules)
- Test: `tests/ui/FlashCard.test.tsx`
- Test: `tests/ui/LessonNewStep.test.tsx`

**Interfaces:**
- Consumes: `LessonIntroduce` (`{ type, id, role }`) from `@/core/types`; `ContentDb.getGrammar`/`getKanji`/`getVocab`; `sectionBody` from `@/core/quiz/grammar-questions`; `Furigana`.
- Produces (used by Task 6's `LessonScreen`):
  - `FlashCard({ front, back, onKnown, onAgain }: { front: ReactNode; back: ReactNode; onKnown: () => void; onAgain: () => void })` — shows `front` + a "Показать" button; after reveal shows `back` + "Понятно" (calls `onKnown`) / "Ещё раз" (calls `onAgain`).
  - `LessonNewStep({ introduces, onDone }: { introduces: LessonIntroduce[]; onDone: () => void })` — renders grammar "Кратко" blocks (read-only) followed by a queue of vocab/kanji flash cards; "Ещё раз" requeues that card at the end; calls `onDone` once every flash card has been marked "Понятно" (and immediately if there are no flash cards — but the parent only mounts this step when `introduces` is non-empty).

- [ ] **Step 1: Write the failing `FlashCard` test**

Create `tests/ui/FlashCard.test.tsx`:

```typescript
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FlashCard } from '@/ui/components/FlashCard';

describe('FlashCard', () => {
  it('hides the back until "Показать", then offers "Понятно"/"Ещё раз"', () => {
    const onKnown = vi.fn();
    const onAgain = vi.fn();
    render(<FlashCard front={<span>おおきい</span>} back={<span>большой</span>} onKnown={onKnown} onAgain={onAgain} />);
    expect(screen.queryByText('большой')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Показать' }));
    expect(screen.getByText('большой')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Понятно' }));
    expect(onKnown).toHaveBeenCalledTimes(1);
    expect(onAgain).not.toHaveBeenCalled();
  });

  it('"Ещё раз" calls onAgain', () => {
    const onKnown = vi.fn();
    const onAgain = vi.fn();
    render(<FlashCard front={<span>f</span>} back={<span>b</span>} onKnown={onKnown} onAgain={onAgain} />);
    fireEvent.click(screen.getByRole('button', { name: 'Показать' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ещё раз' }));
    expect(onAgain).toHaveBeenCalledTimes(1);
    expect(onKnown).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/ui/FlashCard.test.tsx`
Expected: FAIL — `Cannot find module '@/ui/components/FlashCard'`.

- [ ] **Step 3: Implement `src/ui/components/FlashCard.tsx`**

```typescript
import { useState, type ReactNode } from 'react';

export function FlashCard({
  front, back, onKnown, onAgain,
}: {
  front: ReactNode;
  back: ReactNode;
  onKnown: () => void;
  onAgain: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="flashcard">
      <div className="flashcard-front">{front}</div>
      {revealed ? (
        <>
          <div className="flashcard-back">{back}</div>
          <div className="flashcard-actions">
            <button type="button" className="btn-ghost" onClick={onAgain}>Ещё раз</button>
            <button type="button" className="btn-primary" onClick={onKnown}>Понятно</button>
          </div>
        </>
      ) : (
        <button type="button" className="btn-primary" onClick={() => setRevealed(true)}>
          Показать
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write the failing `LessonNewStep` test**

Create `tests/ui/LessonNewStep.test.tsx`:

```typescript
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ContentDbContext } from '@/ui/ContentDbProvider';
import type { Level, LessonIntroduce } from '@/core/types';

vi.mock('@/ui/useUserDb', () => ({ useUserDb: () => ({ getSetting: (_k: string, fb: unknown) => fb }) }));

import { LessonNewStep } from '@/ui/components/LessonNewStep';

const levels: Level[] = [{ code: 'N5', ord: 1, status: 'available', titleRu: 'N5' }];
const fakeDb = {
  getGrammar: (id: string) =>
    id === 'g1' ? { id, title: 'は (тема)', bodyMarkdown: '## Кратко\nМаркер темы предложения.\n\n## Примеры\n- x' } : null,
  getVocab: (id: string) =>
    id === 'v1' ? { id, headword: '朝', reading: 'あさ', pos: 'сущ.', meaningRu: 'утро', level: 'N5' } : null,
  getKanji: (id: string) =>
    id === 'k1' ? { id, char: '朝', onyomi: ['チョウ'], kunyomi: ['あさ'], meaningRu: 'утро', strokeCount: 12, level: 'N5' } : null,
} as unknown as import('@/storage/content-db').ContentDb;

function renderStep(introduces: LessonIntroduce[], onDone = vi.fn()) {
  const utils = render(
    <ContentDbContext.Provider value={{ db: fakeDb, levels }}>
      <LessonNewStep introduces={introduces} onDone={onDone} />
    </ContentDbContext.Provider>,
  );
  return { ...utils, onDone };
}

describe('LessonNewStep', () => {
  it('shows the grammar "Кратко" text read-only (no reveal button for it)', () => {
    renderStep([{ type: 'grammar', id: 'g1', role: 'introduce' }]);
    expect(screen.getByText(/Маркер темы предложения/)).toBeInTheDocument();
  });

  it('calls onDone only after every vocab/kanji flash card is marked "Понятно"', () => {
    const { onDone } = renderStep([
      { type: 'vocab', id: 'v1', role: 'introduce' },
      { type: 'kanji', id: 'k1', role: 'introduce' },
    ]);
    // card 1
    fireEvent.click(screen.getByRole('button', { name: 'Показать' }));
    fireEvent.click(screen.getByRole('button', { name: 'Понятно' }));
    expect(onDone).not.toHaveBeenCalled();
    // card 2
    fireEvent.click(screen.getByRole('button', { name: 'Показать' }));
    fireEvent.click(screen.getByRole('button', { name: 'Понятно' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('"Ещё раз" requeues the card so onDone waits for it', () => {
    const { onDone } = renderStep([{ type: 'vocab', id: 'v1', role: 'introduce' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Показать' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ещё раз' }));
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Показать' }));
    fireEvent.click(screen.getByRole('button', { name: 'Понятно' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('calls onDone immediately when there are only grammar introduces (no flash cards)', () => {
    const { onDone } = renderStep([{ type: 'grammar', id: 'g1', role: 'introduce' }]);
    fireEvent.click(screen.getByRole('button', { name: /Дальше|Продолжить/ }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 5: Run to verify it fails**

Run: `npx vitest run tests/ui/LessonNewStep.test.tsx`
Expected: FAIL — `Cannot find module '@/ui/components/LessonNewStep'`.

- [ ] **Step 6: Implement `src/ui/components/LessonNewStep.tsx`**

```typescript
import { useMemo, useState } from 'react';
import type { LessonIntroduce } from '@/core/types';
import { useContentDb } from '../useContentDb';
import { sectionBody } from '@/core/quiz/grammar-questions';
import { Furigana } from './Furigana';
import { FlashCard } from './FlashCard';

interface Flash {
  key: string;
  front: React.ReactNode;
  back: React.ReactNode;
}

export function LessonNewStep({
  introduces, onDone,
}: {
  introduces: LessonIntroduce[];
  onDone: () => void;
}) {
  const db = useContentDb();

  const grammarBlocks = useMemo(
    () =>
      introduces
        .filter((it) => it.type === 'grammar' && it.role === 'introduce')
        .map((it) => {
          const g = db.getGrammar(it.id);
          const brief = g ? sectionBody(g.bodyMarkdown, 'Кратко') : null;
          return g && brief ? { id: it.id, title: g.title, brief } : null;
        })
        .filter((x): x is { id: string; title: string; brief: string } => x !== null),
    [introduces, db],
  );

  const flashes = useMemo<Flash[]>(() => {
    const out: Flash[] = [];
    for (const it of introduces) {
      if (it.role !== 'introduce') continue;
      if (it.type === 'vocab') {
        const v = db.getVocab(it.id);
        if (v) out.push({
          key: `vocab:${it.id}`,
          front: <span className="flashcard-word"><Furigana text={v.headword} /></span>,
          back: <span>{v.reading} — {v.meaningRu}</span>,
        });
      } else if (it.type === 'kanji') {
        const k = db.getKanji(it.id);
        if (k) out.push({
          key: `kanji:${it.id}`,
          front: <span className="flashcard-word flashcard-kanji">{k.char}</span>,
          back: <span>{[...k.onyomi, ...k.kunyomi].join(' · ')} — {k.meaningRu}</span>,
        });
      }
    }
    return out;
  }, [introduces, db]);

  const [queue, setQueue] = useState<Flash[]>(() => flashes);
  const [pos, setPos] = useState(0);

  const current = queue[pos] ?? null;
  const noFlashes = flashes.length === 0;

  const advance = () => setPos((p) => p + 1);
  const requeue = () => {
    setQueue((q) => [...q, q[pos]!]);
    advance();
  };

  const doneWithFlashes = !noFlashes && pos >= queue.length;

  return (
    <div className="lesson-new">
      {grammarBlocks.map((g) => (
        <div key={g.id} className="lesson-new-grammar">
          <h3>{g.title}</h3>
          <p>{g.brief}</p>
        </div>
      ))}

      {noFlashes ? (
        <button type="button" className="btn-primary" onClick={onDone}>Дальше</button>
      ) : doneWithFlashes ? (
        <button type="button" className="btn-primary" onClick={onDone}>Дальше</button>
      ) : current ? (
        <FlashCard
          key={`${current.key}:${pos}`}
          front={current.front}
          back={current.back}
          onKnown={advance}
          onAgain={requeue}
        />
      ) : null}
    </div>
  );
}
```

> The test `'calls onDone immediately when there are only grammar introduces'` clicks a button named `/Дальше|Продолжить/` — the implementation's no-flashes branch renders "Дальше", which matches. The other tests never render that branch. Keep the button label "Дальше" for both the no-flashes and the flashes-done branches.

- [ ] **Step 7: Append CSS**

Append to `src/ui/theme.css`:

```css
.flashcard {
  border: 1px solid var(--border); border-radius: 0.5rem; padding: 1.25rem;
  display: flex; flex-direction: column; gap: 0.75rem; align-items: center; text-align: center;
}
.flashcard-word { font-size: 1.6rem; font-family: var(--font-ja); }
.flashcard-kanji { font-size: 2.4rem; }
.flashcard-actions { display: flex; gap: 0.75rem; flex-wrap: wrap; justify-content: center; }
.lesson-new { display: flex; flex-direction: column; gap: 1rem; }
.lesson-new-grammar { border-left: 3px solid var(--accent); padding-left: 0.75rem; }
.lesson-new-grammar h3 { margin: 0 0 0.25rem; font-size: 1rem; }
```

- [ ] **Step 8: Run the tests + typecheck + lint**

Run: `npx vitest run tests/ui/FlashCard.test.tsx tests/ui/LessonNewStep.test.tsx && npm run typecheck && npm run lint`
Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add src/ui/components/FlashCard.tsx src/ui/components/LessonNewStep.tsx src/ui/theme.css tests/ui/FlashCard.test.tsx tests/ui/LessonNewStep.test.tsx
git commit -m "feat(course): FlashCard + LessonNewStep (player step 0)"
```

---

### Task 4: `LessonReader` + `ComprehensionQuiz` (extracted) — player steps 1 & 2

**Files:**
- Create: `src/ui/components/LessonReader.tsx`
- Create: `src/ui/components/ComprehensionQuiz.tsx`
- Modify: `src/ui/theme.css` (append `.lesson-read-*`, `.dialogue-*`, `.lesson-marker*` rules)
- Test: `tests/ui/LessonReader.test.tsx`
- Test: `tests/ui/ComprehensionQuiz.test.tsx`

**Interfaces:**
- Consumes: `LessonFull` fields `bodyRuby`, `translationRu`, `kind`, `markers` (`LessonMarker[]`), `questions` (`LessonQuestion[]`); `ContentDb.getGrammar`/`getKanji`/`getVocab` (for the marker popover); `sectionBody`; `Furigana`.
- Produces (used by Task 6):
  - `LessonReader({ lesson }: { lesson: LessonFull })` — renders the body (text → paragraphs; dialogue → speaker bubbles), wraps each `marker.surface` occurrence (first, document order) in a `<button class="lesson-marker">`; clicking one toggles a `.lesson-marker-card` below the body with that item's gloss (vocab: `reading — meaningRu`; kanji: `onyomi/kunyomi — meaningRu`; grammar: "Кратко"). A "Показать перевод" / "Скрыть перевод" button toggles `translationRu` (paragraph-split).
  - `ComprehensionQuiz({ questions, onFinish }: { questions: LessonQuestion[]; onFinish: () => void })` — one question at a time; on answer, a coloured + `role="status"` verdict ("Верно"/"Неверно") and a "Далее" (or "Завершить" on the last) button; "Завершить" calls `onFinish`. Wrong answers do not block.

- [ ] **Step 1: Write the failing `LessonReader` test**

Create `tests/ui/LessonReader.test.tsx`:

```typescript
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ContentDbContext } from '@/ui/ContentDbProvider';
import type { Level, LessonFull } from '@/core/types';

vi.mock('@/ui/useUserDb', () => ({ useUserDb: () => ({ getSetting: (_k: string, fb: unknown) => fb }) }));

import { LessonReader } from '@/ui/components/LessonReader';

const levels: Level[] = [{ code: 'N5', ord: 1, status: 'available', titleRu: 'N5' }];
const fakeDb = {
  getVocab: (id: string) =>
    id === 'v-asa' ? { id, headword: '朝', reading: 'あさ', pos: 'сущ.', meaningRu: 'утро', level: 'N5' } : null,
  getGrammar: () => null,
  getKanji: () => null,
} as unknown as import('@/storage/content-db').ContentDb;

const base = (over: Partial<LessonFull> = {}): LessonFull => ({
  id: 'l1', stage: 3, kind: 'text', title: 'T', introducesCount: 0, isFreeReading: true,
  bodyRuby: '毎朝[まいあさ] 朝[あさ]を 食[た]べます。\n\n二[ふた]つ目[め]。',
  translationRu: 'Каждое утро ем завтрак.\n\nВторой абзац.',
  questions: [], introduces: [], markers: [], ...over,
});

function renderReader(lesson: LessonFull) {
  return render(
    <ContentDbContext.Provider value={{ db: fakeDb, levels }}>
      <LessonReader lesson={lesson} />
    </ContentDbContext.Provider>,
  );
}

describe('LessonReader', () => {
  it('renders body paragraphs with furigana and hides the translation until toggled', () => {
    const { container } = renderReader(base());
    expect(container.querySelectorAll('.lesson-read-paragraph')).toHaveLength(2);
    expect(container.querySelector('ruby')).not.toBeNull();
    expect(screen.queryByText('Каждое утро ем завтрак.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Показать перевод' }));
    expect(screen.getByText('Каждое утро ем завтрак.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Скрыть перевод' }));
    expect(screen.queryByText('Каждое утро ем завтрак.')).toBeNull();
  });

  it('renders dialogue lines as speaker bubbles', () => {
    const { container } = renderReader(base({
      kind: 'dialogue',
      bodyRuby: 'A: おはよう。\n\nB: おはようございます。',
      translationRu: 'A: Доброе утро.\n\nB: Доброе утро (вежл.).',
    }));
    const bubbles = container.querySelectorAll('.dialogue-line');
    expect(bubbles).toHaveLength(2);
    expect(bubbles[0]).toHaveAttribute('data-speaker', 'A');
  });

  it('a marked surface is a button that opens a gloss card', () => {
    renderReader(base({
      markers: [{
        type: 'vocab', id: 'v-asa', surface: '朝[あさ]',
        sentenceRuby: '毎朝[まいあさ] 朝[あさ]を 食[た]べます。', sentenceRu: 'Каждое утро ем завтрак.',
      }],
    }));
    const marker = screen.getByRole('button', { name: /朝/ });
    fireEvent.click(marker);
    expect(screen.getByText(/あさ — утро/)).toBeInTheDocument();
  });

  it('a marker whose surface is absent from the body renders no tap target and does not throw', () => {
    expect(() =>
      renderReader(base({
        markers: [{ type: 'vocab', id: 'v-asa', surface: '存在[そんざい]しない', sentenceRuby: 'x', sentenceRu: 'y' }],
      })),
    ).not.toThrow();
    expect(screen.queryByRole('button', { name: /存在/ })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/ui/LessonReader.test.tsx`
Expected: FAIL — `Cannot find module '@/ui/components/LessonReader'`.

- [ ] **Step 3: Implement `src/ui/components/LessonReader.tsx`**

```typescript
import { useMemo, useState } from 'react';
import type { LessonFull, LessonMarker } from '@/core/types';
import { useContentDb } from '../useContentDb';
import { sectionBody } from '@/core/quiz/grammar-questions';
import { Furigana } from './Furigana';

const SPEAKER = /^([A-Za-zА-Яа-я]{1,8}):\s*/;

/** Split one paragraph on the given marker surfaces, first occurrence, in order. */
function splitParagraph(text: string, markers: LessonMarker[]): Array<
  { kind: 'text'; value: string } | { kind: 'marker'; marker: LessonMarker }
> {
  const parts: Array<{ kind: 'text'; value: string } | { kind: 'marker'; marker: LessonMarker }> = [];
  let rest = text;
  // markers already in document order; consume each at its first occurrence in `rest`
  const pending = [...markers];
  while (rest.length > 0 && pending.length > 0) {
    // find the earliest-occurring still-pending marker in `rest`
    let bestIdx = -1;
    let bestAt = Infinity;
    pending.forEach((m, i) => {
      const at = rest.indexOf(m.surface);
      if (at !== -1 && at < bestAt) { bestAt = at; bestIdx = i; }
    });
    if (bestIdx === -1) break;
    const m = pending.splice(bestIdx, 1)[0]!;
    if (bestAt > 0) parts.push({ kind: 'text', value: rest.slice(0, bestAt) });
    parts.push({ kind: 'marker', marker: m });
    rest = rest.slice(bestAt + m.surface.length);
  }
  if (rest.length > 0) parts.push({ kind: 'text', value: rest });
  return parts;
}

export function LessonReader({ lesson }: { lesson: LessonFull }) {
  const db = useContentDb();
  const [translationShown, setTranslationShown] = useState(false);
  const [openMarker, setOpenMarker] = useState<string | null>(null);

  const paragraphs = useMemo(() => lesson.bodyRuby.split('\n\n'), [lesson.bodyRuby]);
  const translationParas = useMemo(() => lesson.translationRu.split('\n\n'), [lesson.translationRu]);

  // assign each marker to the first paragraph its surface appears in
  const markersByPara = useMemo(() => {
    const map = new Map<number, LessonMarker[]>();
    const remaining = [...lesson.markers];
    paragraphs.forEach((p, i) => {
      const here = remaining.filter((m) => p.includes(m.surface));
      for (const m of here) remaining.splice(remaining.indexOf(m), 1);
      if (here.length) map.set(i, here);
    });
    return map;
  }, [lesson.markers, paragraphs]);

  const glossFor = (m: LessonMarker): string => {
    if (m.type === 'vocab') {
      const v = db.getVocab(m.id);
      return v ? `${v.reading} — ${v.meaningRu}` : m.id;
    }
    if (m.type === 'kanji') {
      const k = db.getKanji(m.id);
      return k ? `${[...k.onyomi, ...k.kunyomi].join(' · ')} — ${k.meaningRu}` : m.id;
    }
    const g = db.getGrammar(m.id);
    return (g && sectionBody(g.bodyMarkdown, 'Кратко')) || m.id;
  };

  const renderParagraph = (text: string, paraIdx: number) => {
    const speakerMatch = lesson.kind === 'dialogue' ? text.match(SPEAKER) : null;
    const speaker = speakerMatch ? speakerMatch[1]! : null;
    const body = speaker ? text.slice(speakerMatch![0].length) : text;
    const segs = splitParagraph(body, markersByPara.get(paraIdx) ?? []);
    const inner = segs.map((s, i) =>
      s.kind === 'text' ? (
        <Furigana key={i} text={s.value} />
      ) : (
        <button
          key={i}
          type="button"
          className="lesson-marker"
          onClick={() => setOpenMarker((cur) => (cur === s.marker.id ? null : s.marker.id))}
        >
          <Furigana text={s.marker.surface} />
        </button>
      ),
    );
    if (speaker) {
      return (
        <p key={paraIdx} className="dialogue-line" data-speaker={speaker}>
          <span className="dialogue-speaker">{speaker}</span>
          <span className="dialogue-text">{inner}</span>
        </p>
      );
    }
    return <p key={paraIdx} className="lesson-read-paragraph">{inner}</p>;
  };

  const openMk = lesson.markers.find((m) => m.id === openMarker) ?? null;

  return (
    <div className="lesson-read">
      <div className="lesson-read-body">
        {paragraphs.map((p, i) => renderParagraph(p, i))}
      </div>

      {openMk && (
        <div className="lesson-marker-card" role="note">
          <strong><Furigana text={openMk.surface} /></strong>
          <span>{glossFor(openMk)}</span>
        </div>
      )}

      <button
        type="button"
        className="btn-ghost"
        onClick={() => setTranslationShown((s) => !s)}
      >
        {translationShown ? 'Скрыть перевод' : 'Показать перевод'}
      </button>
      {translationShown && (
        <div className="lesson-read-translation">
          {translationParas.map((p, i) => <p key={i}>{p}</p>)}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write the failing `ComprehensionQuiz` test**

Create `tests/ui/ComprehensionQuiz.test.tsx`:

```typescript
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { LessonQuestion } from '@/core/types';
import { ComprehensionQuiz } from '@/ui/components/ComprehensionQuiz';

const qs: LessonQuestion[] = [
  { prompt: 'Вопрос 1?', choices: ['A', 'B', 'C'], answerIndex: 1 },
  { prompt: 'Вопрос 2?', choices: ['D', 'E', 'F'], answerIndex: 0 },
];

describe('ComprehensionQuiz', () => {
  it('walks questions one at a time and finishes on the last', () => {
    const onFinish = vi.fn();
    render(<ComprehensionQuiz questions={qs} onFinish={onFinish} />);
    expect(screen.getByText('Вопрос 1?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'A' })); // wrong
    expect(screen.getByRole('status')).toHaveTextContent('Неверно');
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));

    expect(screen.getByText('Вопрос 2?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'D' })); // correct
    expect(screen.getByRole('status')).toHaveTextContent('Верно');
    fireEvent.click(screen.getByRole('button', { name: 'Завершить' }));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('marks the correct and picked-wrong choice after answering', () => {
    const { container } = render(<ComprehensionQuiz questions={qs} onFinish={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    const opts = container.querySelectorAll('.q-opt');
    expect(opts[0]).toHaveClass('opt-wrong');
    expect(opts[1]).toHaveClass('opt-correct');
  });
});
```

- [ ] **Step 5: Run to verify it fails**

Run: `npx vitest run tests/ui/ComprehensionQuiz.test.tsx`
Expected: FAIL — `Cannot find module '@/ui/components/ComprehensionQuiz'`.

- [ ] **Step 6: Implement `src/ui/components/ComprehensionQuiz.tsx`**

```typescript
import { useState } from 'react';
import type { LessonQuestion } from '@/core/types';

export function ComprehensionQuiz({
  questions, onFinish,
}: {
  questions: LessonQuestion[];
  onFinish: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);

  const q = questions[idx];
  if (!q) return null;

  const last = idx + 1 >= questions.length;

  const choose = (i: number) => {
    if (picked !== null) return;
    setPicked(i);
  };
  const next = () => {
    if (last) { onFinish(); return; }
    setIdx((n) => n + 1);
    setPicked(null);
  };

  return (
    <div className="q comprehension-q">
      <p className="q-prompt">{q.prompt}</p>
      <div className="q-options">
        {q.choices.map((c, i) => {
          const cls = ['q-opt'];
          if (picked !== null) {
            if (i === q.answerIndex) cls.push('opt-correct');
            else if (i === picked) cls.push('opt-wrong');
          }
          return (
            <button
              key={i}
              type="button"
              className={cls.join(' ')}
              disabled={picked !== null}
              onClick={() => choose(i)}
            >
              {c}
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <>
          <p
            className={picked === q.answerIndex ? 'verdict-ok' : 'verdict-bad'}
            role="status"
          >
            {picked === q.answerIndex ? 'Верно' : 'Неверно'}
          </p>
          <button type="button" className="btn-primary" onClick={next}>
            {last ? 'Завершить' : 'Далее'}
          </button>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Append CSS**

Append to `src/ui/theme.css`:

```css
.lesson-read { display: flex; flex-direction: column; gap: 1rem; }
.lesson-read-body { font-family: var(--font-ja); line-height: 2; }
.lesson-read-paragraph { margin: 0 0 1em; }
.lesson-read-translation { color: var(--muted); }
.lesson-read-translation p { margin: 0 0 0.6em; }
.lesson-marker {
  border: none; background: none; padding: 0; font: inherit; color: var(--accent);
  border-bottom: 1px dashed var(--accent); cursor: pointer;
}
.lesson-marker-card {
  border: 1px solid var(--border); border-radius: 0.5rem; padding: 0.75rem 1rem;
  display: flex; flex-direction: column; gap: 0.25rem;
}
.dialogue-line { display: flex; gap: 0.5rem; margin: 0 0 0.75em; align-items: baseline; }
.dialogue-speaker { font-weight: 700; color: var(--muted); flex: none; }
.dialogue-text { overflow-wrap: anywhere; }
.comprehension-q .q-prompt { font-weight: 500; }
```

- [ ] **Step 8: Run the tests + typecheck + lint**

Run: `npx vitest run tests/ui/LessonReader.test.tsx tests/ui/ComprehensionQuiz.test.tsx && npm run typecheck && npm run lint`
Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add src/ui/components/LessonReader.tsx src/ui/components/ComprehensionQuiz.tsx src/ui/theme.css tests/ui/LessonReader.test.tsx tests/ui/ComprehensionQuiz.test.tsx
git commit -m "feat(course): LessonReader + ComprehensionQuiz (player steps 1-2)"
```

---

### Task 5: `lesson-reinforce.ts` + the "Reinforce" step (`LessonReinforceStep`)

**Files:**
- Create: `src/core/quiz/lesson-reinforce.ts`
- Create: `src/ui/components/LessonReinforceStep.tsx`
- Modify: `src/ui/theme.css` (append `.reinforce-*` rules)
- Test: `tests/core/lesson-reinforce.test.ts`
- Test: `tests/ui/LessonReinforceStep.test.tsx`

**Interfaces:**
- Consumes: `LessonFull` (`introduces`, `markers`); `ContentDb` methods `getGrammar` (returns `GrammarPointFull` — `GrammarPoint & { relatedTitles }`), `getVocab`, `getKanji`, `listVocab`, `listKanji`; `generateOfKind` from `@/core/quiz/registry`; `genVocabMeaning`/`genVocabReading` from `@/core/quiz/vocab-questions`; `genKanjiMeaning`/`genKanjiReading` from `@/core/quiz/kanji-questions`; `Question` from `@/core/quiz/types`; `grade` from `@/core/quiz/grade`; `QuestionView`.
- Produces (used by Task 6):
  - `interface ReinforceItem { question: Question; contextRu: string }` — `contextRu` is the marker's `sentenceRu` for grammar/vocab (or `''`), shown above the question.
  - `buildReinforceQuestions(lesson: LessonFull, content: ReinforceContent, seed: string): ReinforceItem[]` — at most 3, in `introduces` order, skipping any item that produced nothing. `type ReinforceContent = Pick<ContentDb, 'getGrammar' | 'getVocab' | 'getKanji' | 'listVocab' | 'listKanji'>`.
  - `LessonReinforceStep({ lesson, onDone }: { lesson: LessonFull; onDone: () => void })` — walks the `ReinforceItem[]` with `QuestionView` + `grade`, "Далее"/"Завершить"; calls `onDone` at the end. If the list is empty, renders a "Дальше" button that calls `onDone` immediately (the parent only mounts this step when `introduces` is non-empty, but a lesson can introduce only items that yield no question).

- [ ] **Step 1: Write the failing `lesson-reinforce` test**

Create `tests/core/lesson-reinforce.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { LessonFull } from '@/core/types';
import { buildReinforceQuestions, type ReinforceContent } from '@/core/quiz/lesson-reinforce';

const GRAMMAR = {
  'g-teiru': {
    id: 'g-teiru', level: 'N5', title: '〜ている (сейчас/состояние)', layer: 3,
    tags: [], related: [], relatedTitles: [],
    bodyMarkdown: '## Кратко\nДействие сейчас или результат-состояние.\n\n## Образование\nて + いる\n\n## Нюансы\nx\n\n## Примеры\n- x\n\n## Частые ошибки\ny',
    examples: [],
  },
};
const VOCAB = {
  'v-asa': { id: 'v-asa', level: 'N5', headword: '朝', reading: 'あさ', pos: 'сущ.', meaningRu: 'утро' },
  'v-hayai': { id: 'v-hayai', level: 'N5', headword: '早い', reading: 'はやい', pos: 'прил.', meaningRu: 'ранний' },
};
const KANJI = {
  'k-asa': { id: 'k-asa', level: 'N5', char: '朝', onyomi: ['チョウ'], kunyomi: ['あさ'], meaningRu: 'утро', strokeCount: 12 },
};

const content: ReinforceContent = {
  getGrammar: (id: string) => (GRAMMAR as Record<string, unknown>)[id] as never ?? null,
  getVocab: (id: string) => (VOCAB as Record<string, unknown>)[id] as never ?? null,
  getKanji: (id: string) => (KANJI as Record<string, unknown>)[id] as never ?? null,
  listVocab: () => Object.values(VOCAB) as never,
  listKanji: () => Object.values(KANJI) as never,
};

const lesson = (over: Partial<LessonFull> = {}): LessonFull => ({
  id: 'l1', stage: 3, kind: 'text', title: 'T', introducesCount: 3, isFreeReading: false,
  bodyRuby: 'x', translationRu: 'y', questions: [],
  introduces: [
    { type: 'grammar', id: 'g-teiru', role: 'introduce' },
    { type: 'vocab', id: 'v-asa', role: 'introduce' },
    { type: 'kanji', id: 'k-asa', role: 'introduce' },
  ],
  markers: [
    {
      type: 'grammar', id: 'g-teiru',
      surface: '起[お]きています',
      sentenceRuby: '毎朝[まいあさ] 六時[ろくじ]に 起[お]きています。',
      sentenceRu: 'Каждое утро встаю в шесть.',
    },
    {
      type: 'vocab', id: 'v-asa', surface: '朝[あさ]',
      sentenceRuby: '朝[あさ]は 早[はや]いです。', sentenceRu: 'Утром рано.',
    },
  ],
  ...over,
});

describe('buildReinforceQuestions', () => {
  it('produces at most 3 questions in introduces order, one per introduce that yields something', () => {
    const items = buildReinforceQuestions(lesson(), content, 'seed');
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items.length).toBeLessThanOrEqual(3);
    expect(items[0]!.question.itemType).toBe('grammar');
    expect(items[0]!.question.itemId).toBe('g-teiru');
  });

  it('the grammar question is built from the marker sentence (cloze/assemble/choice), not a blank one', () => {
    const items = buildReinforceQuestions(lesson(), content, 'seed');
    const g = items.find((i) => i.question.itemType === 'grammar')!;
    expect(['cloze', 'assemble', 'choice']).toContain(g.question.kind);
    if (g.question.kind === 'cloze') {
      expect(g.question.sentenceRuby).toContain('___');
      // the cloze sentence descends from the marker context, not a template
      expect(g.question.translationRu).toBe('Каждое утро встаю в шесть.');
    }
    expect(g.contextRu).toBe('Каждое утро встаю в шесть.');
  });

  it('a grammar introduce with NO marker (or an empty-sentence marker) contributes nothing', () => {
    const items = buildReinforceQuestions(
      lesson({ markers: [], introduces: [{ type: 'grammar', id: 'g-teiru', role: 'introduce' }] }),
      content, 'seed',
    );
    // genCloze/genAssemble need examples; synthetic point has none -> genChoice
    // from "## Кратко" is the only shot, and it succeeds, so this yields a choice q.
    // If you decide grammar-without-marker should be skipped entirely, assert length 0 instead.
    expect(items.every((i) => i.question.itemType === 'grammar')).toBe(true);
  });

  it('vocab and kanji introduces always yield a choice question', () => {
    const items = buildReinforceQuestions(
      lesson({
        introduces: [
          { type: 'vocab', id: 'v-hayai', role: 'introduce' },
          { type: 'kanji', id: 'k-asa', role: 'introduce' },
        ],
        markers: [],
      }),
      content, 'seed',
    );
    expect(items.map((i) => i.question.itemType)).toEqual(['vocab', 'kanji']);
    expect(items.every((i) => i.question.kind === 'choice')).toBe(true);
  });

  it('is deterministic for a fixed seed', () => {
    const a = buildReinforceQuestions(lesson(), content, 'seed-x');
    const b = buildReinforceQuestions(lesson(), content, 'seed-x');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('skips role="review" introduces (only "introduce" reinforced)', () => {
    const items = buildReinforceQuestions(
      lesson({ introduces: [{ type: 'vocab', id: 'v-asa', role: 'review' }], markers: [] }),
      content, 'seed',
    );
    expect(items).toEqual([]);
  });
});
```

> **Ruling on grammar-without-marker:** spec §2.2 step 3 says *"grammar с непустым `lesson_markers.sentence_ruby` → cloze/assemble..."* — it only describes the with-marker path. A grammar `introduce` with no usable marker sentence still has a real `bodyMarkdown` with "## Кратко", so `generateOfKind('cloze', synthetic, [], seed)` will fall through `genCloze` (no examples → null) and `genAssemble` (no examples → null) to `genChoice` (succeeds). **Decision:** allow it — a "Что выражает «X»?" choice question is a fine reinforcement and costs nothing. The test above reflects this. If a reviewer prefers to skip grammar-without-marker, that is a one-line filter and an equally valid reading — implementer's call, but document which.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/core/lesson-reinforce.test.ts`
Expected: FAIL — `Cannot find module '@/core/quiz/lesson-reinforce'`.

- [ ] **Step 3: Implement `src/core/quiz/lesson-reinforce.ts`**

```typescript
import type { LessonFull, LessonMarker } from '@/core/types';
import type { GrammarPointFull, ContentDb } from '@/storage/content-db';
import type { Question } from '@/core/quiz/types';
import { generateOfKind } from '@/core/quiz/registry';
import { genVocabMeaning, genVocabReading } from '@/core/quiz/vocab-questions';
import { genKanjiMeaning, genKanjiReading } from '@/core/quiz/kanji-questions';

export type ReinforceContent = Pick<
  ContentDb, 'getGrammar' | 'getVocab' | 'getKanji' | 'listVocab' | 'listKanji'
>;

export interface ReinforceItem {
  question: Question;
  /** Marker context sentence (RU) to show above the question. "" when none. */
  contextRu: string;
}

const MAX_QUESTIONS = 3;

function markerFor(lesson: LessonFull, type: string, id: string): LessonMarker | null {
  return lesson.markers.find((m) => m.type === type && m.id === id) ?? null;
}

/** A GrammarPointFull whose only example is the lesson's marker sentence. */
function syntheticGrammarPoint(real: GrammarPointFull, mk: LessonMarker | null): GrammarPointFull {
  return {
    ...real,
    examples:
      mk && mk.sentenceRuby.trim() && mk.sentenceRu.trim()
        ? [{ jaRuby: mk.sentenceRuby, ru: mk.sentenceRu }]
        : [],
  };
}

export function buildReinforceQuestions(
  lesson: LessonFull,
  content: ReinforceContent,
  seed: string,
): ReinforceItem[] {
  const out: ReinforceItem[] = [];
  for (const it of lesson.introduces) {
    if (out.length >= MAX_QUESTIONS) break;
    if (it.role !== 'introduce') continue;
    const qSeed = `${seed}:${it.type}:${it.id}`;
    const mk = markerFor(lesson, it.type, it.id);

    if (it.type === 'grammar') {
      const real = content.getGrammar(it.id);
      if (!real) continue;
      try {
        const q = generateOfKind('cloze', syntheticGrammarPoint(real, mk), [], qSeed);
        out.push({ question: q, contextRu: mk?.sentenceRu ?? '' });
      } catch {
        // no generator produced a question for this point — skip it
      }
      continue;
    }

    if (it.type === 'vocab') {
      const v = content.getVocab(it.id);
      if (!v) continue;
      const pool = content.listVocab(v.level);
      const wantReading = v.headword !== v.reading && hashParity(qSeed);
      const q = wantReading
        ? genVocabReading(v, pool, qSeed)
        : genVocabMeaning(v, pool, qSeed);
      out.push({ question: q, contextRu: mk?.sentenceRu ?? '' });
      continue;
    }

    // kanji
    const k = content.getKanji(it.id);
    if (!k) continue;
    const pool = content.listKanji(k.level);
    const q = hashParity(qSeed)
      ? genKanjiReading(k, pool, qSeed)
      : genKanjiMeaning(k, pool, qSeed);
    out.push({ question: q, contextRu: mk?.sentenceRu ?? '' });
  }
  return out;
}

/** Deterministic coin-flip from a seed string (meaning vs reading). */
function hashParity(s: string): boolean {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h & 1) === 1;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/core/lesson-reinforce.test.ts`
Expected: PASS. If the `'grammar introduce with NO marker'` test fails because you chose to *skip* grammar-without-marker, update that test to `expect(items).toEqual([])` and add the `if (!mk?.sentenceRuby.trim()) continue;` filter — but the default is to allow it.

- [ ] **Step 5: Write the failing `LessonReinforceStep` test**

Create `tests/ui/LessonReinforceStep.test.tsx`:

```typescript
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ContentDbContext } from '@/ui/ContentDbProvider';
import type { Level, LessonFull } from '@/core/types';

vi.mock('@/ui/useUserDb', () => ({ useUserDb: () => ({ getSetting: (_k: string, fb: unknown) => fb }) }));

import { LessonReinforceStep } from '@/ui/components/LessonReinforceStep';

const levels: Level[] = [{ code: 'N5', ord: 1, status: 'available', titleRu: 'N5' }];
const fakeDb = {
  getGrammar: () => null,
  getVocab: (id: string) =>
    id === 'v-asa' ? { id, headword: '朝', reading: 'あさ', pos: 'сущ.', meaningRu: 'утро', level: 'N5' } : null,
  getKanji: () => null,
  listVocab: () => [
    { id: 'v-asa', headword: '朝', reading: 'あさ', pos: 'сущ.', meaningRu: 'утро', level: 'N5' },
    { id: 'v-b', headword: '夜', reading: 'よる', pos: 'сущ.', meaningRu: 'ночь', level: 'N5' },
    { id: 'v-c', headword: '昼', reading: 'ひる', pos: 'сущ.', meaningRu: 'день', level: 'N5' },
    { id: 'v-d', headword: '晩', reading: 'ばん', pos: 'сущ.', meaningRu: 'вечер', level: 'N5' },
  ],
  listKanji: () => [],
} as unknown as import('@/storage/content-db').ContentDb;

const lesson: LessonFull = {
  id: 'l1', stage: 3, kind: 'text', title: 'T', introducesCount: 1, isFreeReading: false,
  bodyRuby: 'x', translationRu: 'y', questions: [],
  introduces: [{ type: 'vocab', id: 'v-asa', role: 'introduce' }],
  markers: [{ type: 'vocab', id: 'v-asa', surface: '朝[あさ]', sentenceRuby: '朝[あさ]です。', sentenceRu: 'Это утро.' }],
};

function renderStep(onDone = vi.fn()) {
  const utils = render(
    <ContentDbContext.Provider value={{ db: fakeDb, levels }}>
      <LessonReinforceStep lesson={lesson} onDone={onDone} />
    </ContentDbContext.Provider>,
  );
  return { ...utils, onDone };
}

describe('LessonReinforceStep', () => {
  it('shows the marker context sentence above the question', () => {
    renderStep();
    expect(screen.getByText('Это утро.')).toBeInTheDocument();
  });

  it('walks the questions and calls onDone at the end', () => {
    const { onDone } = renderStep();
    // one vocab question -> answer any choice -> "Далее"/"Завершить"
    const opts = screen.getAllByRole('button').filter((b) => b.classList.contains('q-opt'));
    fireEvent.click(opts[0]!);
    fireEvent.click(screen.getByRole('button', { name: /Завершить|Далее/ }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('renders a skip button that calls onDone when no question could be built', () => {
    const onDone = vi.fn();
    const empty: LessonFull = { ...lesson, introduces: [{ type: 'grammar', id: 'missing', role: 'introduce' }], markers: [] };
    render(
      <ContentDbContext.Provider value={{ db: fakeDb, levels }}>
        <LessonReinforceStep lesson={empty} onDone={onDone} />
      </ContentDbContext.Provider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Дальше' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run tests/ui/LessonReinforceStep.test.tsx`
Expected: FAIL — `Cannot find module '@/ui/components/LessonReinforceStep'`.

- [ ] **Step 7: Implement `src/ui/components/LessonReinforceStep.tsx`**

```typescript
import { useMemo, useState } from 'react';
import type { LessonFull } from '@/core/types';
import { useContentDb } from '../useContentDb';
import { buildReinforceQuestions } from '@/core/quiz/lesson-reinforce';
import { QuestionView } from './QuestionView';
import { grade } from '@/core/quiz/grade';
import type { Answer, GradedAnswer } from '@/core/quiz/types';

export function LessonReinforceStep({
  lesson, onDone,
}: {
  lesson: LessonFull;
  onDone: () => void;
}) {
  const db = useContentDb();
  const [seed] = useState(() => `${lesson.id}:${Date.now()}`);
  const items = useMemo(
    () => buildReinforceQuestions(lesson, db, seed),
    [lesson, db, seed],
  );

  const [idx, setIdx] = useState(0);
  const [graded, setGraded] = useState<GradedAnswer | null>(null);

  if (items.length === 0) {
    return (
      <div className="reinforce">
        <p className="muted">Нечего закреплять — сразу к итогу.</p>
        <button type="button" className="btn-primary" onClick={onDone}>Дальше</button>
      </div>
    );
  }

  const item = items[idx]!;
  const last = idx + 1 >= items.length;

  const answer = (a: Answer) => {
    if (graded) return;
    setGraded(grade(item.question, a));
  };
  const next = () => {
    if (last) { onDone(); return; }
    setIdx((n) => n + 1);
    setGraded(null);
  };

  return (
    <div className="reinforce">
      {item.contextRu && <p className="reinforce-context">{item.contextRu}</p>}
      <QuestionView
        key={item.question.id}
        question={item.question}
        onAnswer={answer}
        revealed={graded}
        showExplainLink={false}
      />
      {graded && (
        <button type="button" className="btn-primary" onClick={next}>
          {last ? 'Завершить' : 'Далее'}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Append CSS + run tests**

Append to `src/ui/theme.css`:

```css
.reinforce { display: flex; flex-direction: column; gap: 1rem; }
.reinforce-context {
  font-family: var(--font-ja); color: var(--muted); font-size: 0.95rem;
  border-left: 3px solid var(--border); padding-left: 0.75rem; margin: 0;
}
```

Run: `npx vitest run tests/core/lesson-reinforce.test.ts tests/ui/LessonReinforceStep.test.tsx && npm run typecheck && npm run lint`
Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add src/core/quiz/lesson-reinforce.ts src/ui/components/LessonReinforceStep.tsx src/ui/theme.css tests/core/lesson-reinforce.test.ts tests/ui/LessonReinforceStep.test.tsx
git commit -m "feat(course): lesson reinforcement questions from markers (player step 3)"
```

---

### Task 6: `LessonScreen` state machine, route wiring, redirects, and the old-screen removal

**Files:**
- Create: `src/ui/screens/LessonScreen.tsx`
- Modify: `src/ui/routes.tsx` (add `/lesson/:id` + `LessonRoute`; convert `/texts` + `/texts/:id` to redirects; drop the two text-screen imports)
- Modify: `src/ui/components/Nav.tsx` ("Тексты"/`/texts` → "Курс"/`/course`)
- Modify: `src/ui/UserDbProvider.tsx` (call `migrateTextsRead(db)`)
- Modify: `src/ui/theme.css` (append `.lesson-screen`, `.lesson-steps`, `.lesson-summary` rules)
- Delete: `src/ui/screens/TextsListScreen.tsx`, `src/ui/screens/TextDetailScreen.tsx`
- Delete: `tests/ui/TextsListScreen.test.tsx`, `tests/ui/TextDetailScreen.test.tsx`
- Delete: `tests/e2e/texts-browse.spec.ts`
- Modify: `tests/ui/Nav.test.tsx`
- Test: `tests/ui/LessonScreen.test.tsx`
- Test: `tests/e2e/course.spec.ts`

**Interfaces:**
- Consumes: everything above — `getCourseStep`/`setCourseStep`/`markLessonComplete`/`isLessonComplete`/`courseCompletedIds`/`nextUnlockedLessonId` (Task 1); `LessonNewStep` (Task 3); `LessonReader`/`ComprehensionQuiz` (Task 4); `LessonReinforceStep` (Task 5); `db.getLesson(id)`/`db.listLessons()` (5-1).
- Produces: the `/lesson/:id` route. No new exports consumed elsewhere.

- [ ] **Step 1: Write the failing `LessonScreen` test**

Create `tests/ui/LessonScreen.test.tsx`:

```typescript
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter as BaseMemoryRouter, Routes, Route } from 'react-router-dom';
import type { ComponentProps } from 'react';
import { ContentDbContext } from '@/ui/ContentDbProvider';

const FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true } as const;
const MemoryRouter = (p: ComponentProps<typeof BaseMemoryRouter>) => (
  <BaseMemoryRouter future={FUTURE} {...p} />
);

const store: { progress: Record<string, { step: number }>; completed: string[] } = {
  progress: {}, completed: [],
};
const setSetting = vi.fn((key: string, value: unknown) => {
  if (key === 'course_progress') store.progress = value as Record<string, { step: number }>;
  if (key === 'course_completed_ids') store.completed = value as string[];
});
vi.mock('@/ui/useUserDb', () => ({
  useUserDb: () => ({
    getSetting: (key: string, fb: unknown) => {
      if (key === 'course_progress') return store.progress;
      if (key === 'course_completed_ids') return store.completed;
      return fb;
    },
    setSetting,
  }),
}));

import { LessonScreen } from '@/ui/screens/LessonScreen';
import type { Level, LessonFull, LessonMeta } from '@/core/types';

const levels: Level[] = [{ code: 'N5', ord: 1, status: 'available', titleRu: 'N5' }];

const freeLesson: LessonFull = {
  id: 'n5-hanami', stage: 2, kind: 'text', title: 'お花見',
  introducesCount: 0, isFreeReading: true,
  bodyRuby: '桜[さくら]が 咲[さ]きます。\n\n春[はる]です。',
  translationRu: 'Сакура цветёт.\n\nВесна.',
  questions: [
    { prompt: 'Что цветёт?', choices: ['Сакура', 'Слива', 'Роза'], answerIndex: 0 },
  ],
  introduces: [], markers: [],
};
const metas: LessonMeta[] = [
  { id: 'n5-hanami', stage: 2, kind: 'text', title: 'お花見', introducesCount: 0, isFreeReading: true },
  { id: 'n5-konbini', stage: 4, kind: 'text', title: 'コンビニ', introducesCount: 0, isFreeReading: true },
];
const fakeDb = {
  getLesson: (id: string) => (id === 'n5-hanami' ? freeLesson : null),
  listLessons: () => metas,
  getGrammar: () => null, getVocab: () => null, getKanji: () => null,
  listVocab: () => [], listKanji: () => [],
} as unknown as import('@/storage/content-db').ContentDb;

function renderAt(path: string) {
  return render(
    <ContentDbContext.Provider value={{ db: fakeDb, levels }}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/lesson/:id" element={<LessonScreen />} />
          <Route path="/course" element={<div>COURSE</div>} />
        </Routes>
      </MemoryRouter>
    </ContentDbContext.Provider>,
  );
}

describe('LessonScreen', () => {
  beforeEach(() => {
    store.progress = {}; store.completed = [];
    setSetting.mockClear();
  });

  it('a free-reading lesson skips step 0 (New) and step 3 (Reinforce): goes Read -> Comprehension -> Summary', () => {
    renderAt('/lesson/n5-hanami');
    // step 1 Read
    expect(screen.getByRole('button', { name: 'Показать перевод' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Дальше|Далее/ }));
    // step 2 Comprehension
    expect(screen.getByText('Что цветёт?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Сакура' }));
    fireEvent.click(screen.getByRole('button', { name: 'Завершить' }));
    // step 4 Summary
    expect(screen.getByText(/Урок пройден/)).toBeInTheDocument();
    expect(setSetting).toHaveBeenCalledWith('course_completed_ids', ['n5-hanami']);
  });

  it('persists the step after each transition via course_progress', () => {
    renderAt('/lesson/n5-hanami');
    fireEvent.click(screen.getByRole('button', { name: /Дальше|Далее/ })); // Read -> Comprehension
    expect(setSetting).toHaveBeenCalledWith('course_progress', expect.objectContaining({
      'n5-hanami': { step: 2 },
    }));
  });

  it('resumes at the persisted step', () => {
    store.progress = { 'n5-hanami': { step: 2 } };
    renderAt('/lesson/n5-hanami');
    expect(screen.getByText('Что цветёт?')).toBeInTheDocument(); // straight to Comprehension
  });

  it('Summary offers the next lesson and a link back to the course', () => {
    store.progress = { 'n5-hanami': { step: 4 } };
    renderAt('/lesson/n5-hanami');
    expect(screen.getByText(/Урок пройден/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /К курсу/ })).toHaveAttribute('href', '/course');
    expect(screen.getByRole('link', { name: /Следующий/ })).toHaveAttribute('href', '/lesson/n5-konbini');
  });

  it('shows a not-found message for an unknown id', () => {
    renderAt('/lesson/does-not-exist');
    expect(screen.getByText(/Урок не найден/)).toBeInTheDocument();
  });

  it('does not re-append to course_completed_ids if the lesson is already complete', () => {
    store.completed = ['n5-hanami'];
    store.progress = { 'n5-hanami': { step: 4 } };
    renderAt('/lesson/n5-hanami');
    expect(setSetting).not.toHaveBeenCalledWith('course_completed_ids', expect.anything());
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/ui/LessonScreen.test.tsx`
Expected: FAIL — `Cannot find module '@/ui/screens/LessonScreen'`.

- [ ] **Step 3: Implement `src/ui/screens/LessonScreen.tsx`**

```typescript
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useContentDb } from '../useContentDb';
import { useUserDb } from '../useUserDb';
import {
  getCourseStep, setCourseStep, markLessonComplete, isLessonComplete,
  courseCompletedIds, nextUnlockedLessonId,
} from '@/core/course';
import { LessonNewStep } from '../components/LessonNewStep';
import { LessonReader } from '../components/LessonReader';
import { ComprehensionQuiz } from '../components/ComprehensionQuiz';
import { LessonReinforceStep } from '../components/LessonReinforceStep';

/** 0 New · 1 Read · 2 Comprehension · 3 Reinforce · 4 Summary */
const LAST_STEP = 4;

export function LessonScreen() {
  const { id = '' } = useParams();
  const db = useContentDb();
  const user = useUserDb();
  const lesson = useMemo(() => db.getLesson(id), [db, id]);
  const metas = useMemo(() => db.listLessons(), [db]);

  const hasIntroduces = (lesson?.introduces.length ?? 0) > 0;
  // Free-reading lessons have no New/Reinforce steps.
  const isSkipped = (step: number) => !hasIntroduces && (step === 0 || step === 3);

  const clampFrom = (raw: number): number => {
    let s = Math.max(0, Math.min(raw, LAST_STEP));
    while (s < LAST_STEP && isSkipped(s)) s += 1;
    return s;
  };

  const [step, setStep] = useState(() => clampFrom(getCourseStep(user, id)));
  const completedRef = useRef(false);

  const go = (next: number) => {
    const s = clampFrom(next);
    setStep(s);
    if (s < LAST_STEP) setCourseStep(user, id, s);
  };

  useEffect(() => {
    if (step !== LAST_STEP || completedRef.current) return;
    completedRef.current = true;
    if (!isLessonComplete(user, id)) markLessonComplete(user, id);
  }, [step, user, id]);

  if (!lesson) {
    return (
      <section className="screen lesson-screen">
        <p className="muted">Урок не найден.</p>
        <Link to="/course" className="back-link">← К курсу</Link>
      </section>
    );
  }

  const next = nextUnlockedLessonId(
    metas,
    new Set([...courseCompletedIds(user), id]),
    id,
  );

  return (
    <section className="screen lesson-screen">
      <Link to="/course" className="back-link">← К курсу</Link>
      <h1>{lesson.title}</h1>

      {step === 0 && (
        <LessonNewStep introduces={lesson.introduces} onDone={() => go(1)} />
      )}

      {step === 1 && (
        <div className="lesson-step">
          <LessonReader lesson={lesson} />
          <button type="button" className="btn-primary" onClick={() => go(2)}>Дальше</button>
        </div>
      )}

      {step === 2 && (
        lesson.questions.length > 0 ? (
          <ComprehensionQuiz questions={lesson.questions} onFinish={() => go(3)} />
        ) : (
          <div className="lesson-step">
            <p className="muted">Вопросов на понимание нет.</p>
            <button type="button" className="btn-primary" onClick={() => go(3)}>Дальше</button>
          </div>
        )
      )}

      {step === 3 && (
        <LessonReinforceStep lesson={lesson} onDone={() => go(4)} />
      )}

      {step === 4 && (
        <div className="lesson-summary">
          <p className="lesson-summary-title">Урок пройден ✓</p>
          <div className="lesson-summary-actions">
            <Link to="/course" className="btn-ghost">К курсу</Link>
            {next && <Link to={`/lesson/${next}`} className="btn-primary">Следующий урок</Link>}
          </div>
        </div>
      )}
    </section>
  );
}
```

> **Note on the test `'persists the step after each transition'`:** it expects `setSetting('course_progress', { 'n5-hanami': { step: 2 } })` after the first "Дальше". The free-reading lesson starts at step 1 (step 0 skipped by `clampFrom(0)`), and `go(2)` writes step 2. Correct. The `'resumes at the persisted step'` test seeds `{ step: 2 }` and `clampFrom(2)` = 2 (step 2 is not skipped). Correct. The remount-on-`:id`-change wrapper is added in the route (Step 5) — this screen relies on it, exactly like `PlacementScreen` relies on `PlacementRoute`.

- [ ] **Step 4: Run to verify the `LessonScreen` unit test passes**

Run: `npx vitest run tests/ui/LessonScreen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Wire routes — `/lesson/:id`, redirects, drop text screens**

Rewrite `src/ui/routes.tsx` to:

```typescript
import { GrammarListScreen } from './screens/GrammarListScreen';
import { GrammarDetailScreen } from './screens/GrammarDetailScreen';
import { KanjiListScreen } from './screens/KanjiListScreen';
import { KanjiDetailScreen } from './screens/KanjiDetailScreen';
import { VocabListScreen } from './screens/VocabListScreen';
import { VocabDetailScreen } from './screens/VocabDetailScreen';
import { CourseScreen } from './screens/CourseScreen';
import { LessonScreen } from './screens/LessonScreen';
import { TodayScreen } from './screens/TodayScreen';
import { ReviewScreen } from './screens/ReviewScreen';
import { PlacementScreen } from './screens/PlacementScreen';
import { Navigate, useParams } from 'react-router-dom';
import { ProgressScreen } from './screens/ProgressScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import type { RouteObject } from 'react-router-dom';

function PlacementRedirect() {
  return <Navigate to="/placement/grammar" replace />;
}

function PlacementRoute() {
  const { type } = useParams();
  return <PlacementScreen key={type} />;
}

// Remount the lesson player when only the :id changes (stale step/refs otherwise),
// same rationale as PlacementRoute.
function LessonRoute() {
  const { id } = useParams();
  return <LessonScreen key={id} />;
}

// Plan 5-2: /texts is now the course. Keep the two redirects so old bookmarks
// and any lingering links still resolve.
function TextDetailRedirect() {
  const { id } = useParams();
  return <Navigate to={`/lesson/${id}`} replace />;
}

export const routes: RouteObject[] = [
  { path: '/', element: <TodayScreen /> },
  { path: '/review', element: <ReviewScreen /> },
  { path: '/placement', element: <PlacementRedirect /> },
  { path: '/placement/:type', element: <PlacementRoute /> },
  { path: '/grammar', element: <GrammarListScreen /> },
  { path: '/grammar/:id', element: <GrammarDetailScreen /> },
  { path: '/kanji', element: <KanjiListScreen /> },
  { path: '/kanji/:id', element: <KanjiDetailScreen /> },
  { path: '/vocab', element: <VocabListScreen /> },
  { path: '/vocab/:id', element: <VocabDetailScreen /> },
  { path: '/course', element: <CourseScreen /> },
  { path: '/lesson/:id', element: <LessonRoute /> },
  { path: '/texts', element: <Navigate to="/course" replace /> },
  { path: '/texts/:id', element: <TextDetailRedirect /> },
  { path: '/progress', element: <ProgressScreen /> },
  { path: '/settings', element: <SettingsScreen /> },
];
```

- [ ] **Step 6: Nav — "Тексты" → "Курс"**

In `src/ui/components/Nav.tsx`, change the `DESTINATIONS` entry `{ to: '/texts', label: 'Тексты', icon: '📖' }` to `{ to: '/course', label: 'Курс', icon: '📖' }`.

- [ ] **Step 7: Update `tests/ui/Nav.test.tsx`**

Open `tests/ui/Nav.test.tsx`. Wherever it asserts a "Тексты" link or `/texts` href (it currently checks 6 destinations including Тексты → `/texts`), change that expectation to "Курс" → `/course`. Keep the destination count the same (6 + Settings). Run `npx vitest run tests/ui/Nav.test.tsx` to confirm.

- [ ] **Step 8: Call `migrateTextsRead` in `UserDbProvider`**

In `src/ui/UserDbProvider.tsx`: add `import { migrateTextsRead } from '@/core/course';` next to the `migratePlacementMarks` import, and add `migrateTextsRead(db);` on the line right after `migratePlacementMarks(db);` inside the `.then((db) => { ... })` block.

- [ ] **Step 9: Delete the old text screens and their tests**

```bash
git rm src/ui/screens/TextsListScreen.tsx src/ui/screens/TextDetailScreen.tsx tests/ui/TextsListScreen.test.tsx tests/ui/TextDetailScreen.test.tsx tests/e2e/texts-browse.spec.ts
```

Then `grep -rn "TextsListScreen\|TextDetailScreen\|/texts" src tests` — the only remaining hits must be the two redirect routes in `routes.tsx`. Remove anything else (there should be nothing).

- [ ] **Step 10: Append CSS**

Append to `src/ui/theme.css`:

```css
.lesson-screen { max-width: min(48rem, 100%); }
.lesson-step { display: flex; flex-direction: column; gap: 1rem; }
.lesson-summary { display: flex; flex-direction: column; gap: 1rem; align-items: flex-start; margin-top: 1.5rem; }
.lesson-summary-title { font-size: 1.15rem; color: var(--ok); font-weight: 600; margin: 0; }
.lesson-summary-actions { display: flex; gap: 0.75rem; flex-wrap: wrap; }
```

- [ ] **Step 11: Write the e2e test**

Create `tests/e2e/course.spec.ts`:

```typescript
import { test, expect, _electron as electron } from '@playwright/test';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

async function launch() {
  const userData = mkdtempSync(join(tmpdir(), 'jlpt-e2e-course-'));
  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/main.js'), `--user-data-dir=${userData}`],
  });
  const win = await app.firstWindow();
  await win.waitForSelector('[data-testid="user-db-ready"]', { state: 'attached', timeout: 20_000 });
  return { app, win };
}

test('the "Курс" nav item opens /course and lists the migrated lessons as free reading', async () => {
  const { app, win } = await launch();
  await win.getByRole('link', { name: /Курс/ }).click();
  await expect(win.getByRole('heading', { name: 'Курс' })).toBeVisible();
  // 15 migrated lessons, all free reading, all unlocked
  await expect(win.locator('.course-item')).toHaveCount(15);
  await expect(win.locator('.course-item[data-state="unlocked-reading"]')).toHaveCount(15);
  // no "Продолжить" — no mandatory lessons exist yet
  await expect(win.getByRole('link', { name: /Продолжить/ })).toHaveCount(0);
  await app.close();
});

test('walking a free-reading lesson: Read -> Comprehension -> Summary, and it survives a restart', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'jlpt-e2e-course-walk-'));
  const args = [join(process.cwd(), 'out/main/main.js'), `--user-data-dir=${userData}`];

  let app = await electron.launch({ args });
  let win = await app.firstWindow();
  await win.waitForSelector('[data-testid="user-db-ready"]', { state: 'attached', timeout: 20_000 });

  await win.getByRole('link', { name: /Курс/ }).click();
  await win.locator('.course-item[data-lesson="n5-hanami"] a').click();
  await expect(win.getByRole('heading', { name: 'お花見' })).toBeVisible();

  // step 1 Read
  await win.getByRole('button', { name: 'Показать перевод' }).click();
  await expect(win.getByText(/сакура/i)).toBeVisible();
  await win.getByRole('button', { name: 'Дальше' }).click();

  // step 2 Comprehension — 4 questions, pick the first choice each time
  for (let i = 0; i < 4; i++) {
    await win.locator('.q-opt').first().click();
    await win.getByRole('button', { name: /Далее|Завершить/ }).click();
  }

  // step 4 Summary
  await expect(win.getByText(/Урок пройден/)).toBeVisible();
  await app.close();

  // restart — the lesson is now marked done on the course screen
  app = await electron.launch({ args });
  win = await app.firstWindow();
  await win.waitForSelector('[data-testid="user-db-ready"]', { state: 'attached', timeout: 20_000 });
  await win.getByRole('link', { name: /Курс/ }).click();
  await expect(win.locator('.course-item[data-lesson="n5-hanami"]')).toHaveAttribute('data-state', 'done');
  await app.close();
});

test('/texts and /texts/:id redirect into the course', async () => {
  const { app, win } = await launch();
  await win.evaluate(() => { window.location.hash = '#/texts'; });
  await expect(win.getByRole('heading', { name: 'Курс' })).toBeVisible();
  await win.evaluate(() => { window.location.hash = '#/texts/n5-hanami'; });
  await expect(win.getByRole('heading', { name: 'お花見' })).toBeVisible();
  await app.close();
});

test('the reinforce step / option buttons stay inside a 380px-wide window', async () => {
  const { app, win } = await launch();
  await win.setViewportSize({ width: 380, height: 800 });
  await win.getByRole('link', { name: /Курс/ }).click();
  await win.locator('.course-item[data-lesson="n5-hanami"] a').click();
  await win.getByRole('button', { name: 'Дальше' }).click(); // to Comprehension

  const overflow = await win.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  const clipped = await win.evaluate(() =>
    [...document.querySelectorAll('.q-opt')].some(
      (el) => el.getBoundingClientRect().right > window.innerWidth + 1,
    ),
  );
  expect(clipped).toBe(false);
  await app.close();
});
```

> **Note (T6-A):** the free-reading lessons have no reinforce step and their comprehension choices are short, so the 380px test here mirrors the plan-5-1 guard rather than truly exercising a choice-grid blowout. That is acceptable *only if* the reinforce step's `.q-options` (which IS a `1fr 1fr` grid of potentially long choices) is covered. If, by the time this task runs, no shipped lesson has `introduces`, add a dedicated assertion: navigate to a lesson, reach step 3, and assert `getComputedStyle(document.querySelector('.q-options')).gridTemplateColumns` resolves to a single track at 380px — OR mark this as an explicit carry-forward to the first plan that adds a mandatory lesson, and say so in the task's report. Do not silently ship a narrow-window test that cannot fail.

- [ ] **Step 12: Build and run the full e2e + vitest**

Run: `npm run build-content && npm run build && npx vitest run && npx playwright test`
Expected: vitest green (report the file/test counts); playwright green (report counts — `course.spec.ts` replaces `texts-browse.spec.ts`, net e2e test count changes by `+4 -3 = +1` relative to baseline's 29, i.e. ~30 — confirm the real number).

- [ ] **Step 13: Full regression + installer**

Run: `npm run typecheck && npm run lint && npx vitest run && npm run build && npx playwright test && npm run build:desktop:installer`
Expected: everything green; `dist/Kotsukotsu Setup 1.4.0.exe` is produced. (If the installer fails purely on the known winCodeSign `.7z` symlink/privilege infra issue — see `docs/RELEASE-CHECKLIST.md` — run `npm run build:desktop` instead to prove packaging and report which ran. Any other failure is a real regression.)

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "feat(course): LessonScreen player, /course + /lesson routes, retire /texts screens"
```

---

## Self-Review

### 1. Spec coverage

| Spec (§2 / §4 / §5 "План 5-2" / §6) | Task |
|---|---|
| §2.1 route `/course` → `CourseScreen` | 2 |
| §2.1 route `/lesson/:id` with `key={id}` remount wrapper | 6 (`LessonRoute`) |
| §2.1 `/texts` → `<Navigate to="/course">` , `/texts/:id` → `<Navigate to="/lesson/:id">` | 6 |
| §2.1 Nav "Тексты" 📖 → "Курс" 📖 `to="/course"` | 6 |
| §2.2 step 0 New — grammar "Кратко" read-only, vocab/kanji flash cards, done when all "Понятно", skipped when `introduces` empty | 3 (`LessonNewStep` + `FlashCard`), 6 (skip logic in `clampFrom`/step render) |
| §2.2 step 1 Read — body Furigana, dialogue bubbles, tappable `surface` → gloss card, "Показать перевод" | 4 (`LessonReader`) |
| §2.2 step 2 Comprehension — one question at a time, coloured + `role="status"` verdict, "Далее", wrong doesn't block | 4 (`ComprehensionQuiz`) |
| §2.2 step 3 Reinforce — 2-3 auto Q from `introduces`; grammar via synthetic `GrammarPointFull` from marker sentence → `genCloze`/`genAssemble`; vocab/kanji `gen*Meaning`/`gen*Reading`; context sentence shown; auto-graded; no FSRS effect; skipped when `introduces` empty | 5 (`lesson-reinforce.ts` + `LessonReinforceStep`), 6 (skip) |
| §2.2 step 4 Summary — "Урок пройден", mark complete (NO cards — see Global Constraints), "К курсу" / "Следующий урок" | 6 |
| §2.3 extract `LessonReader` + `ComprehensionQuiz` from `TextDetailScreen`; step 3 reuses `QuestionView` + `grade`; new `FlashCard` | 3, 4, 5 |
| §1.4 gating — course order `(stage,id)`; mandatory spine; free reading never gates, `stage ≤ ceiling`; current = first uncompleted mandatory | 1 (`courseLessonStates`, `currentMandatoryLessonId`), 2 (render) |
| §4 `course_completed_ids`, `course_progress: {step}` — plain settings, no schema migration | 1 |
| §4 `migrateTextsRead` in `UserDbProvider`, one-shot, consume old key | 1 (fn), 6 (wire) |
| §5 5-2 task 1 "course.ts helpers" | 1 |
| §5 5-2 task 2 "CourseScreen + gating list" | 2 |
| §5 5-2 task 3 "FlashCard + step 0" | 3 |
| §5 5-2 task 4 "LessonReader + ComprehensionQuiz + steps 1-2" | 4 |
| §5 5-2 task 5 "step 3 synthetic GrammarPointFull + QuestionView" | 5 |
| §5 5-2 task 6 "LessonScreen state machine + persist + step 4 (no cards) + redirects + Nav" | 6 |
| §6 vitest: gating (current/locked/free), FlashCard (front/back/requeue), LessonScreen (step transitions, persist, `markLessonComplete`, `insertReviewLog` **not** called — n/a here, no cards), redirects | 1, 3, 6 |
| §6 Playwright: full lesson walk → next open, survives restart; `/texts*` redirect; free reading opens, doesn't gate | 6 (`course.spec.ts`) |
| FR-4 carry-in — marker match by first `surface` occurrence, no throw when absent | 4 (`splitParagraph`), test asserts the absent case |
| T6-A carry-in — narrow-window assertion on the choice grid | 6 (Step 11 + its note) |

Not in 5-2 scope (spec §3 / decomposition): SRS card creation on Summary, `new_per_day` drip removal, scheduler changes, the "Продолжить курс" card on `TodayScreen`, `ProgressScreen` "Курс: X из Y" block — all plan 5-3.

### 2. Placeholder scan

Every step carries full code: `course.ts` (all 10 functions), `CourseScreen`, `FlashCard`, `LessonNewStep`, `LessonReader` (incl. `splitParagraph`), `ComprehensionQuiz`, `lesson-reinforce.ts` (incl. `hashParity`, `syntheticGrammarPoint`), `LessonReinforceStep`, `LessonScreen` (incl. `clampFrom` step-skip logic), the full `routes.tsx` rewrite, and every test body. The only "change this one line" instructions (`Nav.tsx` label, `UserDbProvider` two added lines, `Nav.test.tsx` assertion, the one wrong `course.test.ts` assertion) name the exact before/after. No "add validation" / "handle edge cases" / "similar to Task N" anywhere.

### 3. Type consistency

- `CourseLessonState` union is `'done' | 'current' | 'unlocked-reading' | 'locked'` in Task 1's interface block, its implementation, `STATE_LABEL` in Task 2, and every test — consistent (note: `'unlocked-reading'` with a hyphen throughout, never `'reading'` or `'free'`).
- `getCourseStep`/`setCourseStep`/`markLessonComplete`/`isLessonComplete`/`courseCompletedIds`/`nextUnlockedLessonId`/`currentMandatoryLessonId`/`courseLessonStates`/`migrateTextsRead` — same names in Task 1's Produces block, its code, and Tasks 2 & 6's imports.
- `ReinforceItem { question: Question; contextRu: string }` — Task 5 interface, `buildReinforceQuestions` return, `LessonReinforceStep` consumption (`item.contextRu`, `item.question`) all agree.
- `LessonNewStep`/`LessonReinforceStep` both take `{ ... , onDone: () => void }`; `ComprehensionQuiz` takes `{ questions, onFinish }`; `LessonReader` takes `{ lesson }` — `LessonScreen` calls each with exactly those props.
- `FlashCard` props `{ front, back, onKnown, onAgain }` — Task 3 interface, code, `LessonNewStep` usage, and `FlashCard.test.tsx` all match.
- Step indices: `0 New · 1 Read · 2 Comprehension · 3 Reinforce · 4 Summary` — used identically in `LessonScreen` (`LAST_STEP = 4`, `isSkipped(step) => step === 0 || step === 3`), the persistence tests (`{ step: 2 }` after Read→Comprehension), and `course_progress` writes.
- `generateOfKind('cloze', point, [], seed)` — matches the real signature in `src/core/quiz/registry.ts:44` (`kind, point, levelPoints, idSeed`); passing `[]` for `levelPoints` is what limits distractors to the fallback path, which is fine for a single-sentence synthetic point.
- `genVocabMeaning`/`genVocabReading`/`genKanjiMeaning`/`genKanjiReading` signatures `(point, levelPoints, seed)` — matches `src/core/quiz/vocab-questions.ts` / `kanji-questions.ts`.
- `sectionBody(markdown, heading)` — matches `src/core/quiz/grammar-questions.ts:57`.
- `db.getLesson`/`db.listLessons`/`db.getGrammar`/`db.getVocab`/`db.getKanji`/`db.listVocab`/`db.listKanji` — all real `ContentDb` methods (5-1 added the first two; the rest predate).

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-09-08-plan-5-2-lesson-player.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
