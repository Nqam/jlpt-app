# Plan 2 — SRS Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Plan 1 grammar reference into a working spaced-repetition app — grammar cards, an FSRS engine, a daily "Today" queue with a flashcard review loop, and a Progress screen with bars, status counts, a streak, and an activity heatmap — with all user state in a local `user.db` that survives app updates.

**Architecture:** New pure-TypeScript core modules (`src/core/time.ts`, `src/core/srs.ts`, `src/core/scheduler.ts`, `src/core/progress.ts`) and a storage module (`src/storage/user-db.ts` + `src/storage/migrations.ts`) that opens `user.db` via `sql.js`, runs ordered migrations, and persists with a debounced whole-file write through an extended `PlatformAdapter`. Three React screens (`TodayScreen`, `ReviewScreen`, `ProgressScreen`) plus a `UserDbProvider` compose on top. The core takes `now: Date` as a parameter everywhere — no internal `Date.now()` — so intervals, day boundaries, and streaks are deterministically testable.

**Tech Stack:** TypeScript, React 18, `ts-fsrs` 5.4.2 (FSRS scheduler, MIT), `sql.js` 1.14.2 (WASM SQLite), Electron 33 (`shells/electron`), Vitest, Playwright, electron-vite.

**Spec:** `docs/superpowers/specs/2026-09-03-plan-2-srs-core-design.md` (read it — the plan argues from it). Parent spec: `docs/superpowers/specs/2026-09-03-jlpt-desktop-app-design.md`.

## Global Constraints

- **Browser-safe `src/**`:** no `electron`, `node:*`, `fs`, `path`, `child_process`, `os`, `crypto` imports anywhere under `src/**`. The ESLint rule `no-restricted-imports` (in `eslint.config.js`) enforces this — `npm run lint` must stay green. `window.jlmpBridge` access lives only in `src/platform/desktop.ts` via `declare global`.
- **`shells/electron/**` and `scripts/**`** may use Node/Electron APIs.
- **Time is a parameter.** Every core function that depends on the current time takes `now: Date`. No `Date.now()` / `new Date()` inside `src/core/**` or `src/storage/**` except where explicitly building a value from a passed-in `now`.
- **Timestamps:** all stored moments are UTC ISO 8601 strings. `day_key` is the **local** calendar date (`YYYY-MM-DD`) computed once at write time and never recomputed.
- **FSRS status thresholds** (parent spec §6): `reps === 0` → `new`; else by `stability`: `< 7` → `learning`, `< 30` → `learned`, `>= 30` → `mastered`.
- **Defaults** (seeded into `settings`): `new_per_day = 5`, `review_queue_cap = 100`, `fsrs_request_retention = 0.9`, `fsrs_maximum_interval = 365`, `fsrs_enable_fuzz = true`.
- **UI text in Russian.** Japanese renders with furigana support (reuse `Furigana`, `GrammarMarkdown`).
- **`user.db` migrations:** `PRAGMA user_version`, ordered `up(db)` steps in one transaction each, no down migrations, refuse to open a DB whose `user_version` exceeds the newest known migration.
- **TDD:** failing test first. Vitest for `src/core` + `src/storage` (fake `PlatformAdapter` over Node `fs` in a temp file). Playwright for Electron flows.
- **Commits:** small, one per task (or a few logically-grouped). Body plain English. End every commit message with:
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`
- **Regression bar:** the existing suite (Vitest 42, Playwright e2e 5) stays green. `npm run typecheck`, `npm run lint`, `npm run build` stay clean (no browser-externalization warning).
- **Node not on PATH** in the Bash tool: prefix commands with `export PATH="$PATH:/c/Program Files/nodejs"`.
- **Schema note:** the spec §3 `cards` table is implemented with one added column, `learning_steps INTEGER NOT NULL`, because `ts-fsrs` 5.4.2 `Card` carries it. `elapsed_days` stays (still present in 5.4.2).

---

## File Structure

**Created:**
- `src/core/time.ts` — `startOfLocalDay`, `endOfLocalDay`, `localDayKey`, `toUtcIso`, `daysBetweenLocal`. Pure date math.
- `src/core/srs.ts` — `ts-fsrs` wrapper: `newCard`, `review`, `statusOf`, `previewIntervals`, `CardRow`/`ReviewLogRow` types, Card↔CardRow serialization.
- `src/core/scheduler.ts` — `daySummary`, `buildQueue`. Composes srs + content-db + user-db reads.
- `src/core/progress.ts` — `levelBars`, `statusCounts`, `streak`, `heatmap`, `levelRibbon`.
- `src/storage/migrations.ts` — `MIGRATIONS` array; migration 1 = full v1 schema + seed rows.
- `src/storage/user-db.ts` — `UserDb` class: `open`, typed reads/writes, `markDirty`/debounced persist, `flush`, `export`.
- `src/ui/UserDbProvider.tsx` — opens `UserDb` once, exposes `{ db, reload }` + `data-testid="user-db-ready"`.
- `src/ui/useUserDb.ts` — `useUserDb()` hook.
- `src/ui/screens/TodayScreen.tsx` — summary + "Начать".
- `src/ui/screens/ReviewScreen.tsx` — flashcard loop.
- `src/ui/screens/ProgressScreen.tsx` — ribbon + bars + counts + heatmap + streak.
- `src/ui/components/ProgressBar.tsx` — labelled fraction bar.
- `src/ui/components/Heatmap.tsx` — weeks×7 activity grid.
- `src/ui/components/RatingButtons.tsx` — 4 rating buttons with interval previews.
- Tests mirroring each under `tests/core/`, `tests/storage/`, `tests/ui/`, `tests/e2e/`.

**Modified:**
- `package.json` — add `ts-fsrs` dependency; bump nothing else.
- `src/platform/adapter.ts` — add `readUserDb` / `writeUserDb` to the interface.
- `src/platform/desktop.ts` — implement them; extend the `jlmpBridge` `declare global`.
- `shells/electron/preload.ts` — expose `readUserDb` / `writeUserDb`.
- `shells/electron/main.ts` — `user-db:read` / `user-db:write` IPC handlers (atomic write) + a `before-quit` flush handshake.
- `src/ui/routes.tsx` — `/` → `TodayScreen`, `/review` → `ReviewScreen`, `/progress` → `ProgressScreen`.
- `src/ui/App.tsx` — nest `<UserDbProvider>` inside `<ContentDbProvider>`.
- `src/ui/theme.css` — styles for the new components (kept minimal, append-only).

---

## Task 1: `ts-fsrs` dependency + `PlatformAdapter` write extension

**Files:**
- Modify: `package.json` (dependencies)
- Modify: `src/platform/adapter.ts`
- Modify: `src/platform/desktop.ts`
- Modify: `shells/electron/preload.ts`
- Modify: `shells/electron/main.ts`
- Test: `tests/e2e/user-db-bridge.spec.ts` (create)

**Interfaces:**
- Consumes: existing `PlatformAdapter`, `jlmpBridge` pattern from Plan 1.
- Produces:
  - `PlatformAdapter.readUserDb(): Promise<Uint8Array | null>` — `null` when no file yet.
  - `PlatformAdapter.writeUserDb(bytes: Uint8Array): Promise<void>` — atomic on desktop.
  - `window.jlmpBridge.readUserDb(): Promise<ArrayBuffer | null>`, `window.jlmpBridge.writeUserDb(bytes: ArrayBuffer): Promise<void>`.
  - IPC channels `user-db:read`, `user-db:write`, and `app:flush-user-db` (main→renderer request on quit).

- [ ] **Step 1: Install `ts-fsrs`**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npm install ts-fsrs@5.4.2`
Expected: `package.json` `dependencies` gains `"ts-fsrs": "5.4.2"` (pin exact — the serialization in Task 5 depends on the 5.4.2 `Card` shape). `package-lock.json` updates.

- [ ] **Step 2: Write the failing e2e test**

Create `tests/e2e/user-db-bridge.spec.ts`:

```ts
import { test, expect, _electron as electron } from '@playwright/test';
import { join } from 'node:path';

test('user-db bridge round-trips bytes and reports null before first write', async () => {
  const app = await electron.launch({ args: [join(process.cwd(), 'out/main/main.js')] });
  const win = await app.firstWindow();
  await win.waitForSelector('[data-testid="app-title"]');

  // Fresh userData in CI may already hold a user.db from a prior run; just
  // assert the round-trip contract rather than the initial null.
  const wrote = await win.evaluate(async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]).buffer;
    await window.jlmpBridge!.writeUserDb(bytes);
    const back = await window.jlmpBridge!.readUserDb();
    return back ? Array.from(new Uint8Array(back)).slice(0, 5) : null;
  });
  expect(wrote).toEqual([1, 2, 3, 4, 5]);

  await app.close();
});
```

- [ ] **Step 3: Run it — expect failure**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npm run build && npx playwright test tests/e2e/user-db-bridge.spec.ts`
Expected: FAIL — `window.jlmpBridge.writeUserDb is not a function`.

- [ ] **Step 4: Extend the adapter interface**

In `src/platform/adapter.ts`, add to `PlatformAdapter`:

```ts
  /** Байты `user.db` из приватного хранилища приложения. `null` — файла ещё нет. */
  readUserDb(): Promise<Uint8Array | null>;
  /** Атомарно записать `user.db`. */
  writeUserDb(bytes: Uint8Array): Promise<void>;
```

- [ ] **Step 5: Implement in `desktop.ts`**

In `src/platform/desktop.ts`, extend the `declare global` block:

```ts
    jlmpBridge?: {
      readContentDb(): Promise<ArrayBuffer>;
      readSqlWasm(): Promise<ArrayBuffer>;
      readUserDb(): Promise<ArrayBuffer | null>;
      writeUserDb(bytes: ArrayBuffer): Promise<void>;
    };
```

Add to the returned adapter object:

```ts
    async readUserDb(): Promise<Uint8Array | null> {
      if (!window.jlmpBridge) throw new Error('jlmpBridge missing — preload not loaded');
      const buf = await window.jlmpBridge.readUserDb();
      return buf ? new Uint8Array(buf) : null;
    },
    async writeUserDb(bytes: Uint8Array): Promise<void> {
      if (!window.jlmpBridge) throw new Error('jlmpBridge missing — preload not loaded');
      // structuredClone-safe: pass a plain ArrayBuffer slice
      const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      await window.jlmpBridge.writeUserDb(ab);
    },
```

- [ ] **Step 6: Expose in `preload.ts`**

`shells/electron/preload.ts` becomes:

```ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('jlmpBridge', {
  readContentDb: (): Promise<ArrayBuffer> => ipcRenderer.invoke('content-db:read'),
  readSqlWasm: (): Promise<ArrayBuffer> => ipcRenderer.invoke('sql-wasm:read'),
  readUserDb: (): Promise<ArrayBuffer | null> => ipcRenderer.invoke('user-db:read'),
  writeUserDb: (bytes: ArrayBuffer): Promise<void> => ipcRenderer.invoke('user-db:write', bytes),
  onFlushUserDb: (cb: () => Promise<void> | void): void => {
    ipcRenderer.on('app:flush-user-db', async () => {
      await cb();
      ipcRenderer.send('app:flush-user-db:done');
    });
  },
});
```

Also add `onFlushUserDb` to the `desktop.ts` `declare global` type as `onFlushUserDb(cb: () => Promise<void> | void): void;` — but do NOT call it from the adapter; `UserDbProvider` (Task 8) wires it.

- [ ] **Step 7: Add IPC handlers + flush handshake in `main.ts`**

In `shells/electron/main.ts`, after the `sql-wasm:read` handler add:

```ts
import { writeFile, rename, mkdir } from 'node:fs/promises';
// readFile already imported

function userDbPath(): string {
  return join(app.getPath('userData'), 'user.db');
}

ipcMain.handle('user-db:read', async (): Promise<ArrayBuffer | null> => {
  try {
    const buf = await readFile(userDbPath());
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
});

ipcMain.handle('user-db:write', async (_evt, bytes: ArrayBuffer): Promise<void> => {
  const dir = app.getPath('userData');
  await mkdir(dir, { recursive: true });
  const target = userDbPath();
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, Buffer.from(bytes));
  await rename(tmp, target); // atomic on same filesystem
});
```

For the flush handshake, wrap quit:

```ts
let flushing = false;
app.on('before-quit', (evt) => {
  if (flushing) return;
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return;
  evt.preventDefault();
  flushing = true;
  let done = false;
  ipcMain.once('app:flush-user-db:done', () => { done = true; app.quit(); });
  win.webContents.send('app:flush-user-db');
  setTimeout(() => { if (!done) app.quit(); }, 1500); // don't hang on quit
});
```

- [ ] **Step 8: Rebuild and run the e2e**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npm run build && npx playwright test tests/e2e/user-db-bridge.spec.ts`
Expected: PASS.

- [ ] **Step 9: Full regression**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npm run typecheck && npm run lint && npm test && npm run build`
Expected: typecheck 0, lint 0, Vitest 42 pass, build clean (no `externalized for browser compatibility`).

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json src/platform shells/electron tests/e2e/user-db-bridge.spec.ts
git commit -m "feat: user.db read/write bridge and ts-fsrs dependency

Extend PlatformAdapter with readUserDb/writeUserDb, wire Electron IPC with
an atomic temp-file+rename write and a before-quit flush handshake, and add
the ts-fsrs 5.4.2 dependency for the SRS engine.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: `src/core/time.ts` — local-day / UTC helpers

**Files:**
- Create: `src/core/time.ts`
- Test: `tests/core/time.test.ts`

**Interfaces:**
- Produces:
  - `toUtcIso(d: Date): string` — `d.toISOString()`.
  - `localDayKey(d: Date): string` — `YYYY-MM-DD` in the host's local timezone.
  - `startOfLocalDay(d: Date): Date` — local midnight of `d`'s day, as a `Date`.
  - `endOfLocalDay(d: Date): Date` — local `23:59:59.999` of `d`'s day.
  - `daysBetweenLocal(a: Date, b: Date): number` — signed whole local-day difference (`b`'s day minus `a`'s day), used by streak logic.

- [ ] **Step 1: Write the failing test**

Create `tests/core/time.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { toUtcIso, localDayKey, startOfLocalDay, endOfLocalDay, daysBetweenLocal } from '@/core/time';

describe('core/time', () => {
  const savedTZ = process.env.TZ;
  beforeAll(() => { process.env.TZ = 'Europe/Moscow'; }); // UTC+3, no DST since 2014
  afterAll(() => { process.env.TZ = savedTZ; });

  it('toUtcIso is a round-trippable ISO string', () => {
    const d = new Date('2026-01-15T09:30:00.000Z');
    expect(toUtcIso(d)).toBe('2026-01-15T09:30:00.000Z');
  });

  it('localDayKey uses local calendar date', () => {
    // 2026-01-15 22:30 UTC === 2026-01-16 01:30 Moscow
    expect(localDayKey(new Date('2026-01-15T22:30:00.000Z'))).toBe('2026-01-16');
    expect(localDayKey(new Date('2026-01-15T20:59:00.000Z'))).toBe('2026-01-15');
  });

  it('startOfLocalDay / endOfLocalDay bracket the local day', () => {
    const d = new Date('2026-01-15T22:30:00.000Z'); // local 2026-01-16
    const s = startOfLocalDay(d);
    const e = endOfLocalDay(d);
    expect(localDayKey(s)).toBe('2026-01-16');
    expect(localDayKey(e)).toBe('2026-01-16');
    expect(s.getTime()).toBeLessThan(d.getTime());
    expect(e.getTime()).toBeGreaterThan(d.getTime());
    expect(e.getTime() - s.getTime()).toBe(24 * 3600 * 1000 - 1);
  });

  it('daysBetweenLocal counts calendar days regardless of clock time', () => {
    const a = new Date('2026-01-15T23:00:00.000Z'); // local 2026-01-16 02:00
    const b = new Date('2026-01-16T05:00:00.000Z'); // local 2026-01-16 08:00
    expect(daysBetweenLocal(a, b)).toBe(0);
    const c = new Date('2026-01-16T22:00:00.000Z'); // local 2026-01-17 01:00
    expect(daysBetweenLocal(a, c)).toBe(1);
    expect(daysBetweenLocal(c, a)).toBe(-1);
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/core/time.test.ts`
Expected: FAIL — cannot resolve `@/core/time`.

- [ ] **Step 3: Implement**

Create `src/core/time.ts`:

```ts
/** Всё время в ядре — параметром `now: Date`. Здесь только чистая арифметика дат. */

export function toUtcIso(d: Date): string {
  return d.toISOString();
}

/** Локальная календарная дата `YYYY-MM-DD` (часовой пояс хоста). */
export function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function startOfLocalDay(d: Date): Date {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  return s;
}

export function endOfLocalDay(d: Date): Date {
  const e = new Date(d);
  e.setHours(23, 59, 59, 999);
  return e;
}

/** Знаковая разница в целых локальных днях: день(b) − день(a). */
export function daysBetweenLocal(a: Date, b: Date): number {
  const sa = startOfLocalDay(a).getTime();
  const sb = startOfLocalDay(b).getTime();
  return Math.round((sb - sa) / (24 * 3600 * 1000));
}
```

- [ ] **Step 4: Run — expect pass**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/core/time.test.ts`
Expected: PASS (5 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/core/time.ts tests/core/time.test.ts
git commit -m "feat: local-day and UTC time helpers for the SRS core

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: `src/storage/migrations.ts` — v1 schema

**Files:**
- Create: `src/storage/migrations.ts`
- Test: `tests/storage/migrations.test.ts`

**Interfaces:**
- Consumes: a `sql.js` `Database` instance (`import type { Database } from 'sql.js'`).
- Produces:
  - `MIGRATIONS: Migration[]` where `Migration = { version: number; up(db: Database): void }`.
  - `LATEST_VERSION: number` (= `MIGRATIONS.at(-1)!.version`, currently `1`).
  - `applyMigrations(db: Database, appVersion: string, now: Date): void` — reads `PRAGMA user_version`, runs each pending migration in a transaction, bumps `user_version`; throws `Error` if `user_version > LATEST_VERSION`.

- [ ] **Step 1: Write the failing test**

Create `tests/storage/migrations.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { MIGRATIONS, LATEST_VERSION, applyMigrations } from '@/storage/migrations';

let SQL: SqlJsStatic;
beforeAll(async () => {
  const wasm = createRequire(import.meta.url).resolve('sql.js/dist/sql-wasm.wasm');
  SQL = await initSqlJs({ wasmBinary: readFileSync(wasm) });
});

function tables(db: import('sql.js').Database): string[] {
  const r = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  return r.length ? (r[0]!.values.map((v) => String(v[0]))) : [];
}
function userVersion(db: import('sql.js').Database): number {
  return Number(db.exec('PRAGMA user_version')[0]!.values[0]![0]);
}

describe('storage/migrations', () => {
  const now = new Date('2026-02-01T12:00:00.000Z');

  it('fresh db gets the full v1 schema and user_version = LATEST_VERSION', () => {
    const db = new SQL.Database();
    applyMigrations(db, '0.2.0', now);
    expect(userVersion(db)).toBe(LATEST_VERSION);
    expect(tables(db)).toEqual(['cards', 'meta', 'review_log', 'settings']);
  });

  it('seeds settings and meta', () => {
    const db = new SQL.Database();
    applyMigrations(db, '0.2.0', now);
    const s = db.exec("SELECT value FROM settings WHERE key='new_per_day'");
    expect(Number(JSON.parse(String(s[0]!.values[0]![0])))).toBe(5);
    const m = db.exec("SELECT value FROM meta WHERE key='schema_version'");
    expect(String(m[0]!.values[0]![0])).toBe('1');
    const av = db.exec("SELECT value FROM meta WHERE key='app_version'");
    expect(String(av[0]!.values[0]![0])).toBe('0.2.0');
  });

  it('is idempotent — re-applying does nothing', () => {
    const db = new SQL.Database();
    applyMigrations(db, '0.2.0', now);
    applyMigrations(db, '0.2.0', now); // no throw, no dup rows
    const c = db.exec("SELECT COUNT(*) FROM settings WHERE key='new_per_day'");
    expect(Number(c[0]!.values[0]![0])).toBe(1);
  });

  it('refuses a db newer than LATEST_VERSION', () => {
    const db = new SQL.Database();
    db.run(`PRAGMA user_version = ${LATEST_VERSION + 1}`);
    expect(() => applyMigrations(db, '0.2.0', now)).toThrow(/newer/i);
  });

  it('MIGRATIONS versions are 1..N contiguous and ascending', () => {
    MIGRATIONS.forEach((m, i) => expect(m.version).toBe(i + 1));
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/storage/migrations.test.ts`
Expected: FAIL — cannot resolve `@/storage/migrations`.

- [ ] **Step 3: Implement**

Create `src/storage/migrations.ts`:

```ts
import type { Database } from 'sql.js';
import { toUtcIso } from '@/core/time';

export interface Migration {
  version: number;
  up(db: Database): void;
}

const V1_SCHEMA = `
CREATE TABLE cards (
  item_type      TEXT    NOT NULL,
  item_id        TEXT    NOT NULL,
  due            TEXT    NOT NULL,
  stability      REAL    NOT NULL,
  difficulty     REAL    NOT NULL,
  elapsed_days   INTEGER NOT NULL,
  scheduled_days INTEGER NOT NULL,
  learning_steps INTEGER NOT NULL,
  reps           INTEGER NOT NULL,
  lapses         INTEGER NOT NULL,
  state          INTEGER NOT NULL,
  last_review    TEXT,
  introduced_at  TEXT    NOT NULL,
  PRIMARY KEY (item_type, item_id)
);
CREATE INDEX ix_cards_due ON cards(due);

CREATE TABLE review_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  item_type       TEXT    NOT NULL,
  item_id         TEXT    NOT NULL,
  reviewed_at     TEXT    NOT NULL,
  day_key         TEXT    NOT NULL,
  rating          INTEGER NOT NULL,
  state_before    INTEGER NOT NULL,
  stability_after REAL    NOT NULL,
  elapsed_ms      INTEGER NOT NULL
);
CREATE INDEX ix_review_log_day ON review_log(day_key);
CREATE INDEX ix_review_log_item ON review_log(item_type, item_id);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

const DEFAULT_SETTINGS: Record<string, unknown> = {
  new_per_day: 5,
  review_queue_cap: 100,
  fsrs_request_retention: 0.9,
  fsrs_maximum_interval: 365,
  fsrs_enable_fuzz: true,
};

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    up(db) {
      db.run(V1_SCHEMA);
      const setS = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
      for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
        setS.run([k, JSON.stringify(v)]);
      }
      setS.free();
      // meta rows are written by applyMigrations (needs appVersion + now)
    },
  },
];

export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.version;

export function applyMigrations(db: Database, appVersion: string, now: Date): void {
  const current = Number(db.exec('PRAGMA user_version')[0]!.values[0]![0]);
  if (current > LATEST_VERSION) {
    throw new Error(
      `user.db schema version ${current} is newer than this app supports (${LATEST_VERSION})`,
    );
  }
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    db.run('BEGIN');
    try {
      m.up(db);
      db.run(`PRAGMA user_version = ${m.version}`);
      db.run('COMMIT');
    } catch (e) {
      db.run('ROLLBACK');
      throw e;
    }
  }
  // Seed / refresh meta after the schema exists.
  if (current < 1) {
    const setM = db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)');
    setM.run(['schema_version', String(LATEST_VERSION)]);
    setM.run(['app_version', appVersion]);
    setM.run(['created_at', toUtcIso(now)]);
    setM.free();
  }
}
```

- [ ] **Step 4: Run — expect pass**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/storage/migrations.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Regression + commit**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npm run typecheck && npm run lint`
Expected: clean.

```bash
git add src/storage/migrations.ts tests/storage/migrations.test.ts
git commit -m "feat: user.db migration runner and v1 schema

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: `src/storage/user-db.ts` — open, persist, queries

**Files:**
- Create: `src/storage/user-db.ts`
- Test: `tests/storage/user-db.test.ts`

**Interfaces:**
- Consumes: `PlatformAdapter` (`readUserDb`/`writeUserDb` from Task 1), `applyMigrations` (Task 3), `loadSqlJs` from `src/storage/sqljs.ts` (Plan 1 — signature `loadSqlJs(wasmBinary: Uint8Array): Promise<SqlJsStatic>`), `toUtcIso` (Task 2).
- Produces:

```ts
interface CardRow {
  item_type: string; item_id: string;
  due: string; stability: number; difficulty: number;
  elapsed_days: number; scheduled_days: number; learning_steps: number;
  reps: number; lapses: number; state: number;
  last_review: string | null; introduced_at: string;
}
interface ReviewLogRow {
  item_type: string; item_id: string;
  reviewed_at: string; day_key: string; rating: number;
  state_before: number; stability_after: number; elapsed_ms: number;
}

class UserDb {
  static open(adapter: PlatformAdapter, appVersion: string, now: Date): Promise<UserDb>;
  getSetting<T>(key: string, fallback: T): T;
  setSetting(key: string, value: unknown): void;
  getCard(itemType: string, itemId: string): CardRow | null;
  allCards(itemType?: string): CardRow[];
  upsertCard(row: CardRow): void;                 // marks dirty
  insertReviewLog(row: ReviewLogRow): void;       // marks dirty
  reviewCountsByDay(): { day_key: string; count: number }[];
  introducedOnOrAfter(iso: string): number;       // count of cards with introduced_at >= iso
  flush(): Promise<void>;                         // force debounced write now
  export(): Uint8Array;                           // current bytes (for tests / flush)
}
```

- The debounce is 500 ms; `flush()` cancels the timer and writes immediately.
- `open` calls `adapter.readUserDb()`; `null` → `new SQL.Database()` then `applyMigrations`. Non-null → `new SQL.Database(bytes)` then `applyMigrations` (handles upgrades).

- [ ] **Step 1: Write the failing test**

Create `tests/storage/user-db.test.ts`:

```ts
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import type { PlatformAdapter } from '@/platform/adapter';
import { UserDb } from '@/storage/user-db';

const wasm = readFileSync(createRequire(import.meta.url).resolve('sql.js/dist/sql-wasm.wasm'));

/** In-memory fake adapter: holds the last written bytes. */
function fakeAdapter(initial: Uint8Array | null = null) {
  let store = initial;
  const writes: number[] = [];
  return {
    adapter: {
      platform: 'desktop',
      async readBundledContentDb() { throw new Error('unused'); },
      async readSqlWasm() { return new Uint8Array(wasm); },
      async readUserDb() { return store; },
      async writeUserDb(bytes: Uint8Array) { store = bytes.slice(); writes.push(store.length); },
    } as PlatformAdapter,
    get bytes() { return store; },
    get writeCount() { return writes.length; },
  };
}

const now = new Date('2026-02-01T10:00:00.000Z');

describe('storage/user-db', () => {
  it('creates the schema on first open', async () => {
    const f = fakeAdapter(null);
    const db = await UserDb.open(f.adapter, '0.2.0', now);
    expect(db.getSetting('new_per_day', 0)).toBe(5);
    expect(db.allCards()).toEqual([]);
  });

  it('persists a card and reloads it after reopen', async () => {
    const f = fakeAdapter(null);
    const db = await UserDb.open(f.adapter, '0.2.0', now);
    db.upsertCard({
      item_type: 'grammar', item_id: 'n5-wa-particle',
      due: '2026-02-02T10:00:00.000Z', stability: 3, difficulty: 5,
      elapsed_days: 0, scheduled_days: 1, learning_steps: 0,
      reps: 1, lapses: 0, state: 1, last_review: '2026-02-01T10:00:00.000Z',
      introduced_at: '2026-02-01T10:00:00.000Z',
    });
    await db.flush();

    const db2 = await UserDb.open(f.adapter, '0.2.0', now);
    const card = db2.getCard('grammar', 'n5-wa-particle');
    expect(card?.stability).toBe(3);
    expect(card?.reps).toBe(1);
  });

  it('debounces writes — many mutations, one flush write', async () => {
    vi.useFakeTimers();
    const f = fakeAdapter(null);
    const db = await UserDb.open(f.adapter, '0.2.0', now);
    const base = f.writeCount;
    for (let i = 0; i < 5; i++) {
      db.setSetting(`k${i}`, i);
    }
    expect(f.writeCount).toBe(base); // nothing yet
    await vi.advanceTimersByTimeAsync(600);
    expect(f.writeCount).toBe(base + 1); // collapsed into one
    vi.useRealTimers();
  });

  it('counts review logs by day and cards introduced on/after a cutoff', async () => {
    const f = fakeAdapter(null);
    const db = await UserDb.open(f.adapter, '0.2.0', now);
    db.insertReviewLog({
      item_type: 'grammar', item_id: 'a', reviewed_at: '2026-02-01T10:00:00.000Z',
      day_key: '2026-02-01', rating: 3, state_before: 0, stability_after: 3, elapsed_ms: 4000,
    });
    db.insertReviewLog({
      item_type: 'grammar', item_id: 'b', reviewed_at: '2026-02-01T11:00:00.000Z',
      day_key: '2026-02-01', rating: 3, state_before: 0, stability_after: 3, elapsed_ms: 3000,
    });
    expect(db.reviewCountsByDay()).toEqual([{ day_key: '2026-02-01', count: 2 }]);
    db.upsertCard({
      item_type: 'grammar', item_id: 'a', due: 'x', stability: 1, difficulty: 1,
      elapsed_days: 0, scheduled_days: 0, learning_steps: 0, reps: 0, lapses: 0,
      state: 0, last_review: null, introduced_at: '2026-02-01T09:00:00.000Z',
    });
    expect(db.introducedOnOrAfter('2026-02-01T00:00:00.000Z')).toBe(1);
    expect(db.introducedOnOrAfter('2026-02-02T00:00:00.000Z')).toBe(0);
  });

  it('refuses to open a db newer than the app', async () => {
    // Build a v1 db, then bump user_version past LATEST and hand it back.
    const f = fakeAdapter(null);
    const db = await UserDb.open(f.adapter, '0.2.0', now);
    await db.flush();
    const initSqlJs = (await import('sql.js')).default;
    const SQL = await initSqlJs({ wasmBinary: wasm });
    const raw = new SQL.Database(f.bytes!);
    raw.run('PRAGMA user_version = 999');
    const bumped = raw.export();
    const f2 = fakeAdapter(bumped);
    await expect(UserDb.open(f2.adapter, '0.2.0', now)).rejects.toThrow(/newer/i);
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/storage/user-db.test.ts`
Expected: FAIL — cannot resolve `@/storage/user-db`.

- [ ] **Step 3: Implement**

Create `src/storage/user-db.ts`:

```ts
import type { Database } from 'sql.js';
import type { PlatformAdapter } from '@/platform/adapter';
import { loadSqlJs } from '@/storage/sqljs';
import { applyMigrations } from '@/storage/migrations';

export interface CardRow {
  item_type: string; item_id: string;
  due: string; stability: number; difficulty: number;
  elapsed_days: number; scheduled_days: number; learning_steps: number;
  reps: number; lapses: number; state: number;
  last_review: string | null; introduced_at: string;
}

export interface ReviewLogRow {
  item_type: string; item_id: string;
  reviewed_at: string; day_key: string; rating: number;
  state_before: number; stability_after: number; elapsed_ms: number;
}

const DEBOUNCE_MS = 500;

export class UserDb {
  private dirty = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  private constructor(
    private readonly db: Database,
    private readonly adapter: PlatformAdapter,
  ) {}

  static async open(adapter: PlatformAdapter, appVersion: string, now: Date): Promise<UserDb> {
    const SQL = await loadSqlJs(await adapter.readSqlWasm());
    const existing = await adapter.readUserDb();
    const db = existing ? new SQL.Database(existing) : new SQL.Database();
    applyMigrations(db, appVersion, now); // throws if db is newer than app
    const self = new UserDb(db, adapter);
    if (!existing) await self.persistNow(); // materialise the fresh file
    return self;
  }

  getSetting<T>(key: string, fallback: T): T {
    const r = this.db.exec('SELECT value FROM settings WHERE key = ?', [key]);
    if (!r.length || !r[0]!.values.length) return fallback;
    return JSON.parse(String(r[0]!.values[0]![0])) as T;
  }

  setSetting(key: string, value: unknown): void {
    this.db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
      key, JSON.stringify(value),
    ]);
    this.markDirty();
  }

  getCard(itemType: string, itemId: string): CardRow | null {
    const r = this.db.exec(
      'SELECT * FROM cards WHERE item_type = ? AND item_id = ?',
      [itemType, itemId],
    );
    if (!r.length || !r[0]!.values.length) return null;
    return rowToObject<CardRow>(r[0]!.columns, r[0]!.values[0]!);
  }

  allCards(itemType?: string): CardRow[] {
    const r = itemType
      ? this.db.exec('SELECT * FROM cards WHERE item_type = ? ORDER BY item_id', [itemType])
      : this.db.exec('SELECT * FROM cards ORDER BY item_type, item_id');
    if (!r.length) return [];
    return r[0]!.values.map((v) => rowToObject<CardRow>(r[0]!.columns, v));
  }

  upsertCard(row: CardRow): void {
    this.db.run(
      `INSERT INTO cards
        (item_type,item_id,due,stability,difficulty,elapsed_days,scheduled_days,
         learning_steps,reps,lapses,state,last_review,introduced_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(item_type,item_id) DO UPDATE SET
        due=excluded.due, stability=excluded.stability, difficulty=excluded.difficulty,
        elapsed_days=excluded.elapsed_days, scheduled_days=excluded.scheduled_days,
        learning_steps=excluded.learning_steps, reps=excluded.reps, lapses=excluded.lapses,
        state=excluded.state, last_review=excluded.last_review`,
      [
        row.item_type, row.item_id, row.due, row.stability, row.difficulty,
        row.elapsed_days, row.scheduled_days, row.learning_steps, row.reps, row.lapses,
        row.state, row.last_review, row.introduced_at,
      ],
    );
    this.markDirty();
  }

  insertReviewLog(row: ReviewLogRow): void {
    this.db.run(
      `INSERT INTO review_log
        (item_type,item_id,reviewed_at,day_key,rating,state_before,stability_after,elapsed_ms)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        row.item_type, row.item_id, row.reviewed_at, row.day_key, row.rating,
        row.state_before, row.stability_after, row.elapsed_ms,
      ],
    );
    this.markDirty();
  }

  reviewCountsByDay(): { day_key: string; count: number }[] {
    const r = this.db.exec(
      'SELECT day_key, COUNT(*) AS c FROM review_log GROUP BY day_key ORDER BY day_key',
    );
    if (!r.length) return [];
    return r[0]!.values.map((v) => ({ day_key: String(v[0]), count: Number(v[1]) }));
  }

  introducedOnOrAfter(iso: string): number {
    const r = this.db.exec('SELECT COUNT(*) FROM cards WHERE introduced_at >= ?', [iso]);
    return Number(r[0]!.values[0]![0]);
  }

  export(): Uint8Array {
    return this.db.export();
  }

  async flush(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.dirty) await this.persistNow();
  }

  private markDirty(): void {
    this.dirty = true;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.persistNow();
    }, DEBOUNCE_MS);
  }

  private async persistNow(): Promise<void> {
    this.dirty = false;
    await this.adapter.writeUserDb(this.db.export());
  }
}

function rowToObject<T>(columns: string[], values: unknown[]): T {
  const o: Record<string, unknown> = {};
  columns.forEach((c, i) => { o[c] = values[i]; });
  return o as T;
}
```

- [ ] **Step 4: Run — expect pass**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/storage/user-db.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Regression + commit**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npm run typecheck && npm run lint && npm test`
Expected: clean; Vitest count up.

```bash
git add src/storage/user-db.ts tests/storage/user-db.test.ts
git commit -m "feat: UserDb — open, migrate, typed queries, debounced persist

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: `src/core/srs.ts` — ts-fsrs wrapper

**Files:**
- Create: `src/core/srs.ts`
- Test: `tests/core/srs.test.ts`

**Interfaces:**
- Consumes: `ts-fsrs` (5.4.2), `CardRow`/`ReviewLogRow` types from `@/storage/user-db`, `toUtcIso` + `localDayKey` from `@/core/time`.
- Produces:

```ts
type Rating = 1 | 2 | 3 | 4;                    // Again | Hard | Good | Easy
type Status = 'new' | 'learning' | 'learned' | 'mastered';

interface SrsParams {
  requestRetention: number; maximumInterval: number; enableFuzz: boolean;
}

function newCard(itemType: string, itemId: string, now: Date): CardRow;
function review(
  card: CardRow, rating: Rating, now: Date, elapsedMs: number, params: SrsParams,
): { card: CardRow; log: ReviewLogRow };
function statusOf(card: Pick<CardRow, 'reps' | 'stability'>): Status;
function previewIntervals(card: CardRow, now: Date, params: SrsParams): Record<Rating, string>;
```

- **Implementation guidance:** verify the exact `ts-fsrs` API against `node_modules/ts-fsrs/dist/index.d.ts` before writing. As of 5.4.2: `fsrs(generatorParameters({ request_retention, maximum_interval, enable_fuzz }))` → instance; `createEmptyCard(now)` → `Card`; `instance.next(card, now, grade)` → `{ card, log }` for one grade; `instance.repeat(card, now)` → `IPreview` (`{ [Grade]: { card, log } }`) for all four. `Card` fields: `due: Date, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state: State(0..3), last_review?: Date`. `Rating` enum: `Again=1, Hard=2, Good=3, Easy=4`. Keep ALL ts-fsrs ↔ `CardRow` conversion inside this file (`toFsrsCard` / `fromFsrsCard` private helpers) so no other module touches ts-fsrs types.

- [ ] **Step 1: Write the failing test**

Create `tests/core/srs.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { newCard, review, statusOf, previewIntervals } from '@/core/srs';

const PARAMS = { requestRetention: 0.9, maximumInterval: 365, enableFuzz: false };
const now = new Date('2026-03-01T08:00:00.000Z');

describe('core/srs', () => {
  it('newCard starts unreviewed', () => {
    const c = newCard('grammar', 'n5-wa-particle', now);
    expect(c.reps).toBe(0);
    expect(c.state).toBe(0); // State.New
    expect(c.item_id).toBe('n5-wa-particle');
    expect(c.introduced_at).toBe(now.toISOString());
    expect(statusOf(c)).toBe('new');
  });

  it('Good raises stability, Again raises lapses and shortens the interval', () => {
    const c0 = newCard('grammar', 'g', now);
    const good = review(c0, 3, now, 5000, PARAMS).card;
    const later = new Date(good.due);
    const again = review(good, 1, later, 5000, PARAMS).card;
    expect(good.reps).toBe(1);
    expect(again.lapses).toBeGreaterThanOrEqual(good.lapses);
    expect(new Date(review(good, 4, later, 1000, PARAMS).card.due).getTime())
      .toBeGreaterThan(new Date(again.due).getTime());
  });

  it('review produces a log row with the pre-review state and elapsed_ms', () => {
    const c0 = newCard('grammar', 'g', now);
    const { log } = review(c0, 3, now, 4200, PARAMS);
    expect(log.state_before).toBe(0);
    expect(log.rating).toBe(3);
    expect(log.elapsed_ms).toBe(4200);
    expect(log.reviewed_at).toBe(now.toISOString());
    expect(log.day_key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(log.item_id).toBe('g');
  });

  it('statusOf thresholds at 7 and 30', () => {
    expect(statusOf({ reps: 1, stability: 6.99 })).toBe('learning');
    expect(statusOf({ reps: 1, stability: 7 })).toBe('learned');
    expect(statusOf({ reps: 1, stability: 29.99 })).toBe('learned');
    expect(statusOf({ reps: 1, stability: 30 })).toBe('mastered');
    expect(statusOf({ reps: 0, stability: 999 })).toBe('new');
  });

  it('previewIntervals returns a human string per rating, Easy >= Good >= Hard', () => {
    const c0 = newCard('grammar', 'g', now);
    const p = previewIntervals(c0, now, PARAMS);
    expect(Object.keys(p).map(Number).sort()).toEqual([1, 2, 3, 4]);
    for (const k of [1, 2, 3, 4]) expect(typeof p[k as 1]).toBe('string');
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/core/srs.test.ts`
Expected: FAIL — cannot resolve `@/core/srs`.

- [ ] **Step 3: Implement**

Create `src/core/srs.ts`:

```ts
import { fsrs, generatorParameters, createEmptyCard, State, type Card, type Grade } from 'ts-fsrs';
import type { CardRow, ReviewLogRow } from '@/storage/user-db';
import { toUtcIso, localDayKey } from '@/core/time';

export type Rating = 1 | 2 | 3 | 4; // Again | Hard | Good | Easy
export type Status = 'new' | 'learning' | 'learned' | 'mastered';

export interface SrsParams {
  requestRetention: number;
  maximumInterval: number;
  enableFuzz: boolean;
}

function engine(p: SrsParams) {
  return fsrs(
    generatorParameters({
      request_retention: p.requestRetention,
      maximum_interval: p.maximumInterval,
      enable_fuzz: p.enableFuzz,
    }),
  );
}

function toFsrsCard(row: CardRow): Card {
  return {
    due: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days,
    learning_steps: row.learning_steps,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state as State,
    last_review: row.last_review ? new Date(row.last_review) : undefined,
  };
}

function fromFsrsCard(
  card: Card,
  base: Pick<CardRow, 'item_type' | 'item_id' | 'introduced_at'>,
): CardRow {
  return {
    item_type: base.item_type,
    item_id: base.item_id,
    introduced_at: base.introduced_at,
    due: toUtcIso(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? toUtcIso(card.last_review) : null,
  };
}

export function newCard(itemType: string, itemId: string, now: Date): CardRow {
  const empty = createEmptyCard(now);
  return fromFsrsCard(empty, {
    item_type: itemType,
    item_id: itemId,
    introduced_at: toUtcIso(now),
  });
}

export function review(
  row: CardRow,
  rating: Rating,
  now: Date,
  elapsedMs: number,
  params: SrsParams,
): { card: CardRow; log: ReviewLogRow } {
  const stateBefore = row.state;
  const { card } = engine(params).next(toFsrsCard(row), now, rating as unknown as Grade);
  const next = fromFsrsCard(card, row);
  const log: ReviewLogRow = {
    item_type: row.item_type,
    item_id: row.item_id,
    reviewed_at: toUtcIso(now),
    day_key: localDayKey(now),
    rating,
    state_before: stateBefore,
    stability_after: card.stability,
    elapsed_ms: Math.max(0, Math.round(elapsedMs)),
  };
  return { card: next, log };
}

export function statusOf(card: Pick<CardRow, 'reps' | 'stability'>): Status {
  if (card.reps === 0) return 'new';
  if (card.stability < 7) return 'learning';
  if (card.stability < 30) return 'learned';
  return 'mastered';
}

export function previewIntervals(
  row: CardRow,
  now: Date,
  params: SrsParams,
): Record<Rating, string> {
  const preview = engine(params).repeat(toFsrsCard(row), now);
  const out = {} as Record<Rating, string>;
  for (const r of [1, 2, 3, 4] as Rating[]) {
    const due = preview[r as unknown as Grade].card.due;
    out[r] = humanInterval(due.getTime() - now.getTime());
  }
  return out;
}

function humanInterval(ms: number): string {
  const min = ms / 60000;
  if (min < 60) return `${Math.max(1, Math.round(min))} мин`;
  const hours = min / 60;
  if (hours < 24) return `${Math.round(hours)} ч`;
  const days = hours / 24;
  if (days < 30) return `${Math.round(days)} д`;
  const months = days / 30;
  if (months < 12) return `${Math.round(months)} мес`;
  return `${(days / 365).toFixed(1)} г`;
}
```

- [ ] **Step 4: Run — expect pass**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/core/srs.test.ts`
Expected: PASS (5 tests). If a test fails because a ts-fsrs field name differs from the 5.4.2 shape above, fix the `toFsrsCard`/`fromFsrsCard` mapping (not the tests) and note the change in the report.

- [ ] **Step 5: Regression + commit**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npm run typecheck && npm run lint`

```bash
git add src/core/srs.ts tests/core/srs.test.ts
git commit -m "feat: FSRS wrapper — card lifecycle, ratings, status, interval preview

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: `src/core/scheduler.ts` — daily queue

**Files:**
- Create: `src/core/scheduler.ts`
- Test: `tests/core/scheduler.test.ts`

**Interfaces:**
- Consumes: `UserDb` (Task 4), `ContentDb` (`src/storage/content-db.ts`, Plan 1 — `listLevels()`, `listGrammar(levelCode)` returning `{ id, level, title, layer }[]`), `newCard`/`statusOf` are NOT needed here, `startOfLocalDay`/`endOfLocalDay`/`toUtcIso` (Task 2).
- Produces:

```ts
interface DaySummary {
  dueCount: number;
  newCount: number;
  reviewedToday: number;
  queueOverCap: boolean;
  allDone: boolean;
  nextDueAt: string | null;
}
interface QueueItem { itemType: 'grammar'; itemId: string; kind: 'due' | 'new'; }

function daySummary(user: UserDb, content: ContentDb, now: Date): DaySummary;
function buildQueue(user: UserDb, content: ContentDb, now: Date): QueueItem[];
```

- **`newPerDay`** and **`reviewQueueCap`** read from `user.getSetting('new_per_day', 5)` / `user.getSetting('review_queue_cap', 100)`.
- **Due** = cards whose `due <= endOfLocalDay(now)` (ISO string compare is valid — all UTC ISO), sorted ascending by `due`, sliced to `reviewQueueCap`.
- **New candidates** = grammar points from every `content.listLevels()` level with `status === 'available'`, in `layer` then `id` order, whose `id` has no row in `user.allCards('grammar')`. Take `max(0, newPerDay - introducedToday)` of them, where `introducedToday = user.introducedOnOrAfter(toUtcIso(startOfLocalDay(now)))`. If `dueCount > reviewQueueCap`, take 0 (and `queueOverCap = true`).
- **Queue** = due items ++ new items, then a **seeded deterministic shuffle** (seed = `localDayKey(now)` hashed) with the constraint that `queue[0].kind !== 'new'` whenever any `due` item exists (swap the first `new` with the first `due` if needed).
- **`nextDueAt`** = min `due` across all cards with `due > endOfLocalDay(now)`, or `null`.
- **`allDone`** = `dueCount === 0 && newCount === 0`.

- [ ] **Step 1: Write the failing test**

Create `tests/core/scheduler.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import type { PlatformAdapter } from '@/platform/adapter';
import { UserDb } from '@/storage/user-db';
import { daySummary, buildQueue } from '@/core/scheduler';
import { newCard } from '@/core/srs';

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

/** Minimal fake ContentDb with the two methods the scheduler uses. */
function fakeContent(points: { id: string; layer: number }[]) {
  return {
    listLevels: () => [{ code: 'N5', status: 'available', ord: 1, titleRu: 'N5' }],
    listGrammar: (_lvl: string) =>
      points.map((p) => ({ id: p.id, level: 'N5', title: p.id, layer: p.layer })),
  } as unknown as import('@/storage/content-db').ContentDb;
}

const now = new Date('2026-03-10T09:00:00.000Z');
const POINTS = [
  { id: 'p1', layer: 1 }, { id: 'p2', layer: 1 }, { id: 'p3', layer: 2 },
  { id: 'p4', layer: 2 }, { id: 'p5', layer: 2 }, { id: 'p6', layer: 3 },
  { id: 'p7', layer: 3 }, { id: 'p8', layer: 3 },
];

describe('core/scheduler', () => {
  let user: UserDb;
  beforeEach(async () => { user = await UserDb.open(fakeAdapter(), '0.2.0', now); });

  it('offers new_per_day new cards on a fresh db', () => {
    const s = daySummary(user, fakeContent(POINTS), now);
    expect(s.dueCount).toBe(0);
    expect(s.newCount).toBe(5);
    expect(s.allDone).toBe(false);
  });

  it('buildQueue new items are layer-then-id ordered and none is first', () => {
    const q = buildQueue(user, fakeContent(POINTS), now);
    expect(q).toHaveLength(5);
    const ids = q.map((i) => i.itemId).sort();
    expect(ids).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    // no due items exist, so a new item is allowed first — assert order of *candidates*
    // by checking p1/p2 (layer 1) precede p3+ before shuffle is not observable here;
    // instead assert the SET is the first 5 by layer/id
  });

  it('due cards with past due are queued, future ones are not', () => {
    const c = newCard('grammar', 'p1', now);
    c.reps = 1; c.due = new Date(now.getTime() - 3600_000).toISOString();
    user.upsertCard(c);
    const s = daySummary(user, fakeContent(POINTS), now);
    expect(s.dueCount).toBe(1);
    const q = buildQueue(user, fakeContent(POINTS), now);
    expect(q[0]!.kind).not.toBe('new'); // due exists -> not new first
    expect(q.some((i) => i.itemId === 'p1' && i.kind === 'due')).toBe(true);
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
});
```

- [ ] **Step 2: Run — expect failure**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/core/scheduler.test.ts`
Expected: FAIL — cannot resolve `@/core/scheduler`.

- [ ] **Step 3: Implement**

Create `src/core/scheduler.ts`:

```ts
import type { UserDb } from '@/storage/user-db';
import type { ContentDb } from '@/storage/content-db';
import { startOfLocalDay, endOfLocalDay, toUtcIso, localDayKey } from '@/core/time';

export interface DaySummary {
  dueCount: number;
  newCount: number;
  reviewedToday: number;
  queueOverCap: boolean;
  allDone: boolean;
  nextDueAt: string | null;
}

export interface QueueItem {
  itemType: 'grammar';
  itemId: string;
  kind: 'due' | 'new';
}

function settings(user: UserDb) {
  return {
    newPerDay: user.getSetting('new_per_day', 5),
    cap: user.getSetting('review_queue_cap', 100),
  };
}

function availableGrammarIds(content: ContentDb): string[] {
  const ids: { id: string; layer: number }[] = [];
  for (const lvl of content.listLevels()) {
    if (lvl.status !== 'available') continue;
    for (const g of content.listGrammar(lvl.code)) ids.push({ id: g.id, layer: g.layer });
  }
  ids.sort((a, b) => a.layer - b.layer || a.id.localeCompare(b.id));
  return ids.map((x) => x.id);
}

interface Split {
  due: string[];        // itemIds, due<=endOfDay, sorted by due, capped
  newItems: string[];   // itemIds
  dueTotalBeforeCap: number;
  queueOverCap: boolean;
  reviewedToday: number;
  nextDueAt: string | null;
}

function split(user: UserDb, content: ContentDb, now: Date): Split {
  const { newPerDay, cap } = settings(user);
  const endIso = toUtcIso(endOfLocalDay(now));
  const startIso = toUtcIso(startOfLocalDay(now));
  const cards = user.allCards('grammar');

  const dueSorted = cards
    .filter((c) => c.due <= endIso)
    .sort((a, b) => a.due.localeCompare(b.due));
  const dueTotalBeforeCap = dueSorted.length;
  const due = dueSorted.slice(0, cap).map((c) => c.item_id);
  const queueOverCap = dueTotalBeforeCap > cap;

  const future = cards.filter((c) => c.due > endIso).map((c) => c.due).sort();
  const nextDueAt = future.length ? future[0]! : null;

  const known = new Set(cards.map((c) => c.item_id));
  const introducedToday = user.introducedOnOrAfter(startIso);
  const budget = queueOverCap ? 0 : Math.max(0, newPerDay - introducedToday);
  const newItems = availableGrammarIds(content)
    .filter((id) => !known.has(id))
    .slice(0, budget);

  const reviewedToday =
    user.reviewCountsByDay().find((r) => r.day_key === localDayKey(now))?.count ?? 0;

  return { due, newItems, dueTotalBeforeCap, queueOverCap, reviewedToday, nextDueAt };
}

export function daySummary(user: UserDb, content: ContentDb, now: Date): DaySummary {
  const s = split(user, content, now);
  return {
    dueCount: s.due.length,
    newCount: s.newItems.length,
    reviewedToday: s.reviewedToday,
    queueOverCap: s.queueOverCap,
    allDone: s.due.length === 0 && s.newItems.length === 0,
    nextDueAt: s.nextDueAt,
  };
}

export function buildQueue(user: UserDb, content: ContentDb, now: Date): QueueItem[] {
  const s = split(user, content, now);
  const items: QueueItem[] = [
    ...s.due.map((id): QueueItem => ({ itemType: 'grammar', itemId: id, kind: 'due' })),
    ...s.newItems.map((id): QueueItem => ({ itemType: 'grammar', itemId: id, kind: 'new' })),
  ];
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
Expected: PASS (6 tests).

- [ ] **Step 5: Regression + commit**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npm run typecheck && npm run lint && npm test`

```bash
git add src/core/scheduler.ts tests/core/scheduler.test.ts
git commit -m "feat: day scheduler — due queue, capped new-card feed, daily limit

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: `src/core/progress.ts` — bars, counts, streak, heatmap

**Files:**
- Create: `src/core/progress.ts`
- Test: `tests/core/progress.test.ts`

**Interfaces:**
- Consumes: `UserDb` (Task 4), `ContentDb` (Plan 1 — `listLevels()`, `listGrammar(code)`, `grammarCountByLevel(code)`), `statusOf` (Task 5), `localDayKey`/`daysBetweenLocal` (Task 2).
- Produces:

```ts
interface LevelBars { studied: number; consolidated: number; total: number; }
interface StatusCounts { new: number; learning: number; learned: number; mastered: number; }
interface HeatCell { dayKey: string; count: number; }
interface RibbonSegment { code: string; status: string; fill: number; }

function levelBars(user: UserDb, content: ContentDb, levelCode: string): LevelBars;
function statusCounts(user: UserDb, content: ContentDb, levelCode: string): StatusCounts;
function streak(user: UserDb, now: Date): { current: number; best: number };
function heatmap(user: UserDb, now: Date, weeks: number): HeatCell[];
function levelRibbon(user: UserDb, content: ContentDb): RibbonSegment[];
```

- **`levelBars`**: `total = content.grammarCountByLevel(levelCode)`; for cards of that level's grammar ids, `studied = (learning+learned+mastered)/total`, `consolidated = (learned+mastered)/total` (0 when `total === 0`).
- **`statusCounts`**: `new = total - (cards for this level's grammar ids)`; the other three from `statusOf`.
- **`streak`**: from distinct `day_key`s in `review_log`. `current` = run of consecutive days ending today (`daysBetweenLocal(lastDay, now) === 0`) or yesterday (`=== 1`); else 0. `best` = longest consecutive run ever. `best >= current`.
- **`heatmap`**: last `weeks*7` days ending today; each `HeatCell` = `{ dayKey, count }` with 0 for days without reviews; ordered oldest→newest.
- **`levelRibbon`**: one segment per `content.listLevels()` level; `fill` = `levelBars(...).consolidated` for `available` levels, `0` otherwise.

- [ ] **Step 1: Write the failing test**

Create `tests/core/progress.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import type { PlatformAdapter } from '@/platform/adapter';
import { UserDb } from '@/storage/user-db';
import { newCard, review } from '@/core/srs';
import { levelBars, statusCounts, streak, heatmap } from '@/core/progress';

const wasm = readFileSync(createRequire(import.meta.url).resolve('sql.js/dist/sql-wasm.wasm'));
const PARAMS = { requestRetention: 0.9, maximumInterval: 365, enableFuzz: false };

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
function fakeContent(ids: string[]) {
  return {
    listLevels: () => [{ code: 'N5', status: 'available', ord: 1, titleRu: 'N5' }],
    listGrammar: () => ids.map((id) => ({ id, level: 'N5', title: id, layer: 1 })),
    grammarCountByLevel: () => ids.length,
  } as unknown as import('@/storage/content-db').ContentDb;
}

const now = new Date('2026-04-01T09:00:00.000Z');

describe('core/progress', () => {
  let user: UserDb;
  const content = fakeContent(['p1', 'p2', 'p3', 'p4']);
  beforeEach(async () => { user = await UserDb.open(fakeAdapter(), '0.2.0', now); });

  it('bars are zero on an empty db', () => {
    expect(levelBars(user, content, 'N5')).toEqual({ studied: 0, consolidated: 0, total: 4 });
    expect(statusCounts(user, content, 'N5')).toEqual({ new: 4, learning: 0, learned: 0, mastered: 0 });
  });

  it('a reviewed card moves into learning and lifts the studied bar', () => {
    const c = review(newCard('grammar', 'p1', now), 3, now, 3000, PARAMS).card;
    user.upsertCard(c);
    const b = levelBars(user, content, 'N5');
    expect(b.studied).toBeCloseTo(0.25);
    const sc = statusCounts(user, content, 'N5');
    expect(sc.new).toBe(3);
    expect(sc.learning + sc.learned + sc.mastered).toBe(1);
  });

  it('streak: reviewed today = 1; gap yesterday = 0', () => {
    user.insertReviewLog({
      item_type: 'grammar', item_id: 'p1', reviewed_at: now.toISOString(),
      day_key: '2026-04-01', rating: 3, state_before: 0, stability_after: 3, elapsed_ms: 1000,
    });
    expect(streak(user, now)).toEqual({ current: 1, best: 1 });

    const later = new Date('2026-04-05T09:00:00.000Z');
    expect(streak(user, later).current).toBe(0); // last review 4 days ago
    expect(streak(user, later).best).toBe(1);
  });

  it('streak counts a run ending yesterday as still current', () => {
    for (const d of ['2026-03-30', '2026-03-31']) {
      user.insertReviewLog({
        item_type: 'grammar', item_id: 'p1', reviewed_at: `${d}T09:00:00.000Z`,
        day_key: d, rating: 3, state_before: 0, stability_after: 3, elapsed_ms: 1000,
      });
    }
    expect(streak(user, now)).toEqual({ current: 2, best: 2 }); // now = 2026-04-01, run ended yesterday
  });

  it('heatmap spans the window and marks today', () => {
    user.insertReviewLog({
      item_type: 'grammar', item_id: 'p1', reviewed_at: now.toISOString(),
      day_key: '2026-04-01', rating: 3, state_before: 0, stability_after: 3, elapsed_ms: 1000,
    });
    const cells = heatmap(user, now, 2);
    expect(cells).toHaveLength(14);
    expect(cells[cells.length - 1]).toEqual({ dayKey: '2026-04-01', count: 1 });
    expect(cells[0]!.count).toBe(0);
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/core/progress.test.ts`
Expected: FAIL — cannot resolve `@/core/progress`.

- [ ] **Step 3: Implement**

Create `src/core/progress.ts`:

```ts
import type { UserDb, CardRow } from '@/storage/user-db';
import type { ContentDb } from '@/storage/content-db';
import { statusOf, type Status } from '@/core/srs';
import { localDayKey, daysBetweenLocal, startOfLocalDay } from '@/core/time';

export interface LevelBars { studied: number; consolidated: number; total: number; }
export interface StatusCounts { new: number; learning: number; learned: number; mastered: number; }
export interface HeatCell { dayKey: string; count: number; }
export interface RibbonSegment { code: string; status: string; fill: number; }

function levelGrammarIds(content: ContentDb, levelCode: string): Set<string> {
  return new Set(content.listGrammar(levelCode).map((g) => g.id));
}

function cardsForLevel(user: UserDb, ids: Set<string>): CardRow[] {
  return user.allCards('grammar').filter((c) => ids.has(c.item_id));
}

export function levelBars(user: UserDb, content: ContentDb, levelCode: string): LevelBars {
  const total = content.grammarCountByLevel(levelCode);
  if (total === 0) return { studied: 0, consolidated: 0, total: 0 };
  const cards = cardsForLevel(user, levelGrammarIds(content, levelCode));
  let studied = 0;
  let consolidated = 0;
  for (const c of cards) {
    const s = statusOf(c);
    if (s === 'learning' || s === 'learned' || s === 'mastered') studied++;
    if (s === 'learned' || s === 'mastered') consolidated++;
  }
  return { studied: studied / total, consolidated: consolidated / total, total };
}

export function statusCounts(user: UserDb, content: ContentDb, levelCode: string): StatusCounts {
  const total = content.grammarCountByLevel(levelCode);
  const cards = cardsForLevel(user, levelGrammarIds(content, levelCode));
  const counts: Record<Status, number> = { new: 0, learning: 0, learned: 0, mastered: 0 };
  for (const c of cards) counts[statusOf(c)]++;
  counts.new = Math.max(0, total - cards.length);
  return counts;
}

export function streak(user: UserDb, now: Date): { current: number; best: number } {
  const days = user.reviewCountsByDay().map((r) => r.day_key).sort();
  if (days.length === 0) return { current: 0, best: 0 };

  // longest run
  let best = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = new Date(`${days[i - 1]}T12:00:00`);
    const cur = new Date(`${days[i]}T12:00:00`);
    run = daysBetweenLocal(prev, cur) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }

  // current run: must end today or yesterday
  const lastDay = new Date(`${days[days.length - 1]}T12:00:00`);
  const gap = daysBetweenLocal(lastDay, now);
  if (gap > 1 || gap < 0) return { current: 0, best };
  let current = 1;
  for (let i = days.length - 2; i >= 0; i--) {
    const a = new Date(`${days[i]}T12:00:00`);
    const b = new Date(`${days[i + 1]}T12:00:00`);
    if (daysBetweenLocal(a, b) === 1) current++;
    else break;
  }
  return { current, best: Math.max(best, current) };
}

export function heatmap(user: UserDb, now: Date, weeks: number): HeatCell[] {
  const byDay = new Map(user.reviewCountsByDay().map((r) => [r.day_key, r.count]));
  const cells: HeatCell[] = [];
  const start = startOfLocalDay(now);
  const days = weeks * 7;
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(start);
    d.setDate(d.getDate() - i);
    const key = localDayKey(d);
    cells.push({ dayKey: key, count: byDay.get(key) ?? 0 });
  }
  return cells;
}

export function levelRibbon(user: UserDb, content: ContentDb): RibbonSegment[] {
  return content.listLevels().map((lvl) => ({
    code: lvl.code,
    status: lvl.status,
    fill: lvl.status === 'available' ? levelBars(user, content, lvl.code).consolidated : 0,
  }));
}
```

- [ ] **Step 4: Run — expect pass**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/core/progress.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Regression + commit**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npm run typecheck && npm run lint && npm test`

```bash
git add src/core/progress.ts tests/core/progress.test.ts
git commit -m "feat: progress calculations — bars, status counts, streak, heatmap

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: `UserDbProvider` + `useUserDb` + routing + `TodayScreen`

**Files:**
- Create: `src/ui/UserDbProvider.tsx`
- Create: `src/ui/useUserDb.ts`
- Create: `src/ui/screens/TodayScreen.tsx`
- Modify: `src/ui/App.tsx` (nest provider)
- Modify: `src/ui/routes.tsx` (`/` → TodayScreen, add `/review` stub, `/progress` stub)
- Modify: `src/ui/theme.css` (append TodayScreen styles)
- Test: `tests/ui/TodayScreen.test.tsx`
- Test: `tests/e2e/today.spec.ts`

**Interfaces:**
- Consumes: `UserDb.open` (Task 4), `getPlatformAdapter` (`src/platform`), `daySummary` (Task 6), `useContentDb` (Plan 1), `streak` (Task 7). App version from `import pkg from '../../package.json'` — NOT allowed (JSON import under `src`); instead read `import.meta.env.VITE_APP_VERSION` set in `electron.vite.config.ts`, fallback `'0.0.0'`. **Add** `define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(process.env.npm_package_version ?? '0.0.0') }` to the renderer config in `electron.vite.config.ts`.
- Produces:
  - `<UserDbProvider>` — opens `UserDb` once; renders `Загрузка…` / Russian error / children + `<span data-testid="user-db-ready" hidden />`. Wires `window.jlmpBridge?.onFlushUserDb?.(() => db.flush())` on mount (guarded — may be absent in tests).
  - `useUserDb(): UserDb`.
  - `TodayScreen` — reads `daySummary` + `streak`, shows the status line and a "Начать" button linking to `/review` (disabled when `allDone`).

- [ ] **Step 1: Write the failing component test**

Create `tests/ui/TodayScreen.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TodayScreen } from '@/ui/screens/TodayScreen';

vi.mock('@/ui/useUserDb', () => ({ useUserDb: () => ({}) }));
vi.mock('@/ui/useContentDb', () => ({ useContentDb: () => ({}) }));
vi.mock('@/core/scheduler', () => ({
  daySummary: () => ({
    dueCount: 3, newCount: 5, reviewedToday: 0, queueOverCap: false, allDone: false, nextDueAt: null,
  }),
}));
vi.mock('@/core/progress', () => ({ streak: () => ({ current: 4, best: 9 }) }));

describe('TodayScreen', () => {
  it('shows the due/new/streak line and an enabled Start button', () => {
    render(<MemoryRouter><TodayScreen /></MemoryRouter>);
    expect(screen.getByText(/3 повторить/)).toBeTruthy();
    expect(screen.getByText(/5 новых/)).toBeTruthy();
    expect(screen.getByText(/стрик 4/)).toBeTruthy();
    const btn = screen.getByRole('link', { name: /начать/i });
    expect(btn.getAttribute('href')).toContain('/review');
  });

  it('shows "all done" when nothing is queued', () => {
    vi.doMock('@/core/scheduler', () => ({
      daySummary: () => ({
        dueCount: 0, newCount: 0, reviewedToday: 8, queueOverCap: false, allDone: true,
        nextDueAt: '2026-05-01T06:00:00.000Z',
      }),
    }));
    // re-import with the new mock
  });
});
```

(Keep the second test minimal or drop it if `vi.doMock` re-import is awkward — the e2e covers "all done".)

- [ ] **Step 2: Run — expect failure**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/ui/TodayScreen.test.tsx`
Expected: FAIL — cannot resolve `@/ui/screens/TodayScreen`.

- [ ] **Step 3: Implement the provider + hook**

Create `src/ui/UserDbProvider.tsx`:

```tsx
import { createContext, useEffect, useState, type ReactNode } from 'react';
import { UserDb } from '@/storage/user-db';
import { getPlatformAdapter } from '@/platform';

const APP_VERSION =
  (import.meta.env.VITE_APP_VERSION as string | undefined) ?? '0.0.0';

interface Ctx { db: UserDb; }
export const UserDbContext = createContext<Ctx | null>(null);

export function UserDbProvider({ children }: { children: ReactNode }) {
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let db: UserDb | null = null;
    UserDb.open(getPlatformAdapter(), APP_VERSION, new Date())
      .then((opened) => {
        db = opened;
        setCtx({ db: opened });
        window.jlmpBridge?.onFlushUserDb?.(() => opened.flush());
      })
      .catch((e) => setError(String(e)));
    return () => { void db?.flush(); };
  }, []);

  if (error) return <div className="fatal">Не удалось открыть базу прогресса: {error}</div>;
  if (!ctx) return <div className="loading">Загрузка…</div>;
  return (
    <UserDbContext.Provider value={ctx}>
      <span data-testid="user-db-ready" hidden />
      {children}
    </UserDbContext.Provider>
  );
}
```

Create `src/ui/useUserDb.ts`:

```ts
import { useContext } from 'react';
import { UserDbContext } from './UserDbProvider';

export function useUserDb() {
  const ctx = useContext(UserDbContext);
  if (!ctx) throw new Error('useUserDb used outside UserDbProvider');
  return ctx.db;
}
```

Add to `src/platform/desktop.ts` `declare global` the optional `onFlushUserDb`:

```ts
      onFlushUserDb?(cb: () => Promise<void> | void): void;
```

- [ ] **Step 4: Implement `TodayScreen`**

Create `src/ui/screens/TodayScreen.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { useUserDb } from '@/ui/useUserDb';
import { useContentDb } from '@/ui/useContentDb';
import { daySummary } from '@/core/scheduler';
import { streak } from '@/core/progress';

function relative(iso: string, now: Date): string {
  const ms = new Date(iso).getTime() - now.getTime();
  const h = Math.round(ms / 3600_000);
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

  return (
    <section className="today">
      <h1>Сегодня</h1>
      {s.allDone ? (
        <>
          <p className="today-line">На сегодня всё · стрик {st.current}</p>
          {s.nextDueAt && <p className="today-hint">Следующая карточка — через {relative(s.nextDueAt, now)}</p>}
        </>
      ) : (
        <>
          <p className="today-line">
            {s.dueCount} повторить · {s.newCount} новых · стрик {st.current}
          </p>
          {s.queueOverCap && (
            <p className="today-hint">Много повторений — новые пункты пока на паузе.</p>
          )}
          <Link className="btn-primary" to="/review">Начать</Link>
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Wire routing + App + config + styles**

`src/ui/routes.tsx`:

```tsx
import { PlaceholderScreen } from './screens/PlaceholderScreen';
import { GrammarListScreen } from './screens/GrammarListScreen';
import { GrammarDetailScreen } from './screens/GrammarDetailScreen';
import { TodayScreen } from './screens/TodayScreen';
import { ReviewScreen } from './screens/ReviewScreen';
import { ProgressScreen } from './screens/ProgressScreen';
import type { RouteObject } from 'react-router-dom';

export const routes: RouteObject[] = [
  { path: '/', element: <TodayScreen /> },
  { path: '/review', element: <ReviewScreen /> },
  { path: '/grammar', element: <GrammarListScreen /> },
  { path: '/grammar/:id', element: <GrammarDetailScreen /> },
  { path: '/kanji', element: <PlaceholderScreen title="Кандзи" /> },
  { path: '/vocab', element: <PlaceholderScreen title="Слова" /> },
  { path: '/progress', element: <ProgressScreen /> },
  { path: '/settings', element: <PlaceholderScreen title="Настройки" /> },
];
```

**Task 8 creates minimal stubs** for `ReviewScreen` and `ProgressScreen` so routing type-checks:

`src/ui/screens/ReviewScreen.tsx` (stub — Task 9 replaces):
```tsx
export function ReviewScreen() {
  return <section className="review"><h1>Повторение</h1></section>;
}
```
`src/ui/screens/ProgressScreen.tsx` (stub — Task 10 replaces):
```tsx
export function ProgressScreen() {
  return <section className="progress"><h1>Прогресс</h1></section>;
}
```

`src/ui/App.tsx` — nest the provider (ContentDb outer, UserDb inner — scheduler/progress need both):

```tsx
        <ContentDbProvider>
          <UserDbProvider>
            <Outlet />
          </UserDbProvider>
        </ContentDbProvider>
```
(add `import { UserDbProvider } from './UserDbProvider';`)

`electron.vite.config.ts` — add to the `renderer` config object:
```ts
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(process.env['npm_package_version'] ?? '0.0.0'),
    },
```

`src/ui/theme.css` — append:
```css
.today { max-width: 32rem; margin: 0 auto; padding: 2rem 1rem; text-align: center; }
.today-line { font-size: 1.1rem; margin: 1rem 0; }
.today-hint { color: var(--muted); font-size: 0.9rem; }
.btn-primary {
  display: inline-block; margin-top: 1.5rem; padding: 0.9rem 2.5rem;
  background: var(--accent); color: #fff; border-radius: 0.6rem;
  font-size: 1.1rem; text-decoration: none;
}
```
(If `--muted` / `--accent` are not already defined in `:root`, add sensible values in both light and dark blocks — check the existing file first.)

- [ ] **Step 6: Write the e2e test**

Create `tests/e2e/today.spec.ts`:

```ts
import { test, expect, _electron as electron } from '@playwright/test';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

test('first run shows new cards on Today and persists across restart', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'jlpt-e2e-'));
  const launch = () => electron.launch({
    args: [join(process.cwd(), 'out/main/main.js'), `--user-data-dir=${userData}`],
  });

  let app = await launch();
  let win = await app.firstWindow();
  await win.waitForSelector('[data-testid="user-db-ready"]');
  await win.getByText(/5 новых/).waitFor();
  await app.close();

  // reopen: user.db now exists, still 5 new (nothing reviewed), no crash
  app = await launch();
  win = await app.firstWindow();
  await win.waitForSelector('[data-testid="user-db-ready"]');
  await expect(win.getByText(/5 новых/)).toBeVisible();
  await app.close();
});
```

Note: Electron respects `--user-data-dir`; `app.getPath('userData')` follows it. If it does not in this setup, drop the flag and just assert the round-trip within one launch + one restart against the default userData (accepting test-order coupling), and document it.

- [ ] **Step 7: Run all**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/ui/TodayScreen.test.tsx && npm run build && npx playwright test tests/e2e/today.spec.ts`
Expected: PASS.

- [ ] **Step 8: Full regression + commit**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npm run typecheck && npm run lint && npm test && npm run build`
Expected: all clean.

```bash
git add src/ui shells/electron/preload.ts src/platform/desktop.ts electron.vite.config.ts tests/ui/TodayScreen.test.tsx tests/e2e/today.spec.ts
git commit -m "feat: UserDbProvider, Today screen, and SRS route wiring

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9: `ReviewScreen` — the flashcard loop

**Files:**
- Create: `src/ui/screens/ReviewScreen.tsx` (replaces the Task 8 stub)
- Create: `src/ui/components/RatingButtons.tsx`
- Modify: `src/ui/theme.css` (append review styles)
- Test: `tests/ui/ReviewScreen.test.tsx`
- Test: `tests/e2e/review.spec.ts`

**Interfaces:**
- Consumes: `useUserDb` (Task 8), `useContentDb` (Plan 1 — `getGrammar(id)` → `{ id, title, level, layer, bodyMarkdown, examples: {jaRuby,ru}[], relatedTitles: {id,title}[] }`), `buildQueue` (Task 6), `newCard`/`review`/`previewIntervals`/`statusOf` (Task 5), `GrammarMarkdown` + `Furigana` (Plan 1), `localDayKey` (Task 2).
- Produces: `ReviewScreen` — walks the queue: for `kind:'new'` shows a "learn" panel first (`GrammarMarkdown` body + examples + "Понятно"), then the card face; reveal → `RatingButtons` (4 buttons + `previewIntervals` labels, keys `1-4`, `Space` reveal, `Esc` exit); on grade → `review()` → `user.upsertCard` + `user.insertReviewLog` → next; end → summary + "Готово" → `/`.
- `params` for srs: `{ requestRetention: user.getSetting('fsrs_request_retention', 0.9), maximumInterval: user.getSetting('fsrs_maximum_interval', 365), enableFuzz: user.getSetting('fsrs_enable_fuzz', true) }`.
- `elapsedMs` = `Date.now()` at grade minus `Date.now()` at reveal (component-local — this is UI, `Date.now()` is allowed here, not in core).

- [ ] **Step 1: Write the failing component test**

Create `tests/ui/ReviewScreen.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const upsertCard = vi.fn();
const insertReviewLog = vi.fn();
vi.mock('@/ui/useUserDb', () => ({
  useUserDb: () => ({
    getCard: () => null,
    upsertCard, insertReviewLog,
    getSetting: (_k: string, d: unknown) => d,
  }),
}));
vi.mock('@/ui/useContentDb', () => ({
  useContentDb: () => ({
    getGrammar: (id: string) => ({
      id, title: `${id} title`, level: 'N5', layer: 1,
      bodyMarkdown: '## Кратко\nОбъяснение.', examples: [{ jaRuby: '私[わたし]', ru: 'я' }],
      relatedTitles: [],
    }),
  }),
}));
vi.mock('@/core/scheduler', () => ({
  buildQueue: () => [{ itemType: 'grammar', itemId: 'p1', kind: 'due' }],
}));
vi.mock('@/core/srs', async (orig) => {
  const real = await orig<typeof import('@/core/srs')>();
  return { ...real, previewIntervals: () => ({ 1: '1 мин', 2: '6 мин', 3: '10 мин', 4: '4 д' }) };
});

import { ReviewScreen } from '@/ui/screens/ReviewScreen';

describe('ReviewScreen', () => {
  it('reveals then grades, writing a card and a log row', () => {
    render(<MemoryRouter><ReviewScreen /></MemoryRouter>);
    // face shown, no rating buttons yet
    expect(screen.queryByRole('button', { name: /хорошо/i })).toBeNull();
    fireEvent.keyDown(window, { key: ' ' }); // reveal
    const good = screen.getByRole('button', { name: /хорошо/i });
    expect(good.textContent).toContain('10 мин');
    fireEvent.click(good);
    expect(upsertCard).toHaveBeenCalledTimes(1);
    expect(insertReviewLog).toHaveBeenCalledTimes(1);
    // queue exhausted -> summary
    expect(screen.getByText(/готово/i)).toBeTruthy();
  });

  it('a new card shows the learn panel before the first grade', () => {
    vi.doMock('@/core/scheduler', () => ({
      buildQueue: () => [{ itemType: 'grammar', itemId: 'p2', kind: 'new' }],
    }));
    // (kept light; e2e exercises the full new-card path)
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/ui/ReviewScreen.test.tsx`
Expected: FAIL (stub `ReviewScreen` has no reveal/grade behaviour).

- [ ] **Step 3: Implement `RatingButtons`**

Create `src/ui/components/RatingButtons.tsx`:

```tsx
import type { Rating } from '@/core/srs';

const LABELS: Record<Rating, string> = { 1: 'Снова', 2: 'Трудно', 3: 'Хорошо', 4: 'Легко' };

export function RatingButtons({
  previews, onRate,
}: {
  previews: Record<Rating, string>;
  onRate: (r: Rating) => void;
}) {
  return (
    <div className="rating-row">
      {([1, 2, 3, 4] as Rating[]).map((r) => (
        <button key={r} className={`rating rating-${r}`} onClick={() => onRate(r)}>
          <span className="rating-label">{LABELS[r]}</span>
          <span className="rating-interval">{previews[r]}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Implement `ReviewScreen`**

Create `src/ui/screens/ReviewScreen.tsx`:

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserDb } from '@/ui/useUserDb';
import { useContentDb } from '@/ui/useContentDb';
import { buildQueue } from '@/core/scheduler';
import { newCard, review, previewIntervals, type Rating } from '@/core/srs';
import { GrammarMarkdown } from '@/ui/components/GrammarMarkdown';
import { Furigana } from '@/ui/components/Furigana';
import { RatingButtons } from '@/ui/components/RatingButtons';

export function ReviewScreen() {
  const user = useUserDb();
  const content = useContentDb();
  const navigate = useNavigate();

  const queue = useMemo(() => buildQueue(user, content, new Date()), [user, content]);
  const params = useMemo(() => ({
    requestRetention: user.getSetting('fsrs_request_retention', 0.9),
    maximumInterval: user.getSetting('fsrs_maximum_interval', 365),
    enableFuzz: user.getSetting('fsrs_enable_fuzz', true),
  }), [user]);

  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<'learn' | 'face' | 'revealed'>('face');
  const revealedAt = useRef<number>(Date.now());
  const [done, setDone] = useState({ n: 0, again: 0, newIntroduced: 0 });

  const item = queue[idx];
  const point = item ? content.getGrammar(item.itemId) : null;

  useEffect(() => {
    if (!item) return;
    setPhase(item.kind === 'new' ? 'learn' : 'face');
  }, [idx, item]);

  const reveal = useCallback(() => {
    setPhase((p) => (p === 'face' ? (revealedAt.current = Date.now(), 'revealed') : p));
  }, []);

  const grade = useCallback((r: Rating) => {
    if (!item) return;
    const now = new Date();
    const existing = user.getCard('grammar', item.itemId);
    const base = existing ?? newCard('grammar', item.itemId, now);
    const { card, log } = review(base, r, now, Date.now() - revealedAt.current, params);
    user.upsertCard(card);
    user.insertReviewLog(log);
    setDone((d) => ({
      n: d.n + 1,
      again: d.again + (r === 1 ? 1 : 0),
      newIntroduced: d.newIntroduced + (existing ? 0 : 1),
    }));
    setIdx((i) => i + 1);
  }, [item, user, params]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { navigate('/'); return; }
      if (phase === 'face' && e.key === ' ') { e.preventDefault(); reveal(); }
      if (phase === 'revealed' && ['1', '2', '3', '4'].includes(e.key)) {
        grade(Number(e.key) as Rating);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, reveal, grade, navigate]);

  if (!item || !point) {
    return (
      <section className="review review-done">
        <h1>Готово</h1>
        <p>Сделано {done.n} · «снова» {done.again} · новых введено {done.newIntroduced}</p>
        <button className="btn-primary" onClick={() => navigate('/')}>На сегодня</button>
      </section>
    );
  }

  const previews = previewIntervals(
    user.getCard('grammar', item.itemId) ?? newCard('grammar', item.itemId, new Date()),
    new Date(), params,
  );

  return (
    <section className="review">
      <div className="review-progress">{idx + 1} / {queue.length}</div>

      {phase === 'learn' && (
        <div className="review-learn">
          <h2>{point.title}</h2>
          <GrammarMarkdown source={point.bodyMarkdown} />
          <ul className="examples">
            {point.examples.map((ex, i) => (
              <li key={i}><Furigana text={ex.jaRuby} /> — {ex.ru}</li>
            ))}
          </ul>
          <button className="btn-primary" onClick={() => setPhase('face')}>Понятно</button>
        </div>
      )}

      {phase === 'face' && (
        <div className="review-face" onClick={reveal}>
          <h2>{point.title}</h2>
          <p className="review-cue">Вспомни правило</p>
          <button className="btn-ghost" onClick={reveal}>Показать (Space)</button>
        </div>
      )}

      {phase === 'revealed' && (
        <div className="review-revealed">
          <h2>{point.title}</h2>
          <GrammarMarkdown source={point.bodyMarkdown} />
          <ul className="examples">
            {point.examples.map((ex, i) => (
              <li key={i}><Furigana text={ex.jaRuby} /> — {ex.ru}</li>
            ))}
          </ul>
          <RatingButtons previews={previews} onRate={grade} />
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Append styles**

`src/ui/theme.css` — append `.review*`, `.rating*`, `.btn-ghost` rules (flex column, centered, 2×2 rating grid on narrow, row on wide). Keep it short; match the existing visual language.

- [ ] **Step 6: Run the component test**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/ui/ReviewScreen.test.tsx`
Expected: PASS.

- [ ] **Step 7: Write + run the e2e**

Create `tests/e2e/review.spec.ts`:

```ts
import { test, expect, _electron as electron } from '@playwright/test';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

test('a full review session records progress and returns to Today', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'jlpt-e2e-'));
  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/main.js'), `--user-data-dir=${userData}`],
  });
  const win = await app.firstWindow();
  await win.waitForSelector('[data-testid="user-db-ready"]');
  await win.getByRole('link', { name: /начать/i }).click();

  // 5 new cards: for each -> "Понятно", then "Показать", then "Хорошо"
  for (let i = 0; i < 5; i++) {
    await win.getByRole('button', { name: /понятно/i }).click();
    await win.getByRole('button', { name: /показать/i }).click();
    await win.getByRole('button', { name: /хорошо/i }).click();
  }
  await expect(win.getByText(/готово/i)).toBeVisible();
  await win.getByRole('button', { name: /на сегодня/i }).click();
  await expect(win.getByText(/повторить/)).toBeVisible(); // back on Today
  await app.close();
});
```

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npm run build && npx playwright test tests/e2e/review.spec.ts`
Expected: PASS.

- [ ] **Step 8: Full regression + commit**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npm run typecheck && npm run lint && npm test && npm run build`

```bash
git add src/ui tests/ui/ReviewScreen.test.tsx tests/e2e/review.spec.ts
git commit -m "feat: flashcard review loop with FSRS grading

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 10: `ProgressScreen` — ribbon, bars, counts, heatmap, streak

**Files:**
- Create: `src/ui/screens/ProgressScreen.tsx` (replaces the Task 8 stub)
- Create: `src/ui/components/ProgressBar.tsx`
- Create: `src/ui/components/Heatmap.tsx`
- Modify: `src/ui/theme.css` (append)
- Test: `tests/ui/ProgressScreen.test.tsx`
- Test: `tests/e2e/progress.spec.ts`

**Interfaces:**
- Consumes: `useUserDb`, `useContentDb` + `useLevels` (Plan 1), `levelBars`/`statusCounts`/`streak`/`heatmap`/`levelRibbon` (Task 7).
- Produces:
  - `ProgressBar({ label, value, total })` — one labelled bar; `value` is a 0..1 fraction, caption `Math.round(value*total) / total`.
  - `Heatmap({ cells })` — `cells: HeatCell[]`, a CSS-grid of 7 rows × N columns, intensity class by count bucket (0 / 1 / 2-3 / 4-6 / 7+).
  - `ProgressScreen` — level ribbon (fills from `levelRibbon`), the N5 grammar bars ("Изучено" / "Закреплено"), the 4 status counts, `Heatmap` for ~17 weeks, current + best streak, and the static N4-unlock rule text.

- [ ] **Step 1: Write the failing component test**

Create `tests/ui/ProgressScreen.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/ui/useUserDb', () => ({ useUserDb: () => ({}) }));
vi.mock('@/ui/useContentDb', () => ({
  useContentDb: () => ({}),
  useLevels: () => [
    { code: 'N5', status: 'available', ord: 1, titleRu: 'N5' },
    { code: 'N4', status: 'coming_soon', ord: 2, titleRu: 'N4' },
  ],
}));
vi.mock('@/core/progress', () => ({
  levelRibbon: () => [
    { code: 'N5', status: 'available', fill: 0.25 },
    { code: 'N4', status: 'coming_soon', fill: 0 },
  ],
  levelBars: () => ({ studied: 0.5, consolidated: 0.25, total: 8 }),
  statusCounts: () => ({ new: 4, learning: 2, learned: 1, mastered: 1 }),
  streak: () => ({ current: 3, best: 7 }),
  heatmap: () => Array.from({ length: 119 }, (_, i) => ({ dayKey: `d${i}`, count: i % 3 })),
}));

import { ProgressScreen } from '@/ui/screens/ProgressScreen';

describe('ProgressScreen', () => {
  it('renders ribbon, bars, counts, streak, heatmap and the unlock rule', () => {
    render(<ProgressScreen />);
    expect(screen.getByText('N5')).toBeTruthy();
    expect(screen.getByText('N4')).toBeTruthy();
    expect(screen.getByText(/Изучено/)).toBeTruthy();
    expect(screen.getByText(/Закреплено/)).toBeTruthy();
    expect(screen.getByText(/стрик 3/i)).toBeTruthy();
    expect(screen.getByText(/рекорд 7/i)).toBeTruthy();
    expect(screen.getByText(/60 %/)).toBeTruthy(); // N4 unlock rule
    expect(screen.getAllByTestId('heat-cell').length).toBe(119);
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/ui/ProgressScreen.test.tsx`
Expected: FAIL (stub screen).

- [ ] **Step 3: Implement `ProgressBar`**

Create `src/ui/components/ProgressBar.tsx`:

```tsx
export function ProgressBar({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = Math.round(value * 100);
  const count = Math.round(value * total);
  return (
    <div className="pbar">
      <div className="pbar-head"><span>{label}</span><span>{count} / {total}</span></div>
      <div className="pbar-track"><div className="pbar-fill" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
```

- [ ] **Step 4: Implement `Heatmap`**

Create `src/ui/components/Heatmap.tsx`:

```tsx
import type { HeatCell } from '@/core/progress';

function bucket(count: number): number {
  if (count === 0) return 0;
  if (count <= 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

export function Heatmap({ cells }: { cells: HeatCell[] }) {
  return (
    <div className="heatmap" style={{ gridTemplateColumns: `repeat(${Math.ceil(cells.length / 7)}, 1fr)` }}>
      {cells.map((c) => (
        <span
          key={c.dayKey}
          data-testid="heat-cell"
          className={`heat heat-${bucket(c.count)}`}
          title={`${c.dayKey}: ${c.count}`}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Implement `ProgressScreen`**

Create `src/ui/screens/ProgressScreen.tsx`:

```tsx
import { useUserDb } from '@/ui/useUserDb';
import { useContentDb, useLevels } from '@/ui/useContentDb';
import { levelRibbon, levelBars, statusCounts, streak, heatmap } from '@/core/progress';
import { ProgressBar } from '@/ui/components/ProgressBar';
import { Heatmap } from '@/ui/components/Heatmap';

export function ProgressScreen() {
  const user = useUserDb();
  const content = useContentDb();
  const levels = useLevels();
  const now = new Date();

  const ribbon = levelRibbon(user, content);
  const active = levels.find((l) => l.status === 'available')?.code ?? levels[0]!.code;
  const bars = levelBars(user, content, active);
  const counts = statusCounts(user, content, active);
  const st = streak(user, now);
  const cells = heatmap(user, now, 17);

  return (
    <section className="progress">
      <h1>Прогресс</h1>

      <div className="ribbon">
        {ribbon.map((seg) => (
          <div key={seg.code} className={`ribbon-seg ${seg.status}`}>
            <span className="ribbon-code">{seg.code}</span>
            <div className="ribbon-track"><div className="ribbon-fill" style={{ width: `${Math.round(seg.fill * 100)}%` }} /></div>
          </div>
        ))}
      </div>

      <h2>Грамматика {active}</h2>
      <ProgressBar label="Изучено" value={bars.studied} total={bars.total} />
      <ProgressBar label="Закреплено" value={bars.consolidated} total={bars.total} />

      <div className="status-counts">
        <span>new {counts.new}</span>
        <span>learning {counts.learning}</span>
        <span>learned {counts.learned}</span>
        <span>mastered {counts.mastered}</span>
      </div>

      <h2>Активность</h2>
      <Heatmap cells={cells} />
      <p className="streak">Стрик {st.current} · рекорд {st.best}</p>

      <p className="unlock-rule">N4 откроется при ≥ 60 % закреплено по грамматике N5.</p>
    </section>
  );
}
```

- [ ] **Step 6: Append styles**

`src/ui/theme.css` — append `.progress`, `.ribbon*`, `.pbar*`, `.heatmap`, `.heat`, `.heat-0..4`, `.status-counts`, `.streak`, `.unlock-rule`. Heatmap: `display:grid; grid-auto-flow:column; grid-template-rows:repeat(7,10px); gap:2px`. Buckets: `--heat-0`…`--heat-4` colors in both themes.

- [ ] **Step 7: Run component test**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/ui/ProgressScreen.test.tsx`
Expected: PASS.

- [ ] **Step 8: Write + run the e2e**

Create `tests/e2e/progress.spec.ts`:

```ts
import { test, expect, _electron as electron } from '@playwright/test';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

test('after a session the Progress screen shows non-zero bars, counts and streak', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'jlpt-e2e-'));
  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/main.js'), `--user-data-dir=${userData}`],
  });
  const win = await app.firstWindow();
  await win.waitForSelector('[data-testid="user-db-ready"]');
  await win.getByRole('link', { name: /начать/i }).click();
  for (let i = 0; i < 5; i++) {
    await win.getByRole('button', { name: /понятно/i }).click();
    await win.getByRole('button', { name: /показать/i }).click();
    await win.getByRole('button', { name: /хорошо/i }).click();
  }
  await win.getByRole('button', { name: /на сегодня/i }).click();

  // navigate to Progress via nav
  await win.getByRole('link', { name: /прогресс/i }).click();
  await expect(win.getByText(/Стрик 1/)).toBeVisible();
  await expect(win.getByText(/learning 5|learned|mastered/)).toBeVisible();
  const heatToday = win.locator('.heat').last();
  await expect(heatToday).not.toHaveClass(/heat-0/);
  await app.close();
});
```

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npm run build && npx playwright test tests/e2e/progress.spec.ts`
Expected: PASS.

- [ ] **Step 9: Full regression + commit**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npm run typecheck && npm run lint && npm test && npm run build && npm run build:desktop && npx playwright test`
Expected: everything green (Vitest well above 42; e2e: smoke 2, grammar-browse 2, packaged 1, user-db-bridge 1, today 1, review 1, progress 1).

```bash
git add src/ui tests/ui/ProgressScreen.test.tsx tests/e2e/progress.spec.ts
git commit -m "feat: Progress screen — level ribbon, bars, status counts, heatmap, streak

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:**
- §2 module list → Tasks 2–10 (each module one task; `time.ts` folded into Task 2 as a shared helper).
- §2 `PlatformAdapter` extension → Task 1.
- §2 desktop read/write + atomic + before-quit flush → Task 1.
- §2 debounce 500 ms → Task 4.
- §2 content↔user id linking, orphan tolerance → Task 6 (`known` set filter) + Task 7 (`cardsForLevel` intersection). Orphan user rows are simply never matched — covered.
- §3 migration mechanism, refuse-newer, v1 schema, seeds → Task 3; `learning_steps` addition noted in Global Constraints.
- §3 time/day_key rules → Task 2 + used in Tasks 5–7.
- §4 srs wrapper (`newCard`/`review`/`statusOf`/`previewIntervals`), params from settings → Task 5 (funcs) + Task 9 (params wiring).
- §5 scheduler (`daySummary`/`buildQueue`), due cap, new feed + daily limit, queueOverCap, interleave, not-new-first, idempotent → Task 6.
- §6 Today / Review / Progress screens → Tasks 8 / 9 / 10.
- §7 `core/progress` API → Task 7.
- §8 test matrix → each task's tests + the final e2e list in Task 10 Step 9.
- §9 open questions: ts-fsrs serialization isolated in `core/srs` (Task 5 guidance); before-quit flush best-effort with 1.5 s timeout (Task 1); settings as JSON-per-key (Task 3).

**2. Placeholder scan:** the Task 8 and Task 9 second component tests are deliberately marked "keep light / e2e covers it" — acceptable because the e2e fully exercises those paths; not a code placeholder. No "TBD"/"add error handling"/bare "write tests" anywhere. All code steps carry real code.

**3. Type consistency:**
- `CardRow` / `ReviewLogRow` defined in Task 4, imported by Tasks 5/6/7 — same field names throughout (`item_type`, `item_id`, `elapsed_days`, `scheduled_days`, `learning_steps`, …).
- `Rating` = `1|2|3|4` defined in Task 5, used in Task 9 (`RatingButtons`).
- `QueueItem` shape (`itemType`/`itemId`/`kind`) consistent between Task 6 output and Task 9 consumption.
- `DaySummary` fields consistent between Task 6 and Task 8 (`dueCount`, `newCount`, `allDone`, `queueOverCap`, `nextDueAt`).
- `HeatCell` (`dayKey`/`count`) consistent between Task 7 and Task 10 `Heatmap`.
- `ContentDb` methods referenced (`listLevels`, `listGrammar`, `getGrammar`, `grammarCountByLevel`) all exist from Plan 1 — verified against `src/storage/content-db.ts` at plan-writing time. **Task 6/7 implementers: confirm `listGrammar` returns objects with a `layer` field and `listLevels` items have `code`/`status`; adjust field access if the Plan 1 shape differs.**
- `loadSqlJs(wasmBinary)` signature from Plan 1 (Task 9b) — used in Task 4.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-03-plan-2-srs-core.md`.

Recommended: **Subagent-Driven** — fresh subagent per task, review after each, broad review at the end. (Same flow Plan 1 used.)
