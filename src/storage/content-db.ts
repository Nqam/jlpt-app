import type { Database } from 'sql.js';
import type { PlatformAdapter } from '@/platform/adapter';
import type {
  GrammarPoint, KanjiPoint, Level, LevelCode, VocabPoint,
  LessonMeta, LessonFull,
} from '@/core/types';
import { loadSqlJs } from './sqljs';

export type GrammarPointFull = GrammarPoint & {
  relatedTitles: { id: string; title: string }[];
};

interface GrammarListRow {
  id: string;
  level: string;
  title: string;
  layer: number;
  tags_json: string;
}

type GrammarRow = GrammarListRow & { body_markdown: string };

interface KanjiRow {
  id: string;
  level: string;
  char: string;
  onyomi_json: string;
  kunyomi_json: string;
  meaning_ru: string;
  stroke_count: number;
}

interface VocabRow {
  id: string;
  level: string;
  headword: string;
  reading: string;
  pos: string;
  meaning_ru: string;
}

interface LessonMetaRow {
  id: string;
  stage: number;
  kind: string;
  title: string;
}

interface LessonRow {
  id: string;
  stage: number;
  kind: string;
  title: string;
  body_ruby: string;
  translation_ru: string;
}

interface LessonQuestionRow {
  prompt: string;
  choices_json: string;
  answer_index: number;
}

/** Колонки для списков/поиска — без тяжёлого body_markdown (полный скан на каждое нажатие). */
const LIST_COLS = 'id, level, title, layer, tags_json';
/** Полный набор — только для getGrammar. */
const FULL_COLS = `${LIST_COLS}, body_markdown`;

export class ContentDb {
  private constructor(private readonly db: Database) {}

  static async open(adapter: PlatformAdapter): Promise<ContentDb> {
    const [bytes, wasmBytes] = await Promise.all([
      adapter.readBundledContentDb(),
      adapter.readSqlWasm(),
    ]);
    const SQL = await loadSqlJs(wasmBytes);
    return new ContentDb(new SQL.Database(bytes));
  }

  private all<T>(sql: string, params: unknown[] = []): T[] {
    const stmt = this.db.prepare(sql);
    stmt.bind(params as never);
    const rows: T[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject() as T);
    stmt.free();
    return rows;
  }

  listLevels(): Level[] {
    return this.all<{ code: string; ord: number; status: string; title_ru: string }>(
      'SELECT code, ord, status, title_ru FROM levels ORDER BY ord',
    ).map((r) => ({
      code: r.code,
      ord: r.ord,
      status: r.status as Level['status'],
      titleRu: r.title_ru,
    }));
  }

  private rowToPoint(r: GrammarListRow): GrammarPoint {
    return {
      id: r.id,
      level: r.level,
      title: r.title,
      layer: r.layer,
      tags: JSON.parse(r.tags_json) as string[],
      related: [],
      bodyMarkdown: '',
      examples: [],
      kanjiIds: [],
    };
  }

  listGrammar(level: LevelCode): GrammarPoint[] {
    return this.all<GrammarListRow>(
      `SELECT ${LIST_COLS} FROM grammar_points WHERE level = ? ORDER BY layer, title`,
      [level],
    ).map((r) => this.rowToPoint(r));
  }

  /** Every grammar point, in course order: level ord, then layer, then title. */
  listCourseGrammar(): GrammarPoint[] {
    return this.all<GrammarListRow>(
      `SELECT g.id, g.level, g.title, g.layer, g.tags_json
         FROM grammar_points g JOIN levels l ON l.code = g.level
        ORDER BY l.ord, g.layer, g.title`,
    ).map((r) => this.rowToPoint(r));
  }

  grammarCountByLevel(level: LevelCode): number {
    const r = this.all<{ n: number }>(
      'SELECT count(*) AS n FROM grammar_points WHERE level = ?',
      [level],
    );
    return r[0]?.n ?? 0;
  }

  getGrammar(id: string): GrammarPointFull | null {
    const rows = this.all<GrammarRow>(
      `SELECT ${FULL_COLS} FROM grammar_points WHERE id = ?`,
      [id],
    );
    const row = rows[0];
    if (!row) return null;
    const point = this.rowToPoint(row);
    point.bodyMarkdown = row.body_markdown;
    point.examples = this.all<{ ja_ruby: string; ru: string }>(
      'SELECT ja_ruby, ru FROM grammar_examples WHERE grammar_id = ? ORDER BY ord',
      [id],
    ).map((e) => ({ jaRuby: e.ja_ruby, ru: e.ru }));
    point.kanjiIds = this.all<{ kanji_id: string }>(
      'SELECT kanji_id FROM grammar_kanji WHERE grammar_id = ? ORDER BY ord',
      [id],
    ).map((r) => r.kanji_id);
    point.introducesVocab = this.all<{ vocab_id: string }>(
      'SELECT vocab_id FROM grammar_vocab WHERE grammar_id = ? ORDER BY ord',
      [id],
    ).map((r) => r.vocab_id);
    const related = this.all<{ id: string; title: string }>(
      `SELECT p.id AS id, p.title AS title
       FROM grammar_relations r JOIN grammar_points p ON p.id = r.to_id
       WHERE r.from_id = ? ORDER BY p.layer, p.title`,
      [id],
    );
    point.related = related.map((r) => r.id);
    return { ...point, relatedTitles: related };
  }

  searchGrammar(query: string): GrammarPoint[] {
    // SQLite's lower() is ASCII-only, so it silently fails to case-fold Cyrillic.
    // Filter in JS instead — the table is tiny (~8 rows now, ~150 at most ever).
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return this.all<GrammarListRow>(
      `SELECT ${LIST_COLS} FROM grammar_points ORDER BY level, layer`,
    )
      .filter((r) => r.title.toLowerCase().includes(q))
      .map((r) => this.rowToPoint(r));
  }

  private rowToKanji(r: KanjiRow): KanjiPoint {
    return {
      id: r.id,
      level: r.level,
      char: r.char,
      onyomi: JSON.parse(r.onyomi_json) as string[],
      kunyomi: JSON.parse(r.kunyomi_json) as string[],
      strokeCount: r.stroke_count,
      meaningRu: r.meaning_ru,
    };
  }

  listKanji(level: LevelCode): KanjiPoint[] {
    return this.all<KanjiRow>('SELECT * FROM kanji_points WHERE level = ? ORDER BY id', [level]).map((r) => this.rowToKanji(r));
  }

  getKanji(id: string): KanjiPoint | null {
    const rows = this.all<KanjiRow>('SELECT * FROM kanji_points WHERE id = ?', [id]);
    return rows[0] ? this.rowToKanji(rows[0]) : null;
  }

  searchKanji(query: string): KanjiPoint[] {
    // SQLite's lower() is ASCII-only, so it silently fails to case-fold Cyrillic.
    // Filter in JS instead — the table is tiny (~150 kanji at most).
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return this.all<KanjiRow>('SELECT * FROM kanji_points ORDER BY level, id')
      .map((r) => this.rowToKanji(r))
      .filter(
        (k) =>
          k.char.includes(q) ||
          k.meaningRu.toLowerCase().includes(q) ||
          k.onyomi.some((r2) => r2.toLowerCase().includes(q)) ||
          k.kunyomi.some((r2) => r2.toLowerCase().includes(q)),
      );
  }

  private rowToVocab(r: VocabRow): VocabPoint {
    return {
      id: r.id,
      level: r.level,
      headword: r.headword,
      reading: r.reading,
      pos: r.pos,
      meaningRu: r.meaning_ru,
    };
  }

  listVocab(level: LevelCode): VocabPoint[] {
    return this.all<VocabRow>('SELECT * FROM vocab_points WHERE level = ? ORDER BY id', [level]).map((r) =>
      this.rowToVocab(r),
    );
  }

  getVocab(id: string): VocabPoint | null {
    const rows = this.all<VocabRow>('SELECT * FROM vocab_points WHERE id = ?', [id]);
    return rows[0] ? this.rowToVocab(rows[0]) : null;
  }

  searchVocab(query: string): VocabPoint[] {
    // SQLite's lower() is ASCII-only — filter in JS, same pattern as searchKanji/searchGrammar.
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return this.all<VocabRow>('SELECT * FROM vocab_points ORDER BY level, id')
      .map((r) => this.rowToVocab(r))
      .filter(
        (v) =>
          v.headword.toLowerCase().includes(q) ||
          v.reading.toLowerCase().includes(q) ||
          v.meaningRu.toLowerCase().includes(q),
      );
  }

  listLessons(): LessonMeta[] {
    return this.all<LessonMetaRow>(
      'SELECT id, stage, kind, title FROM lessons ORDER BY stage, id',
    ).map((r) => ({
      id: r.id,
      stage: r.stage,
      kind: r.kind as LessonMeta['kind'],
      title: r.title,
    }));
  }

  getLesson(id: string): LessonFull | null {
    const rows = this.all<LessonRow>(
      'SELECT id, stage, kind, title, body_ruby, translation_ru FROM lessons WHERE id = ?',
      [id],
    );
    const row = rows[0];
    if (!row) return null;

    const questions = this.all<LessonQuestionRow>(
      'SELECT prompt, choices_json, answer_index FROM lesson_questions WHERE lesson_id = ? ORDER BY ord',
      [id],
    ).map((q) => ({
      prompt: q.prompt,
      choices: JSON.parse(q.choices_json) as string[],
      answerIndex: q.answer_index,
    }));

    return {
      id: row.id,
      stage: row.stage,
      kind: row.kind as LessonFull['kind'],
      title: row.title,
      bodyRuby: row.body_ruby,
      translationRu: row.translation_ru,
      questions,
    };
  }
}
