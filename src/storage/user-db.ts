import type { Database } from 'sql.js';
import type { PlatformAdapter } from '@/platform/adapter';
import { loadSqlJs } from '@/storage/sqljs';
import { applyMigrations, LATEST_VERSION } from '@/storage/migrations';

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

  introducedOnOrAfter(iso: string, itemType?: string): number {
    const r = itemType
      ? this.db.exec(
          'SELECT COUNT(*) FROM cards WHERE introduced_at >= ? AND item_type = ?',
          [iso, itemType],
        )
      : this.db.exec('SELECT COUNT(*) FROM cards WHERE introduced_at >= ?', [iso]);
    return Number(r[0]!.values[0]![0]);
  }

  export(): Uint8Array {
    return this.db.export();
  }

  deleteCard(itemType: string, itemId: string): void {
    this.db.run('DELETE FROM cards WHERE item_type = ? AND item_id = ?', [itemType, itemId]);
    this.markDirty();
  }

  /**
   * Проверяет, что байты открываются как sqlite и содержат все таблицы `user.db`
   * (см. `migrations.ts`'s `V1_SCHEMA`). Не мутирует текущий инстанс. Никогда не
   * бросает — любая проблема (битые байты, не sqlite, чужая схема) даёт `false`.
   */
  async validateImportBytes(bytes: Uint8Array): Promise<boolean> {
    let check: Database | undefined;
    try {
      const SQL = await loadSqlJs(await this.adapter.readSqlWasm());
      check = new SQL.Database(bytes);
      const version = Number(check.exec('PRAGMA user_version')[0]?.values[0]?.[0] ?? 0);
      if (version > LATEST_VERSION) return false;
      const rows = check.exec("SELECT name FROM sqlite_master WHERE type='table'");
      const tables = new Set((rows[0]?.values ?? []).map((v) => String(v[0])));
      return ['cards', 'review_log', 'settings', 'meta'].every((t) => tables.has(t));
    } catch {
      return false;
    } finally {
      check?.close();
    }
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
      this.persistNow().catch((e) => {
        // Leave `dirty` set so the next markDirty/flush retries this write.
        console.error('user-db: debounced persist failed, will retry', e);
      });
    }, DEBOUNCE_MS);
  }

  private async persistNow(): Promise<void> {
    // Snapshot before the await so a concurrent mutation can't be lost, and
    // clear `dirty` only once the write actually lands.
    const bytes = this.db.export();
    await this.adapter.writeUserDb(bytes);
    this.dirty = false;
  }
}

function rowToObject<T>(columns: string[], values: unknown[]): T {
  const o: Record<string, unknown> = {};
  columns.forEach((c, i) => { o[c] = values[i]; });
  return o as T;
}
