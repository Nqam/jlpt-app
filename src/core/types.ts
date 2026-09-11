/** Код уровня JLPT как строка из content.db, например "N5". Не enum — уровни расширяемы. */
export type LevelCode = string;

/** The three kinds of reviewable SRS content. */
export type ItemType = 'grammar' | 'kanji' | 'vocab';

export interface Level {
  code: LevelCode;
  /** Порядок на ленте: N5 = 1 ... N1 = 5. */
  ord: number;
  /** "available" — контент есть; "coming_soon" — сегмент показан, но пуст. */
  status: 'available' | 'coming_soon';
  titleRu: string;
}

export interface GrammarExample {
  /** Японское предложение в записи фуриганы: "私[わたし]は 学生[がくせい]です。" */
  jaRuby: string;
  /** Перевод на русский. */
  ru: string;
}

export interface GrammarPoint {
  id: string;
  level: LevelCode;
  /** Заголовок пункта, напр. "は (тема предложения)". */
  title: string;
  /** Слой внутри уровня (1..N) — порядок изучения. */
  layer: number;
  tags: string[];
  /** id других пунктов грамматики. */
  related: string[];
  /** Тело объяснения в Markdown (секции ## Кратко / ## Образование / ...). */
  bodyMarkdown: string;
  examples: GrammarExample[];
  /** JLPT kanji appearing in the examples — build-time extracted. Empty from list methods. */
  kanjiIds: string[];
  /** Vocab this point introduces — authored (frontmatter `introduces_vocab`), not
   *  auto-extracted (no Japanese segmentation). Optional: most points won't set
   *  it yet. `undefined`/empty from list methods, same as `kanjiIds` being `[]`. */
  introducesVocab?: string[];
}

export interface RubySegment {
  base: string;
  /** Чтение над кандзи; null для сегментов без фуриганы (кана, пунктуация). */
  ruby: string | null;
}

export interface KanjiPoint {
  id: string;
  level: LevelCode;
  char: string;
  /** Онное чтение (катакана). */
  onyomi: string[];
  /** Кунное чтение (хирагана, "." отделяет окуригану — напр. "まな.ぶ"). */
  kunyomi: string[];
  strokeCount: number;
  meaningRu: string;
}

export interface VocabPoint {
  id: string;
  level: LevelCode;
  headword: string;
  reading: string;
  /** Часть речи в кратком русском обозначении (может быть пустой строкой). */
  pos: string;
  meaningRu: string;
}

export type LessonKind = 'text' | 'dialogue';

export interface LessonQuestion {
  /** Текст вопроса на русском. */
  prompt: string;
  /** 3-4 варианта ответа на русском. */
  choices: string[];
  /** Индекс верного варианта в `choices`. */
  answerIndex: number;
}

export interface LessonMeta {
  id: string;
  /** Сквозной порядок в курсе, тоньше уровней N5/N4. Уникален. */
  stage: number;
  kind: LessonKind;
  title: string;
}

export interface LessonFull extends LessonMeta {
  /** Японское тело в записи фуриганы ("кандзи[чтение]"), абзацы через "\n\n". */
  bodyRuby: string;
  /** Русский перевод, столько же абзацев, сколько в bodyRuby. */
  translationRu: string;
  questions: LessonQuestion[];
}
