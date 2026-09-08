# Plan 4c-1 — Settings Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/settings` `PlaceholderScreen` with a real Settings screen: daily
new-card limit, review-queue cap, a furigana on/off toggle, and manual export/import of
`user.db` via native OS file dialogs.

**Architecture:** `new_per_day`/`review_queue_cap` are already free-string `settings` rows
read with defaults in `scheduler.ts` — the screen just needs to read/write them through the
existing `UserDb.getSetting`/`setSetting`. `furigana_enabled` is a new setting key;
`Furigana.tsx` already accepts a (currently unused) `showFurigana` prop, so it only needs to
fall back to the setting instead of a hardcoded `true`. Export/import needs one new capability
that doesn't exist yet — `PlatformAdapter` gains two methods backed by Electron's native
`dialog` module (main process) + one new `UserDb` instance method that validates imported
bytes look like a real `user.db` before anything is overwritten. No schema migration —
`settings` is already a free key-value table.

**Tech Stack:** Unchanged — TypeScript, React 18, Electron, Vitest, Playwright, sql.js.

**Spec:** `docs/superpowers/specs/2026-09-05-plan-4c-1-settings-design.md` — this plan
implements that spec in full. Sound/TTS and the theme toggle are explicitly out of scope
(see spec §1, §2) — do not add either.

## Global Constraints

- **`exportUserDb`/`importUserDb` are REQUIRED members of `PlatformAdapter`** (not
  optional) — confirmed by running `tsc --noEmit` after adding them as required: exactly 6
  sites break (`src/platform/desktop.ts` plus the 5 test files listed in Task 1), and Task 1
  fixes all 6 in one pass. Do not make them optional — that would let a future Android
  adapter compile without implementing them.
- **Import always confirms first, validates second, writes third.** Never call
  `adapter.writeUserDb` with imported bytes before `UserDb`'s validation method returns
  `true`. A failed validation shows an error message and touches nothing on disk.
- **No new relaunch/IPC surface for import.** After a successful import write, call
  `window.location.reload()` — this reloads the renderer in the same Electron window; the
  main process and its close/flush handlers are untouched. Do not add an `app.relaunch()`
  IPC path.
- **No sound/TTS setting, no theme setting in this screen.** `ThemeToggle` stays exactly
  where it is (navbar) — do not duplicate or remove it.
- **FSRS parameters (`fsrs_request_retention`, `fsrs_maximum_interval`, `fsrs_enable_fuzz`)
  are NOT exposed in this screen** — they stay as internal defaults in `ReviewScreen.tsx`.
- **No e2e test for the native export/import dialog** — Playwright cannot drive a real OS
  file picker. Export/import correctness is covered by unit tests with a mocked
  `PlatformAdapter` only.
- **Node not on PATH**: prefix every `npm`/`npx` run with
  `export PATH="$PATH:/c/Program Files/nodejs" &&` (Bash) as established in this repo.

---

## File Structure

**Created:**
- `src/ui/screens/SettingsScreen.tsx` — the new screen.
- `tests/ui/SettingsScreen.test.tsx`
- `tests/e2e/settings.spec.ts`

**Modified:**
- `src/platform/adapter.ts` — `PlatformAdapter` gains `exportUserDb`/`importUserDb`.
- `src/platform/desktop.ts` — implements both via `window.jlmpBridge`; `Window.jlmpBridge`
  type gains the two matching bridge methods.
- `shells/electron/main.ts` — two new `ipcMain.handle` blocks using Electron's `dialog`.
- `shells/electron/preload.ts` — exposes the two new bridge methods.
- `src/storage/user-db.ts` — new instance method `validateImportBytes(bytes)`.
- `src/ui/components/Furigana.tsx` — `showFurigana` prop becomes a true override; when
  omitted, falls back to the `furigana_enabled` setting via `useUserDb()`.
- `src/ui/routes.tsx` — `/settings` now renders `SettingsScreen`; removes the now-unused
  `PlaceholderScreen` import.
- `src/ui/theme.css` — `.settings*` rules.
- `tests/core/scheduler.test.ts`, `tests/core/session.test.ts`, `tests/core/progress.test.ts`,
  `tests/storage/user-db.test.ts`, `tests/storage/content-db.test.ts` — each `fakeAdapter`
  gains stub `exportUserDb`/`importUserDb` methods (required by the widened interface;
  never actually exercised by these tests).
- `tests/storage/user-db.test.ts` — two new tests for `validateImportBytes`.
- `tests/ui/Furigana.test.tsx` — rewritten to mock `@/ui/useUserDb` (now a real dependency
  of the component) and cover the setting-driven default.
- `tests/ui/QuestionView.test.tsx`, `tests/ui/GrammarDetailScreen.test.tsx` — **must** each
  gain a `vi.mock('@/ui/useUserDb', ...)` stub. Both render `<Furigana>` transitively
  (`QuestionView` directly; `GrammarDetailScreen` via its examples list) and currently render
  it with NO `UserDbProvider`/mock in scope — once `Furigana` calls `useUserDb()`
  unconditionally (this plan's own change), both files fail with "useUserDb used outside
  UserDbProvider" unless mocked. This was found by grepping every UI test file for a
  `useUserDb` mock before writing this plan — these two are the only ones missing it that
  render a `Furigana`-using component.

**Not modified:** `src/core/scheduler.ts`, `src/core/session.ts`, `src/storage/migrations.ts`
(no schema change), `src/ui/components/ThemeToggle.tsx`, `src/ui/App.tsx`.

---

## Task 1: Widen `PlatformAdapter` with export/import, wire Electron dialogs

**Files:**
- Modify: `src/platform/adapter.ts`, `src/platform/desktop.ts`, `shells/electron/main.ts`,
  `shells/electron/preload.ts`
- Modify (mechanical stub addition): `tests/core/scheduler.test.ts`,
  `tests/core/session.test.ts`, `tests/core/progress.test.ts`, `tests/storage/user-db.test.ts`,
  `tests/storage/content-db.test.ts`

**Interfaces:**
- Produces: `PlatformAdapter.exportUserDb(bytes: Uint8Array): Promise<boolean>` (`true` if
  saved, `false` if the user cancelled the dialog) and
  `PlatformAdapter.importUserDb(): Promise<Uint8Array | null>` (bytes read from the chosen
  file, `null` if cancelled) — consumed by `SettingsScreen` in Task 4.

This task's platform-layer code (`desktop.ts`, `main.ts`, `preload.ts`) has no existing unit
tests anywhere in this project (verified: no file under `tests/` targets these three files) —
it is verified by `tsc --noEmit` here and by the e2e-adjacent manual/Playwright coverage of
the rest of the app; do not invent a new unit-testing approach for Electron IPC in this task.

- [ ] **Step 1: Widen the `PlatformAdapter` interface**

Modify `src/platform/adapter.ts` — add two methods after `writeUserDb`:

```ts
  /** Атомарно записать `user.db`. */
  writeUserDb(bytes: Uint8Array): Promise<void>;
  /** Диалог "Сохранить как", пишет байты по выбранному пользователем пути. `false`, если отменено. */
  exportUserDb(bytes: Uint8Array): Promise<boolean>;
  /** Диалог "Открыть", читает выбранный пользователем файл. `null`, если отменено. */
  importUserDb(): Promise<Uint8Array | null>;
```

- [ ] **Step 2: Run — expect failure**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx tsc --noEmit`
Expected: FAIL with exactly 6 errors — `TS2739`/`TS2352` on `src/platform/desktop.ts` and the
5 test files touched in Step 4, each "missing the following properties from type
'PlatformAdapter': exportUserDb, importUserDb".

- [ ] **Step 3: Implement the Electron main-process handlers**

Modify `shells/electron/main.ts` — change the import line at the top to add `dialog`:

```ts
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
```

Add these two handlers right after the existing `ipcMain.handle('user-db:write', ...)` block
(which ends at the `});` following the `rm(tmp, ...)` cleanup):

```ts
ipcMain.handle('user-db:export', async (_evt, bytes: ArrayBuffer): Promise<boolean> => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Экспорт резервной копии',
    defaultPath: `jlpt-backup-${new Date().toISOString().slice(0, 10)}.db`,
    filters: [{ name: 'JLPT backup', extensions: ['db'] }],
  });
  if (canceled || !filePath) return false;
  await writeFile(filePath, Buffer.from(bytes));
  return true;
});

ipcMain.handle('user-db:import', async (): Promise<ArrayBuffer | null> => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Импорт резервной копии',
    filters: [{ name: 'JLPT backup', extensions: ['db'] }],
    properties: ['openFile'],
  });
  if (canceled || filePaths.length === 0) return null;
  const buf = await readFile(filePaths[0]!);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
});
```

(`writeFile`/`readFile` are already imported at the top of this file from `node:fs/promises`
— no new import needed for those two.)

- [ ] **Step 4: Wire the preload bridge**

Modify `shells/electron/preload.ts` — add two lines inside the `contextBridge.exposeInMainWorld`
object, after `writeUserDb`:

```ts
  writeUserDb: (bytes: ArrayBuffer): Promise<void> => ipcRenderer.invoke('user-db:write', bytes),
  exportUserDb: (bytes: ArrayBuffer): Promise<boolean> => ipcRenderer.invoke('user-db:export', bytes),
  importUserDb: (): Promise<ArrayBuffer | null> => ipcRenderer.invoke('user-db:import'),
```

- [ ] **Step 5: Implement the desktop adapter**

Modify `src/platform/desktop.ts` — replace the full file contents with:

```ts
import type { PlatformAdapter } from './adapter';

declare global {
  interface Window {
    jlmpBridge?: {
      readContentDb(): Promise<ArrayBuffer>;
      readSqlWasm(): Promise<ArrayBuffer>;
      readUserDb(): Promise<ArrayBuffer | null>;
      writeUserDb(bytes: ArrayBuffer): Promise<void>;
      exportUserDb(bytes: ArrayBuffer): Promise<boolean>;
      importUserDb(): Promise<ArrayBuffer | null>;
      onFlushUserDb?(cb: () => Promise<void> | void): void;
    };
  }
}

/** Десктопный адаптер: тянет байты через preload-мост Electron. */
export function createDesktopAdapter(): PlatformAdapter {
  return {
    platform: 'desktop',
    async readBundledContentDb(): Promise<Uint8Array> {
      if (!window.jlmpBridge) {
        throw new Error('jlmpBridge missing — preload not loaded');
      }
      const buf = await window.jlmpBridge.readContentDb();
      return new Uint8Array(buf);
    },
    async readSqlWasm(): Promise<Uint8Array> {
      if (!window.jlmpBridge) {
        throw new Error('jlmpBridge missing — preload not loaded');
      }
      const buf = await window.jlmpBridge.readSqlWasm();
      return new Uint8Array(buf);
    },
    async readUserDb(): Promise<Uint8Array | null> {
      if (!window.jlmpBridge) {
        throw new Error('jlmpBridge missing — preload not loaded');
      }
      const buf = await window.jlmpBridge.readUserDb();
      return buf ? new Uint8Array(buf) : null;
    },
    async writeUserDb(bytes: Uint8Array): Promise<void> {
      if (!window.jlmpBridge) {
        throw new Error('jlmpBridge missing — preload not loaded');
      }
      // structuredClone-safe: pass a plain ArrayBuffer slice
      const ab = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
      await window.jlmpBridge.writeUserDb(ab);
    },
    async exportUserDb(bytes: Uint8Array): Promise<boolean> {
      if (!window.jlmpBridge) {
        throw new Error('jlmpBridge missing — preload not loaded');
      }
      const ab = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
      return window.jlmpBridge.exportUserDb(ab);
    },
    async importUserDb(): Promise<Uint8Array | null> {
      if (!window.jlmpBridge) {
        throw new Error('jlmpBridge missing — preload not loaded');
      }
      const buf = await window.jlmpBridge.importUserDb();
      return buf ? new Uint8Array(buf) : null;
    },
  };
}
```

- [ ] **Step 6: Add the required stub to every fake adapter in the test suite**

Five files each define a `PlatformAdapter`-shaped object for tests unrelated to
export/import. Add two stub methods to each, matching each file's existing style.

In `tests/core/scheduler.test.ts`, `tests/core/session.test.ts`, and
`tests/core/progress.test.ts`, each has a `fakeAdapter()` function whose returned object
literal ends with the `writeUserDb` line before the closing `} as PlatformAdapter;`. In each
of these three files, add two lines right after `writeUserDb`:

```ts
    async exportUserDb() { throw new Error('unused'); },
    async importUserDb() { throw new Error('unused'); },
```

In `tests/storage/user-db.test.ts`, the `fakeAdapter` function's inner object currently ends
with:

```ts
      async writeUserDb(bytes: Uint8Array) { store = bytes.slice(); writes.push(store.length); },
    } as PlatformAdapter,
```

Add the two stub lines between them:

```ts
      async writeUserDb(bytes: Uint8Array) { store = bytes.slice(); writes.push(store.length); },
      async exportUserDb() { throw new Error('unused'); },
      async importUserDb() { throw new Error('unused'); },
    } as PlatformAdapter,
```

In `tests/storage/content-db.test.ts`, the `fakeAdapter` is a plain
`const fakeAdapter: PlatformAdapter = { ... }` object ending with:

```ts
  async writeUserDb() {
    // no-op: ContentDb tests don't touch the user db
  },
```

Add after it:

```ts
  async exportUserDb() {
    throw new Error('unused');
  },
  async importUserDb() {
    return null;
  },
```

- [ ] **Step 7: Run — expect pass**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx tsc --noEmit`
Expected: PASS — 0 errors.

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run`
Expected: PASS — 223 tests (this task adds no new tests, only stub methods; nothing should
regress).

- [ ] **Step 8: Commit**

```bash
git add src/platform/adapter.ts src/platform/desktop.ts shells/electron/main.ts shells/electron/preload.ts tests/core/scheduler.test.ts tests/core/session.test.ts tests/core/progress.test.ts tests/storage/user-db.test.ts tests/storage/content-db.test.ts
git commit -m "feat: PlatformAdapter export/import via native Electron file dialogs"
```

---

## Task 2: `UserDb.validateImportBytes`

**Files:**
- Modify: `src/storage/user-db.ts`
- Test: `tests/storage/user-db.test.ts` (extend)

**Interfaces:**
- Produces: `UserDb.prototype.validateImportBytes(bytes: Uint8Array): Promise<boolean>` —
  consumed by `SettingsScreen` in Task 4. Returns `true` only if the bytes open as a sqlite
  database (via sql.js) AND contain all four tables from `migrations.ts`'s `V1_SCHEMA`
  (`cards`, `review_log`, `settings`, `meta`). Never throws — any failure (corrupt bytes, not
  a sqlite file, wrong schema) resolves to `false`.

- [ ] **Step 1: Write the failing test**

Add to `tests/storage/user-db.test.ts`, inside the existing `describe('storage/user-db', ...)`
block (after the last existing `it(...)`, before the closing `});`):

```ts
  it('validateImportBytes accepts its own exported bytes', async () => {
    const f = fakeAdapter(null);
    const db = await UserDb.open(f.adapter, '0.2.0', now);
    const bytes = db.export();
    await expect(db.validateImportBytes(bytes)).resolves.toBe(true);
  });

  it('validateImportBytes rejects garbage and a valid-sqlite-but-wrong-schema file', async () => {
    const f = fakeAdapter(null);
    const db = await UserDb.open(f.adapter, '0.2.0', now);
    await expect(db.validateImportBytes(new Uint8Array([1, 2, 3, 4]))).resolves.toBe(false);

    const initSqlJs = (await import('sql.js')).default;
    const SQL = await initSqlJs({ wasmBinary: wasm as unknown as ArrayBuffer });
    const wrongSchema = new SQL.Database();
    wrongSchema.run('CREATE TABLE unrelated (id INTEGER)');
    await expect(db.validateImportBytes(wrongSchema.export())).resolves.toBe(false);
  });
```

- [ ] **Step 2: Run — expect failure**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/storage/user-db.test.ts`
Expected: FAIL — `db.validateImportBytes` is not a function yet.

- [ ] **Step 3: Implement**

Modify `src/storage/user-db.ts` — add the import for `loadSqlJs` is already present at the
top of the file. Add this new instance method right after the existing `export()` method
(before `async flush()`):

```ts
  /**
   * Проверяет, что байты открываются как sqlite и содержат все таблицы `user.db`
   * (см. `migrations.ts`'s `V1_SCHEMA`). Не мутирует текущий инстанс. Никогда не
   * бросает — любая проблема (битые байты, не sqlite, чужая схема) даёт `false`.
   */
  async validateImportBytes(bytes: Uint8Array): Promise<boolean> {
    try {
      const SQL = await loadSqlJs(await this.adapter.readSqlWasm());
      const check = new SQL.Database(bytes);
      const rows = check.exec("SELECT name FROM sqlite_master WHERE type='table'");
      const tables = new Set((rows[0]?.values ?? []).map((v) => String(v[0])));
      check.close();
      return ['cards', 'review_log', 'settings', 'meta'].every((t) => tables.has(t));
    } catch {
      return false;
    }
  }
```

- [ ] **Step 4: Run — expect pass**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/storage/user-db.test.ts`
Expected: PASS — 8 tests (6 pre-existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/storage/user-db.ts tests/storage/user-db.test.ts
git commit -m "feat: UserDb.validateImportBytes for pre-overwrite backup validation"
```

---

## Task 3: Furigana reads `furigana_enabled` as its default

**Files:**
- Modify: `src/ui/components/Furigana.tsx`
- Test (rewrite): `tests/ui/Furigana.test.tsx`
- Modify (mock addition only, no behavior change): `tests/ui/QuestionView.test.tsx`,
  `tests/ui/GrammarDetailScreen.test.tsx`

**Interfaces:**
- Consumes: `UserDb.getSetting('furigana_enabled', true)` via `useUserDb()`.
- Produces: `Furigana`'s `showFurigana` prop is now a true override — omit it to use the
  `furigana_enabled` setting; passing it (either value) always wins over the setting.

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `tests/ui/Furigana.test.tsx` with:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { Furigana } from '@/ui/components/Furigana';

const furiganaSetting: { value: boolean } = { value: true };
vi.mock('@/ui/useUserDb', () => ({
  useUserDb: () => ({ getSetting: () => furiganaSetting.value }),
}));

describe('Furigana', () => {
  beforeEach(() => {
    furiganaSetting.value = true;
  });

  it('renders ruby for kanji groups and plain text for kana', () => {
    const { container } = render(<Furigana text="私[わたし]は 学生[がくせい]です。" />);
    const rubies = container.querySelectorAll('ruby');
    expect(rubies).toHaveLength(2);
    expect(rubies[0]!.querySelector('rt')!.textContent).toBe('わたし');
    expect(container.textContent).toContain('です。');
  });

  it('hides furigana when showFurigana={false} is passed explicitly, overriding the setting', () => {
    const { container } = render(<Furigana text="私[わたし]" showFurigana={false} />);
    expect(container.querySelector('rt')).toBeNull();
    expect(container.textContent).toBe('私');
  });

  it('hides furigana when furigana_enabled is false and no prop override is given', () => {
    furiganaSetting.value = false;
    const { container } = render(<Furigana text="私[わたし]" />);
    expect(container.querySelector('rt')).toBeNull();
    expect(container.textContent).toBe('私');
  });

  it('an explicit showFurigana={true} wins over a false setting', () => {
    furiganaSetting.value = false;
    const { container } = render(<Furigana text="私[わたし]" showFurigana={true} />);
    expect(container.querySelector('rt')).not.toBeNull();
  });
});
```

Add the same mock, so the existing tests keep passing once `Furigana` requires
`useUserDb()`, to the top of `tests/ui/QuestionView.test.tsx` (after the existing imports,
before the `const cloze: ClozeQuestion = ...` line):

```ts
vi.mock('@/ui/useUserDb', () => ({
  useUserDb: () => ({ getSetting: (_key: string, fallback: unknown) => fallback }),
}));
```

And to `tests/ui/GrammarDetailScreen.test.tsx`: change its import line
`import { describe, it, expect } from 'vitest';` to
`import { describe, it, expect, vi } from 'vitest';`, and add the same mock block right after
that import line:

```ts
vi.mock('@/ui/useUserDb', () => ({
  useUserDb: () => ({ getSetting: (_key: string, fallback: unknown) => fallback }),
}));
```

- [ ] **Step 2: Run — expect failure**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/ui/Furigana.test.tsx tests/ui/QuestionView.test.tsx tests/ui/GrammarDetailScreen.test.tsx`
Expected: FAIL — `Furigana.test.tsx`'s two new tests fail (component doesn't read the
setting yet); `QuestionView.test.tsx`/`GrammarDetailScreen.test.tsx` still PASS at this point
(the mock is harmless before `Furigana` changes) — that's expected, only `Furigana.test.tsx`
should be red here.

- [ ] **Step 3: Implement**

Replace the full contents of `src/ui/components/Furigana.tsx` with:

```tsx
import { useUserDb } from '@/ui/useUserDb';
import { parseRuby } from '@/core/ruby';

export function Furigana({
  text,
  showFurigana,
}: {
  text: string;
  showFurigana?: boolean;
}) {
  const user = useUserDb();
  const enabled = showFurigana ?? user.getSetting('furigana_enabled', true);
  const segs = parseRuby(text);
  return (
    <span className="furigana">
      {segs.map((s, i) => {
        if (s.ruby && enabled) {
          return (
            <ruby key={i}>
              {s.base}
              <rt>{s.ruby}</rt>
            </ruby>
          );
        }
        return <span key={i}>{s.base}</span>;
      })}
    </span>
  );
}
```

- [ ] **Step 4: Run — expect pass**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/ui/Furigana.test.tsx tests/ui/QuestionView.test.tsx tests/ui/GrammarDetailScreen.test.tsx`
Expected: PASS — `Furigana.test.tsx` 4/4, `QuestionView.test.tsx` 4/4 (unchanged count),
`GrammarDetailScreen.test.tsx` 5/5 (unchanged count).

Run the full suite once to confirm no other file needs the same mock:
Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run`
Expected: PASS — 227 tests (223 plan-baseline + 2 from Task 2's `user-db.test.ts` additions
+ 2 net-new here: `Furigana.test.tsx` goes from 2 tests to 4). If any OTHER test file now fails with "useUserDb used outside
UserDbProvider", it renders a `Furigana`-using component this plan's file-structure scan
missed — add the same mock there and re-run before proceeding; do not silence the error any
other way.

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/Furigana.tsx tests/ui/Furigana.test.tsx tests/ui/QuestionView.test.tsx tests/ui/GrammarDetailScreen.test.tsx
git commit -m "feat: Furigana falls back to the furigana_enabled setting when no prop override is given"
```

---

## Task 4: `SettingsScreen`

**Files:**
- Create: `src/ui/screens/SettingsScreen.tsx`
- Modify: `src/ui/routes.tsx`, `src/ui/theme.css`
- Test: `tests/ui/SettingsScreen.test.tsx`

**Interfaces:**
- Consumes: `UserDb.getSetting`/`setSetting`/`export`/`validateImportBytes` (Task 2);
  `getPlatformAdapter().exportUserDb`/`importUserDb`/`writeUserDb` (Task 1).

- [ ] **Step 1: Write the failing test**

Create `tests/ui/SettingsScreen.test.tsx`:

```tsx
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

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
    render(<SettingsScreen />);
    expect(screen.getByLabelText(/новых карточек в день/i)).toHaveValue(5);
    expect(screen.getByLabelText(/предел повторений/i)).toHaveValue(100);
    expect(screen.getByLabelText(/показывать фуригану/i)).toBeChecked();
  });

  it('changing the daily-limit field calls setSetting with the new value', () => {
    render(<SettingsScreen />);
    fireEvent.change(screen.getByLabelText(/новых карточек в день/i), { target: { value: '8' } });
    expect(setSetting).toHaveBeenCalledWith('new_per_day', 8);
  });

  it('toggling furigana calls setSetting', () => {
    render(<SettingsScreen />);
    fireEvent.click(screen.getByLabelText(/показывать фуригану/i));
    expect(setSetting).toHaveBeenCalledWith('furigana_enabled', false);
  });

  it('export button calls adapter.exportUserDb with the current db bytes', async () => {
    render(<SettingsScreen />);
    fireEvent.click(screen.getByRole('button', { name: /экспортировать/i }));
    await waitFor(() => expect(exportUserDb).toHaveBeenCalledWith(exportBytes));
  });

  it('import asks for confirmation, and does nothing further if it is declined', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    render(<SettingsScreen />);
    fireEvent.click(screen.getByRole('button', { name: /импортировать/i }));
    await waitFor(() => expect(importUserDb).not.toHaveBeenCalled());
  });

  it('import writes valid bytes and reloads the page', async () => {
    importUserDb.mockResolvedValueOnce(new Uint8Array([9, 9]));
    render(<SettingsScreen />);
    fireEvent.click(screen.getByRole('button', { name: /импортировать/i }));
    await waitFor(() => expect(writeUserDb).toHaveBeenCalledWith(new Uint8Array([9, 9])));
    expect(window.location.reload).toHaveBeenCalled();
  });

  it('shows an error and does not write when imported bytes fail validation', async () => {
    importUserDb.mockResolvedValueOnce(new Uint8Array([])); // length 0 -> fails the fake validator
    render(<SettingsScreen />);
    fireEvent.click(screen.getByRole('button', { name: /импортировать/i }));
    await waitFor(() => expect(screen.getByText(/повреждён/i)).toBeInTheDocument());
    expect(writeUserDb).not.toHaveBeenCalled();
    expect(window.location.reload).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/ui/SettingsScreen.test.tsx`
Expected: FAIL — `src/ui/screens/SettingsScreen.tsx` does not exist yet.

- [ ] **Step 3: Implement the screen**

Create `src/ui/screens/SettingsScreen.tsx`:

```tsx
import { useState } from 'react';
import { useUserDb } from '@/ui/useUserDb';
import { getPlatformAdapter } from '@/platform';

export function SettingsScreen() {
  const user = useUserDb();
  const [newPerDay, setNewPerDay] = useState(user.getSetting('new_per_day', 5));
  const [reviewCap, setReviewCap] = useState(user.getSetting('review_queue_cap', 100));
  const [furigana, setFurigana] = useState(user.getSetting('furigana_enabled', true));
  const [status, setStatus] = useState<string | null>(null);

  const changeNewPerDay = (raw: string) => {
    const n = Math.max(1, Math.floor(Number(raw)) || 1);
    setNewPerDay(n);
    user.setSetting('new_per_day', n);
  };

  const changeReviewCap = (raw: string) => {
    const n = Math.max(1, Math.floor(Number(raw)) || 1);
    setReviewCap(n);
    user.setSetting('review_queue_cap', n);
  };

  const changeFurigana = (checked: boolean) => {
    setFurigana(checked);
    user.setSetting('furigana_enabled', checked);
  };

  const exportDb = async () => {
    setStatus(null);
    const ok = await getPlatformAdapter().exportUserDb(user.export());
    if (ok) setStatus('Резервная копия сохранена.');
  };

  const importDb = async () => {
    setStatus(null);
    if (!window.confirm('Это заменит весь текущий прогресс. Продолжить?')) return;
    const bytes = await getPlatformAdapter().importUserDb();
    if (!bytes) return;
    const valid = await user.validateImportBytes(bytes);
    if (!valid) {
      setStatus('Файл повреждён или не является резервной копией JLPT.');
      return;
    }
    await getPlatformAdapter().writeUserDb(bytes);
    window.location.reload();
  };

  return (
    <section className="screen settings">
      <h1>Настройки</h1>

      <div className="settings-field">
        <label htmlFor="new-per-day">Новых карточек в день</label>
        <input
          id="new-per-day"
          type="number"
          min={1}
          value={newPerDay}
          onChange={(e) => changeNewPerDay(e.target.value)}
        />
      </div>

      <div className="settings-field">
        <label htmlFor="review-cap">Предел повторений в очереди</label>
        <input
          id="review-cap"
          type="number"
          min={1}
          value={reviewCap}
          onChange={(e) => changeReviewCap(e.target.value)}
        />
      </div>

      <div className="settings-field settings-field-checkbox">
        <label htmlFor="furigana-enabled">
          <input
            id="furigana-enabled"
            type="checkbox"
            checked={furigana}
            onChange={(e) => changeFurigana(e.target.checked)}
          />
          Показывать фуригану
        </label>
      </div>

      <div className="settings-backup">
        <h2>Резервная копия</h2>
        <button type="button" className="btn-ghost" onClick={exportDb}>
          Экспортировать
        </button>
        <button type="button" className="btn-ghost" onClick={importDb}>
          Импортировать
        </button>
        {status && <p className="settings-status">{status}</p>}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Wire the route**

Replace the full contents of `src/ui/routes.tsx` with:

```tsx
import { GrammarListScreen } from './screens/GrammarListScreen';
import { GrammarDetailScreen } from './screens/GrammarDetailScreen';
import { KanjiListScreen } from './screens/KanjiListScreen';
import { KanjiDetailScreen } from './screens/KanjiDetailScreen';
import { VocabListScreen } from './screens/VocabListScreen';
import { VocabDetailScreen } from './screens/VocabDetailScreen';
import { TodayScreen } from './screens/TodayScreen';
import { ReviewScreen } from './screens/ReviewScreen';
import { ProgressScreen } from './screens/ProgressScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import type { RouteObject } from 'react-router-dom';

export const routes: RouteObject[] = [
  { path: '/', element: <TodayScreen /> },
  { path: '/review', element: <ReviewScreen /> },
  { path: '/grammar', element: <GrammarListScreen /> },
  { path: '/grammar/:id', element: <GrammarDetailScreen /> },
  { path: '/kanji', element: <KanjiListScreen /> },
  { path: '/kanji/:id', element: <KanjiDetailScreen /> },
  { path: '/vocab', element: <VocabListScreen /> },
  { path: '/vocab/:id', element: <VocabDetailScreen /> },
  { path: '/progress', element: <ProgressScreen /> },
  { path: '/settings', element: <SettingsScreen /> },
];
```

- [ ] **Step 5: Add styles**

Add to `src/ui/theme.css`, at the end of the file:

```css
.settings { max-width: 32rem; }
.settings-field { margin: 1rem 0; display: flex; flex-direction: column; gap: 4px; }
.settings-field label { font-weight: 500; }
.settings-field input[type="number"] {
  padding: 0.5rem; border: 1px solid var(--border); border-radius: 0.4rem;
  background: var(--surface); color: var(--text); font-size: 1rem; max-width: 8rem;
}
.settings-field-checkbox label { display: flex; align-items: center; gap: 8px; font-weight: 400; }
.settings-backup { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--border); }
.settings-backup button { margin-right: 0.6rem; }
.settings-status { margin-top: 0.8rem; color: var(--muted); font-size: 0.9rem; }
```

- [ ] **Step 6: Run — expect pass**

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run tests/ui/SettingsScreen.test.tsx`
Expected: PASS — 7 tests.

Run: `export PATH="$PATH:/c/Program Files/nodejs" && npx tsc --noEmit`
Expected: PASS — 0 errors (confirms `PlaceholderScreen`'s now-removed import doesn't leave a
dangling reference and `SettingsScreen`'s prop/type usage is sound).

- [ ] **Step 7: Commit**

```bash
git add src/ui/screens/SettingsScreen.tsx src/ui/routes.tsx src/ui/theme.css tests/ui/SettingsScreen.test.tsx
git commit -m "feat: Settings screen wired to daily limit, review cap, furigana toggle, backup export/import"
```

---

## Task 5: e2e coverage + final regression

**Files:**
- Create: `tests/e2e/settings.spec.ts`

**Interfaces:**
- Consumes: the full stack built by Tasks 1-4, exercised through the real Electron app.

- [ ] **Step 1: Write the e2e test**

Create `tests/e2e/settings.spec.ts`:

```ts
import { test, expect, _electron as electron } from '@playwright/test';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

test('changing settings on the Settings screen persists across app restarts', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'jlpt-e2e-settings-'));
  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/main.js'), `--user-data-dir=${userData}`],
  });
  const win = await app.firstWindow();
  await win.waitForSelector('[data-testid="user-db-ready"]', { state: 'attached', timeout: 20_000 });

  await win.getByRole('link', { name: /настройки/i }).click();
  await win.getByLabel(/новых карточек в день/i).fill('8');
  await win.getByLabel(/показывать фуригану/i).uncheck();

  await app.close();

  const app2 = await electron.launch({
    args: [join(process.cwd(), 'out/main/main.js'), `--user-data-dir=${userData}`],
  });
  const win2 = await app2.firstWindow();
  await win2.waitForSelector('[data-testid="user-db-ready"]', { state: 'attached', timeout: 20_000 });
  await win2.getByRole('link', { name: /настройки/i }).click();
  await expect(win2.getByLabel(/новых карточек в день/i)).toHaveValue('8');
  await expect(win2.getByLabel(/показывать фуригану/i)).not.toBeChecked();
  await app2.close();
});
```

- [ ] **Step 2: Build and run the e2e test**

Run:
```bash
export PATH="$PATH:/c/Program Files/nodejs" && npm run build:desktop
export PATH="$PATH:/c/Program Files/nodejs" && npx playwright test tests/e2e/settings.spec.ts
```
Expected: PASS.

- [ ] **Step 3: Full regression**

Run:
```bash
export PATH="$PATH:/c/Program Files/nodejs" && npx vitest run
```
Expected: PASS — 234 tests (223 baseline + 2 in `user-db.test.ts` (Task 2) + 2 net-new in
`Furigana.test.tsx` (Task 3, replaced 2 pre-existing with 4) + 7 new in
`SettingsScreen.test.tsx` (Task 4) = 223 + 2 + 2 + 7 = 234).

Then run the full e2e suite once to confirm no regression:
```bash
export PATH="$PATH:/c/Program Files/nodejs" && npx playwright test
```
Expected: PASS — all specs green, including the new `settings.spec.ts`.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/settings.spec.ts
git commit -m "test: e2e coverage for Settings screen persistence across restarts"
```

---

## Self-Review

- **Spec coverage:** §2 (three fields) — Task 4. §3 (furigana default) — Task 3. §4
  (export/import, validation, reload) — Tasks 1, 2, 4. §5 (testing: required adapter
  methods, unit-only for export/import, e2e for plain settings persistence) — Tasks 1, 4, 5.
  §6 (out of scope: sound, theme, FSRS UI, auto-backup, Android) — respected, none of these
  appear in any task.
- **Placeholder scan:** no TBD/TODO; every step has complete, runnable code.
- **Type consistency:** `PlatformAdapter.exportUserDb`/`importUserDb` signatures match
  exactly between `adapter.ts` (Task 1), `desktop.ts`'s implementation (Task 1), and
  `SettingsScreen.tsx`'s usage (Task 4). `UserDb.validateImportBytes`'s signature (Task 2)
  matches its mock in `SettingsScreen.test.tsx` (Task 4) and its real usage in
  `SettingsScreen.tsx`.
- **Blast-radius check (the one non-obvious risk in this plan):** `Furigana.tsx` gaining a
  hard dependency on `useUserDb()` (Task 3) could silently break any test that renders it
  without a `UserDbProvider`/mock in scope. Grepped every file under `tests/ui/` for
  `useUserDb` before writing this plan — found exactly two gaps (`QuestionView.test.tsx`,
  `GrammarDetailScreen.test.tsx`) and Task 3 fixes both in the same commit as the component
  change, not as an afterthought discovered by a failing regression run.
