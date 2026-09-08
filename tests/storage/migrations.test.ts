import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { MIGRATIONS, LATEST_VERSION, applyMigrations } from '@/storage/migrations';

let SQL: SqlJsStatic;
const savedTZ = process.env.TZ;
beforeAll(async () => {
  process.env.TZ = 'Europe/Moscow'; // insurance: keep TZ-derived seeds deterministic
  const wasm = createRequire(import.meta.url).resolve('sql.js/dist/sql-wasm.wasm');
  SQL = await initSqlJs({ wasmBinary: readFileSync(wasm) as unknown as ArrayBuffer });
});
afterAll(() => {
  if (savedTZ === undefined) delete process.env.TZ;
  else process.env.TZ = savedTZ;
});

function tables(db: import('sql.js').Database): string[] {
  const r = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  return r.length ? (r[0]!.values.map((v) => String(v[0])).filter((n) => n !== 'sqlite_sequence')) : [];
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
