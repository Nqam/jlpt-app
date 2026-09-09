import initSqlJs from 'sql.js';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// Schema mirrors src/storage/migrations.ts V1_SCHEMA (source of truth).
// Kept inline so this Playwright helper imports nothing from src/**.
const V1_SCHEMA = `
CREATE TABLE cards (
  item_type TEXT NOT NULL, item_id TEXT NOT NULL, due TEXT NOT NULL,
  stability REAL NOT NULL, difficulty REAL NOT NULL, elapsed_days INTEGER NOT NULL,
  scheduled_days INTEGER NOT NULL, learning_steps INTEGER NOT NULL, reps INTEGER NOT NULL,
  lapses INTEGER NOT NULL, state INTEGER NOT NULL, last_review TEXT, introduced_at TEXT NOT NULL,
  PRIMARY KEY (item_type, item_id)
);
CREATE INDEX ix_cards_due ON cards(due);
CREATE TABLE review_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, item_type TEXT NOT NULL, item_id TEXT NOT NULL,
  reviewed_at TEXT NOT NULL, day_key TEXT NOT NULL, rating INTEGER NOT NULL,
  state_before INTEGER NOT NULL, stability_after REAL NOT NULL, elapsed_ms INTEGER NOT NULL
);
CREATE INDEX ix_review_log_day ON review_log(day_key);
CREATE INDEX ix_review_log_item ON review_log(item_type, item_id);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

const DEFAULT_SETTINGS: Record<string, unknown> = {
  new_per_day: 5, review_queue_cap: 100, fsrs_request_retention: 0.9,
  fsrs_maximum_interval: 365, fsrs_enable_fuzz: true,
};

export async function writeSeededUserDb(
  userDataDir: string,
  opts: {
    learnedIds: string[];
    dueIds: string[];
    newPerDay?: number;
    placementOffered?: boolean;
    unlockedLevels?: string[];
    /** Kanji content ids to seed as cards due now (item_type = 'kanji'). */
    dueKanjiIds?: string[];
    /** Vocab content ids to seed as cards due now (item_type = 'vocab'). */
    dueVocabIds?: string[];
  },
): Promise<void> {
  const wasm = readFileSync(createRequire(import.meta.url).resolve('sql.js/dist/sql-wasm.wasm'));
  // sql.js types only know about ArrayBuffer; emscripten accepts a typed array
  // too. Same point cast as src/storage/sqljs.ts's loadSqlJs.
  const SQL = await initSqlJs({ wasmBinary: wasm as unknown as ArrayBuffer });
  const db = new SQL.Database();
  db.run(V1_SCHEMA);
  db.run('PRAGMA user_version = 1');

  const settings: Record<string, unknown> = {
    ...DEFAULT_SETTINGS,
    placement_offered: opts.placementOffered ?? false,
    unlocked_levels: opts.unlockedLevels ?? [],
  };
  if (opts.newPerDay !== undefined) settings.new_per_day = opts.newPerDay;
  const setS = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(settings)) setS.run([k, JSON.stringify(v)]);
  setS.free();

  const setM = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)');
  setM.run(['schema_version', '1']);
  setM.run(['app_version', '0.3.0']);
  setM.run(['created_at', '2026-01-01T00:00:00.000Z']);
  setM.free();

  const past = new Date(Date.now() - 3_600_000).toISOString();
  const future = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const intro = '2026-01-01T00:00:00.000Z';
  const insert = db.prepare(
    `INSERT INTO cards (item_type,item_id,due,stability,difficulty,elapsed_days,
      scheduled_days,learning_steps,reps,lapses,state,last_review,introduced_at)
     VALUES (?,?,?,?,?,0,1,0,?,0,?,?,?)`,
  );
  // dueIds win over learnedIds when an id appears in both (same as the old
  // flat loop); kanji/vocab groups are keyed by type so they never collide
  // with a same-named grammar id.
  const groups: { type: string; ids: string[]; due: string }[] = [
    { type: 'grammar', ids: opts.dueIds, due: past },
    { type: 'grammar', ids: opts.learnedIds, due: future },
    { type: 'kanji', ids: opts.dueKanjiIds ?? [], due: past },
    { type: 'vocab', ids: opts.dueVocabIds ?? [], due: past },
  ];
  const seen = new Set<string>();
  for (const g of groups) {
    for (const id of g.ids) {
      const key = `${g.type}:${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      insert.run([g.type, id, g.due, 12, 6, 5, 2, intro, intro]);
    }
  }
  insert.free();

  mkdirSync(userDataDir, { recursive: true });
  writeFileSync(join(userDataDir, 'user.db'), Buffer.from(db.export()));
  db.close();
}
