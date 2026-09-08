# Plan 4a-5 — Grammar Reference (N5 remainder + full N4) Implementation Plan

**Status: ЗАВЕРШЁН, влит в master (2026-09-05).** Все 9 задач выполнены: 43/43 N5 +
50/50 N4 канонических пунктов грамматики, `levels.yml` N4 → `available`, найден и
исправлен реальный баг планировщика (см. коммит `6e4f97e`). Финал: Vitest 196,
Playwright e2e 19, typecheck/lint/build чисты.

**Goal:** Complete the grammar reference against the canonical Wikibooks JLPT grammar lists —
35 remaining N5 constructions + all 50 N4 constructions (85 new essays total, on top of the 8
existing N5 files from Plan 1) — then flip `levels.yml`'s N4 status to `available`, since kanji
N4 (Plan 4a-2) and vocab N4 (Plan 4a-4) already exist and grammar N4 was the last missing piece.

**Architecture:** Zero pipeline code changes. `parse-grammar.ts`'s `loadAllGrammar` derives level
from each file's own frontmatter `level:` field, not its directory name — `content/grammar/n4/`
works immediately, the same way `content/vocab/n4.tsv` needed no code changes in Plan 4a-4. This
plan is entirely content authoring (85 new markdown files) plus updating count assertions that
hardcode the old N5 total, plus one one-line config flip.

**Spec:** `docs/superpowers/specs/2026-09-04-plan-4a-kanji-vocab-content-design.md` §grammar scope
— canonical list = Wikibooks' own JLPT_N5_Grammar (40 headers) / JLPT_N4_Grammar (50 headers)
pages, same "list source only, prose written fresh" convention as Plan 1's original 8 N5 essays.

**Predecessor:** Plans 1 (8 N5 grammar essays, merged), 4a-1..4a-4 (kanji/vocab N5+N4, merged).

**Scope correction from the brainstorm:** of the 8 existing N5 files, only 5 correspond to an
actual Wikibooks N5-list header (です, も, に, を, は — matched by title/meaning, not filename).
The other 3 (`ka-question.md`, `masu-form.md`, `no-noun-linking.md`) are valuable prerequisite
scaffolding the source list doesn't include at all (question particle か, polite ます-form, の as
noun-connector) — kept as-is, not touched by this plan. So the source's 40-header N5 list has
**35 remaining** items, not 40−8=32.

## Global Constraints

- **Content must be original prose**, exactly like Plan 1's 8 existing essays and every prior
  content plan's `CREDITS.md` convention: Wikibooks supplies *scope* (which constructions exist)
  and a starting-point example sentence at most — the five required sections (Кратко/Образование/
  Нюансы/Примеры/Частые ошибки) are written fresh for this app, not translated from the source.
- **File format unchanged from Plan 1**: frontmatter `id/level/title/tags/related/layer`, body
  with the 5 required `## ` sections (`parseGrammarFile`'s `REQUIRED_SECTIONS` check), `## Примеры`
  as a bullet list of `- <furigana ruby> — <russian>` lines (`жизнь[せいかつ]` bracket-ruby syntax,
  parsed by `parseRuby`/`Furigana`), **≥3 examples per point** (`validateGrammar`'s hard minimum).
  Ruby annotation goes only on kanji, never on kana (`validateGrammar`'s kana-in-ruby-base check).
- **`id` scheme**: `n5-<kebab-slug>` / `n4-<kebab-slug>`, English kebab-case slug describing the
  construction (mirrors existing `n5-wa-particle`, `n5-masu-form`), unique across the whole corpus.
- **`layer` scheme**: layer = the batch number below (an integer, per level — `ORDER BY level,
  layer, title` is how lists render). Batches follow the Wikibooks list's own order, which is
  already a reasonable teaching progression (that's why the source lists them that way) — no
  separate hand-tuned pedagogical resequencing; N5 continues from its existing max layer (2), N4
  starts its own layer scale at 1 (`layer` is not compared across levels, only within one).
- **`related` field**: link only where a genuinely close relation already exists in the corpus
  (e.g. a new `～ば/～れば` conditional essay should link to `～たら`/`～ても` once those exist) —
  don't manufacture a relation graph beyond what's naturally obvious; `validateGrammar` requires
  every `related` id to resolve, so only link to ids that exist by the time a batch is validated
  (i.e. link backward to earlier batches/existing files, or add both sides of the link at once).
- **Two title collisions in N4's own header list need disambiguation**: the source's plain
  headers `そうです` (hearsay — "I heard that...") and `～そうです` (appearance — "looks like...")
  are grammatically distinct constructions that happen to render identically in kana; give them
  distinguishing Russian titles (e.g. "そうです (по слухам)" vs "～そうです (похоже, что…)") and
  separate slugs (`n4-sou-desu-hearsay` / `n4-sou-desu-looks-like`) so neither `id` nor rendered
  title is ambiguous in the list/search UI.
- **No literal `[`/`]` characters anywhere in a `## Кратко` section, found the hard way
  in Task 4**: `genChoice` (`src/core/quiz/grammar-questions.ts`) extracts a point's `## Кратко`
  first sentence as multiple-choice quiz text, and `QuestionView` renders every choice through
  `<Furigana>` — which calls `parseRuby`, treating any `X[Y]` as a furigana annotation and
  **throwing** on a bracket that isn't immediately preceded by a kanji run (e.g. a placeholder
  like `[место]` or `[A]`). This crashed `minitest.spec.ts` (an unrelated e2e test) with
  `parseRuby: '[' without a preceding base`, surfaced only once ~10 N5 batch-1..3 files used
  `[placeholder]`-style notation in their Кратко section. Fixed by rewriting those sections
  without brackets (spelled-out prose instead of a formula). `## Образование`/`## Нюансы`/
  `## Частые ошибки` are NOT extracted by any quiz generator (verified: only `sectionBody(...,
  'Кратко')` is ever called) — bracket notation there is safe and already used throughout
  (e.g. every "[глагол, основа] + …" formula lives in `## Образование`). **When authoring every
  remaining batch, keep `## Кратко` prose-only, no brackets** — put formula/placeholder notation
  in `## Образование` instead.
- **`levels.yml`'s N4 flip is the LAST task**, after all 85 files exist and validate — flipping
  early would expose a half-finished N4 grammar tab.
- **Baseline: Vitest 190, Playwright e2e 16** (Plan 4a-4's final state).

## File Structure

**Created:** `content/grammar/n5/*.md` (35 new files, alongside the 8 existing), `content/grammar/n4/*.md` (50 new files, new directory).

**Modified:**
- `content/levels.yml` — N4 `status: coming_soon` → `available` (Task 9, last).
- `content/CREDITS.md` — grammar bullet extended to name both list pages explicitly (currently
  cites the vaguer parent `JLPT_Guide` page).
- `tests/scripts/parse-grammar.test.ts` — N5 count 8 → 43; add an N4 count (50) assertion.
- `tests/scripts/build-content.test.ts` — N5 grammar count 8 → 43; add an N4 grammar count (50)
  assertion + one spot-checked N4 row.
- `tests/storage/content-db.test.ts` — `listGrammar('N5')` length 8 → 43; add `listGrammar('N4')`
  length 50 + `getGrammar` for one N4 id + a level-status assertion (N4 now `available`).
- `tests/e2e/grammar-browse.spec.ts` — count 8 → 43; add a short N4-tab browse assertion (N4 is
  the first level whose tab genuinely goes live across all three screens in this plan).
- `tests/e2e/packaged.spec.ts` — grammar-list-item count 8 → 43.
- New: `tests/e2e/n4-unlocked.spec.ts` — one small test confirming that once N4 flips available,
  the kanji (177) and vocab (630) tabs for N4 render real grids/lists too, not just grammar —
  proving the per-level (not per-category) `status` flag genuinely gates all three screens
  together, which is the whole point of saving the flip for last.

**Not modified:** everything else — `scripts/build-content/**` (no code changes at all this
plan), `src/core/types.ts`, `src/storage/content-db.ts`, `src/ui/screens/Grammar*Screen.tsx`,
`content/kanji/**`, `content/vocab/**`.

---

## Canonical scope checklist (both lists, in Wikibooks' own order — tick off as authored)

### N5 remainder — 35 items (`docs` source: `en.wikibooks.org/wiki/JLPT_Guide/JLPT_N5_Grammar`)

**Batch 1 (layer 3), 9 items, natural source order:** で, に/へ (movement direction — distinct
from the already-covered plain に which is time/location existence, not movement), ～ませんか,
～があります, ～がいます, と, ～ましょう, ～ましょうか, ～てください

**Batch 2 (layer 4), 9 items:** ～てもいいです, ～てはいけません, ～から(reason), ～ている,
～にいく, ないでください, ～のがすきです, ～のがじょうずです, ～のがへたです

**Batch 3 (layer 5), 9 items:** まだ～ていません, ～のほうが～より, ～のなかで～がいちばん～,
つもりです, ～く/～になる, V stem+たいです, ～たり…たりする, ～たことがある, や

**Batch 4 (layer 6), 8 items:** ～んです, ～すぎる, ～ほうがいい, ので, ～なくちゃいけない,
でしょう, ～まえに, ～てから

*(35 total: 9+9+9+8 = 35 ✓, natural Wikibooks list order throughout — no manual resequencing.)*

### N4 — 50 items (`docs` source: `en.wikibooks.org/wiki/JLPT_Guide/JLPT_N4_Grammar`)

**Batch 5 (layer 1), 13 items:** ～し, そうです(hearsay), てみる, なら, 期間+に+回数, ～がほしい,
～がる, ～かもしれない, ～たらどうですか, Number+も, しかない, ～ておく, ～よう

**Batch 6 (layer 2), 13 items:** ～おう, ～てあげる, ～てくれる, ～てもらう, ～ていただけません
か, ～といいです, ～てすみません, ～そうです(looks-like), ～させる, ～なさい, ～ば/～れば,
～ても, ～たら

**Batch 7 (layer 3), 12 items:** ～なくてもいい, ～みたい, ～てしまう, Dictionary form+と,
～ながら, ～ばよかった, ～てくれてありがとう, ～てよかった, ～はずです, ～ないで, ～かどうか,
～という～

**Batch 8 (layer 4), 12 items:** ～やすい, ～にくい, ～られる, ～てある, ～ているあいだに,
～く/～にする, ～てほしい, のに, ～のような, ～のように, ～させられる, ～ことにする

*(50 total: 13+13+12+12 = 50 ✓.)*

---

## Task 1: N5 remainder batch 1 (9 essays, layer 3)

**Files:** create `content/grammar/n5/{de-particle, ni-he-direction, masenka, ga-arimasu, ga-imasu, to-particle, mashou, mashouka, te-kudasai}.md` (slugs indicative, finalize per construction).

- [x] Write all 9 files per the Global Constraints format (frontmatter + 5 sections + ≥3 examples each).
- [x] Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/scripts/parse-grammar.test.ts` — expect the existing "loads all 8" test to now fail with a real count (update it once ALL N5 batches land in Task 4, not per-batch, to avoid four throwaway edits to the same assertion — see note in Task 4).
- [ ] Run: `npm run build-content` and manually spot check `db.exec("select id,title,layer from grammar_points where level='N5' order by layer,title")` shows the 9 new rows.
- [ ] Commit:
```bash
git add content/grammar/n5/
git commit -m "feat: author N5 grammar batch 1/4 (9 constructions)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

## Task 2: N5 remainder batch 2 (9 essays, layer 4)
Same procedure as Task 1, files for: てもいいです, てはいけません, から(reason), ている, にいく,
ないでください, のがすきです, のがじょうずです, のがへたです.

## Task 3: N5 remainder batch 3 (9 essays, layer 5)
Same procedure. Files for: まだていません, のほうがより, のなかでいちばん, つもりです, くになる,
たいです, たりたりする, たことがある, や.

## Task 4: N5 remainder batch 4 (8 essays, layer 6) + update N5 count assertions
Same procedure for the last 8 (んです, すぎる, ほうがいい, ので, なくちゃいけない, でしょう,
まえに, てから). Then, in one pass (all N5 batches now landed, real total = 43):
- [ ] Update `tests/scripts/parse-grammar.test.ts`'s "loads all 8 seeded points" → 43, rename to
  "loads all 43 N5 points".
- [ ] Update `tests/scripts/build-content.test.ts`'s `expect(grammar).toBe(8)` → `toBe(43)`.
- [ ] Update `tests/storage/content-db.test.ts`'s `listGrammar('N5')` length 8 → 43.
- [ ] Update `tests/e2e/grammar-browse.spec.ts` and `tests/e2e/packaged.spec.ts` count 8 → 43.
- [ ] Run full regression: `npm run typecheck && npm run lint && npm test && npm run build && npx playwright test`.
- [ ] Commit (content batch 4 + all count-assertion updates together, since they're only correct once batch 4 lands):
```bash
git add content/grammar/n5/ tests/
git commit -m "feat: author N5 grammar batch 4/4 (8 constructions); N5 grammar reference complete (43 total)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

## Task 5: N4 batch 1 (13 essays, layer 1) — new `content/grammar/n4/` directory
First N4 file establishes the directory. Same authoring procedure; `level: N4` in frontmatter.

## Task 6: N4 batch 2 (13 essays, layer 2)
Watch for the そうです(hearsay, batch 5)/～そうです(looks-like, this batch) title/id disambiguation called out in Global Constraints.

## Task 7: N4 batch 3 (12 essays, layer 3)

## Task 8: N4 batch 4 (12 essays, layer 4) + N4 grammar count assertions
Same finishing pattern as Task 4: after this batch, N4 total = 50.
- [ ] Add to `tests/scripts/parse-grammar.test.ts`: N4 count assertion (50).
- [ ] Add to `tests/scripts/build-content.test.ts`: N4 grammar count (50) + one spot-checked row.
- [ ] Add to `tests/storage/content-db.test.ts`: `listGrammar('N4')` length 50 + `getGrammar` for one N4 id.
- [ ] Full regression, commit (content + new N4 test assertions together).

## Task 9: Flip `levels.yml` N4 → `available`; CREDITS.md; N4-unlock e2e; final regression

- [ ] `content/levels.yml`: N4 `status: coming_soon` → `available`.
- [ ] `content/CREDITS.md`: extend the grammar bullet to name both `JLPT_N5_Grammar` and
  `JLPT_N4_Grammar` pages explicitly (currently only cites the parent `JLPT_Guide` page vaguely).
- [ ] Add `tests/e2e/n4-unlocked.spec.ts`: browse to Grammar, click N4 tab, assert a real list (50
  items) renders instead of "появится скоро"; same for Kanji tab (177) and Vocab tab (630) — since
  this is the first plan where a level's `status` flip makes all three screens go live together.
- [ ] Add an N4-tab browse test to `tests/e2e/grammar-browse.spec.ts` (or fold into the new file):
  click into one N4 grammar point, verify detail renders.
- [ ] Full regression: `npm run typecheck && npm run lint && npm test && npm run build && npx playwright test`.
- [ ] Commit:
```bash
git add content/levels.yml content/CREDITS.md tests/e2e/n4-unlocked.spec.ts tests/e2e/grammar-browse.spec.ts
git commit -m "feat: flip N4 to available — grammar+kanji+vocab all complete for N4

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

## Self-Review

**1. Spec coverage:** all 40 N5 + 50 N4 canonical Wikibooks grammar headers accounted for (5
pre-existing + 35 new N5, 50 new N4); N4 level flip tied to grammar completion (the last of its
three categories); two same-kana N4 titles disambiguated up front instead of discovered mid-batch.

**2. Placeholder scan:** the per-batch item lists above are the authoring checklist, cross-checked
against the raw Wikibooks header dump at plan-writing time — no TBD content, only real headers.

**3. Regression discipline:** count-assertion updates are batched with the content that makes them
true (end of N5's 4 batches, end of N4's 4 batches) rather than touched-and-broken four times each
— avoids a red test sitting mid-plan for batches 1-3.
