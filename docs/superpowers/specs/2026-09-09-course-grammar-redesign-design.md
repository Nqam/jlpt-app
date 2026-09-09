# Design: grammar-driven Course + separate Texts section

Date: 2026-09-09. Status: agreed.

## Supersedes

This design replaces the "lesson player" half of
`docs/superpowers/specs/2026-09-08-plan-5-graded-reading-course-design.md`:

- **§1 (lesson content model)** — partly unwound. `content/lessons/*.md` stay, but
  as free-reading *texts*, not course lessons. `lesson_introduces` / `lesson_markers`
  tables and their parsing are dropped.
- **§2 (5-step lesson player)** — replaced. The course is no longer a text-first
  5-step player; it is a grammar-first 3-step player generated from
  `content/grammar/**`.
- **§3 (SRS wiring)** — kept almost entirely. Card creation on lesson finale, the
  scheduler drip removal, the "Сегодня" course card, and the "Прогресс" course line
  all survive; only the notion of "what a lesson is" changes (a grammar point, not a
  text).
- **§4 (user data keys)** — `course_completed_ids` / `course_progress` keep their
  names but now hold grammar-point ids. A one-shot reverse migration moves any
  text-lesson ids that leaked into `course_completed_ids` back to `texts_read_ids`.

Plans 5-1, 5-2, and 5-3 already shipped to local `main` (HEAD after plan 5-3 +
cleanup). v1.6.0 was bumped but never released. This redesign is the next release.

## Problem

Plan 5 folded the "Тексты" section into a graded-reading course: a course lesson
was a text/dialogue that *introduced* grammar/kanji/vocab, and free-reading texts
were "lessons with empty `introduces`". Two problems surfaced:

1. **No content triggers it.** All 15 shipped lessons are migrated free-reading
   texts with zero `introduces_*`. The card-creation mechanism (plan 5-3) never
   fires, so a fresh user who skips the placement test acquires no SRS cards at
   all — `/review` is empty, the mini-test and the N4 unlock are unreachable.
   Authoring a text + comprehension questions for every grammar point is a large
   content backlog.
2. **Wrong mental model.** The user wants a textbook-shaped course: read about a
   grammar point in order, then do exercises confirming understanding. The text is
   optional illustration, not the spine. And free-reading texts should be their own
   section, not entangled with the course.

## Solution

Two independent sections:

- **Курс** — a grammar progression. A course lesson *is* a grammar point. Every
  grammar point in `content/grammar/**` is a lesson, ordered the way the reference
  list already orders them (`level.ord`, then `layer`, then `title`). Each lesson:
  read the point, reinforce with generated cloze/assemble questions, finish — which
  creates the FSRS card. Nothing new is authored; the course populates itself from
  existing grammar content, which fixes problem 1 outright.
- **Тексты** — the free-reading library restored as its own section: a list of
  texts/dialogues by `stage`, each with translation and comprehension questions,
  marked read/unread. No gating, no card creation.

Kanji ride along with grammar: when a grammar lesson finishes, every JLPT kanji
that appears in that point's example sentences also gets a card. Vocab in the
course is deferred to a later iteration (no Japanese segmentation in the project,
so vocab can only come from hand-authored id lists — out of scope now).

Decisions confirmed with the user on 2026-09-09:

1. Approach A — generated grammar course, thin lesson model. Not authored lessons
   (content backlog), not a synthetic `LessonFull` fed to the old player (fragile).
2. Course lesson = one grammar point. Text is optional and not present in the
   first iteration.
3. Kanji: auto-extracted from example furigana at build time. Vocab: later.
4. Progress: reuse `course_completed_ids` / `course_progress` keys, holding
   grammar-point ids.

## Not in scope

- **Vocab in the course** — later, via an optional `introduces_vocab` frontmatter
  list on grammar points.
- **Illustrative text attached to a grammar point** — later, via an optional
  frontmatter field.
- **Standalone kanji / vocab courses** — later, same generated pattern.
- **JLPT level locks on the course** — the course is gated only by its own grammar
  order. Rule 4g (N4 unlocks at 90% N5) still governs the `/grammar` reference
  section, unchanged.
- **The mini-test** — unchanged (grammar-only, ≥5 learned cards). It now draws on
  cards the course produced; same mechanism.
- **The placement test `/placement`** — unchanged.
- **v1.6.0 release** — held; this redesign becomes the release.

---

## 1. Information architecture / routes

| Nav item | Route | Screen |
|---|---|---|
| **Курс** 📚 | `/course` | `CourseScreen` (rewritten) — grammar points in course order |
| — | `/course/:grammarId` | `GrammarLessonScreen` (new) — 3 steps |
| **Тексты** 📖 | `/texts` | `TextsListScreen` (restored) — reading library |
| — | `/texts/:id` | `TextDetailScreen` (restored) — body + translation + questions |
| Грамматика | `/grammar`, `/grammar/:id` | reference — unchanged |
| Кандзи, Слова | `/kanji`, `/vocab` | reference — unchanged |

- `/lesson/:id` → `<Navigate to="/texts/:id" replace />` (old ids are text ids).
- `/course` no longer redirects anywhere — it is the course.
- Nav gains a second item. Order: Сегодня · Курс · Тексты · Грамматика · Кандзи ·
  Слова · Прогресс · Настройки (final order a UI detail for the plan).

## 2. Course model — `src/core/course.ts` rewritten

The course spine is every grammar point, in reference order. `content-db` already
sorts `listGrammarAll()` by `(level, layer)` and `listGrammar(level)` by
`(layer, title)`; the course uses a whole-course ordering:

```
listCourseGrammar(content): GrammarPoint[]
  = content.listGrammarAll() already ordered by (level.ord, layer, title)
```

New / changed functions:

- `courseCompletedIds(user): string[]` — unchanged accessor, now grammar-point ids.
- `isLessonComplete(user, grammarId)` — unchanged.
- `getCourseStep` / `setCourseStep` / `markLessonComplete` — unchanged (operate on
  `course_progress` / `course_completed_ids`).
- `currentCourseLessonId(points, completedSet, hasCard): string | null` — the first
  point that is neither in `completedSet` nor already carded. (A point the user
  already knows from placement is treated as done — no need to walk it. `hasCard`
  is `(id) => user.getCard('grammar', id) != null`, passed in.)
- `courseLessonState(point, completedSet, hasCard): 'done' | 'current' | 'ahead'` —
  `done` if completed or carded; `current` if it is `currentCourseLessonId`;
  `ahead` otherwise. There is no `locked` — every point is reachable, but the list
  visually marks what is done / current / still ahead.
- `nextCourseLessonId(points, afterId): string | null` — the next point in course
  order (for the "Следующий пункт" button on the finale).

Deleted: `courseLessonStates`, `nextUnlockedLessonId`, `mandatory`,
`currentMandatoryLessonId`, the free-reading ceiling logic, `CourseLessonState`
(replaced by the 3-value type above), `migrateTextsRead` (replaced — see §8).

## 3. `GrammarLessonScreen` — 3 steps

Route `/course/:grammarId`, `<GrammarLessonScreen key={grammarId} />` (remount on
id change, like `PlacementRoute`). Current step in `course_progress[grammarId].step`
(0, 1, 2). "← К курсу" link always visible.

**Step 0 — Изучение.** Render the grammar point:
- `<GrammarMarkdown source={point.bodyMarkdown} />` (Кратко / Образование / Нюансы /
  Частые ошибки — `GrammarMarkdown` already strips the Примеры section).
- "Примеры" block: `point.examples` as `<Furigana text={ex.jaRuby} />` + `ex.ru`.
- This is the body of the existing `GrammarDetailScreen`; extract the shared markup
  into a `GrammarPointBody` component used by both.
- Button "Понятно" → step 1.

**Step 1 — Закрепление.** 2–3 generated questions:
- `generateForCard(point, levelPointsFor(content, point.level), seed)` per question,
  `seed = `${grammarId}:${mountTime}:${i}``. This is exactly what the daily review
  uses for a grammar card, so the questions are the real thing (cloze / assemble
  from `point.examples`).
- `QuestionView` + `grade`. Coloured + textual verdict (`role="status"`). Wrong
  answers do not block — "Далее" advances regardless.
- If `generateForCard` yields nothing for this point (no usable examples), the step
  is skipped with a "Нечего закреплять" line and a "Дальше" button.
- Reuse `LessonReinforceStep`, stripped of the `lesson_markers` / synthetic-point
  path — it now takes a `GrammarPointFull` directly.

**Step 2 — Итог.** "Пункт пройден ✓". A `useEffect`, guarded exactly as plan 5-3's
finale effect (`completedRef` for the single mount, `isLessonComplete` for
re-entry, everything inside the `!isLessonComplete` branch):

```
now = new Date(); params = { requestRetention, maximumInterval, enableFuzz }  // from user settings, as PlacementScreen
if (!user.getCard('grammar', grammarId)):
  { card } = review(newCard('grammar', grammarId, now), 3, now, 0, params)
  user.upsertCard(card)
for (kanjiId of point.kanjiIds):            // auto-kanji, §4
  if (!content.getKanji(kanjiId)) continue  // ghost guard
  if (user.getCard('kanji', kanjiId)) continue
  { card } = review(newCard('kanji', kanjiId, now), 3, now, 0, params)
  user.upsertCard(card)
markLessonComplete(user, grammarId)
```

- Rating 3 ("Хорошо") — just taught, resurfaces in ~10 min / next day.
- `insertReviewLog` is never called (same as `PlacementScreen`).
- Buttons: "К курсу" / "Следующий пункт" (`nextCourseLessonId`).

## 4. Auto-kanji — `scripts/build-content`

New table:

```sql
CREATE TABLE grammar_kanji (
  grammar_id TEXT NOT NULL,
  kanji_id   TEXT NOT NULL,
  PRIMARY KEY (grammar_id, kanji_id)
);
```

Build step (in the grammar pipeline, after examples are parsed):

- For each grammar point, walk every `example.ja_ruby`.
- Strip ruby readings: `漢字[かんじ]` → `漢字` (drop the `[...]` groups).
- Collect the unique CJK ideographs from the stripped text.
- For each char, if `n5-{char}` or `n4-{char}` (or any shipped level code) resolves
  in the `kanji` table, record `(grammar_id, that kanji_id)`.
- Order within a point: first appearance in the examples.

`content-db`:

- `getGrammar(id)` gains `kanjiIds: string[]` on `GrammarPointFull` (ordered).
- `content/**` is not edited; `content.db` is rebuilt by `pretest` / `build-content`.

## 5. SRS wiring — what survives from plan 5-3

| Mechanism | Fate |
|---|---|
| Finale card creation (rating 3, `getCard` guard, no `insertReviewLog`, FSRS params from user) | **survives**; keyed on grammar id + auto-kanji ids |
| Scheduler drip removal (no `newCount` / `newItems` / `allocateBudget` / `new_per_day` path) | **survives whole** |
| "Сегодня": no "N новых"; course card | **survives**; card → `/course/:currentCourseLessonId`, label "Продолжить курс · {title}" / "Начать курс · {title}" / bare "Курс" when the course is finished |
| "Прогресс": "Курс: пройдено X из Y" | **survives**; Y = `listCourseGrammar().length`, X = `courseCompletedIds` that resolve to a real grammar point |
| `new_per_day` out of Settings UI (key stays in db) | **survives** |
| Post-drip dead-code cleanup (commit `2dfb195`) | **survives** |

`daySummary` / `buildQueue` / `buildDailySession` signatures unchanged. `TodayScreen`
and `ProgressScreen` swap `currentMandatoryLessonId` / `LessonMeta` inputs for the
grammar-point equivalents.

## 6. Texts section — restored

- Recover `src/ui/screens/TextsListScreen.tsx` and `TextDetailScreen.tsx` from
  `git show 37b4763^:...`. Adapt to the current `content-db` API
  (`listLessons()` / `getLesson(id)` already return title, `stage`, `kind`,
  `bodyRuby`, `translationRu`, `questions`).
- List ordered by `stage`. Each row: title + read/unread mark.
- "Read" state in `texts_read_ids` (the pre-plan-5 key). Marking read is a button on
  the detail screen or automatic on reaching the questions — a UI detail for the
  plan. No cards, no gating.
- `content/lessons/*.md` (15 files) are unchanged — they are the texts.
- `LessonReader` (dialogue bubbles / furigana body) and `ComprehensionQuiz` move
  into `TextDetailScreen` or are inlined; `LessonNewStep`, `FlashCard`, the old
  `CourseScreen`, `LessonScreen` are deleted.

## 7. Removed from plan 5

**Screens/components:** old `CourseScreen`, `LessonScreen`, `LessonNewStep`,
`FlashCard`. (`LessonReader`, `ComprehensionQuiz` are retained by the Texts
section.)

**Core:** `lesson-reinforce.ts` synthetic-marker path (simplified to
"grammar point → `generateForCard`"); `lesson_introduces` / `lesson_markers`
parsing in `scripts/build-content/lessons.ts`; the `{{TYPE:id|surface}}` marker
parser; `migrateTextsRead`.

**Schema:** drop `lesson_introduces`, `lesson_markers` tables (and their indices)
from `scripts/build-content/schema.sql`. `lessons` / `lesson_questions` stay.

**Types:** `LessonIntroduce`, `LessonMarker`; `introducesCount` / `isFreeReading`
on `LessonMeta` (texts don't gate); `CourseLessonState` (replaced).

**Tests:** delete the lesson-player / introduces / markers / free-reading-gating
tests; keep and repoint the text-rendering and comprehension-quiz tests.

## 8. User-data migration

One-shot idempotent `migrateCourseKeys(user, content)` in `UserDbProvider`
(alongside the other migrations), guarded by a `course_keys_migrated` marker so it
runs once:

- Any id in `course_completed_ids` that does **not** resolve to a grammar point
  (`content.getGrammar(id) == null`) — that is an old text-lesson id — is moved into
  `texts_read_ids` (union) and removed from `course_completed_ids`.
- Any key in `course_progress` that is not a grammar point is dropped.
- Set `course_keys_migrated = true`.

This is the reverse of plan 5-3's `migrateTextsRead`, which is deleted. No user.db
schema change (same pattern as `placement_marked_*_ids`).

The "Сбросить весь прогресс" button in Settings (added this session) already clears
`course_completed_ids` / card state; it needs a one-line check that it also clears
`course_progress` and re-locks correctly under the new model.

## 9. Testing

**Core (vitest):**
- course order = `(level.ord, layer, title)`.
- `currentCourseLessonId` — skips completed AND carded points; returns null when all
  done.
- `courseLessonState` — done / current / ahead.
- finale effect — creates a grammar card (rating 3, state Learning, no `review_log`),
  creates a card for each resolved auto-kanji, skips already-carded and ghost ids,
  idempotent on re-mount / re-entry.
- auto-kanji extractor — ruby stripping, CJK collection, n5/n4 resolution, first-
  appearance order, non-kanji chars ignored.
- `migrateCourseKeys` — moves text ids to `texts_read_ids`, drops text
  `course_progress` keys, runs once, leaves grammar ids untouched.

**UI (vitest):**
- `GrammarLessonScreen` — step transitions, `course_progress` persistence, finale
  fires `upsertCard` for grammar + kanji, `insertReviewLog` not called, re-entry
  creates nothing.
- `CourseScreen` — the three visual states; "Продолжить" targets
  `currentCourseLessonId`.
- `TextsListScreen` / `TextDetailScreen` — list by stage, read mark, questions
  render, verdicts.
- `TodayScreen` / `ProgressScreen` — course card + course line against grammar-point
  data.
- `/lesson/:id` → `/texts/:id` redirect.

**Playwright:**
- walk a grammar lesson (3 steps) → grammar card + example kanji cards in user.db →
  next point becomes current → survives restart.
- `/texts` list opens, does not gate, read mark persists.
- "Продолжить курс" on Сегодня lands in the current grammar lesson.

**Full regression (last task):** `npm run typecheck && npm run lint &&
npx vitest run && npm run build && npx playwright test &&
npm run build:desktop:installer`.

## 10. Release

v1.6.0 was bumped (plan 5-3) but never released. This redesign ships as the
release — version number (stay 1.6.0 or go 2.0.0 given the IA change) decided in
the plan. `gh release create` + `dist/` prune + memory update happen at the end,
with the user's go-ahead, per the established process (`jlpt-app-github.md`).

## 11. Open risks

- **`generateForCard` coverage.** Some grammar points may have examples that no
  generator can turn into a question (no cloze-able core, too few candidates). The
  reinforce step degrades to "Нечего закреплять" — acceptable, but if it is common
  the course feels thin. The plan's first task should measure how many of the ~90
  N5 points produce at least one question.
- **Points with no examples at all.** `getGrammar` returns `examples: []` for a few.
  Those still make a valid lesson (read + finale card), just no reinforcement.
- **Auto-kanji noise.** A grammar example may use a kanji far above the point's
  level. Restricting to shipped level codes (n5, n4) bounds it; a point that pulls
  in an N4 kanji while the user is early in N5 is acceptable (the card is created,
  it surfaces in review when due) but worth watching.
