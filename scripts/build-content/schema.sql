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

CREATE TABLE texts (
  id             TEXT PRIMARY KEY,
  level          TEXT NOT NULL REFERENCES levels(code),
  title          TEXT NOT NULL,
  body_ruby      TEXT NOT NULL,
  translation_ru TEXT NOT NULL
);
CREATE INDEX idx_texts_level ON texts(level);

CREATE TABLE text_questions (
  text_id      TEXT NOT NULL REFERENCES texts(id),
  ord          INTEGER NOT NULL,
  prompt       TEXT NOT NULL,
  choices_json TEXT NOT NULL,
  answer_index INTEGER NOT NULL,
  PRIMARY KEY (text_id, ord)
);

CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
