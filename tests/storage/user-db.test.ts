import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import type { PlatformAdapter } from '@/platform/adapter';
import { UserDb } from '@/storage/user-db';

const wasm = readFileSync(createRequire(import.meta.url).resolve('sql.js/dist/sql-wasm.wasm'));

/** In-memory fake adapter: holds the last written bytes. */
function fakeAdapter(initial: Uint8Array | null = null) {
  let store = initial;
  const writes: number[] = [];
  const adapter: PlatformAdapter = {
    platform: 'desktop',
    async readBundledContentDb() { throw new Error('unused'); },
    async readSqlWasm() { return new Uint8Array(wasm); },
    async readUserDb() { return store; },
    async writeUserDb(bytes: Uint8Array) { store = bytes.slice(); writes.push(store.length); },
    async exportUserDb() { throw new Error('unused'); },
    async importUserDb() { throw new Error('unused'); },
    async checkForUpdate() { return null; },
    async openExternal() {},
    async autoBackupUserDb() {},
  };
  return {
    adapter,
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

  it('resetAll wipes cards, review log and settings, surviving a reopen', async () => {
    const f = fakeAdapter(null);
    const db = await UserDb.open(f.adapter, '0.2.0', now);
    db.upsertCard({
      item_type: 'grammar', item_id: 'n5-wa-particle',
      due: '2026-02-02T10:00:00.000Z', stability: 3, difficulty: 5,
      elapsed_days: 0, scheduled_days: 1, learning_steps: 0,
      reps: 1, lapses: 0, state: 1, last_review: null,
      introduced_at: '2026-02-01T10:00:00.000Z',
    });
    db.insertReviewLog({
      item_type: 'grammar', item_id: 'n5-wa-particle',
      reviewed_at: '2026-02-01T10:00:00.000Z', day_key: '2026-02-01',
      rating: 3, state_before: 0, stability_after: 3, elapsed_ms: 1000,
    });
    db.setSetting('unlocked_levels', ['N4']);
    await db.flush();

    db.resetAll();
    await db.flush();

    const db2 = await UserDb.open(f.adapter, '0.2.0', now);
    expect(db2.allCards()).toHaveLength(0);
    expect(db2.reviewCountsByDay()).toHaveLength(0);
    expect(db2.getSetting<string[]>('unlocked_levels', ['fallback'])).toEqual(['fallback']);
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

  it('counts review logs by day', async () => {
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
  });

  it('materialises the file once on first open and flush is a no-op when clean', async () => {
    const f = fakeAdapter(null);
    const db = await UserDb.open(f.adapter, '0.2.0', now);
    expect(f.writeCount).toBe(1); // fresh db written back exactly once
    await db.flush(); // nothing dirty
    await db.flush();
    expect(f.writeCount).toBe(1);
  });

  it('refuses to open a db newer than the app', async () => {
    // Build a v1 db, then bump user_version past LATEST and hand it back.
    const f = fakeAdapter(null);
    const db = await UserDb.open(f.adapter, '0.2.0', now);
    await db.flush();
    const initSqlJs = (await import('sql.js')).default;
    const SQL = await initSqlJs({ wasmBinary: wasm as unknown as ArrayBuffer });
    const raw = new SQL.Database(f.bytes!);
    raw.run('PRAGMA user_version = 999');
    const bumped = raw.export();
    const f2 = fakeAdapter(bumped);
    await expect(UserDb.open(f2.adapter, '0.2.0', now)).rejects.toThrow(/newer/i);
  });

  it('validateImportBytes rejects a backup from a newer schema version than this app supports', async () => {
    const f = fakeAdapter(null);
    const db = await UserDb.open(f.adapter, '0.2.0', now);
    const initSqlJs = (await import('sql.js')).default;
    const SQL = await initSqlJs({ wasmBinary: wasm as unknown as ArrayBuffer });
    const raw = new SQL.Database(db.export());
    raw.run('PRAGMA user_version = 999');
    await expect(db.validateImportBytes(raw.export())).resolves.toBe(false);
  });

  it('validateImportBytes accepts its own exported bytes', async () => {
    const f = fakeAdapter(null);
    const db = await UserDb.open(f.adapter, '0.2.0', now);
    const bytes = db.export();
    await expect(db.validateImportBytes(bytes)).resolves.toBe(true);
  });

  it('deleteCard removes a card so it no longer shows up', async () => {
    const f = fakeAdapter(null);
    const db = await UserDb.open(f.adapter, '0.2.0', now);
    db.upsertCard({
      item_type: 'grammar', item_id: 'n5-wa-particle',
      due: '2026-02-02T10:00:00.000Z', stability: 3, difficulty: 5,
      elapsed_days: 0, scheduled_days: 1, learning_steps: 0,
      reps: 1, lapses: 0, state: 1, last_review: '2026-02-01T10:00:00.000Z',
      introduced_at: '2026-02-01T10:00:00.000Z',
    });
    expect(db.getCard('grammar', 'n5-wa-particle')).not.toBeNull();
    db.deleteCard('grammar', 'n5-wa-particle');
    expect(db.getCard('grammar', 'n5-wa-particle')).toBeNull();
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
});
