import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import initSqlJs from 'sql.js';
import { buildContentDb, initWriter } from '../../scripts/build-content/write-db';

describe('content.db schema', () => {
  it('executes without error and creates expected tables', async () => {
    const SQL = await initSqlJs({
      locateFile: () => resolve(__dirname, '../../node_modules/sql.js/dist/sql-wasm.wasm'),
    });
    const db = new SQL.Database();
    const ddl = readFileSync(resolve(__dirname, '../../scripts/build-content/schema.sql'), 'utf8');
    db.run(ddl);
    const res = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    const tables = res[0]!.values.map((r) => r[0]);
    expect(tables).toEqual([
      'grammar_examples',
      'grammar_kanji',
      'grammar_points',
      'grammar_relations',
      'kanji_points',
      'lesson_questions',
      'lessons',
      'levels',
      'meta',
      'vocab_points',
    ]);
    db.close();
  });
});

const opts = {
  grammarDir: resolve(__dirname, '../../content/grammar'),
  levelsYml: resolve(__dirname, '../../content/levels.yml'),
  schemaPath: resolve(__dirname, '../../scripts/build-content/schema.sql'),
  kanjiDir: resolve(__dirname, '../../content/kanji'),
  vocabDir: resolve(__dirname, '../../content/vocab'),
  lessonsDir: resolve(__dirname, '../../content/lessons'),
};

describe('buildContentDb', () => {
  beforeAll(async () => {
    await initWriter();
  });

  it('produces a db with levels and grammar rows and intact FKs', async () => {
    const bytes = buildContentDb(opts);
    const SQL = await initSqlJs({
      locateFile: () => resolve(__dirname, '../../node_modules/sql.js/dist/sql-wasm.wasm'),
    });
    const db = new SQL.Database(bytes);

    const levels = db.exec('SELECT count(*) FROM levels')[0]!.values[0]![0];
    expect(levels).toBe(5);

    const grammar = db.exec("SELECT count(*) FROM grammar_points WHERE level='N5'")[0]!.values[0]![0];
    expect(grammar).toBe(43);

    const grammarN4 = db.exec("SELECT count(*) FROM grammar_points WHERE level='N4'")[0]!.values[0]![0];
    expect(grammarN4).toBe(50);

    const examples = db.exec('SELECT count(*) FROM grammar_examples')[0]!.values[0]![0] as number;
    expect(examples).toBeGreaterThanOrEqual(24);

    // осиротевших связей нет
    const orphans = db.exec(`
      SELECT count(*) FROM grammar_relations r
      LEFT JOIN grammar_points a ON a.id = r.from_id
      LEFT JOIN grammar_points b ON b.id = r.to_id
      WHERE a.id IS NULL OR b.id IS NULL
    `)[0]!.values[0]![0];
    expect(orphans).toBe(0);

    const version = db.exec("SELECT value FROM meta WHERE key='content_version'")[0]!.values[0]![0];
    expect(String(version)).toMatch(/\d/);

    db.close();
  });

  it('produces a spot-checked N4 grammar row with related titles resolvable', async () => {
    const bytes = buildContentDb(opts);
    const SQL = await initSqlJs({
      locateFile: () => resolve(__dirname, '../../node_modules/sql.js/dist/sql-wasm.wasm'),
    });
    const db = new SQL.Database(bytes);

    const row = db.exec("SELECT title, layer FROM grammar_points WHERE id = 'n4-nara'")[0]!.values[0]!;
    expect(String(row[0])).toContain('なら');
    expect(row[1]).toBe(1);

    db.close();
  });

  it('produces 81 real N5 kanji rows with readings and Russian meanings', async () => {
    const bytes = buildContentDb(opts);
    const SQL = await initSqlJs({
      locateFile: () => resolve(__dirname, '../../node_modules/sql.js/dist/sql-wasm.wasm'),
    });
    const db = new SQL.Database(bytes);

    const count = db.exec("SELECT count(*) FROM kanji_points WHERE level = 'N5'")[0]!.values[0]![0];
    expect(count).toBe(81);

    const row = db.exec("SELECT onyomi_json, kunyomi_json, meaning_ru, stroke_count FROM kanji_points WHERE id = 'n5-学'")[0]!.values[0]!;
    expect(JSON.parse(String(row[0]))).toContain('ガク');
    expect(JSON.parse(String(row[1]))).toContain('まな.ぶ');
    expect(row[2]).toBe('учиться');
    expect(row[3]).toBe(8);

    db.close();
  });

  it('produces 177 real N4 kanji rows with readings and Russian meanings', async () => {
    const bytes = buildContentDb(opts);
    const SQL = await initSqlJs({
      locateFile: () => resolve(__dirname, '../../node_modules/sql.js/dist/sql-wasm.wasm'),
    });
    const db = new SQL.Database(bytes);

    const n4Count = db.exec("SELECT count(*) FROM kanji_points WHERE level = 'N4'")[0]!.values[0]![0];
    expect(n4Count).toBe(177);
    const n5Count = db.exec("SELECT count(*) FROM kanji_points WHERE level = 'N5'")[0]!.values[0]![0];
    expect(n5Count).toBe(81); // unchanged by this task

    const row = db.exec("SELECT onyomi_json, kunyomi_json, meaning_ru, stroke_count FROM kanji_points WHERE id = 'n4-犬'")[0]!.values[0]!;
    expect(JSON.parse(String(row[0]))).toContain('ケン');
    expect(JSON.parse(String(row[1]))).toContain('いぬ');
    expect(row[2]).toBe('собака');
    expect(row[3]).toBe(4);

    db.close();
  });

  it('produces 681 real N5 vocab rows with readings and Russian meanings', async () => {
    const bytes = buildContentDb(opts);
    const SQL = await initSqlJs({
      locateFile: () => resolve(__dirname, '../../node_modules/sql.js/dist/sql-wasm.wasm'),
    });
    const db = new SQL.Database(bytes);

    const count = db.exec("SELECT count(*) FROM vocab_points WHERE level = 'N5'")[0]!.values[0]![0];
    expect(count).toBe(681);

    const row = db.exec("SELECT reading, pos, meaning_ru FROM vocab_points WHERE id = 'n5-学校-がっこう'")[0]!.values[0]!;
    expect(row[0]).toBe('がっこう');
    expect(row[1]).toBe('сущ.');
    expect(row[2]).toBe('школа');

    // the 4 known no-kanji homograph pairs got -2 suffixes, deterministically
    const mou = db.exec("SELECT id, meaning_ru FROM vocab_points WHERE headword = 'もう' ORDER BY id")[0]!.values;
    expect(mou.map((r) => r[0])).toEqual(['n5-もう', 'n5-もう-2']);

    db.close();
  });

  it('produces 625 real N4 vocab rows with readings and Russian meanings', async () => {
    const bytes = buildContentDb(opts);
    const SQL = await initSqlJs({
      locateFile: () => resolve(__dirname, '../../node_modules/sql.js/dist/sql-wasm.wasm'),
    });
    const db = new SQL.Database(bytes);

    // 630 from the Wikibooks N4 list, minus 5 words it also lists at N5
    // (明日/あした, 開く/あく, そう, 上げる/あげる, つける) — deduped so the
    // learner does not get the same word as a second SRS card. See CREDITS.md.
    const n4Count = db.exec("SELECT count(*) FROM vocab_points WHERE level = 'N4'")[0]!.values[0]![0];
    expect(n4Count).toBe(625);
    const n5Count = db.exec("SELECT count(*) FROM vocab_points WHERE level = 'N5'")[0]!.values[0]![0];
    expect(n5Count).toBe(681); // unchanged by this task

    const row = db.exec("SELECT reading, pos, meaning_ru FROM vocab_points WHERE id = 'n4-会議-かいぎ'")[0]!.values[0]!;
    expect(row[0]).toBe('かいぎ');
    expect(row[1]).toBe('сущ.');
    expect(row[2]).toBe('собрание, совещание');

    db.close();
  });

  it('produces 15 lessons migrated from texts, ordered by stage', async () => {
    const bytes = buildContentDb(opts);
    const SQL = await initSqlJs({
      locateFile: () => resolve(__dirname, '../../node_modules/sql.js/dist/sql-wasm.wasm'),
    });
    const db = new SQL.Database(bytes);

    const count = db.exec('SELECT count(*) FROM lessons')[0]!.values[0]![0];
    expect(count).toBe(15);

    const stages = db.exec('SELECT stage FROM lessons ORDER BY stage')[0]!.values.map((r) => r[0]);
    expect(stages).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 42, 44, 46, 48, 50, 52]);

    const row = db.exec(
      "SELECT stage, kind, title, body_ruby FROM lessons WHERE id = 'n5-hanami'",
    )[0]!.values[0]!;
    expect(row[0]).toBe(2);
    expect(row[1]).toBe('text');
    expect(row[2]).toBe('お花見');
    expect(String(row[3])).toContain('桜');

    const qCount = db.exec(
      "SELECT count(*) FROM lesson_questions WHERE lesson_id = 'n5-hanami'",
    )[0]!.values[0]![0];
    expect(qCount).toBe(4);

    // известный вопрос round-trip'ит через write-path: n5-hanami Q1 "Когда цветёт сакура?"
    const q1 = db.exec(
      "SELECT answer_index, choices_json FROM lesson_questions WHERE lesson_id = 'n5-hanami' AND ord = 0",
    )[0]!.values[0]!;
    expect(q1[0]).toBe(0);
    expect((JSON.parse(String(q1[1])) as string[]).length).toBe(4);

    const orphans = db.exec(`
      SELECT count(*) FROM lesson_questions q
      LEFT JOIN lessons l ON l.id = q.lesson_id
      WHERE l.id IS NULL
    `)[0]!.values[0]![0];
    expect(orphans).toBe(0);

    db.close();
  });

  it('is deterministic (two builds give identical bytes)', () => {
    const a = buildContentDb(opts);
    const b = buildContentDb(opts);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });
});
