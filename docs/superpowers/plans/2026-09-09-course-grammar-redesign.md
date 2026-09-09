# Grammar-driven Course + separate Texts section — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the text-first lesson course with a grammar-first one generated from `content/grammar/**` (one grammar point per lesson, 3 steps, card created on finish), and restore free-reading texts as their own "Тексты" section.

**Architecture:** The course spine is every grammar point in reference order. A new `GrammarLessonScreen` renders the point, reinforces it with the same generators the daily review uses, and on finish creates a rating-3 FSRS card for the point plus one for each JLPT kanji appearing in its examples (extracted at build time). The old `LessonScreen` / `CourseScreen` / `content/lessons` machinery is removed; `content/lessons/*.md` become the corpus for a restored `TextsListScreen` / `TextDetailScreen`. Plan 5-3's SRS wiring (finale card, scheduler drip removal, "Сегодня" course card, "Прогресс" course line) is kept and re-pointed at grammar points.

**Tech Stack:** No new dependencies. React 18 + `react-router-dom` 6 (hash router), `sql.js`-backed `ContentDb` / `UserDb`, `ts-fsrs` via `@/core/srs`, the `@/core/quiz/**` generators, Vitest + Playwright + ESLint + `tsc`.

**Spec:** `docs/superpowers/specs/2026-09-09-course-grammar-redesign-design.md` — read it alongside this plan. It supersedes §1–§2 of `docs/superpowers/specs/2026-09-08-plan-5-graded-reading-course-design.md`.

## Global Constraints

- **Course order** = grammar points sorted by `(levels.ord, grammar_points.layer, grammar_points.title)` — the same order `content-db` and the placement test already use. JLPT level locks (rule 4g) do **not** apply to the course.
- **Course lesson = one grammar point.** No `content/lessons/*.md` for the course. Text is not part of a course lesson in this iteration.
- **Finale card creation** (mirrors plan 5-3, spec §3 step 2): on a grammar lesson's first completion, inside a `completedRef` + `isLessonComplete` guard, for the grammar point and each resolved auto-kanji id with no existing card: `const { card } = review(newCard(type, id, now), 3, now, 0, params); user.upsertCard(card)`. **Rating is `3`.** `insertReviewLog` is **never** called. FSRS params read exactly as `PlacementScreen` does: `{ requestRetention: user.getSetting('fsrs_request_retention', 0.9), maximumInterval: user.getSetting('fsrs_maximum_interval', 365), enableFuzz: user.getSetting('fsrs_enable_fuzz', true) }`. Skip an id that does not resolve to real content of its type (`content.getGrammar` / `content.getKanji` returns null) — never mint a ghost card.
- **Auto-kanji:** at build time, for every grammar point, strip ruby (`X[よみ]` → `X`) from each example's `jaRuby`, collect unique CJK ideographs in first-appearance order, keep those where `{levelcode}-{char}` resolves in `kanji_points` for any shipped level. Stored in a new `grammar_kanji` table. Vocab is **not** extracted (no Japanese segmentation) — deferred.
- **Progress keys:** reuse `course_completed_ids: string[]` and `course_progress: Record<id, {step:number}>`, now holding grammar-point ids. A one-shot `migrateCourseKeys` moves non-grammar ids out to `texts_read_ids`.
- **Texts section:** restored `TextsListScreen` (`/texts`) + `TextDetailScreen` (`/texts/:id`), free reading, read marks in `texts_read_ids`, no cards, no gating. `content/lessons/*.md` (15 files) are its corpus, unchanged.
- **Node/npm on PATH** — run `npm` / `npx` directly.
- **`content/**` and `resources/content.db` are git-ignored.** `pretest` / `build-content` rebuild `content.db` locally. No content files are edited by this plan.
- **Baseline** (measured on `main` at `bae80b0`): `npx vitest run` → **57 files, 442 tests**; `npx playwright test` → **30 tests**. Each task states its delta; the last task re-measures.
- **Final regression** (last task): `npm run typecheck && npm run lint && npx vitest run && npm run build && npx playwright test && npm run build:desktop:installer`.
- **Version:** `package.json` is already `1.6.0` (bumped by plan 5-3, never released). This plan does **not** bump again. The last task builds the installer and commits locally; **`git push` and `gh release create` are explicitly out of scope for the executor** — they are surfaced to the user with the Finding-1 context (a fresh user needs at least the grammar course working end to end before release).

---

## File Structure

```
scripts/build-content/
  grammar-kanji.ts     # NEW — extract JLPT kanji ids from a grammar point's example furigana
  write-db.ts          # MOD — create grammar_kanji table rows; later (Task 9) drop lesson_introduces/lesson_markers inserts
  schema.sql           # MOD — + grammar_kanji table; later (Task 9) − lesson_introduces, lesson_markers
  lessons.ts           # MOD (Task 9) — drop introduces/markers/marker-parser, keep body+translation+questions
  parse-grammar.ts     # unchanged

src/storage/
  content-db.ts        # MOD — + listCourseGrammar(); getGrammar() gains kanjiIds; later (Task 9) getLesson() drops introduces/markers

src/core/
  course.ts            # MOD (Task 3) — + listCourseGrammar consumer helpers; (Task 9) − old free-reading/gating fns, − migrateTextsRead
  types.ts             # MOD (Task 9) — − LessonIntroduce, LessonMarker; − introducesCount/isFreeReading on LessonMeta
  quiz/
    grammar-reinforce.ts   # NEW — buildGrammarReinforce(point, levelPoints, seed): Question[]  (replaces the lesson-marker path)
    lesson-reinforce.ts    # DELETE (Task 9)

src/ui/
  routes.tsx           # MOD — + /course/:grammarId; (Task 7) real /texts + /texts/:id + /lesson/:id→/texts/:id; (Task 9) − LessonRoute
  components/
    Nav.tsx            # MOD (Task 7) — "Тексты" nav item back; rename current /course item to "Курс"
    GrammarPointBody.tsx   # NEW (Task 4) — shared "body + Примеры" markup, used by GrammarDetailScreen and GrammarLessonScreen
    GrammarReinforceStep.tsx  # NEW (Task 5) — wraps buildGrammarReinforce + QuestionView + grade
    LessonReinforceStep.tsx / LessonReader.tsx / ComprehensionQuiz.tsx / LessonNewStep.tsx / FlashCard.tsx  # DELETE (Task 9)
  screens/
    GrammarLessonScreen.tsx  # NEW (Task 5) — /course/:grammarId, 3 steps
    CourseScreen.tsx         # MOD (Task 6) — grammar-point list, 3 visual states
    GrammarDetailScreen.tsx  # MOD (Task 4) — use GrammarPointBody
    TextsListScreen.tsx      # NEW (Task 7) — restored from 37b4763^, adapted
    TextDetailScreen.tsx     # NEW (Task 7) — restored from 37b4763^, adapted
    LessonScreen.tsx         # DELETE (Task 9)
    TodayScreen.tsx          # MOD (Task 8) — course card → currentCourseLessonId
    ProgressScreen.tsx       # MOD (Task 8) — "Курс: X из Y" over grammar points
  UserDbProvider.tsx   # MOD (Task 8) — migrateTextsRead → migrateCourseKeys
```

---

### Task 1: `ContentDb.listCourseGrammar()` — the course spine

**Files:**
- Modify: `src/storage/content-db.ts` (add a method near `listGrammar`, ~line 129)
- Test: `tests/storage/content-db.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `listCourseGrammar(): GrammarPoint[]` — every grammar point, ordered `(levels.ord, grammar_points.layer, grammar_points.title)`. List columns only (`bodyMarkdown: ''`, `examples: []`, `related: []`), same shape `listGrammar` returns.

- [ ] **Step 1: Write the failing test**

Add to `tests/storage/content-db.test.ts` (it already opens a real `ContentDb` from the built `resources/content.db` via the test adapter — follow the existing `describe`/`beforeAll` in that file):

```ts
it('listCourseGrammar returns every grammar point in (level, layer, title) order', () => {
  const all = db.listCourseGrammar();
  // every point is present
  const n5 = db.listGrammar('N5').length;
  const n4 = db.listGrammar('N4').length;
  expect(all.length).toBe(n5 + n4);
  // N5 fully precedes N4 (levels.ord)
  const lastN5 = all.map((p) => p.level).lastIndexOf('N5');
  const firstN4 = all.map((p) => p.level).indexOf('N4');
  expect(lastN5).toBeLessThan(firstN4);
  // within a level: non-decreasing layer, then title
  const n5only = all.filter((p) => p.level === 'N5');
  for (let i = 1; i < n5only.length; i++) {
    const a = n5only[i - 1]!, b = n5only[i]!;
    expect(a.layer < b.layer || (a.layer === b.layer && a.title.localeCompare(b.title) <= 0)).toBe(true);
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/storage/content-db.test.ts`
Expected: FAIL — `db.listCourseGrammar is not a function`.

- [ ] **Step 3: Implement**

In `src/storage/content-db.ts`, after `listGrammar`:

```ts
  /** Every grammar point, in course order: level ord, then layer, then title. */
  listCourseGrammar(): GrammarPoint[] {
    return this.all<GrammarListRow>(
      `SELECT g.id, g.level, g.title, g.layer, g.tags_json
         FROM grammar_points g JOIN levels l ON l.code = g.level
        ORDER BY l.ord, g.layer, g.title`,
    ).map((r) => this.rowToPoint(r));
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/storage/content-db.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + full suite**

Run: `npm run typecheck && npx vitest run`
Expected: typecheck clean; 442 prior + 1 new pass.

- [ ] **Step 6: Commit**

```bash
git add src/storage/content-db.ts tests/storage/content-db.test.ts
git commit -m "feat(content-db): listCourseGrammar — every grammar point in course order

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Auto-kanji extraction in the build pipeline

**Files:**
- Create: `scripts/build-content/grammar-kanji.ts`
- Modify: `scripts/build-content/schema.sql` (add `grammar_kanji` table)
- Modify: `scripts/build-content/write-db.ts` (`buildContentDb` — insert `grammar_kanji` rows in pass 1)
- Modify: `src/storage/content-db.ts` (`getGrammar` gains `kanjiIds`; `GrammarRow` / `rowToPoint` unaffected — `kanjiIds` is a separate query)
- Modify: `src/core/types.ts` (`GrammarPoint` gains `kanjiIds: string[]`)
- Test: `tests/build-content/grammar-kanji.test.ts` (new), `tests/storage/content-db.test.ts`

**Interfaces:**
- Consumes: `parseRuby` from `@/core/ruby` (`parseRuby(s: string): { base: string; ruby: string | null }[]`).
- Produces:
  - `extractGrammarKanji(examples: { jaRuby: string }[], kanjiIdSet: ReadonlySet<string>, levelCodes: readonly string[]): string[]` — resolved kanji ids, first-appearance order, deduped.
  - `grammar_kanji(grammar_id TEXT, kanji_id TEXT)` table.
  - `GrammarPoint.kanjiIds: string[]` — populated by `getGrammar` (empty `[]` from list methods, like `examples`).

- [ ] **Step 1: Write the failing test for the extractor**

Create `tests/build-content/grammar-kanji.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { extractGrammarKanji } from '../../scripts/build-content/grammar-kanji';

describe('extractGrammarKanji', () => {
  const kanjiIds = new Set(['n5-学', 'n5-校', 'n5-行', 'n4-薬']);
  const levels = ['N5', 'N4'];

  it('collects resolvable JLPT kanji from example furigana, first-appearance order, deduped', () => {
    const examples = [
      { jaRuby: '学校[がっこう]で 勉強[べんきょう]します。' }, // 学 校 勉 強 — 勉/強 not in set
      { jaRuby: '学校[がっこう]へ 行[い]きます。' },            // 学 校 again, + 行
    ];
    expect(extractGrammarKanji(examples, kanjiIds, levels)).toEqual(['n5-学', 'n5-校', 'n5-行']);
  });

  it('ignores kana, punctuation, and ideographs with no matching id', () => {
    const examples = [{ jaRuby: 'これは 薬[くすり]です、ね。' }];
    expect(extractGrammarKanji(examples, kanjiIds, levels)).toEqual(['n4-薬']);
  });

  it('returns [] when there are no examples', () => {
    expect(extractGrammarKanji([], kanjiIds, levels)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/build-content/grammar-kanji.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the extractor**

Create `scripts/build-content/grammar-kanji.ts`:

```ts
import { parseRuby } from '../../src/core/ruby';

/** CJK ideograph range (kanji). Excludes 々/〻 repeat marks — not real kanji ids. */
const KANJI = /[㐀-鿿]/u;

/**
 * Every JLPT kanji id that appears in a grammar point's example sentences,
 * in first-appearance order, deduped. "Appears" = a bare ideograph in the
 * ruby-stripped text whose `${levelcode}-${char}` resolves in `kanjiIdSet`
 * for one of `levelCodes`.
 */
export function extractGrammarKanji(
  examples: { jaRuby: string }[],
  kanjiIdSet: ReadonlySet<string>,
  levelCodes: readonly string[],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const ex of examples) {
    // Drop the reading groups: parseRuby gives us the base text without "[...]".
    const bare = parseRuby(ex.jaRuby).map((s) => s.base).join('');
    for (const ch of bare) {
      if (!KANJI.test(ch)) continue;
      for (const code of levelCodes) {
        const id = `${code.toLowerCase()}-${ch}`;
        if (kanjiIdSet.has(id) && !seen.has(id)) {
          seen.add(id);
          out.push(id);
        }
      }
    }
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/build-content/grammar-kanji.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the schema table**

In `scripts/build-content/schema.sql`, after the `grammar_relations` table:

```sql
CREATE TABLE grammar_kanji (
  grammar_id TEXT NOT NULL REFERENCES grammar_points(id),
  kanji_id   TEXT NOT NULL,
  ord        INTEGER NOT NULL,
  PRIMARY KEY (grammar_id, kanji_id)
);
```

(`kanji_id` is not a FK — a build that resolved it already proved it exists, and keeping it FK-free avoids an insert-ordering constraint with `kanji_points`.)

- [ ] **Step 6: Wire it into `buildContentDb`**

In `scripts/build-content/write-db.ts`:

- add the import: `import { extractGrammarKanji } from './grammar-kanji';`
- the `kanji` array is loaded *after* grammar today. Move the `const kanji = loadAllKanji(...)` + its `validateKanji` + level check block **above** the grammar insert pass (right after `insLevel.free();`), so the kanji id set is available. The kanji INSERT loop (`insK`) can stay where it is or move with it — moving the whole block is simplest.
- in the grammar pass-1 loop, after `g.examples.forEach(...)`, add:

```ts
    const kanjiIds = extractGrammarKanji(
      g.examples,
      new Set(kanji.map((k) => k.id)),
      levels.map((l) => l.code),
    );
    kanjiIds.forEach((kid, i) => insGK.run([g.id, kid, i]));
```

- declare the prepared statement next to `insG` / `insE`:

```ts
  const insGK = db.prepare('INSERT INTO grammar_kanji (grammar_id, kanji_id, ord) VALUES (?,?,?)');
```

and `insGK.free();` alongside `insG.free(); insE.free();`.

- [ ] **Step 7: Expose `kanjiIds` on `GrammarPoint`**

In `src/core/types.ts`, add to the `GrammarPoint` interface (next to `examples`):

```ts
  /** JLPT kanji appearing in the examples — build-time extracted. Empty from list methods. */
  kanjiIds: string[];
```

In `src/storage/content-db.ts`:
- `rowToPoint` (used by list methods): add `kanjiIds: []` to the returned object (mirrors `examples: []`).
- `getGrammar`, after the `examples` query:

```ts
    point.kanjiIds = this.all<{ kanji_id: string }>(
      'SELECT kanji_id FROM grammar_kanji WHERE grammar_id = ? ORDER BY ord',
      [id],
    ).map((r) => r.kanji_id);
```

- [ ] **Step 8: Test `getGrammar().kanjiIds` against real content**

Add to `tests/storage/content-db.test.ts`:

```ts
it('getGrammar().kanjiIds are real kanji ids drawn from the examples', () => {
  // Pick any grammar point that has examples with kanji; n5-de-particle uses 学校/公園/電車…
  const p = db.getGrammar('n5-de-particle');
  expect(p).not.toBeNull();
  for (const kid of p!.kanjiIds) {
    expect(db.getKanji(kid)).not.toBeNull();
  }
  // 学 appears in its first example ("学校で…") and is an N5 kanji
  expect(p!.kanjiIds).toContain('n5-学');
});
```

(If `n5-de-particle` or `n5-学` is not in the shipped content, pick another point + kanji the executor verifies with `grep -l` in `content/grammar/` and `content/kanji/n5.tsv` — the assertion shape stays.)

- [ ] **Step 9: Rebuild content + full suite**

Run: `npm run build-content && npm run typecheck && npx vitest run`
Expected: `content.db` rebuilds without a validation error; typecheck clean; 443 prior + 4 new pass. `getGrammar` consumers elsewhere still compile (`kanjiIds` is additive).

- [ ] **Step 10: Commit**

```bash
git add scripts/build-content/grammar-kanji.ts scripts/build-content/schema.sql scripts/build-content/write-db.ts src/storage/content-db.ts src/core/types.ts tests/build-content/grammar-kanji.test.ts tests/storage/content-db.test.ts
git commit -m "feat(content): extract example kanji per grammar point (grammar_kanji table)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `src/core/course.ts` — grammar-point course model (additive)

**Files:**
- Modify: `src/core/course.ts` (add functions; leave the existing ones in place — Task 9 removes the dead ones)
- Test: `tests/core/course.test.ts`

**Interfaces:**
- Consumes: `GrammarPoint` from `@/core/types`; `ContentDb.getGrammar` (for the `hasCard` guard the caller builds; the module itself stays db-agnostic).
- Produces:
  - `currentCourseLessonId(points: readonly {id: string}[], completedIds: ReadonlySet<string>, hasCard: (id: string) => boolean): string | null` — first point that is neither completed nor carded.
  - `courseLessonState(point: {id: string}, currentId: string | null, completedIds: ReadonlySet<string>, hasCard: (id: string) => boolean): 'done' | 'current' | 'ahead'`.
  - `nextCourseLessonId(points: readonly {id: string}[], afterId: string): string | null` — next point in list order, or null.
  - Unchanged and kept: `courseCompletedIds`, `isLessonComplete`, `getCourseStep`, `setCourseStep`, `markLessonComplete`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/core/course.test.ts` a new `describe('grammar course', ...)`:

```ts
import {
  currentCourseLessonId, courseLessonState, nextCourseLessonId,
} from '@/core/course';

const pts = [{ id: 'g1' }, { id: 'g2' }, { id: 'g3' }, { id: 'g4' }];

describe('grammar course', () => {
  it('currentCourseLessonId skips completed and already-carded points', () => {
    const completed = new Set(['g1']);
    const carded = new Set(['g2']); // known from placement
    const cur = currentCourseLessonId(pts, completed, (id) => carded.has(id));
    expect(cur).toBe('g3');
  });

  it('currentCourseLessonId is null when every point is done or carded', () => {
    const done = new Set(['g1', 'g2', 'g3', 'g4']);
    expect(currentCourseLessonId(pts, done, () => false)).toBeNull();
  });

  it('courseLessonState labels done / current / ahead', () => {
    const completed = new Set(['g1']);
    const hasCard = (id: string) => id === 'g2';
    const cur = currentCourseLessonId(pts, completed, hasCard); // 'g3'
    expect(courseLessonState({ id: 'g1' }, cur, completed, hasCard)).toBe('done');
    expect(courseLessonState({ id: 'g2' }, cur, completed, hasCard)).toBe('done'); // carded
    expect(courseLessonState({ id: 'g3' }, cur, completed, hasCard)).toBe('current');
    expect(courseLessonState({ id: 'g4' }, cur, completed, hasCard)).toBe('ahead');
  });

  it('nextCourseLessonId returns the next list entry or null at the end', () => {
    expect(nextCourseLessonId(pts, 'g2')).toBe('g3');
    expect(nextCourseLessonId(pts, 'g4')).toBeNull();
    expect(nextCourseLessonId(pts, 'nope')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/core/course.test.ts`
Expected: FAIL — the three functions are not exported.

- [ ] **Step 3: Implement**

Append to `src/core/course.ts`:

```ts
/** First course point the user has neither finished nor already has a card for. */
export function currentCourseLessonId(
  points: readonly { id: string }[],
  completedIds: ReadonlySet<string>,
  hasCard: (id: string) => boolean,
): string | null {
  return points.find((p) => !completedIds.has(p.id) && !hasCard(p.id))?.id ?? null;
}

export type CourseState = 'done' | 'current' | 'ahead';

export function courseLessonState(
  point: { id: string },
  currentId: string | null,
  completedIds: ReadonlySet<string>,
  hasCard: (id: string) => boolean,
): CourseState {
  if (completedIds.has(point.id) || hasCard(point.id)) return 'done';
  if (point.id === currentId) return 'current';
  return 'ahead';
}

/** The next point after `afterId` in list order, or null. */
export function nextCourseLessonId(
  points: readonly { id: string }[],
  afterId: string,
): string | null {
  const i = points.findIndex((p) => p.id === afterId);
  if (i === -1 || i + 1 >= points.length) return null;
  return points[i + 1]!.id;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/core/course.test.ts`
Expected: PASS — new tests plus every existing `course.test.ts` test (the old functions are untouched).

- [ ] **Step 5: Typecheck + full suite**

Run: `npm run typecheck && npx vitest run`
Expected: typecheck clean; 447 prior + 4 new.

- [ ] **Step 6: Commit**

```bash
git add src/core/course.ts tests/core/course.test.ts
git commit -m "feat(course): grammar-point course model (currentCourseLessonId, courseLessonState, nextCourseLessonId)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `GrammarPointBody` component + `buildGrammarReinforce`

**Files:**
- Create: `src/ui/components/GrammarPointBody.tsx`
- Modify: `src/ui/screens/GrammarDetailScreen.tsx` (use the new component)
- Create: `src/core/quiz/grammar-reinforce.ts`
- Test: `tests/ui/GrammarPointBody.test.tsx` (new), `tests/core/grammar-reinforce.test.ts` (new), `tests/ui/GrammarDetailScreen.test.tsx` (adjust if it asserts the inlined markup)

**Interfaces:**
- Consumes: `GrammarPointFull` (`getGrammar` return); `GrammarMarkdown`, `Furigana`; `generateForCard` from `@/core/quiz/registry` (`generateForCard(point, levelPoints, reps, dayKey): Question` — **throws** if no generator produces one); `levelPointsFor` from `@/core/quiz/level-points`.
- Produces:
  - `<GrammarPointBody point={GrammarPointFull} />` — renders `<GrammarMarkdown source={point.bodyMarkdown} />`, an `<h2>Примеры</h2>`, and the examples list (`Furigana` + ru). Exactly the markup currently inlined in `GrammarDetailScreen` between `<GrammarMarkdown>` and "Связанные пункты".
  - `buildGrammarReinforce(point: GrammarPointFull, levelPoints: readonly GrammarPointFull[], seed: string, count?: number): Question[]` — up to `count` (default 3) distinct questions for the point; skips a slot whose generator chain throws; returns `[]` if none succeed.

- [ ] **Step 1: Write the failing test for `buildGrammarReinforce`**

Create `tests/core/grammar-reinforce.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildGrammarReinforce } from '@/core/quiz/grammar-reinforce';
import type { GrammarPointFull } from '@/storage/content-db';

const point: GrammarPointFull = {
  id: 'n5-x', level: 'N5', title: 'X', layer: 1, tags: [], related: [], relatedTitles: [],
  kanjiIds: [],
  bodyMarkdown: '## Кратко\n\nテスト。\n\n## Образование\n\nA + B\n\n## Примеры\n\n## Частые ошибки\n\nn/a',
  examples: [
    { jaRuby: '学校[がっこう]で 勉強[べんきょう]します。', ru: 'Учусь в школе.' },
    { jaRuby: '公園[こうえん]で 遊[あそ]びます。', ru: 'Играю в парке.' },
    { jaRuby: '電車[でんしゃ]で 行[い]きます。', ru: 'Еду на поезде.' },
  ],
};

describe('buildGrammarReinforce', () => {
  it('produces up to `count` questions for a point with usable examples', () => {
    const qs = buildGrammarReinforce(point, [point], 's', 3);
    expect(qs.length).toBeGreaterThan(0);
    expect(qs.length).toBeLessThanOrEqual(3);
    // deterministic for a fixed seed
    expect(buildGrammarReinforce(point, [point], 's', 3).map((q) => q.id))
      .toEqual(qs.map((q) => q.id));
  });

  it('returns [] for a point whose generators cannot produce anything', () => {
    const empty = { ...point, examples: [] };
    expect(buildGrammarReinforce(empty, [empty], 's', 3)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/core/grammar-reinforce.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `buildGrammarReinforce`**

Create `src/core/quiz/grammar-reinforce.ts`:

```ts
import type { GrammarPointFull } from '@/storage/content-db';
import type { Question } from '@/core/quiz/types';
import { generateForCard } from '@/core/quiz/registry';

/**
 * Up to `count` reinforcement questions for one grammar point, built with the
 * same generator the daily review uses (`generateForCard`, which rotates
 * cloze/choice/assemble by a "reps" index and falls back across kinds). A slot
 * whose whole fallback chain fails is skipped; a point with no usable examples
 * yields `[]` and the caller shows "нечего закреплять".
 */
export function buildGrammarReinforce(
  point: GrammarPointFull,
  levelPoints: readonly GrammarPointFull[],
  seed: string,
  count = 3,
): Question[] {
  const out: Question[] = [];
  for (let i = 0; i < count; i++) {
    try {
      // vary the rotation slot per question; dayKey slot carries the per-question seed
      out.push(generateForCard(point, levelPoints, i, `${seed}:${i}`));
    } catch {
      // this rotation slot produced nothing for this point — skip it
    }
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/core/grammar-reinforce.test.ts`
Expected: PASS.

- [ ] **Step 5: Extract `GrammarPointBody`, write its test**

Create `src/ui/components/GrammarPointBody.tsx`:

```tsx
import type { GrammarPointFull } from '@/storage/content-db';
import { Furigana } from './Furigana';
import { GrammarMarkdown } from './GrammarMarkdown';

export function GrammarPointBody({ point }: { point: GrammarPointFull }) {
  return (
    <>
      <GrammarMarkdown source={point.bodyMarkdown} />
      <h2>Примеры</h2>
      <ul className="examples">
        {point.examples.map((ex, i) => (
          <li key={i} className="example">
            <div className="example-ja"><Furigana text={ex.jaRuby} /></div>
            <div className="example-ru">{ex.ru}</div>
          </li>
        ))}
      </ul>
    </>
  );
}
```

Create `tests/ui/GrammarPointBody.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GrammarPointBody } from '@/ui/components/GrammarPointBody';
import type { GrammarPointFull } from '@/storage/content-db';

const point = {
  id: 'n5-x', level: 'N5', title: 'X', layer: 1, tags: [], related: [], relatedTitles: [],
  kanjiIds: [],
  bodyMarkdown: '## Кратко\n\nКраткое объяснение.\n\n## Частые ошибки\n\nОшибка.',
  examples: [{ jaRuby: '学校[がっこう]。', ru: 'Школа.' }],
} as GrammarPointFull;

describe('GrammarPointBody', () => {
  it('renders the markdown body and the examples list', () => {
    render(<GrammarPointBody point={point} />);
    expect(screen.getByText(/Краткое объяснение/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Примеры' })).toBeInTheDocument();
    expect(screen.getByText('Школа.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Use it in `GrammarDetailScreen`**

In `src/ui/screens/GrammarDetailScreen.tsx`: replace the `<GrammarMarkdown source={point.bodyMarkdown} />` + `<h2>Примеры</h2>` + examples `<ul>` block with `<GrammarPointBody point={point} />`. Drop the now-unused `GrammarMarkdown` / `Furigana` imports if nothing else in the file uses them (the related-points list does not). If `tests/ui/GrammarDetailScreen.test.tsx` asserts example text, it still passes (same DOM); if it asserts on a class the block no longer has, adjust minimally.

- [ ] **Step 7: Run tests + typecheck**

Run: `npx vitest run tests/ui/GrammarPointBody.test.tsx tests/ui/GrammarDetailScreen.test.tsx tests/core/grammar-reinforce.test.ts && npm run typecheck`
Expected: all green.

- [ ] **Step 8: Full suite**

Run: `npx vitest run`
Expected: 451 prior + 3 new (GrammarPointBody 1, grammar-reinforce 2); GrammarDetailScreen unchanged count.

- [ ] **Step 9: Commit**

```bash
git add src/ui/components/GrammarPointBody.tsx src/ui/screens/GrammarDetailScreen.tsx src/core/quiz/grammar-reinforce.ts tests/ui/GrammarPointBody.test.tsx tests/core/grammar-reinforce.test.ts tests/ui/GrammarDetailScreen.test.tsx
git commit -m "feat(grammar): GrammarPointBody component + buildGrammarReinforce

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: `GrammarLessonScreen` — 3-step grammar lesson

**Files:**
- Create: `src/ui/components/GrammarReinforceStep.tsx`
- Create: `src/ui/screens/GrammarLessonScreen.tsx`
- Modify: `src/ui/routes.tsx` (add `/course/:grammarId`)
- Modify: `src/ui/theme.css` (small — a `.grammar-lesson` block if needed; reuse existing `.lesson-*` / `.reinforce` classes)
- Test: `tests/ui/GrammarLessonScreen.test.tsx` (new), `tests/ui/GrammarReinforceStep.test.tsx` (new)

**Interfaces:**
- Consumes: `useContentDb` (`getGrammar`, `getKanji`, `listGrammar`), `useUserDb` (`getCard`, `upsertCard`, `getSetting`); `review`, `newCard` from `@/core/srs`; `isLessonComplete`, `markLessonComplete`, `getCourseStep`, `setCourseStep`, `courseCompletedIds`, `listCourseGrammar`-based `nextCourseLessonId` (pass `db.listCourseGrammar()`); `buildGrammarReinforce`, `levelPointsFor`; `GrammarPointBody`; `QuestionView`, `grade`.
- Produces: route `/course/:grammarId` → `<GrammarLessonScreen key={grammarId} />` rendering 3 steps; on first completion, `upsertCard` for the grammar point (rating 3) and for each resolved `point.kanjiIds` entry, then `markLessonComplete`.

- [ ] **Step 1: Write the failing test for `GrammarReinforceStep`**

Create `tests/ui/GrammarReinforceStep.test.tsx`. Mock `@/core/quiz/grammar-reinforce` so the step's flow is what's under test, not the generator:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GrammarReinforceStep } from '@/ui/components/GrammarReinforceStep';

const q = {
  id: 'q1', kind: 'choice' as const, itemType: 'grammar' as const, itemId: 'n5-x',
  prompt: 'Выберите форму', choices: ['A', 'B', 'C', 'D'], answerIndex: 0,
};
vi.mock('@/core/quiz/grammar-reinforce', () => ({ buildGrammarReinforce: () => [q] }));
vi.mock('@/ui/useContentDb', () => ({ useContentDb: () => ({ listGrammar: () => [], getGrammar: () => null }) }));

const point = { id: 'n5-x', level: 'N5', examples: [] } as never;

describe('GrammarReinforceStep', () => {
  it('shows the question, grades an answer, and calls onDone after the last one', async () => {
    const onDone = vi.fn();
    render(<GrammarReinforceStep point={point} onDone={onDone} />);
    expect(screen.getByText('Выберите форму')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'A' }));
    expect(screen.getByRole('status')).toHaveTextContent(/Верно/);
    await userEvent.click(screen.getByRole('button', { name: /Завершить|Далее/ }));
    expect(onDone).toHaveBeenCalled();
  });

  it('renders a skip affordance and calls onDone when there are no questions', async () => {
    vi.doMock('@/core/quiz/grammar-reinforce', () => ({ buildGrammarReinforce: () => [] }));
    // (or pass a point whose mock returns []) — assert a "Дальше" button that calls onDone
  });
});
```

(The executor firms up the second test to match the mock mechanism they choose — the requirement is: empty questions → a button that calls `onDone`, no crash.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/ui/GrammarReinforceStep.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `GrammarReinforceStep`**

Model it on the current `LessonReinforceStep` (`src/ui/components/LessonReinforceStep.tsx`) but take a `GrammarPointFull` directly — no `lesson`, no markers:

```tsx
import { useMemo, useState } from 'react';
import type { GrammarPointFull } from '@/storage/content-db';
import { useContentDb } from '../useContentDb';
import { buildGrammarReinforce } from '@/core/quiz/grammar-reinforce';
import { levelPointsFor } from '@/core/quiz/level-points';
import { QuestionView } from './QuestionView';
import { grade } from '@/core/quiz/grade';
import type { Answer, GradedAnswer } from '@/core/quiz/types';

export function GrammarReinforceStep({
  point, onDone,
}: {
  point: GrammarPointFull;
  onDone: () => void;
}) {
  const db = useContentDb();
  const [seed] = useState(() => `${point.id}:${Date.now()}`);
  const questions = useMemo(
    () => buildGrammarReinforce(point, levelPointsFor(db, point.level), seed),
    [point, db, seed],
  );

  const [idx, setIdx] = useState(0);
  const [graded, setGraded] = useState<GradedAnswer | null>(null);

  if (questions.length === 0) {
    return (
      <div className="reinforce">
        <p className="muted">Нечего закреплять — сразу к итогу.</p>
        <button type="button" className="btn-primary" onClick={onDone}>Дальше</button>
      </div>
    );
  }

  const question = questions[idx]!;
  const last = idx + 1 >= questions.length;
  const answer = (a: Answer) => { if (!graded) setGraded(grade(question, a)); };
  const next = () => {
    if (last) { onDone(); return; }
    setIdx((n) => n + 1);
    setGraded(null);
  };

  return (
    <div className="reinforce">
      <QuestionView
        key={question.id}
        question={question}
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

- [ ] **Step 4: Run the step test**

Run: `npx vitest run tests/ui/GrammarReinforceStep.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write the failing test for `GrammarLessonScreen`**

Create `tests/ui/GrammarLessonScreen.test.tsx`. Follow the mock style of the current `tests/ui/LessonScreen.test.tsx` (a `store`-backed `useUserDb` mock with `getSetting`/`setSetting`, plus `getCard`/`upsertCard`/`insertReviewLog` spies; a fake content db). Render at `/course/n5-x` via a `MemoryRouter` + the `routes` table or a direct `<Routes>`.

Key assertions:

```tsx
it('walks the 3 steps and on finish creates a grammar card + example-kanji cards, no review log', async () => {
  cards.clear();
  store.progress = {};            // start at step 0
  store.completed = [];
  // fake getGrammar('n5-x') → point with kanjiIds: ['n5-学', 'n5-校'] and 3 examples
  // fake getKanji resolves 'n5-学' and 'n5-校'
  renderAt('/course/n5-x');

  // step 0 — Изучение
  expect(screen.getByText(/Краткое объяснение/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Понятно' }));

  // step 1 — Закрепление (mock buildGrammarReinforce → [] to keep the test about flow)
  await userEvent.click(screen.getByRole('button', { name: 'Дальше' }));

  // step 2 — Итог
  expect(screen.getByText(/Пункт пройден/)).toBeInTheDocument();
  const carded = upsertCard.mock.calls.map((c) => `${c[0].item_type}:${c[0].item_id}`).sort();
  expect(carded).toEqual(['grammar:n5-x', 'kanji:n5-校', 'kanji:n5-学'].sort());
  expect(insertReviewLog).not.toHaveBeenCalled();
  expect(setSetting).toHaveBeenCalledWith('course_completed_ids', ['n5-x']);
});

it('does not re-create cards when the point was already complete', () => {
  cards.clear();
  store.progress = { 'n5-x': { step: 2 } };
  store.completed = ['n5-x'];
  renderAt('/course/n5-x');
  expect(upsertCard).not.toHaveBeenCalled();
});

it('skips a kanji id that does not resolve in content', async () => {
  // point.kanjiIds includes 'n5-nope'; fake getKanji('n5-nope') → null
  // assert 'kanji:n5-nope' is absent from upsertCard calls
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run tests/ui/GrammarLessonScreen.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `GrammarLessonScreen`**

Model the step machine and finale effect on the current `src/ui/screens/LessonScreen.tsx` (steps + `completedRef` + `isLessonComplete` guard + FSRS params). `LAST_STEP = 2`. Steps: 0 `GrammarPointBody` + "Понятно" → `go(1)`; 1 `GrammarReinforceStep` → `go(2)`; 2 summary + finale effect + "К курсу" / "Следующий пункт".

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useContentDb } from '../useContentDb';
import { useUserDb } from '../useUserDb';
import {
  getCourseStep, setCourseStep, markLessonComplete, isLessonComplete,
  courseCompletedIds, nextCourseLessonId,
} from '@/core/course';
import { GrammarPointBody } from '../components/GrammarPointBody';
import { GrammarReinforceStep } from '../components/GrammarReinforceStep';
import { review, newCard } from '@/core/srs';

const LAST_STEP = 2; // 0 Изучение · 1 Закрепление · 2 Итог

export function GrammarLessonScreen() {
  const { grammarId = '' } = useParams();
  const db = useContentDb();
  const user = useUserDb();
  const point = useMemo(() => db.getGrammar(grammarId), [db, grammarId]);
  const courseIds = useMemo(() => db.listCourseGrammar().map((p) => ({ id: p.id })), [db]);

  const [step, setStep] = useState(() =>
    Math.max(0, Math.min(getCourseStep(user, grammarId), LAST_STEP)),
  );
  const completedRef = useRef(false);

  const go = (next: number) => {
    const s = Math.max(0, Math.min(next, LAST_STEP));
    setStep(s);
    if (s < LAST_STEP) setCourseStep(user, grammarId, s);
  };

  useEffect(() => {
    if (step !== LAST_STEP || completedRef.current) return;
    completedRef.current = true;
    if (isLessonComplete(user, grammarId)) return;

    const now = new Date();
    const params = {
      requestRetention: user.getSetting('fsrs_request_retention', 0.9),
      maximumInterval: user.getSetting('fsrs_maximum_interval', 365),
      enableFuzz: user.getSetting('fsrs_enable_fuzz', true),
    };
    const create = (type: 'grammar' | 'kanji', id: string) => {
      if (user.getCard(type, id)) return;
      const { card } = review(newCard(type, id, now), 3, now, 0, params);
      user.upsertCard(card);
    };
    if (point) {
      create('grammar', point.id);
      for (const kid of point.kanjiIds) {
        if (db.getKanji(kid)) create('kanji', kid);
      }
    }
    markLessonComplete(user, grammarId);
  }, [step, user, grammarId, point, db]);

  if (!point) {
    return (
      <section className="screen lesson-screen">
        <p className="muted">Пункт не найден.</p>
        <Link to="/course" className="back-link">← К курсу</Link>
      </section>
    );
  }

  const next = nextCourseLessonId(courseIds, grammarId);

  return (
    <section className="screen lesson-screen grammar-lesson">
      {step !== LAST_STEP && <Link to="/course" className="back-link">← К курсу</Link>}
      <h1>{point.title}</h1>

      {step === 0 && (
        <div className="lesson-step">
          <GrammarPointBody point={point} />
          <button type="button" className="btn-primary" onClick={() => go(1)}>Понятно</button>
        </div>
      )}

      {step === 1 && <GrammarReinforceStep point={point} onDone={() => go(2)} />}

      {step === 2 && (
        <div className="lesson-summary">
          <p className="lesson-summary-title">Пункт пройден ✓</p>
          <div className="lesson-summary-actions">
            <Link to="/course" className="btn-ghost">К курсу</Link>
            {next && <Link to={`/course/${next}`} className="btn-primary">Следующий пункт</Link>}
          </div>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 8: Add the route**

In `src/ui/routes.tsx`:

```tsx
import { GrammarLessonScreen } from './screens/GrammarLessonScreen';

function GrammarLessonRoute() {
  const { grammarId } = useParams();
  return <GrammarLessonScreen key={grammarId} />;
}
```

and in the `routes` array, right after `{ path: '/course', ... }`:

```tsx
  { path: '/course/:grammarId', element: <GrammarLessonRoute /> },
```

- [ ] **Step 9: Run tests + typecheck**

Run: `npx vitest run tests/ui/GrammarLessonScreen.test.tsx tests/ui/GrammarReinforceStep.test.tsx && npm run typecheck`
Expected: green.

- [ ] **Step 10: Full suite**

Run: `npx vitest run`
Expected: 454 prior + new (GrammarReinforceStep ~2, GrammarLessonScreen ~3). Nothing else touched.

- [ ] **Step 11: Commit**

```bash
git add src/ui/components/GrammarReinforceStep.tsx src/ui/screens/GrammarLessonScreen.tsx src/ui/routes.tsx src/ui/theme.css tests/ui/GrammarLessonScreen.test.tsx tests/ui/GrammarReinforceStep.test.tsx
git commit -m "feat(course): GrammarLessonScreen — 3-step grammar lesson, card on finish

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: `CourseScreen` — grammar-point list

**Files:**
- Modify: `src/ui/screens/CourseScreen.tsx` (full rewrite of the body)
- Modify: `src/ui/theme.css` (reuse existing `.course-*` classes; adjust only if needed)
- Test: `tests/ui/CourseScreen.test.tsx`

**Interfaces:**
- Consumes: `useContentDb().listCourseGrammar()`; `useUserDb()` (`getSetting('course_completed_ids')`, `getCard`); `currentCourseLessonId`, `courseLessonState` from `@/core/course`.
- Produces: `/course` screen listing every grammar point with a `done` / `current` / `ahead` marker and a "Продолжить" / "Начать курс" link to `/course/{currentCourseLessonId}`.

- [ ] **Step 1: Rewrite the test**

Replace `tests/ui/CourseScreen.test.tsx` body. Mock `@/core/course` helpers or feed a fake content db + user db. Assertions:

```tsx
it('lists every grammar point with done / current / ahead markers', () => {
  // fake listCourseGrammar → [{id:'g1',title:'A'},{id:'g2',title:'B'},{id:'g3',title:'C'}]
  // completed = ['g1'], carded: none → current = 'g2'
  renderScreen();
  expect(screen.getByText('A').closest('[data-state]')).toHaveAttribute('data-state', 'done');
  expect(screen.getByText('B').closest('[data-state]')).toHaveAttribute('data-state', 'current');
  expect(screen.getByText('C').closest('[data-state]')).toHaveAttribute('data-state', 'ahead');
});

it('the continue button targets the current point and says "Начать курс" when nothing is done', () => {
  // completed = [], carded none → current = 'g1'
  renderScreen();
  const cta = screen.getByRole('link', { name: /Начать курс/ });
  expect(cta).toHaveAttribute('href', '#/course/g1');
});

it('says "Продолжить" once at least one point is done', () => {
  // completed = ['g1'] → current 'g2'
  renderScreen();
  expect(screen.getByRole('link', { name: /Продолжить/ })).toHaveAttribute('href', '#/course/g2');
});

it('shows a "курс пройден" state when every point is done', () => {
  // completed = all → current null; assert no continue link / a done message
  renderScreen();
  expect(screen.queryByRole('link', { name: /Продолжить|Начать курс/ })).toBeNull();
});
```

(`#/course/...` because the app uses a hash router; match whatever the existing CourseScreen tests assert for hrefs.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/ui/CourseScreen.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Rewrite `CourseScreen.tsx`**

```tsx
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useContentDb } from '../useContentDb';
import { useUserDb } from '../useUserDb';
import { currentCourseLessonId, courseLessonState, type CourseState } from '@/core/course';

const STATE_LABEL: Record<CourseState, string> = {
  done: '✓ пройден',
  current: '● текущий',
  ahead: '',
};

export function CourseScreen() {
  const db = useContentDb();
  const user = useUserDb();
  const points = useMemo(() => db.listCourseGrammar(), [db]);
  const completed = user.getSetting<string[]>('course_completed_ids', []);
  const completedSet = useMemo(() => new Set(completed), [completed]);
  const hasCard = (id: string) => user.getCard('grammar', id) != null;
  const currentId = currentCourseLessonId(points, completedSet, hasCard);
  const current = currentId ? points.find((p) => p.id === currentId) ?? null : null;

  return (
    <section className="screen course">
      <h1>Курс</h1>

      {current ? (
        <Link to={`/course/${current.id}`} className="btn-primary course-continue">
          {completedSet.size === 0 ? 'Начать курс' : 'Продолжить'} · {current.title}
        </Link>
      ) : (
        <p className="muted">Курс пройден — все пункты грамматики изучены.</p>
      )}

      <ul className="course-list">
        {points.map((p) => {
          const state = courseLessonState(p, currentId, completedSet, hasCard);
          return (
            <li key={p.id} className="course-item" data-lesson={p.id} data-state={state}>
              <Link to={`/course/${p.id}`} className="course-item-link">
                <span className="course-item-title">{p.title}</span>
                <span className="course-item-state" data-state={state}>{STATE_LABEL[state]}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run tests/ui/CourseScreen.test.tsx && npm run typecheck`
Expected: green. (`courseLessonStates` and other old `course.ts` exports are still present and still compile — used by the not-yet-deleted `LessonScreen`.)

- [ ] **Step 5: Full suite**

Run: `npx vitest run`
Expected: green; count shifts only by the CourseScreen test rewrite.

- [ ] **Step 6: Commit**

```bash
git add src/ui/screens/CourseScreen.tsx src/ui/theme.css tests/ui/CourseScreen.test.tsx
git commit -m "feat(course): CourseScreen lists grammar points with done/current/ahead

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Restore the "Тексты" section

**Files:**
- Create: `src/ui/screens/TextsListScreen.tsx` (from `git show 37b4763^:src/ui/screens/TextsListScreen.tsx`, adapted)
- Create: `src/ui/screens/TextDetailScreen.tsx` (from `git show 37b4763^:src/ui/screens/TextDetailScreen.tsx`, adapted)
- Modify: `src/ui/components/Nav.tsx` (rename current `/course` item label to "Курс"; add a "Тексты" `/texts` item)
- Modify: `src/ui/routes.tsx` (`/texts` → `TextsListScreen`, `/texts/:id` → `TextDetailScreen`, `/lesson/:id` → `<Navigate to={`/texts/${id}`} replace />`)
- Test: `tests/ui/TextsListScreen.test.tsx` (new), `tests/ui/TextDetailScreen.test.tsx` (new)
- Test (e2e): `tests/e2e/texts.spec.ts` (new)

**Interfaces:**
- Consumes: `useContentDb().listLessons()` / `.getLesson(id)` (current signatures: `LessonMeta` has `id, stage, kind, title, introducesCount, isFreeReading`; `LessonFull` adds `bodyRuby, translationRu, questions`); `useUserDb()` `getSetting`/`setSetting` for `texts_read_ids`.
- Produces: `/texts` list ordered by `stage`, `/texts/:id` detail with body + toggle translation + one-at-a-time comprehension questions + read mark on completion.

- [ ] **Step 1: Recover and adapt `TextsListScreen`**

`git show 37b4763^:src/ui/screens/TextsListScreen.tsx > src/ui/screens/TextsListScreen.tsx`, then adapt:
- **Remove** the level-tab shim (`STAGE_LEVEL_SPLIT`, `levelOfStage`, `useEffectiveLevels`, the `role="tablist"` block, the `coming_soon`/`locked` branch). The spec wants one flat list ordered by `stage`.
- Result: a `<h1>Тексты</h1>` + a `<ul>` over `db.listLessons()` (already `ORDER BY stage, id`), each row a `<Link to={/texts/${p.id}}>` with title + a `✓` when `p.id` is in `texts_read_ids`.

```tsx
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useContentDb } from '../useContentDb';
import { useUserDb } from '../useUserDb';

export function TextsListScreen() {
  const db = useContentDb();
  const user = useUserDb();
  const lessons = useMemo(() => db.listLessons(), [db]);
  const readIds = user.getSetting<string[]>('texts_read_ids', []);

  return (
    <section className="screen">
      <h1>Тексты</h1>
      {lessons.length === 0 ? (
        <p className="muted">Текстов пока нет.</p>
      ) : (
        <ul className="text-list">
          {lessons.map((p) => (
            <li key={p.id}>
              <Link to={`/texts/${p.id}`} className="text-list-item">
                <span className="text-list-title">{p.title}</span>
                {readIds.includes(p.id) && <span className="text-read-badge" aria-label="прочитано">✓</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Recover `TextDetailScreen`**

`git show 37b4763^:src/ui/screens/TextDetailScreen.tsx > src/ui/screens/TextDetailScreen.tsx`. It is already self-contained and reads `db.getLesson(id)`, splits `bodyRuby` / `translationRu` on `\n\n`, renders `<Furigana>` paragraphs, a translation toggle, one-at-a-time questions with a coloured `role="status"` verdict, and marks `texts_read_ids` on completion via a `markedRef` effect. No adaptation needed unless `tsc` complains about a type drift — if so, fix minimally.

- [ ] **Step 3: Nav + routes**

`src/ui/components/Nav.tsx` — change the destinations list:

```tsx
  { to: '/course', label: 'Курс', icon: '📚' },
  { to: '/texts', label: 'Тексты', icon: '📖' },
```

(insert both where the single `/course` entry currently sits, keeping the overall order Сегодня · Грамматика · Кандзи · Слова · Курс · Тексты · Прогресс — or Сегодня · Курс · Тексты · … if that reads better; the executor picks one, the tests assert the labels exist).

`src/ui/routes.tsx`:
- add imports for `TextsListScreen`, `TextDetailScreen`.
- replace `{ path: '/texts', element: <Navigate to="/course" replace /> }` with `{ path: '/texts', element: <TextsListScreen /> }`.
- replace `{ path: '/texts/:id', element: <TextDetailRedirect /> }` with `{ path: '/texts/:id', element: <TextDetailScreen /> }`.
- change `TextDetailRedirect` — delete it; instead add a `LessonToTextRedirect`:

```tsx
function LessonToTextRedirect() {
  const { id } = useParams();
  return <Navigate to={`/texts/${id}`} replace />;
}
```

  and change `{ path: '/lesson/:id', element: <LessonRoute /> }` to `{ path: '/lesson/:id', element: <LessonToTextRedirect /> }`. Leave `LessonRoute` / the `LessonScreen` import in place for now — Task 9 removes them (keeping this task's diff focused; an unused import is a lint warning at worst, and `LessonRoute` is still referenced until you change this line — so actually: change the line AND delete `LessonRoute` + the `LessonScreen` import in this task if lint fails on unused, otherwise defer to Task 9). Executor: run `npm run lint` and follow what it says.

- [ ] **Step 4: Write the screen tests**

`tests/ui/TextsListScreen.test.tsx` — fake `listLessons` returns 3 metas by stage; `texts_read_ids` has one; assert order, titles, the `✓` on the read one, and the `/texts/:id` hrefs.

`tests/ui/TextDetailScreen.test.tsx` — fake `getLesson` returns a `LessonFull` with 2 `\n\n` paragraphs, a translation, 2 questions; assert: paragraphs render, translation hidden until the toggle, a question at a time, verdict after answering, "Завершить" on the last, and that finishing calls `setSetting('texts_read_ids', [<id>])`.

- [ ] **Step 5: Write the e2e**

`tests/e2e/texts.spec.ts` — launch with `writeSeededUserDb(userData, { learnedIds: [], dueIds: [] })` (fresh), navigate to `/texts` (or click the nav item), open the first text, answer its questions, assert "прочитан", relaunch, assert the `✓` persisted on the list. Also assert `/lesson/<some id>` in the address resolves to `/texts/<id>` (open it via `win.evaluate` route push or a link).

- [ ] **Step 6: Run tests + typecheck + lint**

Run: `npx vitest run tests/ui/TextsListScreen.test.tsx tests/ui/TextDetailScreen.test.tsx && npm run typecheck && npm run lint && npm run build && npx playwright test tests/e2e/texts.spec.ts`
Expected: green.

- [ ] **Step 7: Full suite**

Run: `npx vitest run`
Expected: green (+~7 new UI tests).

- [ ] **Step 8: Commit**

```bash
git add src/ui/screens/TextsListScreen.tsx src/ui/screens/TextDetailScreen.tsx src/ui/components/Nav.tsx src/ui/routes.tsx tests/ui/TextsListScreen.test.tsx tests/ui/TextDetailScreen.test.tsx tests/e2e/texts.spec.ts
git commit -m "feat(texts): restore the free-reading Тексты section (/texts, /texts/:id)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Re-point "Сегодня" / "Прогресс" at grammar points + `migrateCourseKeys`

**Files:**
- Modify: `src/ui/screens/TodayScreen.tsx` (course card uses `currentCourseLessonId` over grammar points)
- Modify: `src/ui/screens/ProgressScreen.tsx` (`Курс: X из Y` counts grammar points)
- Modify: `src/core/course.ts` (add `migrateCourseKeys`; leave `migrateTextsRead` for Task 9 to delete)
- Modify: `src/ui/UserDbProvider.tsx` (call `migrateCourseKeys` instead of `migrateTextsRead`)
- Test: `tests/ui/TodayScreen.test.tsx`, `tests/ui/ProgressScreen.test.tsx`, `tests/core/course.test.ts`

**Interfaces:**
- Consumes: `listCourseGrammar`, `getGrammar`, `getCard`, `courseCompletedIds`, `currentCourseLessonId`.
- Produces: `migrateCourseKeys(user, content): void` — one-shot (marker `course_keys_migrated`): every id in `course_completed_ids` for which `content.getGrammar(id)` is null is unioned into `texts_read_ids` and dropped from `course_completed_ids`; non-grammar keys are removed from `course_progress`; the marker is set.

- [ ] **Step 1: `migrateCourseKeys` — failing test**

Add to `tests/core/course.test.ts`:

```ts
import { migrateCourseKeys } from '@/core/course';

function fakeUser(initial: Record<string, unknown>) {
  const store = { ...initial };
  return {
    getSetting: <T,>(k: string, d: T) => (k in store ? (store[k] as T) : d),
    setSetting: (k: string, v: unknown) => { store[k] = v; },
    _store: store,
  };
}
const fakeContent = { getGrammar: (id: string) => (id.startsWith('n5-') ? ({ id } as never) : null) };

describe('migrateCourseKeys', () => {
  it('moves non-grammar completed ids to texts_read_ids, once', () => {
    const u = fakeUser({
      course_completed_ids: ['n5-de-particle', 'hanami', 'konbini'],
      course_progress: { 'n5-de-particle': { step: 1 }, hanami: { step: 2 } },
      texts_read_ids: ['kitsune'],
    });
    migrateCourseKeys(u as never, fakeContent as never);
    expect(u._store['course_completed_ids']).toEqual(['n5-de-particle']);
    expect(new Set(u._store['texts_read_ids'] as string[])).toEqual(new Set(['kitsune', 'hanami', 'konbini']));
    expect(u._store['course_progress']).toEqual({ 'n5-de-particle': { step: 1 } });
    expect(u._store['course_keys_migrated']).toBe(true);
    // idempotent: a second run with grammar ids present does nothing
    u._store['course_completed_ids'] = ['n5-de-particle', 'stray'];
    migrateCourseKeys(u as never, fakeContent as never);
    expect(u._store['course_completed_ids']).toEqual(['n5-de-particle', 'stray']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/core/course.test.ts`
Expected: FAIL — `migrateCourseKeys` not exported.

- [ ] **Step 3: Implement `migrateCourseKeys`**

Append to `src/core/course.ts` (it can share `UserLike` but also needs `getGrammar` — accept a minimal content shape):

```ts
type GrammarLookup = { getGrammar(id: string): unknown | null };

/**
 * One-shot: the course used to store text-lesson ids in `course_completed_ids`
 * (plan 5-2's `migrateTextsRead`). The course is grammar points now, so any id
 * that is not a grammar point is an old text id — move it to `texts_read_ids`
 * and drop it from the course keys. Runs once (marker `course_keys_migrated`).
 */
export function migrateCourseKeys(user: UserLike, content: GrammarLookup): void {
  if (user.getSetting<boolean>('course_keys_migrated', false)) return;

  const completed = courseCompletedIds(user);
  const stray = completed.filter((id) => content.getGrammar(id) == null);
  if (stray.length > 0) {
    const read = new Set(user.getSetting<string[]>('texts_read_ids', []));
    for (const id of stray) read.add(id);
    user.setSetting('texts_read_ids', [...read]);
    user.setSetting(K_COMPLETED, completed.filter((id) => content.getGrammar(id) != null));

    const progress = { ...user.getSetting<ProgressMap>(K_PROGRESS, {}) };
    for (const id of Object.keys(progress)) {
      if (content.getGrammar(id) == null) delete progress[id];
    }
    user.setSetting(K_PROGRESS, progress);
  }
  user.setSetting('course_keys_migrated', true);
}
```

- [ ] **Step 4: Wire it in `UserDbProvider`**

In `src/ui/UserDbProvider.tsx`: change `import { migrateTextsRead } from '@/core/course';` → `import { migrateCourseKeys } from '@/core/course';` and the call site `migrateTextsRead(db);` → `if (contentRef.current) migrateCourseKeys(db, contentRef.current);` (the content db is already available there for `backfillUnlockedFromProgress`).

- [ ] **Step 5: `TodayScreen` — course card over grammar points**

In `src/ui/screens/TodayScreen.tsx`, replace the `currentMandatoryLessonId` / `content.listLessons()` computation with:

```ts
  const points = content.listCourseGrammar();
  const completedSet = new Set(courseCompletedIds(user));
  const hasCard = (id: string) => user.getCard('grammar', id) != null;
  const curId = currentCourseLessonId(points, completedSet, hasCard);
  const curPoint = curId ? points.find((p) => p.id === curId) ?? null : null;
```

and the card:

```tsx
  {curPoint ? (
    <Link className="btn-ghost today-course" to={`/course/${curPoint.id}`}>
      {completedSet.size === 0 ? 'Начать курс' : 'Продолжить курс'} · {curPoint.title}
    </Link>
  ) : (
    <Link className="btn-ghost today-course" to="/course">Курс</Link>
  )}
```

Update `tests/ui/TodayScreen.test.tsx`: swap the `@/core/course` mock to expose `currentCourseLessonId` + `courseCompletedIds`, the content mock to expose `listCourseGrammar` (a small fixture), and adjust the two course-card tests to the new hrefs (`#/course/<id>`).

- [ ] **Step 6: `ProgressScreen` — course line over grammar points**

In `src/ui/screens/ProgressScreen.tsx`, replace the `content.listLessons()` course-count computation with:

```ts
  const coursePoints = content.listCourseGrammar();
  const grammarIds = new Set(coursePoints.map((p) => p.id));
  const doneCount = courseCompletedIds(user).filter((x) => grammarIds.has(x)).length;
```

and render `Курс: пройдено {doneCount} из {coursePoints.length} уроков`. Update `tests/ui/ProgressScreen.test.tsx` mock (`listCourseGrammar` fixture of 4, `courseCompletedIds` → 2 matching) — assertion text unchanged (`/Курс: пройдено 2 из 4/`).

- [ ] **Step 7: Run tests + typecheck**

Run: `npx vitest run tests/core/course.test.ts tests/ui/TodayScreen.test.tsx tests/ui/ProgressScreen.test.tsx && npm run typecheck`
Expected: green.

- [ ] **Step 8: Full suite**

Run: `npx vitest run`
Expected: green. (`migrateTextsRead` is still exported and still has its own test — untouched until Task 9.)

- [ ] **Step 9: Commit**

```bash
git add src/ui/screens/TodayScreen.tsx src/ui/screens/ProgressScreen.tsx src/core/course.ts src/ui/UserDbProvider.tsx tests/core/course.test.ts tests/ui/TodayScreen.test.tsx tests/ui/ProgressScreen.test.tsx
git commit -m "feat(course): Сегодня/Прогресс track grammar points; migrateCourseKeys reverse migration

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: Delete the old lesson-player machinery

**Files:**
- Delete: `src/ui/screens/LessonScreen.tsx`, `src/ui/components/LessonNewStep.tsx`, `src/ui/components/FlashCard.tsx`, `src/ui/components/LessonReader.tsx`, `src/ui/components/ComprehensionQuiz.tsx`, `src/ui/components/LessonReinforceStep.tsx`, `src/core/quiz/lesson-reinforce.ts`
- Delete: `tests/ui/LessonScreen.test.tsx`, `tests/ui/LessonNewStep.test.tsx`, `tests/ui/FlashCard.test.tsx`, `tests/ui/LessonReader.test.tsx`, `tests/ui/ComprehensionQuiz.test.tsx`, `tests/ui/LessonReinforceStep.test.tsx`, `tests/core/lesson-reinforce.test.ts` — plus any `tests/e2e/course.spec.ts` that drove the old player
- Modify: `src/ui/routes.tsx` (drop `LessonRoute` + `LessonScreen` import if still present)
- Modify: `src/core/course.ts` (delete `courseLessonStates`, `currentMandatoryLessonId`, `nextUnlockedLessonId`, `mandatory`, `CourseLessonState`, `migrateTextsRead`; keep the rest)
- Modify: `src/core/types.ts` (delete `LessonIntroduce`, `LessonMarker`; drop `introducesCount` + `isFreeReading` from `LessonMeta` and `LessonFull`; drop `introduces` + `markers` from `LessonFull`)
- Modify: `src/storage/content-db.ts` (`listLessons` drops the `introduces_count` subquery + the two derived fields; `getLesson` drops the `introduces` + `markers` queries and fields; delete now-unused row interfaces `LessonIntroduceRow` / `LessonMarkerRow` and the `LessonIntroduce`/`LessonMarker` imports)
- Modify: `scripts/build-content/schema.sql` (drop `CREATE TABLE lesson_introduces` and `CREATE TABLE lesson_markers`)
- Modify: `scripts/build-content/write-db.ts` (`insertLessons` — drop the `insLI` / `insLM` statements and the `introduces` / `reviews` / `markers` loops; keep `insL` + `insLQ`; drop the `refSets` param if now unused, or keep for `validateLessonRefs` if that still runs — see next line)
- Modify: `scripts/build-content/lessons.ts` (drop the `{{TYPE:id|surface}}` marker parser, `expandMarkers`, `validateLessonRefs`, marker/introduces fields on `ParsedLesson`; keep frontmatter + body + `## Перевод` + `## Вопросы` parsing and `validateLessons`)
- Test: adjust `tests/build-content/lessons.test.ts`, `tests/storage/content-db.test.ts` (drop introduces/markers assertions)

**Interfaces:**
- Consumes: nothing new.
- Produces: `LessonMeta = { id, stage, kind, title }`; `LessonFull = LessonMeta & { bodyRuby, translationRu, questions }`. `content/lessons/*.md` still parse (frontmatter `id/stage/kind/title` + `## Перевод` + `## Вопросы`); any `introduces_*` / `reviews` frontmatter keys and `{{...}}` markers in a file are now simply ignored, not an error.

- [ ] **Step 1: Delete the component/screen/test files**

```bash
git rm src/ui/screens/LessonScreen.tsx src/ui/components/LessonNewStep.tsx src/ui/components/FlashCard.tsx src/ui/components/LessonReader.tsx src/ui/components/ComprehensionQuiz.tsx src/ui/components/LessonReinforceStep.tsx src/core/quiz/lesson-reinforce.ts
git rm tests/ui/LessonScreen.test.tsx tests/ui/LessonNewStep.test.tsx tests/ui/FlashCard.test.tsx tests/ui/LessonReader.test.tsx tests/ui/ComprehensionQuiz.test.tsx tests/ui/LessonReinforceStep.test.tsx tests/core/lesson-reinforce.test.ts
git ls-files 'tests/e2e/course.spec.ts' && git rm tests/e2e/course.spec.ts || true
```

(If a listed test file does not exist, skip it — `git rm` the ones that do. Run `git ls-files 'tests/**/*esson*'` and `'tests/**/*lash*'` first to get the exact set.)

- [ ] **Step 2: Prune `src/core/course.ts`**

Delete `mandatory`, `currentMandatoryLessonId`, `courseLessonStates`, `nextUnlockedLessonId`, `CourseLessonState`, `CourseProgress` (if only used there), and `migrateTextsRead`. Keep: `UserLike`, `courseCompletedIds`, `isLessonComplete`, `getCourseStep`, `setCourseStep`, `markLessonComplete`, `currentCourseLessonId`, `courseLessonState`, `CourseState`, `nextCourseLessonId`, `migrateCourseKeys`, `ProgressMap`, `K_COMPLETED`, `K_PROGRESS`.

Update `tests/core/course.test.ts`: delete the tests for the removed functions.

- [ ] **Step 3: Prune the types**

`src/core/types.ts`: delete `LessonIntroduce` and `LessonMarker` interfaces. On `LessonMeta` remove `introducesCount` and `isFreeReading`. On `LessonFull` remove `introduces` and `markers`. Keep `LessonQuestion`, `bodyRuby`, `translationRu`, `questions`.

- [ ] **Step 4: Prune `content-db.ts`**

- `import` line: drop `LessonIntroduce, LessonMarker`.
- `listLessons`: query becomes `SELECT id, stage, kind, title FROM lessons ORDER BY stage, id`; map to `{ id, stage, kind, title }`.
- `getLesson`: drop the `introduces` and `markers` queries; the returned object is `{ id, stage, kind, title, bodyRuby, translationRu, questions }`.
- delete the `LessonIntroduceRow` / `LessonMarkerRow` interfaces and the `introduces_count` from `LessonMetaRow`.

- [ ] **Step 5: Prune the build pipeline**

- `schema.sql`: delete the `lesson_introduces` and `lesson_markers` `CREATE TABLE` statements.
- `write-db.ts` `insertLessons`: keep `insL` + `insLQ` loops; delete `insLI`, `insLM`, the `introduces` / `reviews` / `markers` loops, and the `sets` / `setFor` machinery. Drop the `validateLessonRefs(...)` call + `refSets` build in `buildContentDb` if `validateLessonRefs` is being removed (next bullet). Keep `validateLessons(lessons)`.
- `lessons.ts`: delete `MARKER_RE` / `expandMarkers` / the sentence-context extraction / `validateLessonRefs` / the `introduces` / `reviews` / `markers` fields on `ParsedLesson`. `parseLessonFile` keeps: frontmatter `id/stage/kind/title`, body → `bodyRuby` (no marker expansion — the body is used verbatim; if a file contains `{{...}}` the executor decides: strip the wrapper `{{x:id|text}}`→`text` with a one-liner regex, OR leave as-is since current files have none — check `grep -rl '{{' content/lessons/` first, today it returns nothing).

- [ ] **Step 6: Prune the route**

`src/ui/routes.tsx`: remove the `LessonScreen` import and `LessonRoute` function if they survived Task 7. `/lesson/:id` already points at `LessonToTextRedirect` from Task 7.

- [ ] **Step 7: Fix the pipeline tests**

`tests/build-content/lessons.test.ts` (or wherever the parser is tested): delete assertions about markers / introduces / `validateLessonRefs`; keep body/translation/questions parsing tests. `tests/storage/content-db.test.ts`: delete `getLesson().introduces` / `.markers` assertions.

- [ ] **Step 8: Rebuild + typecheck + lint + full suite**

Run: `npm run build-content && npm run typecheck && npm run lint && npx vitest run`
Expected: `content.db` rebuilds; typecheck clean (no dangling refs — grep to confirm: `grep -rn "LessonScreen\|LessonReader\|ComprehensionQuiz\|LessonNewStep\|FlashCard\|LessonReinforceStep\|lesson-reinforce\|courseLessonStates\|currentMandatoryLessonId\|migrateTextsRead\|introducesCount\|isFreeReading\|LessonIntroduce\|LessonMarker" src/ scripts/ tests/` → only the new `grammar-reinforce` and unrelated hits); lint clean; vitest green (count drops by the deleted test files, ~-20).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: remove the text-first lesson player superseded by the grammar course

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: e2e re-seed, full regression, installer (local)

**Files:**
- Modify: any `tests/e2e/*.spec.ts` that still references the old course/lesson flow or `/course` as "Тексты"
- Modify: `tests/e2e/helpers/seed-user-db.ts` only if a new seed shape is needed (unlikely)
- No production code changes.

- [ ] **Step 1: Audit the e2e suite**

Run: `grep -rln "/lesson/\|/course\|Тексты\|Продолжить курс\|Начать курс\|listLessons\|course_completed" tests/e2e/*.spec.ts` and read each hit. Expected work:
- a spec that navigated the old 5-step player → rewrite against `/course/:grammarId` (3 steps) or delete if `tests/e2e/course.spec.ts` was already removed in Task 9.
- `today.spec.ts` / any spec asserting the "Продолжить курс" card → the card now links to `/course/<grammarId>`; update the href/text expectation.
- the nav now has both "Курс" and "Тексты" — a nav-count or nav-label assertion (e.g. in a smoke spec) may need the extra item.

- [ ] **Step 2: Add a course walk e2e**

`tests/e2e/course.spec.ts` (new or rewritten): fresh seeded db, open `/course`, click "Начать курс", walk the 3 steps (Понятно → answer/skip reinforce → Итог), relaunch, assert (a) the finished point shows `✓ пройден` on `/course`, (b) the next point is now `● текущий`, (c) a grammar card exists in `user.db` (byte sniff for `item_type`… `grammar`, mirroring `kanji-review.spec.ts`'s existing check), (d) if the point had example kanji, a `kanji` card too.

- [ ] **Step 3: Fix each spec, one file at a time**

For each: edit, then `npm run build && npx playwright test tests/e2e/<file>` until green. (`npm run build` once up front, re-run per file.)

- [ ] **Step 4: Full regression**

Run: `npm run typecheck && npm run lint && npx vitest run && npm run build && npx playwright test`
Expected: all green. Record the vitest file/test counts and the playwright count.

- [ ] **Step 5: Installer**

Run: `npm run build:desktop:installer`
Expected: `dist/Kotsukotsu Setup 1.6.0.exe` produced. If it fails **only** on the known winCodeSign `.7z`/symlink infra issue (`docs/RELEASE-CHECKLIST.md`), run `npm run build:desktop` instead and note it. Any other failure → stop and report.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e
git commit -m "test(e2e): cover the grammar course walk; drop old lesson-player specs

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Hand off the release decision**

Do **not** `git push` or `gh release create`. Report to the user:
- the branch state (local `main`, N commits ahead of `origin/main`, package.json `1.6.0`, installer built);
- that the course now works end to end from real grammar content (Finding 1 from the plan-5-3 final review is resolved — a fresh user acquires cards by walking the course);
- remaining pre-release checks they may want: a manual walk of one grammar lesson in the built app; deciding the version number (stay `1.6.0` or bump to `2.0.0` for the IA change);
- the memory files to update (`jlpt-desktop-app.md`, `jlpt-app-github.md`) once released.

---

## Self-Review

**1. Spec coverage:**

| Spec section | Task |
|---|---|
| §1 IA / routes (`/course`, `/course/:grammarId`, `/texts`, `/texts/:id`, `/lesson/:id`→redirect, nav) | 5 (route), 6, 7 |
| §2 `course.ts` rewrite (`listCourseGrammar` consumer, `currentCourseLessonId`, `courseLessonState`, `nextCourseLessonId`; delete old gating) | 3 (add), 9 (delete old) |
| §2 no JLPT level locks on course | 3/6 by construction (order is `listCourseGrammar`, no level gate) |
| §3 `GrammarLessonScreen` 3 steps (Изучение / Закрепление / Итог) | 5 |
| §3 finale effect — grammar card + auto-kanji, rating 3, guard, no `insertReviewLog`, ghost guard | 5 (Global Constraints + Step 7) |
| §4 auto-kanji build pipeline (`grammar_kanji` table, extractor, `getGrammar().kanjiIds`) | 2 |
| §5 SRS wiring survives (finale card, drip removal, Today card, Progress line, `new_per_day`, cleanup) | drip removal/`new_per_day`/cleanup already landed (plan 5-3 + `2dfb195`); Today card + Progress line re-pointed in 8; finale card in 5 |
| §6 Texts section restored | 7 |
| §7 removals (screens, components, core, schema, types) | 9 |
| §8 `migrateCourseKeys`; "Сбросить весь прогресс" check | 8 (`resetAll` already clears all settings — verified: `UserDb.resetAll` wipes the settings table; if the executor finds it does not clear `course_progress`, add that clear in Task 8) |
| §9 tests (core / UI / e2e) | every task's test steps + 10 |
| §10 release (installer, no push/release by executor) | 10 |
| §11 risk — `generateForCard` coverage | 4 (`buildGrammarReinforce` returns `[]` gracefully; the step shows "нечего закреплять"); a corpus-coverage guard test can be added to Task 4 Step 1 if desired — noted, not mandated |

**2. Placeholder scan:** Task 5 Step 1/5 and Task 6 Step 1 give assertion shapes with "the executor firms up …" notes where the mock mechanism is a local choice — each still states the exact behaviour to assert (cards created, hrefs, states). Task 7 recovers two files verbatim from a named git ref then lists the exact adaptations. Task 9 Step 5 leaves one genuine executor decision (strip `{{...}}` vs leave verbatim) gated on a `grep` whose result is known today (no markers in the 15 files). No `TBD` / `implement later` / bare "add error handling".

**3. Type consistency:** `currentCourseLessonId(points, completedSet, hasCard)` / `courseLessonState(point, currentId, completedSet, hasCard)` / `nextCourseLessonId(points, afterId)` — same signatures in Task 3 (definition), Task 5 (`GrammarLessonScreen`), Task 6 (`CourseScreen`), Task 8 (`TodayScreen`). `listCourseGrammar(): GrammarPoint[]` — Task 1 definition, consumed in 5/6/8. `GrammarPoint.kanjiIds: string[]` — Task 2 definition, consumed in 5. `buildGrammarReinforce(point, levelPoints, seed, count?)` — Task 4 definition, consumed in 5. `migrateCourseKeys(user, content)` — Task 8 definition, called in 8 (`UserDbProvider`). `LessonMeta` / `LessonFull` shrink in Task 9 and every consumer (`TextsListScreen`, `TextDetailScreen`) only uses fields that remain (`id/stage/kind/title/bodyRuby/translationRu/questions`).

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-09-09-course-grammar-redesign.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, task review + broad final review. Tasks 2 and 9 are the risky ones (build pipeline; large deletion sweep) — capable model + careful review.

**2. Inline Execution** — executing-plans, batch with checkpoints.

**Which approach?**
