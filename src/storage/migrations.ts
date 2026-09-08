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
