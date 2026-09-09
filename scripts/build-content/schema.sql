PRAGMA foreign_keys = ON;

CREATE TABLE levels (
  code    TEXT PRIMARY KEY,
  ord     INTEGER NOT NULL,
  status  TEXT NOT NULL CHECK (status IN ('available', 'coming_soon')),
  title_ru TEXT NOT NULL
);

CREATE TABLE grammar_points (
  id            TEXT PRIMARY KEY,
  level         TEXT NOT NULL REFERENCES levels(code),
  title         TEXT NOT NULL,
  layer         INTEGER NOT NULL,
  tags_json     TEXT NOT NULL DEFAULT '[]',
  body_markdown TEXT NOT NULL
);
CREATE INDEX idx_grammar_level ON grammar_points(level, layer);

CREATE TABLE grammar_examples (
  grammar_id TEXT NOT NULL REFERENCES grammar_points(id),
  ord        INTEGER NOT NULL,
  ja_ruby    TEXT NOT NULL,
  ru         TEXT NOT NULL,
  PRIMARY KEY (grammar_id, ord)
);

CREATE TABLE grammar_relations (
  from_id TEXT NOT NULL REFERENCES grammar_points(id),
  to_id   TEXT NOT NULL REFERENCES grammar_points(id),
  PRIMARY KEY (from_id, to_id)
);

-- Кандзи JLPT, встречающиеся в примерах пункта грамматики (извлекаются на сборке).
-- kanji_id намеренно НЕ внешний ключ: сборка уже доказала существование id,
-- а отсутствие FK снимает ограничение на порядок вставки относительно kanji_points.
CREATE TABLE grammar_kanji (
  grammar_id TEXT NOT NULL REFERENCES grammar_points(id),
  kanji_id   TEXT NOT NULL,
  ord        INTEGER NOT NULL,
  PRIMARY KEY (grammar_id, kanji_id)
);

CREATE TABLE kanji_points (
  id            TEXT PRIMARY KEY,
  level         TEXT NOT NULL REFERENCES levels(code),
  char          TEXT NOT NULL,
  onyomi_json   TEXT NOT NULL,
  kunyomi_json  TEXT NOT NULL,
  meaning_ru    TEXT NOT NULL,
  stroke_count  INTEGER NOT NULL
);
CREATE INDEX idx_kanji_level ON kanji_points(level);

CREATE TABLE vocab_points (
  id          TEXT PRIMARY KEY,
  level       TEXT NOT NULL REFERENCES levels(code),
  headword    TEXT NOT NULL,
  reading     TEXT NOT NULL,
  pos         TEXT NOT NULL,
  meaning_ru  TEXT NOT NULL
);
CREATE INDEX idx_vocab_level ON vocab_points(level);

CREATE TABLE lessons (
  id             TEXT PRIMARY KEY,
  stage          INTEGER NOT NULL,
  kind           TEXT    NOT NULL,           -- 'text' | 'dialogue'
  title          TEXT    NOT NULL,
  body_ruby      TEXT    NOT NULL,           -- inline-маркеры развёрнуты
  translation_ru TEXT    NOT NULL
);
CREATE INDEX ix_lessons_stage ON lessons(stage);

CREATE TABLE lesson_questions (
  lesson_id    TEXT    NOT NULL,
  ord          INTEGER NOT NULL,
  prompt       TEXT    NOT NULL,
  choices_json TEXT    NOT NULL,
  answer_index INTEGER NOT NULL,
  PRIMARY KEY (lesson_id, ord)
);

CREATE TABLE lesson_introduces (
  lesson_id TEXT    NOT NULL,
  item_type TEXT    NOT NULL,                -- 'grammar' | 'kanji' | 'vocab'
  item_id   TEXT    NOT NULL,
  role      TEXT    NOT NULL,                -- 'introduce' | 'review'
  ord       INTEGER NOT NULL,
  PRIMARY KEY (lesson_id, item_type, item_id)
);

CREATE TABLE lesson_markers (
  lesson_id     TEXT    NOT NULL,
  item_type     TEXT    NOT NULL,
  item_id       TEXT    NOT NULL,
  ord           INTEGER NOT NULL,
  surface       TEXT    NOT NULL,
  sentence_ruby TEXT    NOT NULL,
  sentence_ru   TEXT    NOT NULL,            -- может быть ''
  PRIMARY KEY (lesson_id, item_type, item_id)
);

CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
