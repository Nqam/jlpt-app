import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import type { PlatformAdapter } from '@/platform/adapter';
import { ContentDb } from '@/storage/content-db';

// адаптер, читающий собранный resources/content.db с диска
const fakeAdapter: PlatformAdapter = {
  platform: 'desktop',
  async readBundledContentDb() {
    return new Uint8Array(readFileSync(resolve(__dirname, '../../resources/content.db')));
  },
  async readSqlWasm() {
    return new Uint8Array(
      readFileSync(createRequire(import.meta.url).resolve('sql.js/dist/sql-wasm.wasm')),
    );
  },
  async readUserDb() {
    return null;
  },
  async writeUserDb() {
    // no-op: ContentDb tests don't touch the user db
  },
  async exportUserDb() {
    throw new Error('unused');
  },
  async importUserDb() {
    return null;
  },
  async checkForUpdate() {
    return null;
  },
  async openExternal() {},
  async autoBackupUserDb() {},
};

describe('ContentDb', () => {
  let db: ContentDb;
  beforeAll(async () => {
    db = await ContentDb.open(fakeAdapter);
  });

  it('lists levels ordered by ord', () => {
    const levels = db.listLevels();
    expect(levels.map((l) => l.code)).toEqual(['N5', 'N4', 'N3', 'N2', 'N1']);
    expect(levels[2]!.status).toBe('coming_soon');
  });

  it('lists N5 grammar sorted by layer', () => {
    const g = db.listGrammar('N5');
    expect(g).toHaveLength(43);
    for (let i = 1; i < g.length; i++) expect(g[i]!.layer).toBeGreaterThanOrEqual(g[i - 1]!.layer);
  });

  it('gets a full grammar point with examples and resolved related titles', () => {
    const p = db.getGrammar('n5-wa-particle');
    expect(p).not.toBeNull();
    expect(p!.examples.length).toBeGreaterThanOrEqual(3);
    expect(p!.bodyMarkdown).toContain('## Кратко');
    expect(p!.relatedTitles.every((r) => r.title.length > 0)).toBe(true);
  });

  it('returns null for an unknown id', () => {
    expect(db.getGrammar('nope')).toBeNull();
  });

  it('getGrammar().kanjiIds are real kanji ids drawn from the examples', () => {
    // n5-de-particle's examples use 学校/公園/電車/会社… — 学 и 校 есть в content/kanji/n5.tsv
    const p = db.getGrammar('n5-de-particle');
    expect(p).not.toBeNull();
    expect(p!.kanjiIds.length).toBeGreaterThan(0);
    for (const kid of p!.kanjiIds) {
      expect(db.getKanji(kid)).not.toBeNull();
    }
    // 学 стоит в первом примере ("学校[がっこう]で…") и это кандзи N5
    expect(p!.kanjiIds).toContain('n5-学');
    // список-методы кандзи не тянут
    expect(db.listGrammar('N5').every((g) => g.kanjiIds.length === 0)).toBe(true);
  });

  it('lists N4 grammar sorted by layer, independently of N5', () => {
    const g = db.listGrammar('N4');
    expect(g).toHaveLength(50);
    for (let i = 1; i < g.length; i++) expect(g[i]!.layer).toBeGreaterThanOrEqual(g[i - 1]!.layer);
    expect(db.listGrammar('N5')).toHaveLength(43); // unaffected by N4 landing
  });

  it('gets a full N4 grammar point', () => {
    const p = db.getGrammar('n4-nara');
    expect(p).not.toBeNull();
    expect(p!.level).toBe('N4');
    expect(p!.examples.length).toBeGreaterThanOrEqual(3);
  });

  it('listCourseGrammar returns every grammar point in (level, layer, title) order', () => {
    const all = db.listCourseGrammar();
    // every point is present
    const n5 = db.listGrammar('N5').length;
    const n4 = db.listGrammar('N4').length;
    expect(all.length).toBe(n5 + n4);
    // N5 fully precedes N4 (levels.ord)
    const lastN5 = all.map((p) => p.level).lastIndexOf('N5');
    const firstN4 = all.map((p) => p.level).indexOf('N4');
    expect(lastN5).toBeLessThan(firstN4);
    // within a level: non-decreasing layer, then title (SQLite BINARY collation,
    // matching `ORDER BY g.layer, g.title` — code-point order, as `listGrammar` uses)
    const n5only = all.filter((p) => p.level === 'N5');
    for (let i = 1; i < n5only.length; i++) {
      const a = n5only[i - 1]!, b = n5only[i]!;
      expect(a.layer < b.layer || (a.layer === b.layer && a.title <= b.title)).toBe(true);
    }
  });

  it('searches grammar by title, folding Cyrillic case in both directions', () => {
    // SQLite lower() is ASCII-only, so any query whose case differs from the
    // stored title must still match — the filtering has to case-fold in JS.
    const lower = db.searchGrammar('вопрос');
    const upper = db.searchGrammar('ВОПРОС');
    const mixed = db.searchGrammar('Вопрос');
    expect(lower.map((p) => p.id)).toContain('n5-ka-question');
    expect(upper.map((p) => p.id)).toEqual(lower.map((p) => p.id));
    expect(mixed.map((p) => p.id)).toEqual(lower.map((p) => p.id));
  });

  it('counts grammar for a coming-soon level as zero', () => {
    expect(db.grammarCountByLevel('N3')).toBe(0);
  });

  it('lists all 81 N5 kanji sorted by id', () => {
    const k = db.listKanji('N5');
    expect(k).toHaveLength(81);
    for (let i = 1; i < k.length; i++) expect(k[i]!.id >= k[i - 1]!.id).toBe(true);
  });

  it('gets a full kanji point with parsed readings', () => {
    const p = db.getKanji('n5-学');
    expect(p).not.toBeNull();
    expect(p!.char).toBe('学');
    expect(p!.onyomi).toContain('ガク');
    expect(p!.kunyomi).toContain('まな.ぶ');
    expect(p!.meaningRu).toBe('учиться');
    expect(p!.strokeCount).toBe(8);
  });

  it('returns null for an unknown kanji id', () => {
    expect(db.getKanji('nope')).toBeNull();
  });

  it('searches kanji by meaning, character, and reading', () => {
    expect(db.searchKanji('учиться').map((k) => k.id)).toContain('n5-学');
    expect(db.searchKanji('学').map((k) => k.id)).toContain('n5-学');
    expect(db.searchKanji('ガク').map((k) => k.id)).toContain('n5-学');
    expect(db.searchKanji('')).toEqual([]);
  });

  it('lists all 177 N4 kanji sorted by id, independently of N5', () => {
    const n4 = db.listKanji('N4');
    expect(n4).toHaveLength(177);
    for (let i = 1; i < n4.length; i++) expect(n4[i]!.id >= n4[i - 1]!.id).toBe(true);
    expect(db.listKanji('N5')).toHaveLength(81); // unaffected by N4 landing
  });

  it('gets a full N4 kanji point with parsed readings', () => {
    const p = db.getKanji('n4-犬');
    expect(p).not.toBeNull();
    expect(p!.char).toBe('犬');
    expect(p!.level).toBe('N4');
    expect(p!.onyomi).toContain('ケン');
    expect(p!.kunyomi).toContain('いぬ');
    expect(p!.meaningRu).toBe('собака');
    expect(p!.strokeCount).toBe(4);
  });

  it('searches across levels and returns N4 hits alongside N5 ones', () => {
    // 'лекарство' matches only N4's 薬; no N5 kanji shares that meaning,
    // so this also proves search is not accidentally scoped to one level.
    const hits = db.searchKanji('лекарство');
    expect(hits.map((k) => k.id)).toContain('n4-薬');
  });

  it('case-folds an uppercase Cyrillic query the same as lowercase', () => {
    const lower = db.searchKanji('собака');
    const upper = db.searchKanji('СОБАКА');
    expect(upper.map((k) => k.id)).toEqual(lower.map((k) => k.id));
    expect(upper.map((k) => k.id)).toContain('n4-犬');
  });

  it('lists all 681 N5 vocab entries sorted by id', () => {
    const v = db.listVocab('N5');
    expect(v).toHaveLength(681);
    for (let i = 1; i < v.length; i++) expect(v[i]!.id >= v[i - 1]!.id).toBe(true);
  });

  it('gets a full vocab point', () => {
    const p = db.getVocab('n5-学校-がっこう');
    expect(p).not.toBeNull();
    expect(p!.headword).toBe('学校');
    expect(p!.reading).toBe('がっこう');
    expect(p!.pos).toBe('сущ.');
    expect(p!.meaningRu).toBe('школа');
  });

  it('returns null for an unknown vocab id', () => {
    expect(db.getVocab('nope')).toBeNull();
  });

  it('resolves the -2 suffixed homograph for a kana-only word with two senses', () => {
    const first = db.getVocab('n5-もう');
    const second = db.getVocab('n5-もう-2');
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first!.meaningRu).not.toBe(second!.meaningRu);
  });

  it('searches vocab by headword, reading, and meaning', () => {
    expect(db.searchVocab('がっこう').map((v) => v.id)).toContain('n5-学校-がっこう');
    expect(db.searchVocab('школа').map((v) => v.id)).toContain('n5-学校-がっこう');
    expect(db.searchVocab('学校').map((v) => v.id)).toContain('n5-学校-がっこう');
    expect(db.searchVocab('')).toEqual([]);
  });

  it('case-folds an uppercase Cyrillic vocab query the same as lowercase', () => {
    const lower = db.searchVocab('школа');
    const upper = db.searchVocab('ШКОЛА');
    expect(upper.map((v) => v.id)).toEqual(lower.map((v) => v.id));
  });

  it('lists all 625 N4 vocab entries sorted by id, independently of N5', () => {
    const n4 = db.listVocab('N4');
    expect(n4).toHaveLength(625); // 630 Wikibooks minus 5 deduped vs N5 (see CREDITS.md)
    for (let i = 1; i < n4.length; i++) expect(n4[i]!.id >= n4[i - 1]!.id).toBe(true);
    expect(db.listVocab('N5')).toHaveLength(681); // unaffected by N4 landing
  });

  it('gets a full N4 vocab point', () => {
    const p = db.getVocab('n4-会議-かいぎ');
    expect(p).not.toBeNull();
    expect(p!.level).toBe('N4');
    expect(p!.reading).toBe('かいぎ');
    expect(p!.pos).toBe('сущ.');
    expect(p!.meaningRu).toBe('собрание, совещание');
  });

  it('searches vocab across levels and returns N4 hits alongside N5 ones', () => {
    // "школа" matches N5's 学校 plus N4's 小学校/中学校/高校/高等学校 -- proves search
    // is not accidentally scoped to one level, same pattern as searchKanji's N4 test.
    const hits = db.searchVocab('школа');
    expect(hits.map((v) => v.id)).toContain('n5-学校-がっこう');
    expect(hits.map((v) => v.id)).toContain('n4-小学校-しょうがっこう');
    expect(hits.length).toBe(5);
  });

  it('lists all 15 lessons ordered by (stage, id)', () => {
    const ls = db.listLessons();
    expect(ls).toHaveLength(15);
    for (let i = 1; i < ls.length; i++) {
      expect(ls[i]!.stage).toBeGreaterThanOrEqual(ls[i - 1]!.stage);
    }
    expect(ls[0]!.id).toBe('n5-hanami');
    expect(ls[0]!.stage).toBe(2);
    // 15 мигрированных текстов — свободное чтение
    expect(ls.every((l) => l.isFreeReading && l.introducesCount === 0)).toBe(true);
  });

  it('gets a full lesson with body, translation, questions and empty introduces/markers', () => {
    const l = db.getLesson('n5-hanami');
    expect(l).not.toBeNull();
    expect(l!.title).toBe('お花見');
    expect(l!.kind).toBe('text');
    expect(l!.stage).toBe(2);
    expect(l!.bodyRuby).toContain('桜');
    expect(l!.translationRu).toContain('сакура');
    expect(l!.questions).toHaveLength(4);
    expect(l!.questions[0]!.choices.length).toBeGreaterThanOrEqual(3);
    expect(typeof l!.questions[0]!.answerIndex).toBe('number');
    expect(l!.introduces).toEqual([]);
    expect(l!.markers).toEqual([]);
  });

  it('returns null for an unknown lesson id', () => {
    expect(db.getLesson('nope')).toBeNull();
  });

  it('gets a migrated N4 lesson', () => {
    const l = db.getLesson('n4-onsen');
    expect(l).not.toBeNull();
    expect(l!.stage).toBe(52);
    expect(l!.kind).toBe('text');
    expect(l!.questions.length).toBeGreaterThanOrEqual(3);
  });
});
