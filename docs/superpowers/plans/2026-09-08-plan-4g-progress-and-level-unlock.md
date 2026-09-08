# Progress by Kanji/Vocab + Level Unlock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show progress bars/counts for kanji and vocab on the Progress screen, and gate level N4 behind 90% average "consolidated" completion of N5 (or a manual unlock).

**Architecture:** `src/core/progress.ts` gets an `itemType` parameter so its per-level bar/count math works for all three SRS types; a new pure `levelCompletion` averages the three "consolidated" fractions. A new `src/core/levels.ts` computes an *effective* level status (`available | locked | coming_soon`) from that completion plus a `settings.unlocked_levels` list — nothing is stored in `content.db`. The set of effective-`available` level codes is threaded into the scheduler's new-card selection and the placement test; daily *review* of already-started cards is untouched. UI reads a new `useEffectiveLevels()` hook.

**Tech Stack:** TypeScript, React 18, Vitest, Playwright, sql.js (SQLite WASM), Electron.

**Spec:** `docs/superpowers/specs/2026-09-08-plan-4g-progress-and-level-unlock-design.md`

## Global Constraints

- Node >= 22. Package version is `1.1.0` (do not bump in this plan).
- `src/**` is browser code: never import `node:*` / `electron` there (eslint `no-restricted-imports` enforces it). Core logic stays pure and platform-free.
- All time enters core functions as a `now: Date` parameter — never `new Date()` inside `src/core/**`.
- Tests: Vitest for `src/core/**` + `src/storage/**` + React screens (jsdom, `tests/ui/**`); Playwright for Electron e2e (`tests/e2e/**`). Playwright helpers import nothing from `src/**`.
- `content/**` and `resources/content.db` are gitignored (variant C). Content edits are not needed in this plan.
- `ItemType` = `'grammar' | 'kanji' | 'vocab'`, exported from `@/core/types` and re-exported by `@/core/scheduler`.
- Card status via `statusOf(card)` from `@/core/srs`: `'new' | 'learning' | 'learned' | 'mastered'`. "studied" = learning|learned|mastered; "consolidated" = learned|mastered.
- Work directly on branch `main`, one commit per task, Conventional Commits, footer `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- Full regression command set: `npm run typecheck`, `npm run lint`, `npx vitest run`, `npx playwright test`, `npm run build:desktop:installer`.

---

## Task 1: Generalize progress.ts to all item types + levelCompletion

**Files:**
- Modify: `src/core/progress.ts`
- Test: `tests/core/progress.test.ts`

**Interfaces:**
- Consumes: `ContentDb.listGrammar/listKanji/listVocab(level): {id:string,...}[]`, `ContentDb.grammarCountByLevel(level): number`, `UserDb.allCards(itemType): CardRow[]`, `statusOf(card)`.
- Produces:
  - `levelBars(user: UserDb, content: ContentDb, levelCode: string, itemType: ItemType): LevelBars` — `LevelBars = { studied: number; consolidated: number; total: number }` (studied/consolidated are 0..1 fractions).
  - `statusCounts(user: UserDb, content: ContentDb, levelCode: string, itemType: ItemType): StatusCounts` — unchanged shape `{ new; learning; learned; mastered }`.
  - `levelCompletion(user: UserDb, content: ContentDb, levelCode: string): number` — mean of the `consolidated` fraction across the three item types, ignoring types whose `total` is 0; `0` if all three are 0.
  - `levelRibbon(user, content): RibbonSegment[]` unchanged signature; `RibbonSegment.status` stays `string`, `fill` now equals `levelCompletion(user, content, code)` for `available` levels, `0` otherwise.

- [ ] **Step 1: Write failing tests for kanji/vocab bars + levelCompletion**

In `tests/core/progress.test.ts`, extend `fakeContent` to also serve kanji/vocab, and add a describe block. Replace the `fakeContent` factory (around line 20-33) with:

```typescript
function fakeContent(grammarIds: string[], kanjiIds: string[] = [], vocabIds: string[] = []) {
  return {
    listLevels: () => [{ code: 'N5', ord: 1, status: 'available', titleRu: 'N5' }],
    listGrammar: () => grammarIds.map((id) => ({ id, level: 'N5', title: id, layer: 1 })),
    grammarCountByLevel: () => grammarIds.length,
    listKanji: () => kanjiIds.map((id) => ({ id, level: 'N5', char: id, onyomi: [], kunyomi: [], meaningRu: '', strokeCount: 1 })),
    listVocab: () => vocabIds.map((id) => ({ id, level: 'N5', headword: id, reading: id, pos: '', meaningRu: '' })),
  } as unknown as import('@/storage/content-db').ContentDb;
}
```

Update the existing `const content = fakeContent(['p1', 'p2', 'p3', 'p4']);` line to `fakeContent(['p1','p2','p3','p4'], ['k1','k2'], ['v1','v2','v3','v4','v5'])` and add `itemType` args to the existing `levelBars`/`statusCounts` calls in that file (append `, 'grammar'`). Then add:

```typescript
  it('levelBars works for kanji and vocab item types', async () => {
    const u = await UserDb.open(fakeAdapter(), '0.2.0', now);
    u.upsertCard(review(newCard('kanji', 'k1', now), 4, now, 3000, PARAMS).card); // -> consolidated
    u.upsertCard(review(newCard('vocab', 'v1', now), 3, now, 3000, PARAMS).card); // -> learning
    expect(levelBars(u, content, 'N5', 'kanji')).toMatchObject({ total: 2, consolidated: 0.5 });
    const vb = levelBars(u, content, 'N5', 'vocab');
    expect(vb.total).toBe(5);
    expect(vb.studied).toBeCloseTo(0.2);
    expect(vb.consolidated).toBe(0);
  });

  it('levelCompletion averages the consolidated fraction across the three types', async () => {
    const u = await UserDb.open(fakeAdapter(), '0.2.0', now);
    expect(levelCompletion(u, content, 'N5')).toBe(0); // empty
    for (const id of ['p1', 'p2', 'p3', 'p4']) u.upsertCard(review(newCard('grammar', id, now), 4, now, 3000, PARAMS).card);
    // grammar 4/4 = 1, kanji 0, vocab 0 -> mean 1/3
    expect(levelCompletion(u, content, 'N5')).toBeCloseTo(1 / 3);
  });

  it('levelCompletion ignores a type with no content', async () => {
    const c = fakeContent(['p1', 'p2'], [], []); // only grammar has items
    const u = await UserDb.open(fakeAdapter(), '0.2.0', now);
    u.upsertCard(review(newCard('grammar', 'p1', now), 4, now, 3000, PARAMS).card);
    expect(levelCompletion(u, c, 'N5')).toBeCloseTo(0.5); // mean over the one non-empty type
  });
```

Add `levelCompletion` to the import on line 7.

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run tests/core/progress.test.ts`
Expected: FAIL — `levelBars` takes 3 args / `levelCompletion` is not exported.

- [ ] **Step 3: Implement in `src/core/progress.ts`**

Replace `levelGrammarIds`, `cardsForLevel`, `levelBars`, `statusCounts`, `levelRibbon` with:

```typescript
import type { ItemType } from '@/core/types';

function levelItemIds(content: ContentDb, levelCode: string, itemType: ItemType): Set<string> {
  const list =
    itemType === 'grammar' ? content.listGrammar(levelCode)
    : itemType === 'kanji' ? content.listKanji(levelCode)
    : content.listVocab(levelCode);
  return new Set(list.map((p) => p.id));
}

function totalForLevel(content: ContentDb, levelCode: string, itemType: ItemType): number {
  if (itemType === 'grammar') return content.grammarCountByLevel(levelCode);
  return levelItemIds(content, levelCode, itemType).size;
}

function cardsForLevel(user: UserDb, itemType: ItemType, ids: Set<string>): CardRow[] {
  return user.allCards(itemType).filter((c) => ids.has(c.item_id));
}

export function levelBars(
  user: UserDb, content: ContentDb, levelCode: string, itemType: ItemType,
): LevelBars {
  const total = totalForLevel(content, levelCode, itemType);
  if (total === 0) return { studied: 0, consolidated: 0, total: 0 };
  const cards = cardsForLevel(user, itemType, levelItemIds(content, levelCode, itemType));
  let studied = 0;
  let consolidated = 0;
  for (const c of cards) {
    const s = statusOf(c);
    if (s === 'learning' || s === 'learned' || s === 'mastered') studied++;
    if (s === 'learned' || s === 'mastered') consolidated++;
  }
  return { studied: studied / total, consolidated: consolidated / total, total };
}

export function statusCounts(
  user: UserDb, content: ContentDb, levelCode: string, itemType: ItemType,
): StatusCounts {
  const total = totalForLevel(content, levelCode, itemType);
  const cards = cardsForLevel(user, itemType, levelItemIds(content, levelCode, itemType));
  const counts: Record<Status, number> = { new: 0, learning: 0, learned: 0, mastered: 0 };
  for (const c of cards) counts[statusOf(c)]++;
  counts.new = Math.max(0, total - cards.length);
  return counts;
}

const COMPLETION_TYPES: readonly ItemType[] = ['grammar', 'kanji', 'vocab'];

export function levelCompletion(user: UserDb, content: ContentDb, levelCode: string): number {
  const parts: number[] = [];
  for (const t of COMPLETION_TYPES) {
    const b = levelBars(user, content, levelCode, t);
    if (b.total > 0) parts.push(b.consolidated);
  }
  return parts.length === 0 ? 0 : parts.reduce((a, b) => a + b, 0) / parts.length;
}

export function levelRibbon(user: UserDb, content: ContentDb): RibbonSegment[] {
  return content.listLevels().map((lvl) => ({
    code: lvl.code,
    status: lvl.status,
    fill: lvl.status === 'available' ? levelCompletion(user, content, lvl.code) : 0,
  }));
}
```

- [ ] **Step 4: Update the other in-repo callers of `levelBars`/`statusCounts`**

`src/ui/screens/ProgressScreen.tsx` — its `levelBars(user, content, active)` / `statusCounts(user, content, active)` calls (lines ~24-25) get a 4th arg `'grammar'` for now (Task 5 rewrites this screen fully). Do the minimal edit to keep typecheck green:

```typescript
  const bars = levelBars(user, content, active, 'grammar');
  const counts = statusCounts(user, content, active, 'grammar');
```

- [ ] **Step 5: Run typecheck + tests**

Run: `npm run typecheck && npx vitest run tests/core/progress.test.ts tests/ui/ProgressScreen.test.tsx`
Expected: PASS. (`tests/ui/ProgressScreen.test.tsx` mocks `@/core/progress` so it is unaffected.)

- [ ] **Step 6: Commit**

```bash
git add src/core/progress.ts src/ui/screens/ProgressScreen.tsx tests/core/progress.test.ts
git commit -m "feat(progress): per-itemType bars/counts + levelCompletion

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: Effective level status — src/core/levels.ts

**Files:**
- Create: `src/core/levels.ts`
- Test: `tests/core/levels.test.ts`

**Interfaces:**
- Consumes: `ContentDb.listLevels(): { code: string; ord: number; status: 'available'|'coming_soon'; titleRu: string }[]`, `UserDb.getSetting<T>(key, fallback): T`, `UserDb.setSetting(key, value)`, `levelCompletion` from `@/core/progress`.
- Produces:
  - `type EffectiveLevelStatus = 'available' | 'locked' | 'coming_soon'`
  - `const UNLOCK_THRESHOLD = 0.9`
  - `effectiveLevelStatus(user: UserDb, content: ContentDb, levelCode: string, now: Date): EffectiveLevelStatus`
  - `availableLevelCodes(user: UserDb, content: ContentDb, now: Date): Set<string>`
  - `unlockLevel(user: UserDb, levelCode: string): void`

- [ ] **Step 1: Write the failing test**

Create `tests/core/levels.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { UserDb } from '@/storage/user-db';
import { newCard, review } from '@/core/srs';
import { effectiveLevelStatus, availableLevelCodes, unlockLevel, UNLOCK_THRESHOLD } from '@/core/levels';
import type { ContentDb } from '@/storage/content-db';

const PARAMS = { requestRetention: 0.9, maximumInterval: 365, enableFuzz: false };
const now = new Date('2026-04-01T09:00:00.000Z');

// N5 available, N4 available (content ready), N3 coming_soon.
function fakeContent(n5g: string[], n5k: string[], n5v: string[]): ContentDb {
  return {
    listLevels: () => [
      { code: 'N5', ord: 1, status: 'available', titleRu: 'N5' },
      { code: 'N4', ord: 2, status: 'available', titleRu: 'N4' },
      { code: 'N3', ord: 3, status: 'coming_soon', titleRu: 'N3' },
    ],
    listGrammar: (lvl: string) => (lvl === 'N5' ? n5g : []).map((id) => ({ id, level: lvl, title: id, layer: 1 })),
    grammarCountByLevel: (lvl: string) => (lvl === 'N5' ? n5g.length : 0),
    listKanji: (lvl: string) => (lvl === 'N5' ? n5k : []).map((id) => ({ id, level: lvl, char: id, onyomi: [], kunyomi: [], meaningRu: '', strokeCount: 1 })),
    listVocab: (lvl: string) => (lvl === 'N5' ? n5v : []).map((id) => ({ id, level: lvl, headword: id, reading: id, pos: '', meaningRu: '' })),
  } as unknown as ContentDb;
}

// consolidate `frac` of N5 in every type -> levelCompletion(N5) ~= frac
async function seed(frac: number): Promise<{ user: UserDb; content: ContentDb }> {
  const g = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g8', 'g9', 'g10'];
  const k = ['k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8', 'k9', 'k10'];
  const v = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8', 'v9', 'v10'];
  const content = fakeContent(g, k, v);
  const user = await UserDb.open(
    { platform: 'desktop', async readBundledContentDb() { throw new Error('x'); },
      async readSqlWasm() { const { readFileSync } = await import('node:fs');
        const { createRequire } = await import('node:module');
        return new Uint8Array(readFileSync(createRequire(import.meta.url).resolve('sql.js/dist/sql-wasm.wasm'))); },
      async readUserDb() { return null; }, async writeUserDb() {},
      async exportUserDb() { return false; }, async importUserDb() { return null; },
      async checkForUpdate() { return null; }, async openExternal() {}, async autoBackupUserDb() {} },
    '0.2.0', now,
  );
  const nConsolidate = Math.round(frac * 10);
  for (const list of [g, k, v] as const) {
    const type = list === g ? 'grammar' : list === k ? 'kanji' : 'vocab';
    for (let i = 0; i < nConsolidate; i++) {
      user.upsertCard(review(newCard(type, list[i]!, now), 4, now, 3000, PARAMS).card);
    }
  }
  return { user, content };
}

describe('core/levels', () => {
  it('the lowest level is always available', async () => {
    const { user, content } = await seed(0);
    expect(effectiveLevelStatus(user, content, 'N5', now)).toBe('available');
  });

  it('a coming_soon level stays coming_soon regardless of progress', async () => {
    const { user, content } = await seed(1);
    expect(effectiveLevelStatus(user, content, 'N3', now)).toBe('coming_soon');
  });

  it('N4 is locked below the threshold and available at/above it', async () => {
    const below = await seed(0.8);
    expect(effectiveLevelStatus(below.user, below.content, 'N4', now)).toBe('locked');
    const at = await seed(0.9);
    expect(effectiveLevelStatus(at.user, at.content, 'N4', now)).toBe('available');
  });

  it('a manual unlock opens N4 even at zero progress', async () => {
    const { user, content } = await seed(0);
    expect(effectiveLevelStatus(user, content, 'N4', now)).toBe('locked');
    unlockLevel(user, 'N4');
    expect(effectiveLevelStatus(user, content, 'N4', now)).toBe('available');
    expect(user.getSetting<string[]>('unlocked_levels', [])).toEqual(['N4']);
  });

  it('unlockLevel is idempotent', async () => {
    const { user } = await seed(0);
    unlockLevel(user, 'N4');
    unlockLevel(user, 'N4');
    expect(user.getSetting<string[]>('unlocked_levels', [])).toEqual(['N4']);
  });

  it('availableLevelCodes excludes a locked level, includes it after unlock', async () => {
    const { user, content } = await seed(0);
    expect([...availableLevelCodes(user, content, now)].sort()).toEqual(['N5']);
    unlockLevel(user, 'N4');
    expect([...availableLevelCodes(user, content, now)].sort()).toEqual(['N4', 'N5']);
  });

  it('UNLOCK_THRESHOLD is 0.9', () => {
    expect(UNLOCK_THRESHOLD).toBe(0.9);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run tests/core/levels.test.ts`
Expected: FAIL — `@/core/levels` does not exist.

- [ ] **Step 3: Create `src/core/levels.ts`**

```typescript
import type { ContentDb } from '@/storage/content-db';
import type { UserDb } from '@/storage/user-db';
import { levelCompletion } from '@/core/progress';

export type EffectiveLevelStatus = 'available' | 'locked' | 'coming_soon';

/** Average "consolidated" fraction over N5's three categories needed to open the next level. */
export const UNLOCK_THRESHOLD = 0.9;

/**
 * A level's status as the learner experiences it. `content.db`'s stored status is
 * only a content-readiness flag (`available` = shipped, `coming_soon` = not built).
 * A shipped level past the first one stays `locked` until the previous level is
 * `>= UNLOCK_THRESHOLD` complete or the user unlocked it by hand.
 * `now` is currently unused (card recency already lives inside `statusOf`) but is
 * kept for signature parity with the rest of core.
 */
export function effectiveLevelStatus(
  user: UserDb, content: ContentDb, levelCode: string, now: Date,
): EffectiveLevelStatus {
  void now;
  const levels = content.listLevels();
  const lvl = levels.find((l) => l.code === levelCode);
  if (!lvl) return 'coming_soon';
  if (lvl.status === 'coming_soon') return 'coming_soon';

  const lowestOrd = Math.min(...levels.map((l) => l.ord));
  if (lvl.ord === lowestOrd) return 'available';

  if (user.getSetting<string[]>('unlocked_levels', []).includes(levelCode)) return 'available';

  const prev = levels
    .filter((l) => l.ord < lvl.ord)
    .sort((a, b) => b.ord - a.ord)[0];
  if (prev && levelCompletion(user, content, prev.code) >= UNLOCK_THRESHOLD) return 'available';

  return 'locked';
}

export function availableLevelCodes(user: UserDb, content: ContentDb, now: Date): Set<string> {
  const out = new Set<string>();
  for (const l of content.listLevels()) {
    if (effectiveLevelStatus(user, content, l.code, now) === 'available') out.add(l.code);
  }
  return out;
}

export function unlockLevel(user: UserDb, levelCode: string): void {
  const cur = user.getSetting<string[]>('unlocked_levels', []);
  if (cur.includes(levelCode)) return;
  user.setSetting('unlocked_levels', [...cur, levelCode]);
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run tests/core/levels.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/levels.ts tests/core/levels.test.ts
git commit -m "feat(levels): effectiveLevelStatus + availableLevelCodes + unlockLevel

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Thread availableLevelCodes into scheduler + placement

**Files:**
- Modify: `src/core/scheduler.ts` (`availableItemIds`, `typeContext`, `split`)
- Modify: `src/core/placement.ts` (`initPlacement`)
- Modify: `src/ui/screens/PlacementScreen.tsx`
- Test: `tests/core/scheduler.test.ts`, `tests/core/placement.test.ts`, `tests/core/session.test.ts`

**Interfaces:**
- Consumes: `availableLevelCodes` from `@/core/levels`.
- Produces:
  - `availableItemIds(content: ContentDb, itemType: ItemType, availableCodes: ReadonlySet<string>): string[]`
  - `initPlacement(content: ContentDb, availableCodes: ReadonlySet<string>): PlacementState`

- [ ] **Step 1: Update `availableItemIds` + its callers in `src/core/scheduler.ts`**

Change the signature and the level filter:

```typescript
export function availableItemIds(
  content: ContentDb, itemType: ItemType, availableCodes: ReadonlySet<string>,
): string[] {
  const ids: { id: string; ord: number; layer: number }[] = [];
  for (const lvl of content.listLevels()) {
    if (!availableCodes.has(lvl.code)) continue;
    for (const p of LEVEL_EXTRACTORS[itemType](content, lvl.code)) {
      ids.push({ id: p.id, ord: lvl.ord, layer: p.layer });
    }
  }
  ids.sort((a, b) => a.ord - b.ord || a.layer - b.layer || a.id.localeCompare(b.id));
  return ids.map((x) => x.id);
}
```

Add the import at the top of the file: `import { availableLevelCodes } from '@/core/levels';`

Thread it through `typeContext` and `split`:

```typescript
function typeContext(
  user: UserDb, content: ContentDb, now: Date, itemType: ItemType,
  availableCodes: ReadonlySet<string>,
): TypeContext {
  // ...unchanged until:
  const unknownAvailable = availableItemIds(content, itemType, availableCodes).filter((id) => !known.has(id));
  // ...
}
```

In `split(user, content, now)`, right after `const { newPerDay, cap } = settings(user);`:

```typescript
  const availableCodes = availableLevelCodes(user, content, now);
```

and change the `ctx` build:

```typescript
  const ctx = Object.fromEntries(
    ITEM_TYPES.map((t) => [t, typeContext(user, content, now, t, availableCodes)]),
  ) as Record<ItemType, TypeContext>;
```

Public entry points (`daySummary`, `buildQueue`, `buildDailySession`) keep their `(user, content, now)` signatures — no change.

- [ ] **Step 2: Update `src/core/placement.ts`**

```typescript
export function initPlacement(content: ContentDb, availableCodes: ReadonlySet<string>): PlacementState {
  const ids = availableItemIds(content, 'grammar', availableCodes);
  return { ids, lo: 0, hi: ids.length, askedCount: 0 };
}
```

- [ ] **Step 3: Update `src/ui/screens/PlacementScreen.tsx`**

Add import: `import { availableLevelCodes } from '@/core/levels';`
Change the state initializer (line ~23):

```typescript
  const [state, setState] = useState<PlacementState>(() =>
    initPlacement(content, availableLevelCodes(user, content, new Date())),
  );
```

(`user` and `content` are already in scope from `useUserDb()` / `useContentDb()`.)

- [ ] **Step 4: Fix the core tests that call these directly**

`tests/core/placement.test.ts`: its `runToCompletion` and the standalone `initPlacement(content)` calls must pass a code set. Add near the top:

```typescript
const ALL = new Set(['N5', 'N4', 'N3', 'N2', 'N1']);
```

and replace every `initPlacement(content)` with `initPlacement(content, ALL)`. (The fixture's `fakeContent` only lists N5, so `ALL` is a harmless superset.)

`tests/core/scheduler.test.ts`: find every direct `availableItemIds(content, ...)` call (grep the file). For each, add a third arg — a `Set` of the level codes the fixture's `listLevels()` returns with `status: 'available'`. If the fixture doesn't stub `listLevels`, add `listLevels: () => [{ code: 'N5', ord: 1, status: 'available', titleRu: 'N5' }, { code: 'N4', ord: 2, status: 'available', titleRu: 'N4' }]` to it and pass `new Set(['N5', 'N4'])`. Tests that exercise the "N4 sorts before N5" ordering must keep BOTH codes in the set.

`tests/core/session.test.ts` and `tests/core/scheduler.test.ts` that go through `buildQueue` / `daySummary` / `buildDailySession`: these fixtures' `UserDb` is real (`UserDb.open`), so `availableLevelCodes` will run against the fixture `content`. Ensure each fixture `content.listLevels()` returns N5 (and N4 where the test needs N4 content offered) with `status: 'available'`, and — because a brand-new fixture user has 0% completion — either (a) the test only asserts N5 behaviour (fine, N4 auto-locks), or (b) the test needs N4 offered, in which case call `user.setSetting('unlocked_levels', ['N4'])` in the fixture setup. Grep `session.test.ts` / `scheduler.test.ts` for `n4-` expectations and add the setting there.

- [ ] **Step 5: Run the affected tests**

Run: `npx vitest run tests/core/scheduler.test.ts tests/core/placement.test.ts tests/core/session.test.ts && npm run typecheck`
Expected: PASS. Iterate on fixture `listLevels` / `unlocked_levels` seeding until green.

- [ ] **Step 6: Full unit run + commit**

Run: `npx vitest run && npm run lint`
Expected: PASS (48+ files).

```bash
git add src/core/scheduler.ts src/core/placement.ts src/ui/screens/PlacementScreen.tsx tests/core/
git commit -m "feat(scheduler): gate new-card + placement selection by effective level status

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: useEffectiveLevels hook + locked state in the reference-list screens

**Files:**
- Modify: `src/ui/useContentDb.ts`
- Modify: `src/ui/screens/GrammarListScreen.tsx`, `src/ui/screens/KanjiListScreen.tsx`, `src/ui/screens/VocabListScreen.tsx`, `src/ui/screens/TextsListScreen.tsx`
- Modify: `src/ui/theme.css`
- Test: `tests/ui/GrammarListScreen.test.tsx`, `tests/ui/KanjiListScreen.test.tsx`, `tests/ui/VocabListScreen.test.tsx`

**Interfaces:**
- Consumes: `effectiveLevelStatus` from `@/core/levels`, `useUserDb()`, existing `useContentDb()` / `useLevels()`.
- Produces:
  - `useEffectiveLevels(): { code: string; ord: number; titleRu: string; status: EffectiveLevelStatus; rawStatus: 'available'|'coming_soon' }[]` from `@/ui/useContentDb`.

- [ ] **Step 1: Write failing screen tests**

In `tests/ui/GrammarListScreen.test.tsx` (and mirror into Kanji/Vocab test files), add a case. First check how each test provides levels — they render inside a `ContentDbProvider` mock or pass levels via context. Add a test that sets the active level's effective status to `locked` and asserts the locked copy shows:

```typescript
  it('shows the unlock hint (not the list) for a locked level', () => {
    // arrange: mock useEffectiveLevels so the active level is 'locked'
    // (follow the file's existing mocking style for useLevels / useContentDb)
    renderWithLevel({ code: 'N4', status: 'locked' });
    expect(screen.getByText(/откроется после 90% завершения/i)).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).toBeNull();
  });
```

If the existing tests mock `../useContentDb` (or `@/ui/useContentDb`), extend that mock with `useEffectiveLevels`. If they use a real provider, add a `useEffectiveLevels` export the provider can back.

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run tests/ui/GrammarListScreen.test.tsx`
Expected: FAIL — `useEffectiveLevels` not exported / locked copy not rendered.

- [ ] **Step 3: Add `useEffectiveLevels` to `src/ui/useContentDb.ts`**

```typescript
import { useUserDb } from '@/ui/useUserDb';
import { effectiveLevelStatus, type EffectiveLevelStatus } from '@/core/levels';

export interface EffectiveLevel {
  code: string;
  ord: number;
  titleRu: string;
  status: EffectiveLevelStatus;
  rawStatus: 'available' | 'coming_soon';
}

export function useEffectiveLevels(): EffectiveLevel[] {
  const levels = useLevels();
  const content = useContentDb();
  const user = useUserDb();
  const now = new Date();
  return levels.map((l) => ({
    code: l.code,
    ord: l.ord,
    titleRu: l.titleRu,
    rawStatus: l.status,
    status: effectiveLevelStatus(user, content, l.code, now),
  }));
}
```

Match the exact shape of the objects `useLevels()` returns — inspect `src/ui/useContentDb.ts` and `src/storage/content-db.ts`'s `Level` type first and adjust field names (`titleRu` vs `title_ru`).

- [ ] **Step 4: Wire the four list screens**

`GrammarListScreen.tsx`: replace `useLevels()` with `useEffectiveLevels()`. The check at line ~46:

```typescript
{!query && activeLevelObj?.status === 'coming_soon' ? (
  <p className="muted">Материал уровня {activeLevel} появится скоро.</p>
) : !query && activeLevelObj?.status === 'locked' ? (
  <p className="muted">
    Уровень {activeLevel} откроется после 90% завершения предыдущего уровня.
  </p>
) : (
  /* ...existing list... */
)}
```

Do the identical change in `KanjiListScreen.tsx` and `VocabListScreen.tsx` (they have the same `появится скоро` line). `TextsListScreen.tsx`: switch to `useEffectiveLevels()` and treat `locked` the same as `coming_soon` (one combined branch is fine there — texts aren't gated by the rule, but a `locked` N4 tab should read consistently):

```typescript
{(activeLevelObj?.status === 'coming_soon' || activeLevelObj?.status === 'locked') ? (
  <p className="muted">Материал уровня {activeLevel} появится позже.</p>
) : ( /* ...list... */ )}
```

- [ ] **Step 5: Add locked ribbon style to `src/ui/theme.css`**

Find `.ribbon-seg.coming_soon` (or equivalent) and add next to it:

```css
.ribbon-seg.locked { opacity: 0.55; }
.ribbon-seg.locked .ribbon-code::after { content: " 🔒"; font-size: 0.8em; }
```

- [ ] **Step 6: Run tests + typecheck**

Run: `npm run typecheck && npx vitest run tests/ui/`
Expected: PASS. Update any other `useLevels()` consumer that breaks (grep `useLevels`); the Nav component, if it reads status, also moves to `useEffectiveLevels`.

- [ ] **Step 7: Commit**

```bash
git add src/ui/ tests/ui/
git commit -m "feat(ui): useEffectiveLevels hook + locked-level copy in reference lists

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: Progress screen — three category blocks + unlock control

**Files:**
- Modify: `src/ui/screens/ProgressScreen.tsx`
- Modify: `src/ui/theme.css` (if new layout classes are needed)
- Test: `tests/ui/ProgressScreen.test.tsx`

**Interfaces:**
- Consumes: `levelBars`, `statusCounts`, `levelCompletion`, `levelRibbon` from `@/core/progress`; `unlockLevel`, `UNLOCK_THRESHOLD` from `@/core/levels`; `useEffectiveLevels`.

- [ ] **Step 1: Rewrite `tests/ui/ProgressScreen.test.tsx`**

The file already mocks `@/core/progress`. Extend the mock and assertions:

```typescript
vi.mock('@/core/progress', () => ({
  levelRibbon: () => [
    { code: 'N5', status: 'available', fill: 0.4 },
    { code: 'N4', status: 'locked', fill: 0 },
  ],
  levelBars: (_u: unknown, _c: unknown, _lvl: string, itemType: string) =>
    itemType === 'grammar' ? { studied: 0.5, consolidated: 0.25, total: 8 }
    : itemType === 'kanji' ? { studied: 0.3, consolidated: 0.1, total: 20 }
    : { studied: 0.2, consolidated: 0.05, total: 100 },
  statusCounts: () => ({ new: 4, learning: 2, learned: 1, mastered: 1 }),
  levelCompletion: () => 0.42,
  streak: () => ({ current: 3, best: 5 }),
  heatmap: () => [],
}));
const unlockLevel = vi.fn();
vi.mock('@/core/levels', () => ({ unlockLevel, UNLOCK_THRESHOLD: 0.9 }));
vi.mock('@/ui/useContentDb', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useEffectiveLevels: () => [
    { code: 'N5', ord: 1, titleRu: 'N5', status: 'available', rawStatus: 'available' },
    { code: 'N4', ord: 2, titleRu: 'N4', status: 'locked', rawStatus: 'available' },
  ],
}));
```

Assertions:

```typescript
  it('renders a progress block for each of the three categories', () => {
    renderScreen();
    expect(screen.getByRole('heading', { name: /Грамматика N5/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Кандзи N5/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Слова N5/ })).toBeInTheDocument();
  });

  it('shows the unlock control with the current percent when the next level is locked', () => {
    renderScreen();
    expect(screen.getByText(/N4 откроется при/i)).toHaveTextContent('42%');
    fireEvent.click(screen.getByRole('button', { name: /Открыть N4 сейчас/i }));
    expect(unlockLevel).toHaveBeenCalledWith(expect.anything(), 'N4');
  });
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run tests/ui/ProgressScreen.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Rewrite `src/ui/screens/ProgressScreen.tsx`**

```typescript
import { useState } from 'react';
import { useUserDb } from '@/ui/useUserDb';
import { useContentDb, useEffectiveLevels } from '@/ui/useContentDb';
import { levelRibbon, levelBars, statusCounts, levelCompletion, streak, heatmap } from '@/core/progress';
import { unlockLevel, UNLOCK_THRESHOLD } from '@/core/levels';
import { ProgressBar } from '@/ui/components/ProgressBar';
import { Heatmap } from '@/ui/components/Heatmap';
import type { ItemType } from '@/core/types';

const CATEGORY_LABEL: Record<ItemType, string> = {
  grammar: 'Грамматика', kanji: 'Кандзи', vocab: 'Слова',
};

export function ProgressScreen() {
  const user = useUserDb();
  const content = useContentDb();
  const levels = useEffectiveLevels();
  const now = new Date();
  const [, setTick] = useState(0);

  if (levels.length === 0) {
    return (
      <section className="progress">
        <h1>Прогресс</h1>
        <p>Нет данных об уровнях.</p>
      </section>
    );
  }

  const ribbon = levelRibbon(user, content);
  const active = levels.find((l) => l.status === 'available')?.code ?? levels[0]!.code;
  const st = streak(user, now);
  const cells = heatmap(user, now, 17);

  // The next shipped-but-locked level, if any.
  const activeOrd = levels.find((l) => l.code === active)!.ord;
  const nextLocked = levels
    .filter((l) => l.ord > activeOrd && l.rawStatus === 'available' && l.status === 'locked')
    .sort((a, b) => a.ord - b.ord)[0];
  const completion = levelCompletion(user, content, active);

  return (
    <section className="progress">
      <h1>Прогресс</h1>

      <div className="ribbon">
        {ribbon.map((seg) => (
          <div key={seg.code} className={`ribbon-seg ${seg.status}`}>
            <span className="ribbon-code">{seg.code}</span>
            <div className="ribbon-track">
              <div className="ribbon-fill" style={{ width: `${Math.round(seg.fill * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>

      {(['grammar', 'kanji', 'vocab'] as ItemType[]).map((type) => {
        const bars = levelBars(user, content, active, type);
        const counts = statusCounts(user, content, active, type);
        return (
          <div key={type} className="progress-category">
            <h2>{CATEGORY_LABEL[type]} {active}</h2>
            <ProgressBar label="Изучено" value={bars.studied} total={bars.total} />
            <ProgressBar label="Закреплено" value={bars.consolidated} total={bars.total} />
            <div className="status-counts">
              <span>Новые {counts.new}</span>
              <span>Изучаются {counts.learning}</span>
              <span>Изучено {counts.learned}</span>
              <span>Освоено {counts.mastered}</span>
            </div>
          </div>
        );
      })}

      <h2>Активность</h2>
      <Heatmap cells={cells} />
      <p className="streak">Стрик {st.current} · рекорд {st.best}</p>

      {nextLocked && (
        <div className="unlock-rule">
          <p>
            {nextLocked.code} откроется при {Math.round(UNLOCK_THRESHOLD * 100)}% «закреплено»
            по {active}. Сейчас: {Math.round(completion * 100)}%.
          </p>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => { unlockLevel(user, nextLocked.code); setTick((n) => n + 1); }}
          >
            Открыть {nextLocked.code} сейчас
          </button>
        </div>
      )}
    </section>
  );
}
```

Check `ProgressBar` prop names (`value`/`total`/`label`) against `src/ui/components/ProgressBar.tsx` and adjust if different.

- [ ] **Step 4: CSS**

In `src/ui/theme.css`, add spacing for the repeated blocks if the existing `.status-counts` / `h2` rules aren't enough:

```css
.progress-category { margin-top: 1.5rem; }
.unlock-rule { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--border); }
.unlock-rule button { margin-top: 0.6rem; }
```

- [ ] **Step 5: Run tests + typecheck + lint**

Run: `npm run typecheck && npm run lint && npx vitest run tests/ui/ProgressScreen.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/screens/ProgressScreen.tsx src/ui/theme.css tests/ui/ProgressScreen.test.tsx
git commit -m "feat(progress): three category blocks + manual level-unlock control

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: e2e coverage + seed-helper unlock flag + full regression

**Files:**
- Modify: `tests/e2e/helpers/seed-user-db.ts`
- Modify: `tests/e2e/n4-unlocked.spec.ts`
- Create: `tests/e2e/level-unlock.spec.ts`

**Interfaces:**
- Consumes: `writeSeededUserDb(dir, opts)` with a new optional `unlockedLevels?: string[]`.

- [ ] **Step 1: Add `unlockedLevels` to the seed helper**

In `tests/e2e/helpers/seed-user-db.ts`, extend `opts` and the settings write:

```typescript
  opts: { learnedIds: string[]; dueIds: string[]; newPerDay?: number; placementOffered?: boolean; unlockedLevels?: string[] },
```

```typescript
  const settings: Record<string, unknown> = {
    ...DEFAULT_SETTINGS,
    placement_offered: opts.placementOffered ?? false,
    unlocked_levels: opts.unlockedLevels ?? [],
  };
```

- [ ] **Step 2: Fix `tests/e2e/n4-unlocked.spec.ts`**

These three tests launch a fresh default profile and assert N4 reference content is visible. With N4 now locked by default they must seed an unlock. Add `--user-data-dir` + a seeded db to each (mirror `texts-browse.spec.ts`'s per-test `mkdtempSync`):

```typescript
import { writeSeededUserDb } from './helpers/seed-user-db';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('N4 tab shows a real grammar list, not "coming soon"', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'jlpt-e2e-n4-'));
  await writeSeededUserDb(userData, { learnedIds: [], dueIds: [], unlockedLevels: ['N4'] });
  const app = await electron.launch({ args: ['out/main/main.js', `--user-data-dir=${userData}`] });
  // ...rest unchanged...
});
```

Apply to all three tests in the file.

- [ ] **Step 3: Create `tests/e2e/level-unlock.spec.ts`**

```typescript
import { test, expect, _electron as electron } from '@playwright/test';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { writeSeededUserDb } from './helpers/seed-user-db';

test('N4 is locked for a fresh user and opens from the Progress screen, surviving restart', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'jlpt-e2e-unlock-'));
  await writeSeededUserDb(userData, { learnedIds: [], dueIds: [], placementOffered: true });

  const app = await electron.launch({ args: [join(process.cwd(), 'out/main/main.js'), `--user-data-dir=${userData}`] });
  const win = await app.firstWindow();
  await win.waitForSelector('[data-testid="user-db-ready"]', { state: 'attached', timeout: 20_000 });

  // N4 grammar tab is locked
  await win.getByRole('link', { name: /Грамматика/ }).click();
  await win.getByRole('tab', { name: /^N4$/ }).click();
  await expect(win.getByText(/откроется после 90%/i)).toBeVisible();
  await expect(win.locator('.grammar-list-item')).toHaveCount(0);

  // unlock from Progress
  await win.getByRole('link', { name: /Прогресс/ }).click();
  await win.getByRole('button', { name: /Открыть N4 сейчас/i }).click();

  // N4 grammar list is now populated
  await win.getByRole('link', { name: /Грамматика/ }).click();
  await win.getByRole('tab', { name: /^N4$/ }).click();
  await expect(win.locator('.grammar-list-item').first()).toBeVisible();

  await app.close();

  // persists across restart
  const app2 = await electron.launch({ args: [join(process.cwd(), 'out/main/main.js'), `--user-data-dir=${userData}`] });
  const win2 = await app2.firstWindow();
  await win2.waitForSelector('[data-testid="user-db-ready"]', { state: 'attached', timeout: 20_000 });
  await win2.getByRole('link', { name: /Грамматика/ }).click();
  await win2.getByRole('tab', { name: /^N4$/ }).click();
  await expect(win2.locator('.grammar-list-item').first()).toBeVisible();
  await app2.close();
});
```

Adjust selectors (`.grammar-list-item`, nav link names, tab names) to the real DOM — check `GrammarListScreen.tsx` and `Nav.tsx` for the actual class names / labels. If the unlock button triggers `window.location.reload()` instead of a state tick, the second half still works.

- [ ] **Step 4: Build + run e2e**

Run: `npm run build:desktop && npx playwright test level-unlock n4-unlocked texts-browse progress`
Expected: PASS. Iterate on selectors.

- [ ] **Step 5: Full regression**

Run: `npm run typecheck && npm run lint && npx vitest run && npx playwright test && npm run build:desktop:installer`
Expected: all green; `dist/JLPT Setup 1.1.0.exe` produced.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/
git commit -m "test(e2e): level-unlock flow + seed-helper unlockedLevels flag

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- §1 progress.ts generalization + `levelCompletion` → Task 1. ✓
- §2 `src/core/levels.ts` (`EffectiveLevelStatus`, `levelCompletion` [in progress.ts], `effectiveLevelStatus`, `availableLevelCodes`, `unlockLevel`) → Task 2. ✓
- §3 threading into scheduler/session/placement → Task 3. ✓ (session.ts needs no signature change because `split` computes the set internally — noted in Task 3 Step 1.)
- §4 `useEffectiveLevels` + list screens → Task 4. ✓
- §5 ProgressScreen 3 blocks + unlock control → Task 5. ✓
- §6 reference-screen locked copy → Task 4. ✓
- §7 `settings.unlocked_levels`, no migration, `levels.yml` untouched → Task 2 (`unlockLevel`) + Task 6 (seed). ✓
- §8 tests → each task's test steps + Task 6 e2e. ✓
- §9 task order → matches. ✓

**Placeholder scan:** Task 3 Step 4 and Task 4 Step 1/Step 6 say "grep the file" / "follow the existing mocking style" / "adjust selectors" rather than giving exact line edits — this is deliberate: the exact fixture shapes in `scheduler.test.ts` / `session.test.ts` and the mocking style in the screen tests vary per file and must be read at implementation time. Every *new* file and every *core* signature is fully specified. Acceptable.

**Type consistency:**
- `availableItemIds(content, itemType, availableCodes: ReadonlySet<string>)` — same in Task 2 (Produces), Task 3 (impl), Task 3 Step 4 (tests). ✓
- `initPlacement(content, availableCodes: ReadonlySet<string>)` — Task 2 Produces, Task 3 impl + PlacementScreen. ✓
- `effectiveLevelStatus(user, content, levelCode, now)` — Task 2 def, Task 4 hook. ✓
- `levelBars(user, content, levelCode, itemType)` — Task 1 def, Task 5 usage. ✓
- `EffectiveLevelStatus = 'available'|'locked'|'coming_soon'` — Task 2, consumed Task 4/5. ✓
- `unlockLevel(user, levelCode)` — Task 2 def, Task 5 `onClick={() => unlockLevel(user, nextLocked.code)}`. ✓
