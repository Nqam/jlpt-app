import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import initSqlJsFactory from 'sql.js';
import type { SqlJsStatic, Database } from 'sql.js';
import { loadAllGrammar, validateGrammar } from './parse-grammar';
import { loadLevels } from './lists';
import { loadAllKanji, validateKanji } from './kanji';
import { extractGrammarKanji } from './grammar-kanji';
import { loadAllVocab, validateVocab } from './vocab';
import { loadAllLessons, validateLessons } from './lessons';
import type { ParsedLesson } from './lessons';

export interface BuildOpts {
  grammarDir: string;
  levelsYml: string;
  schemaPath: string;
  kanjiDir: string;
  vocabDir: string;
  lessonsDir: string;
  /** По умолчанию — фиксированное значение, чтобы сборка была детерминированной в тестах. */
  contentVersion?: string;
}

let sqlJs: SqlJsStatic | null = null;
function getSqlJsSync(): SqlJsStatic {
  // sql.js init асинхронна из-за загрузки wasm; в Node грузим синхронно из файла.
  if (sqlJs) return sqlJs;
  throw new Error('call initWriter() once before buildContentDb()');
}

export async function initWriter(): Promise<void> {
  if (sqlJs) return;
  sqlJs = await initSqlJsFactory({
    locateFile: () => resolve(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm'),
  });
}

export function buildContentDb(opts: BuildOpts): Uint8Array {
  const SQL = getSqlJsSync();
  const db = new SQL.Database();
  // Схему подаём как есть, включая PRAGMA foreign_keys = ON. Порядок вставки
  // двухпроходный (см. ниже), поэтому FK не нарушаются.
  db.run(readFileSync(opts.schemaPath, 'utf8'));

  const levels = loadLevels(opts.levelsYml).sort((a, b) => a.ord - b.ord);
  const grammar = loadAllGrammar(opts.grammarDir).sort((a, b) => a.id.localeCompare(b.id));

  const errors = validateGrammar(grammar);
  if (errors.length) throw new Error(`grammar validation failed:\n${errors.join('\n')}`);

  const levelCodes = new Set(levels.map((l) => l.code));
  for (const g of grammar) {
    if (!levelCodes.has(g.level)) throw new Error(`grammar ${g.id}: unknown level ${g.level}`);
  }

  const insLevel = db.prepare('INSERT INTO levels (code, ord, status, title_ru) VALUES (?,?,?,?)');
  for (const l of levels) insLevel.run([l.code, l.ord, l.status, l.titleRu]);
  insLevel.free();

  // Кандзи грузим и пишем ДО грамматики: набор их id нужен уже в проходе 1,
  // чтобы вытащить кандзи из примеров (grammar_kanji). Порядок вставки свободен —
  // kanji_points не ссылается на грамматику, а grammar_kanji.kanji_id не FK.
  const kanji = loadAllKanji(opts.kanjiDir).sort((a, b) => a.id.localeCompare(b.id));
  const kanjiErrors = validateKanji(kanji);
  if (kanjiErrors.length) throw new Error(`kanji validation failed:\n${kanjiErrors.join('\n')}`);
  for (const k of kanji) {
    if (!levelCodes.has(k.level)) throw new Error(`kanji ${k.id}: unknown level ${k.level}`);
  }
  const insK = db.prepare(
    'INSERT INTO kanji_points (id, level, char, onyomi_json, kunyomi_json, meaning_ru, stroke_count) VALUES (?,?,?,?,?,?,?)',
  );
  for (const k of kanji) {
    insK.run([
      k.id, k.level, k.char, JSON.stringify(k.onyomi), JSON.stringify(k.kunyomi),
      k.meaningRu, k.strokeCount,
    ]);
  }
  insK.free();
  const kanjiIdSet = new Set(kanji.map((k) => k.id));
  const levelCodeList = levels.map((l) => l.code);

  const grammarIds = new Set(grammar.map((g) => g.id));

  // Проход 1: сами пункты грамматики и их примеры.
  const insG = db.prepare(
    'INSERT INTO grammar_points (id, level, title, layer, tags_json, body_markdown) VALUES (?,?,?,?,?,?)',
  );
  const insE = db.prepare('INSERT INTO grammar_examples (grammar_id, ord, ja_ruby, ru) VALUES (?,?,?,?)');
  const insGK = db.prepare('INSERT INTO grammar_kanji (grammar_id, kanji_id, ord) VALUES (?,?,?)');
  for (const g of grammar) {
    insG.run([g.id, g.level, g.title, g.layer, JSON.stringify(g.tags), g.bodyMarkdown]);
    g.examples.forEach((e, i) => insE.run([g.id, i, e.jaRuby, e.ru]));
    extractGrammarKanji(g.examples, kanjiIdSet, levelCodeList).forEach((kid, i) =>
      insGK.run([g.id, kid, i]),
    );
  }
  insG.free();
  insE.free();
  insGK.free();

  // Проход 2: связи — обе стороны уже существуют, FK не нарушается.
  const insR = db.prepare('INSERT INTO grammar_relations (from_id, to_id) VALUES (?,?)');
  for (const g of grammar) {
    for (const r of [...g.related].sort()) {
      if (grammarIds.has(r)) insR.run([g.id, r]);
    }
  }
  insR.free();

  const vocab = loadAllVocab(opts.vocabDir).sort((a, b) => a.id.localeCompare(b.id));
  const vocabErrors = validateVocab(vocab);
  if (vocabErrors.length) throw new Error(`vocab validation failed:\n${vocabErrors.join('\n')}`);
  for (const v of vocab) {
    if (!levelCodes.has(v.level)) throw new Error(`vocab ${v.id}: unknown level ${v.level}`);
  }
  const insV = db.prepare(
    'INSERT INTO vocab_points (id, level, headword, reading, pos, meaning_ru) VALUES (?,?,?,?,?,?)',
  );
  for (const v of vocab) {
    insV.run([v.id, v.level, v.headword, v.reading, v.pos, v.meaningRu]);
  }
  insV.free();

  const lessons = loadAllLessons(opts.lessonsDir).sort((a, b) => a.id.localeCompare(b.id));
  const lessonErrors = validateLessons(lessons);
  if (lessonErrors.length) throw new Error(`lessons validation failed:\n${lessonErrors.join('\n')}`);
  insertLessons(db, lessons);

  db.run("INSERT INTO meta (key, value) VALUES ('content_version', ?)", [
    opts.contentVersion ?? '0.1.0',
  ]);
  db.run("INSERT INTO meta (key, value) VALUES ('schema_version', '1')");

  const bytes = db.export();
  db.close();
  return bytes;
}

export function insertLessons(db: Database, lessons: ParsedLesson[]): void {
  const insL = db.prepare(
    'INSERT INTO lessons (id, stage, kind, title, body_ruby, translation_ru) VALUES (?,?,?,?,?,?)',
  );
  const insLQ = db.prepare(
    'INSERT INTO lesson_questions (lesson_id, ord, prompt, choices_json, answer_index) VALUES (?,?,?,?,?)',
  );
  for (const l of lessons) {
    insL.run([l.id, l.stage, l.kind, l.title, l.bodyRuby, l.translationRu]);
    l.questions.forEach((q, i) =>
      insLQ.run([l.id, i, q.prompt, JSON.stringify(q.choices), q.answerIndex]),
    );
  }
  insL.free();
  insLQ.free();
}
