# План 5-1: модель контента уроков + пайплайн + миграция — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перевести раздел «Тексты» на модель `Lesson` (текст **или** диалог + теги «что урок вводит/закрепляет» + inline-маркеры пунктов), пересобрать `content.db` на новых таблицах `lessons`/`lesson_questions`/`lesson_introduces`/`lesson_markers`, мигрировать 15 существующих текстов в `content/lessons/*.md` со сквозным порядком `stage`, и оставить переходные экраны `/texts` работающими на новых данных без регресса. Плеер урока и связь с SRS — планы 5-2 и 5-3, здесь не трогаются.

**Architecture:** Контент переезжает из `content/texts/<level>/*.md` в плоский `content/lessons/*.md`. Формат файла — надстройка над текущим текстовым: те же секции `## Текст` / `## Перевод` / `## Вопросы` и тот же формат вопросов, но `level` заменён на `stage` (integer, сквозной порядок тоньше уровней) + `kind` (`text` | `dialogue`) + четыре списка тегов во frontmatter (`introduces_grammar`, `introduces_vocab`, `introduces_kanji`, `reviews`). В теле `## Текст` автор помечает **первое** вхождение вводимого пункта inline-маркером `{{TYPE:id|видимый текст}}` (`TYPE ∈ v | g | k`). Новый парсер `scripts/build-content/lessons.ts` зеркалит `parse-texts.ts`, дополнительно извлекая маркеры (с предложением-контекстом) и разворачивая их в теле. `content.db` не в git и собирается заново — таблицы `texts`/`text_questions` **заменяются** на `lessons` + три новые таблицы, миграции схемы content.db не нужно. `ContentDb` получает `listLessons()` / `getLesson(id)` вместо `listTexts`/`getText`. Одноразовый скрипт `scripts/migrate-texts-to-lessons.ts` конвертирует 15 текстов (проставляет `stage` вручную, `kind: text`, пустые теги). Переходные экраны `TextsListScreen`/`TextDetailScreen` и роуты `/texts`, `/texts/:id` остаются до плана 5-2 — они читают уроки как тексты, а вкладки уровней в списке держатся на временном сдвиге по `stage` (`stage < 40 → N5`, иначе `N4`).

**Tech Stack:** Новых зависимостей нет. `gray-matter` (frontmatter, чтение и запись), `sql.js` (content.db), React + `react-router-dom`, существующий `Furigana`/`parseRuby`, тулчейн проекта — Vitest / Playwright / ESLint / tsc. Node 24 доступен в PATH напрямую (`node`, `npm`, `npx`, `npx tsx`) — префикс `export PATH=...` из прошлых планов больше **не нужен**. Рабочий каталог всех команд — `C:\Users\am200\Documents\ClaudeWork\jlpt-app`.

**Spec:** `docs/superpowers/specs/2026-09-08-plan-5-graded-reading-course-design.md` (общий дизайн плана 5; раздел «План 5-1» и §1 — предмет этого плана).

## Global Constraints

- **Формат фуриганы** — `кандзи[чтение]` ровно как в `content/grammar/**/*.md` и `content/texts/**/*.md`, парсится `src/core/ruby.ts` (`parseRuby`): база чтения — только замыкающая цепочка кандзи перед `[`; кана между словами рвёт цепочку; между бунсэцу — литеральный пробел. Парсер `parseRuby` **не меняется**.
- **Один абзац `## Текст` / `## Перевод` = одна физическая строка** в исходном `.md` (без ручных переносов внутри абзаца); абзацы разделены пустой строкой. Это держит `bodyRuby`/`translationRu` делимыми по `"\n\n"` без «голых» `"\n"` внутри абзаца. Для `kind: dialogue` одна реплика (одна строка с префиксом говорящего) = один абзац, разделены пустой строкой.
- **Вопросы на понимание** пишутся и отвечаются **на русском** (и `prompt`, и `choices`). Ровно один `[x]` на вопрос; 3 или 4 варианта; 3 или 4 вопроса на урок. Проверяется и на уровне файла (структурные throw в `parseLessonFile`), и коллекцией (`validateLessons`).
- **Inline-маркер**: `{{TYPE:id|surface}}`, `TYPE ∈ v | g | k` (vocab / grammar / kanji). `id` не содержит `|`; `surface` не содержит `}}`. Помечается **только первое** вхождение пункта за урок — повтор `(тип, id)` в одном уроке = ошибка сборки. Каждый `id` маркера и каждый `id` в `introduces_*` / `reviews` обязан резолвиться в соответствующей таблице content.db — иначе сборка падает. `id` маркера обязан присутствовать в `introduces_*` **или** `reviews` того же урока.
- **`stage`** — положительное целое, **уникальное** среди всех уроков (жёсткая ошибка при коллизии — порядок курса `(stage, id)` должен быть полностью детерминирован). Курс = все `lessons` по `(stage, id)`.
- **`kind`** ∈ `{'text', 'dialogue'}`. Для `dialogue` каждая строка (абзац) тела `## Текст` начинается с префикса говорящего по маске `^[A-Za-zА-Яа-я]{1,8}:\s` (например `A: おはよう。` / `Аня: おはよう。`).
- **Паритет абзацев**: `bodyRuby.split('\n\n').length === translationRu.split('\n\n').length` для каждого урока — иначе ошибка.
- **content.db не под контролем git и собирается заново** каждой сборкой — таблицы `texts`/`text_questions` **удаляются** из схемы, не переименовываются с сохранением данных; никакой миграции содержимого content.db.
- **Пользовательская настройка `texts_read_ids`** в плане 5-1 **не трогается** — переходные экраны продолжают писать/читать её как сейчас. Миграция ключа в `course_completed_ids` — план 5-3.
- **Атрибуция контента** (`content/CREDITS.md`) — весь японский текст, перевод и вопросы 15 текстов уже атрибутированы (собственная авторская проза, сюжеты общественного достояния); миграция контент **не меняет**, только оборачивает во frontmatter уроков. Раздел CREDITS правится минимально (одна строка-итог).
- **Базовая линия (замерено при написании плана, `npx vitest run` на текущем состоянии):** 51 файл тестов, **397 тестов, все зелёные**. `tests/e2e/*.spec.ts` — 19 файлов. Каждая задача ниже указывает, сколько тестов добавляет/меняет; финальная задача перезамеряет обе цифры и печатает фактические, а не сверяется с заранее вписанным числом.
- **Полная регрессия (задача 5)** обязана прогнать `npm run typecheck && npm run lint && npm run build-content && npx vitest run && npm run build && npx playwright test && npm run build:desktop:installer` — не только vitest+playwright (урок прошлых сессий: ошибки только typecheck/lint всплывали лишь на финальном ревью). Задача 6 (CSS + e2e) добавляет фокусную перепроверку: `npm run typecheck && npm run lint && npx vitest run` + затронутые e2e.

---

## File Structure

```
src/core/
  types.ts                          # MODIFIED — убрать TextPoint/TextQuestion; добавить Lesson* типы

scripts/build-content/
  schema.sql                        # MODIFIED — texts/text_questions -> lessons + 3 новые таблицы
  lessons.ts                        # NEW — parseLessonFile/loadAllLessons/validateLessons/validateLessonRefs
  parse-texts.ts                    # DELETED (задача 5)
  write-db.ts                       # MODIFIED — lessonsDir в BuildOpts; insertLessons + кросс-валидация; убрать texts
  index.ts                          # MODIFIED — lessonsDir -> content/lessons; убрать textsDir

scripts/
  migrate-texts-to-lessons.ts       # NEW — одноразовый: content/texts/**/*.md -> content/lessons/*.md

content/
  lessons/                          # NEW — 15 плоских .md (результат прогона миграции)
    n5-hanami.md ... n4-onsen.md
  texts/                            # DELETED (задача 5)
  CREDITS.md                        # MODIFIED — строка-итог раздела «Тексты»

src/storage/
  content-db.ts                     # MODIFIED — listTexts/getText -> listLessons/getLesson + сборка LessonFull

src/ui/
  theme.css                         # MODIFIED — интерактив/кнопки вписаны в окно (задача 6)
  screens/
    TextsListScreen.tsx             # MODIFIED — listLessons + сдвиг stage->level; роут тот же
    TextDetailScreen.tsx            # MODIFIED — getLesson вместо getText

tests/
  fixtures/
    lessons/
      lesson-text-valid.md          # NEW
      lesson-dialogue-valid.md      # NEW
      lesson-missing-section.md     # NEW
    text-valid.md                   # DELETED (задача 5)
    text-missing-section.md         # DELETED (задача 5)
  scripts/
    lessons.test.ts                 # NEW — парсер уроков (заменяет parse-texts.test.ts)
    lessons-crossref.test.ts        # NEW — validateLessonRefs (кросс-ссылки id)
    parse-texts.test.ts             # DELETED (задача 5)
    build-content.test.ts           # MODIFIED — схема + «15 уроков» вместо «15 текстов»
  storage/
    content-db.test.ts              # MODIFIED — listLessons/getLesson вместо listTexts/getText
  ui/
    TextsListScreen.test.tsx        # MODIFIED — мок listLessons; уровни через stage
    TextDetailScreen.test.tsx       # MODIFIED — мок getLesson
  e2e/
    texts-browse.spec.ts            # MODIFIED — задача 4 (данные) + задача 6 (тест узкого окна)
```

---

### Task 1: типы `Lesson*`, схема `content.db`, парсер `lessons.ts`

Чисто аддитивная задача: `texts`/`text_questions` и `TextPoint`/`TextQuestion` **пока остаются**, `lessons.ts` — новый файл рядом с `parse-texts.ts`. По завершении компиляция и все существующие тесты зелёные, плюс новый `tests/scripts/lessons.test.ts`.

**Files:**
- Modify: `src/core/types.ts` (добавить блок `Lesson*` в конец, ничего не удаляя)
- Modify: `scripts/build-content/schema.sql` (заменить блок `texts`/`text_questions` на `lessons` + 3 таблицы)
- Modify: `tests/scripts/build-content.test.ts` (только список таблиц в тесте схемы)
- Create: `scripts/build-content/lessons.ts`
- Create: `tests/fixtures/lessons/lesson-text-valid.md`
- Create: `tests/fixtures/lessons/lesson-dialogue-valid.md`
- Create: `tests/fixtures/lessons/lesson-missing-section.md`
- Test: `tests/scripts/lessons.test.ts`

**Interfaces:**
- Consumes: `parseRuby` из `src/core/ruby.ts` (`(input: string) => RubySegment[]`, бросает на битой скобке); `ItemType` из `src/core/types.ts` (`'grammar' | 'kanji' | 'vocab'`).
- Produces (для задач 2 и 3):
  - `src/core/types.ts`:
    - `type LessonKind = 'text' | 'dialogue'`
    - `type LessonItemRole = 'introduce' | 'review'`
    - `interface LessonQuestion { prompt: string; choices: string[]; answerIndex: number }`
    - `interface LessonIntroduce { type: ItemType; id: string; role: LessonItemRole }`
    - `interface LessonMarker { type: ItemType; id: string; surface: string; sentenceRuby: string; sentenceRu: string }`
    - `interface LessonMeta { id: string; stage: number; kind: LessonKind; title: string; introducesCount: number; isFreeReading: boolean }`
    - `interface LessonFull extends LessonMeta { bodyRuby: string; translationRu: string; questions: LessonQuestion[]; introduces: LessonIntroduce[]; markers: LessonMarker[] }`
  - `scripts/build-content/lessons.ts`:
    - `interface ParsedLesson { id: string; stage: number; kind: LessonKind; title: string; bodyRuby: string; translationRu: string; questions: LessonQuestion[]; introduces: { type: ItemType; id: string }[]; reviews: string[]; markers: { type: ItemType; id: string; surface: string; sentenceRuby: string; sentenceRu: string }[] }`
    - `parseLessonFile(path: string): ParsedLesson` — бросает `Error` с сообщением, содержащим путь и битый элемент.
    - `loadAllLessons(dir: string): ParsedLesson[]` — плоский каталог `*.md`, `[]` для отсутствующего каталога.
    - `validateLessons(lessons: ParsedLesson[]): string[]` — коллекционные проверки без внешних множеств; `[]` если чисто.
    - `validateLessonRefs(lessons: ParsedLesson[], sets: { grammar: Set<string>; kanji: Set<string>; vocab: Set<string> }): string[]` — резолв `introduces`/`reviews`/маркеров в множествах id; `[]` если чисто.
  - DDL таблиц `lessons`, `lesson_questions`, `lesson_introduces`, `lesson_markers` (см. шаг 2).

- [ ] **Step 1: добавить типы `Lesson*` в `src/core/types.ts`**

Дописать в **конец** `src/core/types.ts` (после `TextPoint`, ничего не удаляя — `TextPoint`/`TextQuestion` уберём в задаче 5):

```typescript
export type LessonKind = 'text' | 'dialogue';
export type LessonItemRole = 'introduce' | 'review';

export interface LessonQuestion {
  /** Текст вопроса на русском. */
  prompt: string;
  /** 3-4 варианта ответа на русском. */
  choices: string[];
  /** Индекс верного варианта в `choices`. */
  answerIndex: number;
}

export interface LessonIntroduce {
  type: ItemType;
  id: string;
  role: LessonItemRole;
}

export interface LessonMarker {
  type: ItemType;
  id: string;
  /** Видимый текст inline-маркера в теле урока (по нему рендер вешает тап-обработчик). */
  surface: string;
  /** Предложение из тела, содержащее маркер, в записи фуриганы (маркеры развёрнуты). */
  sentenceRuby: string;
  /** Соответствующий абзац перевода, если однозначен; иначе "". */
  sentenceRu: string;
}

export interface LessonMeta {
  id: string;
  /** Сквозной порядок в курсе, тоньше уровней N5/N4. Уникален. */
  stage: number;
  kind: LessonKind;
  title: string;
  /** Число пунктов с role='introduce'. 0 — свободное чтение. */
  introducesCount: number;
  /** `introducesCount === 0` — урок не гейтит прогресс курса. */
  isFreeReading: boolean;
}

export interface LessonFull extends LessonMeta {
  /** Японское тело в записи фуриганы ("кандзи[чтение]"), маркеры развёрнуты, абзацы через "\n\n". */
  bodyRuby: string;
  /** Русский перевод, столько же абзацев, сколько в bodyRuby. */
  translationRu: string;
  questions: LessonQuestion[];
  introduces: LessonIntroduce[];
  markers: LessonMarker[];
}
```

- [ ] **Step 2: заменить блок `texts`/`text_questions` в `scripts/build-content/schema.sql`**

В `scripts/build-content/schema.sql` **удалить** блок:

```sql
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
```

и на его место (перед таблицей `meta`, которая остаётся последней) вставить:

```sql
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
  surface       TEXT    NOT NULL,
  sentence_ruby TEXT    NOT NULL,
  sentence_ru   TEXT    NOT NULL,            -- может быть ''
  PRIMARY KEY (lesson_id, item_type, item_id)
);
```

(DDL как в спеке §1.3: без `REFERENCES` — content.db собирается одним процессом с контролируемым порядком вставки, а таблица `levels` урокам больше не нужна.)

- [ ] **Step 3: обновить список таблиц в `tests/scripts/build-content.test.ts`**

В тесте `'executes without error and creates expected tables'` заменить ожидаемый массив на (алфавитный порядок; `texts`/`text_questions` пока остаются, т.к. write-db их ещё пишет — уберём в задаче 5):

```typescript
    expect(tables).toEqual([
      'grammar_examples',
      'grammar_points',
      'grammar_relations',
      'kanji_points',
      'lesson_introduces',
      'lesson_markers',
      'lesson_questions',
      'lessons',
      'levels',
      'meta',
      'text_questions',
      'texts',
      'vocab_points',
    ]);
```

- [ ] **Step 4: написать три фикстуры**

Создать `tests/fixtures/lessons/lesson-text-valid.md`:

```markdown
---
id: fix-lesson-text
stage: 3
kind: text
title: Тестовый урок-текст
introduces_grammar: [n5-teiru]
introduces_vocab: [n5-学校-がっこう]
introduces_kanji: [n5-学]
reviews: [n5-wa-particle]
---

## Текст

毎朝[まいあさ] {{g:n5-teiru|六時[ろくじ]に 起[お]きています}}。 {{k:n5-学|学校[がっこう]}}まで {{v:n5-学校-がっこう|バス}}で 行[い]きます。

これは 二[ふた]つ目[め]の 段落[だんらく]です。

## Перевод

Каждое утро встаю в шесть. До школы еду на автобусе.

Это второй абзац.

## Вопросы

### Вопрос 1
Во сколько встаёт автор?
- [x] В шесть
- [ ] В семь
- [ ] В восемь

### Вопрос 2
Как автор добирается до школы?
- [x] На автобусе
- [ ] Пешком
- [ ] На велосипеде

### Вопрос 3
Сколько абзацев в тексте?
- [x] Два
- [ ] Один
- [ ] Три
```

(Маркер `{{v:n5-学校-がっこう|バス}}` намеренно: `surface` не обязан совпадать с headword — по нему только вешается тап. `id` должен резолвиться, `surface` — произвольный видимый текст.)

Создать `tests/fixtures/lessons/lesson-dialogue-valid.md`:

```markdown
---
id: fix-lesson-dialogue
stage: 7
kind: dialogue
title: Тестовый урок-диалог
---

## Текст

A: おはよう。

B: おはよう ございます。

## Перевод

A: Доброе утро.

B: Доброе утро (вежливо).

## Вопросы

### Вопрос 1
Сколько человек разговаривает?
- [x] Двое
- [ ] Один
- [ ] Трое

### Вопрос 2
Кто говорит вежливее?
- [x] B
- [ ] A
- [ ] Оба одинаково

### Вопрос 3
О чём диалог?
- [x] Приветствие утром
- [ ] Прощание
- [ ] Заказ еды
```

Создать `tests/fixtures/lessons/lesson-missing-section.md`:

```markdown
---
id: fix-lesson-broken
stage: 9
kind: text
title: Урок без вопросов
---

## Текст

これは 文[ぶん]です。

## Перевод

Это предложение.
```

- [ ] **Step 5: написать падающий тест `tests/scripts/lessons.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseLessonFile, loadAllLessons, validateLessons } from '../../scripts/build-content/lessons';
import type { ParsedLesson } from '../../scripts/build-content/lessons';

const fix = (n: string) => resolve(__dirname, '../fixtures/lessons', n);

function tmpFile(content: string, name = 'l.md'): string {
  const dir = mkdtempSync(join(tmpdir(), 'lesson-test-'));
  const path = join(dir, name);
  writeFileSync(path, content, 'utf8');
  return path;
}

const fm = (over: Record<string, string> = {}): string[] => [
  '---',
  `id: ${over['id'] ?? 't1'}`,
  `stage: ${over['stage'] ?? '3'}`,
  `kind: ${over['kind'] ?? 'text'}`,
  `title: ${over['title'] ?? '"t"'}`,
  '---',
  '',
];

const body = (text: string): string[] => ['## Текст', '', text, ''];
const trans = (text: string): string[] => ['## Перевод', '', text, ''];
const oneQuestion = (): string[] => [
  '## Вопросы', '',
  '### Вопрос 1', 'В?', '- [x] Да', '- [ ] Нет', '- [ ] Может быть', '',
  '### Вопрос 2', 'В2?', '- [x] Да', '- [ ] Нет', '- [ ] Может быть', '',
  '### Вопрос 3', 'В3?', '- [x] Да', '- [ ] Нет', '- [ ] Может быть', '',
];

describe('parseLessonFile', () => {
  it('парсит frontmatter, тело, перевод, вопросы, introduces и маркеры', () => {
    const l = parseLessonFile(fix('lesson-text-valid.md'));
    expect(l.id).toBe('fix-lesson-text');
    expect(l.stage).toBe(3);
    expect(l.kind).toBe('text');
    expect(l.title).toBe('Тестовый урок-текст');
    expect(l.questions).toHaveLength(3);
    // introduces собраны из трёх frontmatter-списков
    expect(l.introduces).toEqual([
      { type: 'grammar', id: 'n5-teiru' },
      { type: 'vocab', id: 'n5-学校-がっこう' },
      { type: 'kanji', id: 'n5-学' },
    ]);
    expect(l.reviews).toEqual(['n5-wa-particle']);
    // тело хранится с развёрнутыми маркерами
    expect(l.bodyRuby).toContain('六時[ろくじ]に 起[お]きています');
    expect(l.bodyRuby).not.toContain('{{');
    // маркеры: тип, id, surface, предложение-контекст
    const g = l.markers.find((m) => m.id === 'n5-teiru')!;
    expect(g.type).toBe('grammar');
    expect(g.surface).toBe('六時[ろくじ]に 起[お]きています');
    expect(g.sentenceRuby).toBe('毎朝[まいあさ] 六時[ろくじ]に 起[お]きています。');
    expect(g.sentenceRu).toBe('Каждое утро встаю в шесть. До школы еду на автобусе.');
    expect(l.markers.map((m) => m.type).sort()).toEqual(['grammar', 'kanji', 'vocab']);
  });

  it('парсит диалог: kind=dialogue, реплики как абзацы', () => {
    const l = parseLessonFile(fix('lesson-dialogue-valid.md'));
    expect(l.kind).toBe('dialogue');
    expect(l.bodyRuby.split('\n\n')).toHaveLength(2);
    expect(l.bodyRuby.split('\n\n')[0]).toBe('A: おはよう。');
  });

  it('бросает при отсутствующей секции', () => {
    expect(() => parseLessonFile(fix('lesson-missing-section.md'))).toThrow(/Вопросы/);
  });

  it('бросает при отсутствии frontmatter-ключа stage', () => {
    const path = tmpFile([
      '---', 'id: t1', 'kind: text', 'title: "t"', '---', '',
      ...body('文[ぶん]。'), ...trans('Т.'), ...oneQuestion(),
    ].join('\n'));
    expect(() => parseLessonFile(path)).toThrow(/stage/);
  });

  it('бросает при неизвестном kind', () => {
    const path = tmpFile([
      ...fm({ kind: 'video' }), ...body('文[ぶん]。'), ...trans('Т.'), ...oneQuestion(),
    ].join('\n'));
    expect(() => parseLessonFile(path)).toThrow(/kind/);
  });

  it('бросает при повторном маркере одного пункта', () => {
    const path = tmpFile([
      ...fm(), ...body('{{g:n5-teiru|A}}。 それから {{g:n5-teiru|B}}。'),
      ...trans('Одно предложение. Второе предложение.'), ...oneQuestion(),
    ].join('\n'));
    expect(() => parseLessonFile(path)).toThrow(/marker .*n5-teiru.* appears more than once/);
  });

  it('бросает при нераспознанном синтаксисе маркера ({{ осталось в теле)', () => {
    const path = tmpFile([
      ...fm(), ...body('文[ぶん] {{x:foo|bar}}。'), ...trans('Т.'), ...oneQuestion(),
    ].join('\n'));
    expect(() => parseLessonFile(path)).toThrow(/unrecognized marker syntax/);
  });

  it('бросает при паритете абзацев тело/перевод', () => {
    const path = tmpFile([
      ...fm(), ...body('一[ひと]つ。\n\n二[ふた]つ。'), ...trans('Только один.'), ...oneQuestion(),
    ].join('\n'));
    expect(() => parseLessonFile(path)).toThrow(/paragraph count/);
  });

  it('бросает при вопросе с числом вариантов вне 3-4', () => {
    const path = tmpFile([
      ...fm(), ...body('文[ぶん]。'), ...trans('Т.'),
      '## Вопросы', '', '### Вопрос 1', 'В?', '- [x] A', '- [ ] B', '',
    ].join('\n'));
    expect(() => parseLessonFile(path)).toThrow(/2 choices \(need 3-4\)/);
  });

  it('бросает при диалоге, где строка без префикса говорящего', () => {
    const path = tmpFile([
      ...fm({ kind: 'dialogue' }),
      '## Текст', '', 'A: こんにちは。', '', 'ただの文[ぶん]。', '',
      '## Перевод', '', 'A: Привет.', '', 'Просто предложение.', '',
      ...oneQuestion(),
    ].join('\n'));
    expect(() => parseLessonFile(path)).toThrow(/speaker prefix/);
  });
});

describe('loadAllLessons', () => {
  it('читает все *.md из плоского каталога', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lessons-dir-'));
    writeFileSync(join(dir, 'a.md'), [
      ...fm({ id: 'a', stage: '1' }), ...body('あ。'), ...trans('А.'), ...oneQuestion(),
    ].join('\n'), 'utf8');
    writeFileSync(join(dir, 'b.md'), [
      ...fm({ id: 'b', stage: '2' }), ...body('い。'), ...trans('Б.'), ...oneQuestion(),
    ].join('\n'), 'utf8');
    expect(loadAllLessons(dir).map((l) => l.id).sort()).toEqual(['a', 'b']);
  });

  it('возвращает [] для отсутствующего каталога', () => {
    expect(loadAllLessons('/no/such/dir')).toEqual([]);
  });
});

describe('validateLessons', () => {
  const q = (correct = 0): ParsedLesson['questions'][number] => ({
    prompt: 'В?', choices: ['A', 'B', 'C'], answerIndex: correct,
  });
  const base = (over: Partial<ParsedLesson> = {}): ParsedLesson => ({
    id: 'l1', stage: 1, kind: 'text', title: 't',
    bodyRuby: '文[ぶん]です。', translationRu: 'тест',
    questions: [q(), q(), q()], introduces: [], reviews: [], markers: [],
    ...over,
  });

  it('пропускает чистые данные', () => {
    expect(validateLessons([base()])).toEqual([]);
  });

  it('флагует дубль id', () => {
    expect(validateLessons([base(), base()]).some((e) => e.includes('duplicate lesson id'))).toBe(true);
  });

  it('флагует дубль stage', () => {
    const errs = validateLessons([base({ id: 'a', stage: 5 }), base({ id: 'b', stage: 5 })]);
    expect(errs.some((e) => e.includes('duplicate stage'))).toBe(true);
  });

  it('флагует нецелый/неположительный stage', () => {
    expect(validateLessons([base({ stage: 0 })]).some((e) => e.includes('bad stage'))).toBe(true);
  });

  it('флагует число вопросов вне 3-4', () => {
    expect(validateLessons([base({ questions: [q(), q()] })]).some((e) => e.includes('need 3-4'))).toBe(true);
  });

  it('флагует answerIndex вне диапазона', () => {
    expect(validateLessons([base({ questions: [q(9), q(), q()] })]).some((e) => e.includes('out of range'))).toBe(true);
  });

  it('флагует ruby-базу с каной', () => {
    expect(validateLessons([base({ bodyRuby: 'おちゃ[ちゃ]です。' })]).some((e) => /ruby base .* contains kana/.test(e))).toBe(true);
  });

  it('флагует непарсящуюся ruby', () => {
    expect(validateLessons([base({ bodyRuby: 'これは[' })]).some((e) => /unparseable ruby/.test(e))).toBe(true);
  });
});
```

- [ ] **Step 6: прогнать тест — убедиться, что падает**

Run: `npx vitest run tests/scripts/lessons.test.ts`
Expected: FAIL — `Cannot find module '../../scripts/build-content/lessons'`.

- [ ] **Step 7: реализовать `scripts/build-content/lessons.ts`**

```typescript
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import type { ItemType } from '../../src/core/types';
import { parseRuby } from '../../src/core/ruby';

/** Хирагана + катакана (вкл. полуширинную) — не должны попадать в базу чтения "кандзи[чтение]". */
const KANA = /[぀-ヿｦ-ﾟ]/;
const REQUIRED_SECTIONS = ['## Текст', '## Перевод', '## Вопросы'];
const KINDS = new Set(['text', 'dialogue']);
const SPEAKER_PREFIX = /^[A-Za-zА-Яа-я]{1,8}:\s/;
/** {{TYPE:id|surface}} — TYPE один из v/g/k; id без '|'; surface без '}}'. */
const MARKER_RE = /\{\{([vgk]):([^|{}]+)\|([^}]*)\}\}/g;
const TYPE_MAP: Record<string, ItemType> = { v: 'vocab', g: 'grammar', k: 'kanji' };
const SENTENCE_ENDS = ['。', '！', '？'];

export interface ParsedLesson {
  id: string;
  stage: number;
  kind: 'text' | 'dialogue';
  title: string;
  /** Тело "## Текст" с развёрнутыми маркерами, абзацы через "\n\n". */
  bodyRuby: string;
  translationRu: string;
  questions: { prompt: string; choices: string[]; answerIndex: number }[];
  /** Из introduces_grammar / introduces_vocab / introduces_kanji. */
  introduces: { type: ItemType; id: string }[];
  /** Сырые id из frontmatter reviews — тип резолвится в validateLessonRefs. */
  reviews: string[];
  markers: {
    type: ItemType;
    id: string;
    surface: string;
    sentenceRuby: string;
    sentenceRu: string;
  }[];
}

export function parseLessonFile(path: string): ParsedLesson {
  const raw = readFileSync(path, 'utf8');
  const { data, content } = matter(raw);

  for (const key of ['id', 'stage', 'kind', 'title'] as const) {
    if (data[key] === undefined) throw new Error(`${path}: frontmatter missing "${key}"`);
  }
  const kind = String(data['kind']);
  if (!KINDS.has(kind)) throw new Error(`${path}: bad kind "${kind}" (need text|dialogue)`);
  for (const section of REQUIRED_SECTIONS) {
    if (!content.includes(section)) throw new Error(`${path}: missing section "${section}"`);
  }

  const rawBody = extractSection(content, '## Текст', ['## Перевод'], path);
  const translationRu = extractSection(content, '## Перевод', ['## Вопросы'], path);
  const { bodyRuby, markers } = parseMarkers(rawBody, translationRu, path);

  if (bodyRuby.split('\n\n').length !== translationRu.split('\n\n').length) {
    throw new Error(
      `${path}: paragraph count differs between "## Текст" (${bodyRuby.split('\n\n').length}) and "## Перевод" (${translationRu.split('\n\n').length})`,
    );
  }
  if (kind === 'dialogue') {
    for (const line of bodyRuby.split('\n\n')) {
      if (!SPEAKER_PREFIX.test(line)) {
        throw new Error(`${path}: dialogue line without speaker prefix: ${JSON.stringify(line)}`);
      }
    }
  }

  const introducesRaw = [
    ...toIdList(data['introduces_grammar']).map((id) => ({ type: 'grammar' as ItemType, id })),
    ...toIdList(data['introduces_vocab']).map((id) => ({ type: 'vocab' as ItemType, id })),
    ...toIdList(data['introduces_kanji']).map((id) => ({ type: 'kanji' as ItemType, id })),
  ];

  return {
    id: String(data['id']),
    stage: Number(data['stage']),
    kind: kind as 'text' | 'dialogue',
    title: String(data['title']),
    bodyRuby,
    translationRu,
    questions: parseQuestions(content, path),
    introduces: introducesRaw,
    reviews: toIdList(data['reviews']),
    markers,
  };
}

function toIdList(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : [];
}

function extractSection(content: string, heading: string, stops: string[], path: string): string {
  const lines = content.split('\n');
  const start = lines.findIndex((l) => l.trim() === heading);
  if (start === -1) throw new Error(`${path}: no "${heading}" section`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (stops.includes(lines[i]!.trim())) { end = i; break; }
  }
  const body = lines.slice(start + 1, end).join('\n').trim();
  if (!body) throw new Error(`${path}: empty "${heading}" section`);
  return body;
}

function expandMarkers(s: string): string {
  return s.replace(MARKER_RE, (_m, _t, _id, surface) => surface);
}

function parseMarkers(
  rawBody: string,
  translationRu: string,
  path: string,
): { bodyRuby: string; markers: ParsedLesson['markers'] } {
  const bodyParagraphs = rawBody.split('\n\n');
  const transParagraphs = translationRu.split('\n\n');
  const parityOk = bodyParagraphs.length === transParagraphs.length;

  const markers: ParsedLesson['markers'] = [];
  const seen = new Set<string>();
  MARKER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MARKER_RE.exec(rawBody)) !== null) {
    const type = TYPE_MAP[m[1]!]!;
    const id = m[2]!.trim();
    const surface = m[3]!;
    const key = `${type}:${id}`;
    if (seen.has(key)) {
      throw new Error(`${path}: marker for "${id}" appears more than once (mark only the first occurrence)`);
    }
    seen.add(key);

    // предложение-контекст в сыром теле (границы: 。！？ или \n\n или края)
    const start = m.index;
    const end = m.index + m[0]!.length;
    const before = rawBody.slice(0, start);
    const after = rawBody.slice(end);
    const seps = [...SENTENCE_ENDS.map((t) => before.lastIndexOf(t)), before.lastIndexOf('\n\n')];
    const cut = Math.max(...seps);
    const from = cut === -1 ? 0 : cut + (before.slice(cut).startsWith('\n\n') ? 2 : 1);
    let toRel = after.length;
    for (const t of SENTENCE_ENDS) {
      const i = after.indexOf(t);
      if (i !== -1) toRel = Math.min(toRel, i + 1);
    }
    const nn = after.indexOf('\n\n');
    if (nn !== -1) toRel = Math.min(toRel, nn);
    let sentenceRuby = expandMarkers(rawBody.slice(from, end + toRel)).trim();
    sentenceRuby = sentenceRuby.replace(SPEAKER_PREFIX, '');

    // абзац перевода: индекс абзаца тела, где стоит маркер
    let acc = 0;
    let pIdx = 0;
    for (; pIdx < bodyParagraphs.length; pIdx++) {
      const len = bodyParagraphs[pIdx]!.length + 2;
      if (start < acc + len) break;
      acc += len;
    }
    const sentenceRu = parityOk ? (transParagraphs[pIdx] ?? '').trim() : '';

    markers.push({ type, id, surface, sentenceRuby, sentenceRu });
  }

  const bodyRuby = expandMarkers(rawBody);
  if (bodyRuby.includes('{{') || bodyRuby.includes('}}')) {
    throw new Error(`${path}: unrecognized marker syntax (stray "{{" or "}}" after expansion)`);
  }
  return { bodyRuby, markers };
}

function parseQuestions(content: string, path: string): ParsedLesson['questions'] {
  const lines = content.split('\n');
  const qStart = lines.findIndex((l) => l.trim() === '## Вопросы');
  if (qStart === -1) throw new Error(`${path}: no "## Вопросы" section`);
  const section = lines.slice(qStart + 1);

  const headingIdxs: number[] = [];
  section.forEach((l, i) => { if (l.trim().startsWith('### ')) headingIdxs.push(i); });
  if (headingIdxs.length === 0) {
    throw new Error(`${path}: "## Вопросы" section has no "### Вопрос N" headings`);
  }

  const out: ParsedLesson['questions'] = [];
  for (let h = 0; h < headingIdxs.length; h++) {
    const blockStart = headingIdxs[h]! + 1;
    const blockEnd = h + 1 < headingIdxs.length ? headingIdxs[h + 1]! : section.length;
    const block = section.slice(blockStart, blockEnd).map((l) => l.trim()).filter((l) => l !== '');

    const promptLine = block.find((l) => !l.startsWith('- ['));
    if (!promptLine) throw new Error(`${path}: question ${h + 1} has no prompt text`);

    const choiceLines = block.filter((l) => l.startsWith('- ['));
    if (choiceLines.length < 3 || choiceLines.length > 4) {
      throw new Error(`${path}: question ${h + 1} has ${choiceLines.length} choices (need 3-4)`);
    }
    const checkedIdxs: number[] = [];
    choiceLines.forEach((l, i) => { if (l.startsWith('- [x]')) checkedIdxs.push(i); });
    if (checkedIdxs.length !== 1) {
      throw new Error(`${path}: question ${h + 1} has ${checkedIdxs.length} correct answers marked (need exactly 1)`);
    }
    out.push({
      prompt: promptLine,
      choices: choiceLines.map((l) => l.replace(/^- \[[x ]\]\s*/, '')),
      answerIndex: checkedIdxs[0]!,
    });
  }
  return out;
}

export function loadAllLessons(dir: string): ParsedLesson[] {
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  } catch {
    return [];
  }
  return files.map((f) => parseLessonFile(join(dir, f)));
}

export function validateLessons(lessons: ParsedLesson[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const stages = new Set<number>();
  for (const l of lessons) {
    if (ids.has(l.id)) errors.push(`duplicate lesson id "${l.id}"`);
    ids.add(l.id);
    if (stages.has(l.stage)) errors.push(`${l.id}: duplicate stage ${l.stage}`);
    stages.add(l.stage);
    if (!Number.isInteger(l.stage) || l.stage < 1) errors.push(`${l.id}: bad stage ${l.stage}`);

    if (l.questions.length < 3 || l.questions.length > 4) {
      errors.push(`${l.id}: ${l.questions.length} questions (need 3-4)`);
    }
    for (const q of l.questions) {
      if (q.answerIndex < 0 || q.answerIndex >= q.choices.length) {
        errors.push(`${l.id}: answerIndex ${q.answerIndex} out of range for question "${q.prompt}"`);
      }
    }

    let segs;
    try {
      segs = parseRuby(l.bodyRuby);
    } catch (err) {
      errors.push(`${l.id}: unparseable ruby in body: ${(err as Error).message}`);
      continue;
    }
    for (const s of segs) {
      if (s.ruby !== null && KANA.test(s.base)) {
        errors.push(`${l.id}: ruby base "${s.base}" contains kana in body`);
      }
    }
  }
  return errors;
}

export function validateLessonRefs(
  lessons: ParsedLesson[],
  sets: { grammar: Set<string>; kanji: Set<string>; vocab: Set<string> },
): string[] {
  const setFor = (t: ItemType): Set<string> =>
    t === 'grammar' ? sets.grammar : t === 'kanji' ? sets.kanji : sets.vocab;
  const errors: string[] = [];
  for (const l of lessons) {
    const introduced = new Set(l.introduces.map((it) => `${it.type}:${it.id}`));
    for (const it of l.introduces) {
      if (!setFor(it.type).has(it.id)) {
        errors.push(`${l.id}: introduces ${it.type} id "${it.id}" does not exist`);
      }
    }
    for (const rid of l.reviews) {
      const hits = (['grammar', 'kanji', 'vocab'] as ItemType[]).filter((t) => setFor(t).has(rid));
      if (hits.length !== 1) {
        errors.push(`${l.id}: review id "${rid}" resolves to ${hits.length} item types (need exactly 1)`);
      } else if (introduced.has(`${hits[0]}:${rid}`)) {
        errors.push(`${l.id}: "${rid}" is both introduced and reviewed`);
      }
    }
    for (const m of l.markers) {
      if (!setFor(m.type).has(m.id)) {
        errors.push(`${l.id}: marker ${m.type} id "${m.id}" does not exist`);
      }
      const known = introduced.has(`${m.type}:${m.id}`) || l.reviews.includes(m.id);
      if (!known) {
        errors.push(`${l.id}: marker "${m.id}" is neither introduced nor reviewed by this lesson`);
      }
    }
  }
  return errors;
}
```

- [ ] **Step 8: прогнать тест — убедиться, что проходит**

Run: `npx vitest run tests/scripts/lessons.test.ts`
Expected: PASS. Свериться с фактическим числом тестов в выводе терминала (ожидаемо ~21).

- [ ] **Step 9: typecheck + полная регрессия**

Run: `npm run typecheck && npx vitest run`
Expected: typecheck чисто; 397 прежних тестов + новый файл — все зелёные. (Схема content.db в `build-content.test.ts` теперь содержит и `lessons*`, и `texts*` — обе группы, т.к. write-db ещё пишет `texts`.)

- [ ] **Step 10: коммит**

```bash
git add src/core/types.ts scripts/build-content/schema.sql scripts/build-content/lessons.ts tests/fixtures/lessons tests/scripts/lessons.test.ts tests/scripts/build-content.test.ts
git commit -m "feat(lessons): add Lesson types, content.db lesson tables, lessons.ts parser"
```

---

### Task 2: скрипт миграции, `content/lessons/*.md`, пайплайн сборки

Мигрируем 15 текстов в уроки, подключаем `content/lessons` к сборке content.db (загрузка + кросс-валидация id + вставка в 4 таблицы). `content/texts/` и вставка `texts`/`text_questions` **пока остаются** (уберём в задаче 5) — так `texts-browse.spec.ts` и экраны не ломаются между задачами.

**Files:**
- Create: `scripts/migrate-texts-to-lessons.ts`
- Create: `content/lessons/*.md` (15 файлов — результат прогона скрипта, коммитятся)
- Modify: `scripts/build-content/write-db.ts` (`lessonsDir` в `BuildOpts`; `insertLessons`; вызвать `validateLessons`/`validateLessonRefs`/`insertLessons`)
- Modify: `scripts/build-content/index.ts` (`lessonsDir: resolve(root, 'content/lessons')`)
- Modify: `tests/scripts/build-content.test.ts` (`lessonsDir` в `opts`; тест «15 уроков»)
- Test: `tests/scripts/lessons-crossref.test.ts`

**Interfaces:**
- Consumes: `loadAllLessons`, `validateLessons`, `validateLessonRefs`, `ParsedLesson` из задачи 1; `loadAllGrammar`/`loadAllKanji`/`loadAllVocab` (существуют).
- Produces:
  - `scripts/build-content/write-db.ts`: `export function insertLessons(db: Database, lessons: ParsedLesson[], sets: { grammar: Set<string>; kanji: Set<string>; vocab: Set<string> }): void` — предполагает, что `validateLessons` и `validateLessonRefs` уже прошли; резолвит тип review-пункта через `sets` (гарантированно однозначен).
  - `BuildOpts` получает обязательное поле `lessonsDir: string`.
  - Заполненные таблицы `lessons` / `lesson_questions` / `lesson_introduces` / `lesson_markers` в `content.db`.

- [ ] **Step 1: написать одноразовый скрипт `scripts/migrate-texts-to-lessons.ts`**

```typescript
/**
 * Одноразовая миграция: content/texts/<level>/*.md -> content/lessons/*.md.
 * Проставляет `stage` (чётные, N5 от 2, N4 от 42 — оставляя нечётные слоты
 * будущим вводным урокам), `kind: text`, роняет `level`. Теги introduces/reviews
 * не пишутся (парсер по умолчанию считает их пустыми = свободное чтение).
 * Запускается вручную один раз:  npx tsx scripts/migrate-texts-to-lessons.ts
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const textsDir = resolve(root, 'content/texts');
const lessonsDir = resolve(root, 'content/lessons');
mkdirSync(lessonsDir, { recursive: true });

const rows: [string, number, string][] = [];
for (const [level, startStage] of [['n5', 2], ['n4', 42]] as const) {
  const dir = resolve(textsDir, level);
  const files = readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
  files.forEach((file, i) => {
    const src = readFileSync(resolve(dir, file), 'utf8');
    const { data, content } = matter(src);
    const stage = startStage + i * 2;
    const fm = {
      id: String(data['id']),
      stage,
      kind: 'text',
      title: String(data['title']),
    };
    writeFileSync(resolve(lessonsDir, file), matter.stringify(content, fm), 'utf8');
    rows.push([fm.id, stage, fm.title]);
  });
}
rows.sort((a, b) => a[1] - b[1]);
console.log('Мигрировано уроков:', rows.length);
for (const [id, stage, title] of rows) console.log(`  stage ${String(stage).padStart(2)}  ${id}  — ${title}`);
```

- [ ] **Step 2: прогнать миграцию**

Run: `npx tsx scripts/migrate-texts-to-lessons.ts`
Expected вывод (15 строк; `stage` от 2 до 18 для N5, от 42 до 52 для N4):

```
Мигрировано уроков: 15
  stage  2  n5-hanami  — お花見
  stage  4  n5-kitsune-to-tsuru  — キツネとツル
  stage  6  n5-konbini  — コンビニ
  stage  8  n5-natsu-yasumi  — 夏休み
  stage 10  n5-nihiki-no-kaeru  — 二匹のかえる
  stage 12  n5-watashi-no-chichi  — 私の父
  stage 14  n5-watashi-no-ichinichi  — 私の一日
  stage 16  n5-watashi-no-neko  — 私の猫
  stage 18  n5-zaru-soba  — ざるそば
  stage 42  n4-arubaito  — アルバイト
  stage 44  n4-hikkoshi  — 引っ越し
  stage 46  n4-kin-no-ono-gin-no-ono  — 金の斧銀の斧
  stage 48  n4-kyoto-osaka-kaeru  — 京都のかえると大阪のかえる
  stage 50  n4-nihon-no-natsu  — 日本の夏
  stage 52  n4-onsen  — 温泉
```

- [ ] **Step 3: глазами проверить один мигрированный файл**

Открыть `content/lessons/n5-hanami.md`. Ожидается frontmatter ровно:

```markdown
---
id: n5-hanami
stage: 2
kind: text
title: お花見
---
```

и тело (`## Текст` / `## Перевод` / `## Вопросы`) — байт-в-байт как в `content/texts/n5/hanami.md`. Если `gray-matter` где-то поменял кавычки/экранирование в `title` (например `"お花見"` стало `お花見` — это норм, YAML-эквивалент) — ок. Если тело изменилось — стоп, чинить скрипт.

- [ ] **Step 4: написать падающий кросс-валидационный тест `tests/scripts/lessons-crossref.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { validateLessonRefs } from '../../scripts/build-content/lessons';
import type { ParsedLesson } from '../../scripts/build-content/lessons';

const sets = {
  grammar: new Set(['n5-teiru', 'n5-wa-particle']),
  kanji: new Set(['n5-学']),
  vocab: new Set(['n5-学校-がっこう']),
};

const base = (over: Partial<ParsedLesson> = {}): ParsedLesson => ({
  id: 'l1', stage: 1, kind: 'text', title: 't',
  bodyRuby: '文[ぶん]。', translationRu: 'т',
  questions: [], introduces: [], reviews: [], markers: [],
  ...over,
});

describe('validateLessonRefs', () => {
  it('пропускает урок, где все id резолвятся', () => {
    const l = base({
      introduces: [{ type: 'grammar', id: 'n5-teiru' }, { type: 'kanji', id: 'n5-学' }],
      reviews: ['n5-wa-particle'],
      markers: [{ type: 'grammar', id: 'n5-teiru', surface: 'x', sentenceRuby: 'x', sentenceRu: '' }],
    });
    expect(validateLessonRefs([l], sets)).toEqual([]);
  });

  it('флагует несуществующий introduces id', () => {
    const l = base({ introduces: [{ type: 'grammar', id: 'n5-nope' }] });
    expect(validateLessonRefs([l], sets).some((e) => e.includes('does not exist'))).toBe(true);
  });

  it('флагует review id, который не резолвится ни в одну таблицу', () => {
    const l = base({ reviews: ['n5-ghost'] });
    expect(validateLessonRefs([l], sets).some((e) => e.includes('resolves to 0 item types'))).toBe(true);
  });

  it('флагует маркер на пункт, который урок не вводит и не повторяет', () => {
    const l = base({
      markers: [{ type: 'grammar', id: 'n5-teiru', surface: 'x', sentenceRuby: 'x', sentenceRu: '' }],
    });
    expect(validateLessonRefs([l], sets).some((e) => e.includes('neither introduced nor reviewed'))).toBe(true);
  });

  it('флагует пункт, который одновременно introduced и reviewed', () => {
    const l = base({
      introduces: [{ type: 'grammar', id: 'n5-teiru' }],
      reviews: ['n5-teiru'],
    });
    expect(validateLessonRefs([l], sets).some((e) => e.includes('both introduced and reviewed'))).toBe(true);
  });
});
```

Run: `npx vitest run tests/scripts/lessons-crossref.test.ts`
Expected: PASS сразу (функция уже есть из задачи 1) — это регресс-страховка перед правкой write-db. Если падает — чинить `validateLessonRefs`, не тест.

- [ ] **Step 5: подключить `lessonsDir` к `scripts/build-content/write-db.ts`**

Добавить импорт (после строки `import { loadAllTexts, validateTexts } from './parse-texts';`):

```typescript
import { loadAllLessons, validateLessons, validateLessonRefs } from './lessons';
import type { ParsedLesson } from './lessons';
```

Добавить поле в `BuildOpts` (после `textsDir: string;`):

```typescript
  lessonsDir: string;
```

В `buildContentDb`, **сразу после** блока вставки vocab (после `insV.free();`) и **перед** `db.run("INSERT INTO meta ...`, вставить:

```typescript
  const lessons = loadAllLessons(opts.lessonsDir).sort((a, b) => a.id.localeCompare(b.id));
  const lessonErrors = validateLessons(lessons);
  if (lessonErrors.length) throw new Error(`lessons validation failed:\n${lessonErrors.join('\n')}`);
  const refSets = {
    grammar: ids, // Set(grammar.map(g => g.id)) — уже создан выше по файлу
    kanji: new Set(kanji.map((k) => k.id)),
    vocab: new Set(vocab.map((v) => v.id)),
  };
  const refErrors = validateLessonRefs(lessons, refSets);
  if (refErrors.length) throw new Error(`lesson refs validation failed:\n${refErrors.join('\n')}`);
  insertLessons(db, lessons, refSets);
```

Добавить функцию `insertLessons` в конец файла (перед закрывающей ничего — просто новая экспортируемая функция на уровне модуля):

```typescript
export function insertLessons(
  db: Database,
  lessons: ParsedLesson[],
  sets: { grammar: Set<string>; kanji: Set<string>; vocab: Set<string> },
): void {
  const setFor = (t: 'grammar' | 'kanji' | 'vocab'): Set<string> =>
    t === 'grammar' ? sets.grammar : t === 'kanji' ? sets.kanji : sets.vocab;

  const insL = db.prepare(
    'INSERT INTO lessons (id, stage, kind, title, body_ruby, translation_ru) VALUES (?,?,?,?,?,?)',
  );
  const insLQ = db.prepare(
    'INSERT INTO lesson_questions (lesson_id, ord, prompt, choices_json, answer_index) VALUES (?,?,?,?,?)',
  );
  const insLI = db.prepare(
    'INSERT INTO lesson_introduces (lesson_id, item_type, item_id, role, ord) VALUES (?,?,?,?,?)',
  );
  const insLM = db.prepare(
    'INSERT INTO lesson_markers (lesson_id, item_type, item_id, surface, sentence_ruby, sentence_ru) VALUES (?,?,?,?,?,?)',
  );
  for (const l of lessons) {
    insL.run([l.id, l.stage, l.kind, l.title, l.bodyRuby, l.translationRu]);
    l.questions.forEach((q, i) =>
      insLQ.run([l.id, i, q.prompt, JSON.stringify(q.choices), q.answerIndex]),
    );
    let ord = 0;
    for (const it of l.introduces) insLI.run([l.id, it.type, it.id, 'introduce', ord++]);
    for (const rid of l.reviews) {
      const type = (['grammar', 'kanji', 'vocab'] as const).find((t) => setFor(t).has(rid))!;
      insLI.run([l.id, type, rid, 'review', ord++]);
    }
    for (const mk of l.markers) {
      insLM.run([l.id, mk.type, mk.id, mk.surface, mk.sentenceRuby, mk.sentenceRu]);
    }
  }
  insL.free();
  insLQ.free();
  insLI.free();
  insLM.free();
}
```

Проверить, что имя множества grammar-id в файле — `ids` (в текущем `write-db.ts` строка `const ids = new Set(grammar.map((g) => g.id));`). Если оно называется иначе — использовать фактическое имя в `refSets.grammar`.

- [ ] **Step 6: подключить каталог в `scripts/build-content/index.ts`**

В объект аргумента `buildContentDb({ ... })` добавить (рядом с `textsDir`):

```typescript
    lessonsDir: resolve(root, 'content/lessons'),
```

- [ ] **Step 7: `tests/scripts/build-content.test.ts` — `lessonsDir` + тест «15 уроков»**

В общий объект `opts` добавить:

```typescript
  lessonsDir: resolve(__dirname, '../../content/lessons'),
```

Добавить тест внутри `describe('buildContentDb', ...)`, после теста `'produces 15 real texts (9 N5, 6 N4) ...'` и перед `'is deterministic ...'`:

```typescript
  it('produces 15 lessons migrated from texts, ordered by stage, with empty introduces/markers', async () => {
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

    // 15 мигрированных текстов — свободное чтение: ни introduces, ни маркеров
    const introduces = db.exec('SELECT count(*) FROM lesson_introduces')[0]!.values[0]![0];
    expect(introduces).toBe(0);
    const markers = db.exec('SELECT count(*) FROM lesson_markers')[0]!.values[0]![0];
    expect(markers).toBe(0);

    const orphans = db.exec(`
      SELECT count(*) FROM lesson_questions q
      LEFT JOIN lessons l ON l.id = q.lesson_id
      WHERE l.id IS NULL
    `)[0]!.values[0]![0];
    expect(orphans).toBe(0);

    db.close();
  });
```

- [ ] **Step 8: собрать content.db и прогнать регрессию**

Run: `npm run build-content && npm run typecheck && npx vitest run`
Expected: `content.db written` без ошибок валидации; typecheck чисто; все тесты зелёные, включая новый «15 lessons» и `lessons-crossref`. Тест `'is deterministic'` остаётся зелёным (уроки сортируются по id перед вставкой).

- [ ] **Step 9: коммит**

```bash
git add scripts/migrate-texts-to-lessons.ts content/lessons scripts/build-content/write-db.ts scripts/build-content/index.ts tests/scripts/build-content.test.ts tests/scripts/lessons-crossref.test.ts
git commit -m "feat(lessons): migrate 15 texts to content/lessons, wire lesson tables into build"
```

---

### Task 3: `ContentDb.listLessons` / `getLesson`

Заменяем `listTexts`/`getText` в `content-db.ts` на `listLessons`/`getLesson`. Экраны `TextsListScreen`/`TextDetailScreen` в этой задаче **ещё зовут `listTexts`/`getText`** — значит после правки `content-db.ts` они не компилируются. Чтобы задача осталась зелёной, в этой же задаче правим и экраны на новый API (минимально — детально экраны и их тесты в задаче 4; здесь ровно столько правок экрана, чтобы typecheck прошёл и старые UI-тесты не падали хуже, чем на переименовании метода). **Проще:** переносим правку экранов целиком сюда нельзя (их тесты — большой объём), поэтому оставляем `listTexts`/`getText` как тонкие **депрекейт-обёртки** над новыми методами до задачи 4.

**Files:**
- Modify: `src/storage/content-db.ts`
- Modify: `tests/storage/content-db.test.ts`

**Interfaces:**
- Consumes: `LessonMeta`, `LessonFull`, `LessonQuestion`, `LessonIntroduce`, `LessonMarker` из `src/core/types.ts` (задача 1); таблицы `lessons`/`lesson_questions`/`lesson_introduces`/`lesson_markers` (задача 2).
- Produces (для задачи 4):
  - `listLessons(): LessonMeta[]` — все уроки, `ORDER BY stage, id`; `introducesCount` = число строк `lesson_introduces` с `role='introduce'`; `isFreeReading = introducesCount === 0`.
  - `getLesson(id: string): LessonFull | null` — `+ questions` (по `ord`), `+ introduces` (по `ord`, `{ type, id, role }`), `+ markers` (`{ type, id, surface, sentenceRuby, sentenceRu }`).
  - Временные обёртки `listTexts(level: LevelCode): TextPoint[]` / `getText(id): TextPoint | null` — удаляются в задаче 4.

- [ ] **Step 1: обновить тесты `tests/storage/content-db.test.ts` (падающие)**

Заменить пять тестов текстов (`'lists all 9 N5 texts sorted by id'`, `'lists all 6 N4 texts sorted by id, independently of N5'`, `'gets a full text with body, translation and questions'`, `'returns null for an unknown text id'`, `'gets a full N4 text'`) на:

```typescript
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
```

Run: `npx vitest run tests/storage/content-db.test.ts`
Expected: FAIL — `db.listLessons is not a function`.

- [ ] **Step 2: переписать текстовую часть `src/storage/content-db.ts`**

Заменить импорт типов (строка 3) — убрать `TextPoint`, добавить lesson-типы:

```typescript
import type {
  GrammarPoint, KanjiPoint, Level, LevelCode, VocabPoint,
  LessonMeta, LessonFull, LessonIntroduce, LessonMarker,
} from '@/core/types';
```

> **Внимание:** `TextPoint` ещё используется во временных обёртках `listTexts`/`getText` ниже — оставить его в импорте до задачи 4 (`TextPoint` там же удаляется). Итоговый импорт задачи 3: `..., VocabPoint, TextPoint, LessonMeta, LessonFull, LessonIntroduce, LessonMarker`.

Заменить интерфейсы строк `TextListRow`/`TextRow`/`TextQuestionRow` и константу `TEXT_LIST_COLS` на:

```typescript
interface LessonMetaRow {
  id: string;
  stage: number;
  kind: string;
  title: string;
  introduces_count: number;
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

interface LessonIntroduceRow {
  item_type: string;
  item_id: string;
  role: string;
}

interface LessonMarkerRow {
  item_type: string;
  item_id: string;
  surface: string;
  sentence_ruby: string;
  sentence_ru: string;
}
```

Заменить методы `rowToText`/`listTexts`/`getText` (строки ~231-272) на:

```typescript
  listLessons(): LessonMeta[] {
    return this.all<LessonMetaRow>(
      `SELECT l.id, l.stage, l.kind, l.title,
              (SELECT count(*) FROM lesson_introduces li
                 WHERE li.lesson_id = l.id AND li.role = 'introduce') AS introduces_count
       FROM lessons l
       ORDER BY l.stage, l.id`,
    ).map((r) => ({
      id: r.id,
      stage: r.stage,
      kind: r.kind as LessonMeta['kind'],
      title: r.title,
      introducesCount: r.introduces_count,
      isFreeReading: r.introduces_count === 0,
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

    const introduces: LessonIntroduce[] = this.all<LessonIntroduceRow>(
      'SELECT item_type, item_id, role FROM lesson_introduces WHERE lesson_id = ? ORDER BY ord',
      [id],
    ).map((r) => ({
      type: r.item_type as LessonIntroduce['type'],
      id: r.item_id,
      role: r.role as LessonIntroduce['role'],
    }));

    const markers: LessonMarker[] = this.all<LessonMarkerRow>(
      'SELECT item_type, item_id, surface, sentence_ruby, sentence_ru FROM lesson_markers WHERE lesson_id = ?',
      [id],
    ).map((r) => ({
      type: r.item_type as LessonMarker['type'],
      id: r.item_id,
      surface: r.surface,
      sentenceRuby: r.sentence_ruby,
      sentenceRu: r.sentence_ru,
    }));

    const introducesCount = introduces.filter((i) => i.role === 'introduce').length;
    return {
      id: row.id,
      stage: row.stage,
      kind: row.kind as LessonFull['kind'],
      title: row.title,
      introducesCount,
      isFreeReading: introducesCount === 0,
      bodyRuby: row.body_ruby,
      translationRu: row.translation_ru,
      questions,
      introduces,
      markers,
    };
  }

  // --- Переходные обёртки для /texts до плана 5-2 (удаляются в задаче 4). ---
  listTexts(level: LevelCode): TextPoint[] {
    const cut = level === 'N5' ? -Infinity : 40;
    const hi = level === 'N5' ? 40 : Infinity;
    return this.listLessons()
      .filter((l) => l.stage >= (level === 'N5' ? -Infinity : cut) && l.stage < hi)
      .map((l) => ({ id: l.id, level, title: l.title, bodyRuby: '', translationRu: '', questions: [] }));
  }

  getText(id: string): TextPoint | null {
    const l = this.getLesson(id);
    if (!l) return null;
    return {
      id: l.id,
      level: l.stage < 40 ? 'N5' : 'N4',
      title: l.title,
      bodyRuby: l.bodyRuby,
      translationRu: l.translationRu,
      questions: l.questions,
    };
  }
```

(Обёртки грубые и временные — их единственная задача: не трогать `TextsListScreen`/`TextDetailScreen` и их тесты до задачи 4. `cut`/`hi` для `listTexts` упрощены до `stage < 40 → N5`.)

- [ ] **Step 3: прогнать тесты хранилища**

Run: `npm run build-content && npx vitest run tests/storage/content-db.test.ts`
Expected: PASS — новые lesson-тесты зелёные.

- [ ] **Step 4: typecheck + полная регрессия**

Run: `npm run typecheck && npx vitest run`
Expected: typecheck чисто; все тесты зелёные. `TextsListScreen.test.tsx`/`TextDetailScreen.test.tsx` проходят через обёртки без изменений.

- [ ] **Step 5: коммит**

```bash
git add src/storage/content-db.ts tests/storage/content-db.test.ts
git commit -m "feat(lessons): ContentDb.listLessons/getLesson, transitional text wrappers"
```

---

### Task 4: переходные экраны `/texts` на уроках

`TextsListScreen`/`TextDetailScreen` переводятся на `listLessons`/`getLesson` напрямую; временные обёртки `listTexts`/`getText` **удаляются**. Роуты `/texts`, `/texts/:id`, навигационный пункт «Тексты», настройка `texts_read_ids` — **без изменений** (это план 5-2 и 5-3). Вкладки уровней в списке остаются, `level` вычисляется из `stage` через модульную константу-шим.

**Files:**
- Modify: `src/ui/screens/TextsListScreen.tsx`
- Modify: `src/ui/screens/TextDetailScreen.tsx`
- Modify: `src/storage/content-db.ts` (удалить обёртки `listTexts`/`getText` и `TextListRow` уже удалён; убрать `TextPoint` из импорта)
- Modify: `tests/ui/TextsListScreen.test.tsx`
- Modify: `tests/ui/TextDetailScreen.test.tsx`
- Verify (без правок при зелёном): `tests/e2e/texts-browse.spec.ts`

**Interfaces:**
- Consumes: `db.listLessons()`, `db.getLesson(id)` (задача 3); `LessonMeta`, `LessonFull` (задача 1).
- Produces: `/texts` рендерит список уроков, сгруппированный по производному уровню (`stage < 40 → N5`, иначе `N4`); `/texts/:id` рендерит тело/перевод/вопросы урока. Никаких новых экспортов.

- [ ] **Step 1: обновить `tests/ui/TextsListScreen.test.tsx` (падающий)**

Заменить фейковую БД и данные:

```typescript
import { TextsListScreen } from '@/ui/screens/TextsListScreen';
import type { LessonMeta, Level } from '@/core/types';

const levels: Level[] = [
  { code: 'N5', ord: 1, status: 'available', titleRu: 'N5' },
  { code: 'N4', ord: 2, status: 'coming_soon', titleRu: 'N4' },
];
const lessons: LessonMeta[] = [
  { id: 'n5-a', stage: 4, kind: 'text', title: 'キツネとツル', introducesCount: 0, isFreeReading: true },
  { id: 'n5-b', stage: 10, kind: 'text', title: '二匹のかえる', introducesCount: 0, isFreeReading: true },
  { id: 'n4-a', stage: 44, kind: 'text', title: '温泉', introducesCount: 0, isFreeReading: true },
];
const fakeDb = {
  listLessons: () => lessons,
} as unknown as import('@/storage/content-db').ContentDb;
```

В тесте `'shows N5 texts by default'` — по-прежнему ожидаются 2 ссылки (`n5-a`, `n5-b`; `n4-a` при `stage 44` уходит на вкладку N4). В тесте `'marks a coming-soon level as empty'` — клик по N4 → так как N4 `coming_soon`, показывается «появится позже» (шим уровня не отменяет проверку статуса). Остальные тесты (`locked`, read-badge) — без изменений по смыслу, только данные из `lessons`. Файл фикстур `readIds`/`effLevels` не трогать.

Run: `npx vitest run tests/ui/TextsListScreen.test.tsx`
Expected: FAIL — `listLessons is not a function` / экран всё ещё зовёт `listTexts`.

- [ ] **Step 2: переписать `src/ui/screens/TextsListScreen.tsx`**

```typescript
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useContentDb, useEffectiveLevels } from '../useContentDb';
import { useUserDb } from '../useUserDb';

/**
 * Переходный шим до плана 5-2: у урока нет `level`, только сквозной `stage`.
 * Мигрированные тексты получили stage 2..18 (условно N5) и 42..52 (условно N4).
 * План 5-2 заменит вкладки уровней на единый список курса по `stage`.
 */
const STAGE_LEVEL_SPLIT = 40;
const levelOfStage = (stage: number): string => (stage < STAGE_LEVEL_SPLIT ? 'N5' : 'N4');

export function TextsListScreen() {
  const db = useContentDb();
  const levels = useEffectiveLevels();
  const user = useUserDb();
  const [activeLevel, setActiveLevel] = useState(levels[0]?.code ?? '');

  const activeLevelObj = levels.find((l) => l.code === activeLevel);
  const allLessons = useMemo(() => db.listLessons(), [db]);
  const points = useMemo(
    () => allLessons.filter((l) => levelOfStage(l.stage) === activeLevel),
    [allLessons, activeLevel],
  );
  const readIds = user.getSetting<string[]>('texts_read_ids', []);

  return (
    <section className="screen">
      <h1>Тексты</h1>
      <div role="tablist" className="level-tabs">
        {levels.map((l) => (
          <button
            key={l.code}
            role="tab"
            type="button"
            aria-selected={l.code === activeLevel}
            className="level-tab"
            onClick={() => setActiveLevel(l.code)}
          >
            {l.code}
          </button>
        ))}
      </div>
      {activeLevelObj?.status === 'coming_soon' || activeLevelObj?.status === 'locked' ? (
        <p className="muted">Материал уровня {activeLevel} появится позже.</p>
      ) : points.length === 0 ? (
        <p className="muted">Текстов пока нет.</p>
      ) : (
        <ul className="text-list">
          {points.map((p) => (
            <li key={p.id}>
              <Link to={`/texts/${p.id}`} className="text-list-item">
                <span className="text-list-title">{p.title}</span>
                {readIds.includes(p.id) ? (
                  <span className="text-read-badge" aria-label="прочитано">✓</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

Run: `npx vitest run tests/ui/TextsListScreen.test.tsx`
Expected: PASS.

- [ ] **Step 3: обновить `tests/ui/TextDetailScreen.test.tsx` (падающий)**

Заменить `sample` и фейковую БД:

```typescript
import { TextDetailScreen } from '@/ui/screens/TextDetailScreen';
import type { Level, LessonFull } from '@/core/types';

const levels: Level[] = [{ code: 'N5', ord: 1, status: 'available', titleRu: 'N5' }];
const sample: LessonFull = {
  id: 'n5-sample',
  stage: 3,
  kind: 'text',
  title: 'サンプル',
  introducesCount: 0,
  isFreeReading: true,
  bodyRuby: 'これは 文[ぶん]です。\n\n二[ふた]つ目[め]の 段落[だんらく]です。',
  translationRu: 'Это предложение.\n\nВторой абзац.',
  questions: [
    { prompt: 'Вопрос 1?', choices: ['A', 'B', 'C'], answerIndex: 1 },
    { prompt: 'Вопрос 2?', choices: ['D', 'E', 'F'], answerIndex: 0 },
  ],
  introduces: [],
  markers: [],
};
const fakeDb = {
  getLesson: (id: string) => (id === sample.id ? sample : null),
} as unknown as import('@/storage/content-db').ContentDb;
```

Остальные тесты файла — без изменений (экран рендерит `.title`/`.bodyRuby`/`.translationRu`/`.questions`, пишет `texts_read_ids` как раньше).

Run: `npx vitest run tests/ui/TextDetailScreen.test.tsx`
Expected: FAIL — `getLesson is not a function` / экран зовёт `getText`.

- [ ] **Step 4: править `src/ui/screens/TextDetailScreen.tsx`**

Единственное изменение — источник данных. Строка:

```typescript
  const point = useMemo(() => db.getText(id), [db, id]);
```

→

```typescript
  const point = useMemo(() => db.getLesson(id), [db, id]);
```

Больше в файле ничего не меняется (`point.title`, `point.bodyRuby`, `point.translationRu`, `point.questions`, `point.id` — все есть в `LessonFull`; `point.level` не используется).

Run: `npx vitest run tests/ui/TextDetailScreen.test.tsx`
Expected: PASS.

- [ ] **Step 5: удалить временные обёртки из `src/storage/content-db.ts`**

Удалить методы `listTexts` и `getText` (блок «Переходные обёртки…» целиком) и убрать `TextPoint` из импорта типов (строка 3 — из задачи 3 там `..., VocabPoint, TextPoint, LessonMeta, ...` → убрать `TextPoint`).

Run: `npm run typecheck`
Expected: чисто. Если tsc ругается на неиспользуемый импорт где-то ещё — grep `getText\|listTexts\|TextPoint` по `src/` и убрать оставшиеся ссылки (их не должно быть — задача 4 их все закрыла).

- [ ] **Step 6: собрать приложение и прогнать e2e текстов**

Run: `npm run build-content && npm run build && npx playwright test tests/e2e/texts-browse.spec.ts`
Expected: оба теста зелёные. Первый: список N5 → 9 `.text-list-item` (уроки stage 2..18), открытие «キツネとツル», перевод, 4 вопроса, бейдж «прочитано». Второй: вкладка N4 → 6 `.text-list-item` (stage 42..52).
Если первый тест падает на счётчике: проверить, что все 9 N5-уроков имеют `stage < 40`, а 6 N4 — `stage >= 40` (из вывода миграции задачи 2). Правок кода не требуется — при верных `stage` тест проходит как есть; если Playwright всё же требует поправить селектор/ожидание, внести минимальную правку в `texts-browse.spec.ts` и описать её в коммите.

- [ ] **Step 7: полная vitest-регрессия + typecheck + lint**

Run: `npm run typecheck && npm run lint && npx vitest run`
Expected: всё зелёное.

- [ ] **Step 8: коммит**

```bash
git add src/ui/screens/TextsListScreen.tsx src/ui/screens/TextDetailScreen.tsx src/storage/content-db.ts tests/ui/TextsListScreen.test.tsx tests/ui/TextDetailScreen.test.tsx
git commit -m "feat(lessons): /texts screens read lessons; drop transitional text wrappers"
```

---

### Task 5: удалить путь `texts` целиком + CREDITS + финальная регрессия

Убираем всё, что осталось от старой модели `texts`: парсер, фикстуры, тесты парсера, таблицы `texts`/`text_questions`, типы `TextPoint`/`TextQuestion`, `textsDir` из пайплайна, каталог `content/texts/`. Правим строку-итог в `content/CREDITS.md`. Прогоняем полную регрессию, включая упаковку установщика.

**Files:**
- Delete: `scripts/build-content/parse-texts.ts`
- Delete: `tests/scripts/parse-texts.test.ts`
- Delete: `tests/fixtures/text-valid.md`, `tests/fixtures/text-missing-section.md`
- Delete: `content/texts/` (весь каталог с 15 файлами в `n5/`, `n4/`)
- Modify: `scripts/build-content/schema.sql` (удалить `texts`, `text_questions`)
- Modify: `scripts/build-content/write-db.ts` (убрать импорт `parse-texts`, `textsDir` из `BuildOpts`, блок загрузки/валидации/вставки текстов)
- Modify: `scripts/build-content/index.ts` (убрать `textsDir`)
- Modify: `src/core/types.ts` (удалить `TextQuestion`, `TextPoint`)
- Modify: `tests/scripts/build-content.test.ts` (убрать `texts`/`text_questions` из списка таблиц; убрать `textsDir` из `opts`; удалить тест `'produces 15 real texts ...'`)
- Modify: `content/CREDITS.md` (строка-итог раздела «Тексты»)

**Interfaces:**
- Consumes: ничего нового.
- Produces: `content.db` без таблиц `texts`/`text_questions`; кодовая база без символа `Text*`/`parse-texts`/`textsDir`.

- [ ] **Step 1: удалить файлы старой модели**

```bash
git rm scripts/build-content/parse-texts.ts tests/scripts/parse-texts.test.ts tests/fixtures/text-valid.md tests/fixtures/text-missing-section.md
git rm -r content/texts
```

- [ ] **Step 2: `scripts/build-content/schema.sql` — удалить таблицы текстов**

Удалить блок:

```sql
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
```

(Порядок остальных таблиц: `... vocab_points`, затем `lessons` + 3 lesson-таблицы, затем `meta` последней.)

- [ ] **Step 3: `scripts/build-content/write-db.ts` — вырезать путь текстов**

- Удалить строку `import { loadAllTexts, validateTexts } from './parse-texts';`
- Удалить поле `textsDir: string;` из `BuildOpts`.
- Удалить весь блок между вставкой vocab и вставкой lessons:

```typescript
  const texts = loadAllTexts(opts.textsDir).sort((a, b) => a.id.localeCompare(b.id));
  const textErrors = validateTexts(texts);
  if (textErrors.length) throw new Error(`texts validation failed:\n${textErrors.join('\n')}`);
  for (const t of texts) {
    if (!levelCodes.has(t.level)) throw new Error(`text ${t.id}: unknown level ${t.level}`);
  }
  const insT = db.prepare(/* ... */);
  const insTQ = db.prepare(/* ... */);
  for (const t of texts) { /* ... */ }
  insT.free();
  insTQ.free();
```

(Блок загрузки/валидации/вставки `lessons` из задачи 2 остаётся.)

- [ ] **Step 4: `scripts/build-content/index.ts` — убрать `textsDir`**

Удалить строку `textsDir: resolve(root, 'content/texts'),` из объекта аргумента `buildContentDb`.

- [ ] **Step 5: `src/core/types.ts` — удалить `TextQuestion` и `TextPoint`**

Удалить оба интерфейса (`TextQuestion`, `TextPoint`) целиком. `Lesson*`-типы остаются.

Run: `grep -rn "TextPoint\|TextQuestion\|parse-texts\|loadAllTexts\|validateTexts\|textsDir\|listTexts\|getText" src scripts tests`
Expected: **ноль совпадений** (кроме, возможно, `docs/`). Любое совпадение — дочистить.

- [ ] **Step 6: `tests/scripts/build-content.test.ts` — убрать тексты**

- В тесте схемы убрать `'text_questions'` и `'texts'` из ожидаемого массива:

```typescript
    expect(tables).toEqual([
      'grammar_examples',
      'grammar_points',
      'grammar_relations',
      'kanji_points',
      'lesson_introduces',
      'lesson_markers',
      'lesson_questions',
      'lessons',
      'levels',
      'meta',
      'vocab_points',
    ]);
```

- Убрать `textsDir: resolve(__dirname, '../../content/texts'),` из объекта `opts`.
- Удалить тест `it('produces 15 real texts (9 N5, 6 N4) with questions and intact FKs', ...)` целиком (его роль занял тест «15 lessons» из задачи 2).

- [ ] **Step 7: `content/CREDITS.md` — строка-итог**

Заменить строку:

```
  Итого в разделе «Тексты»: 9 текстов N5 + 6 текстов N4.
```

на:

```
  Итого: 15 уроков чтения (условно 9 N5 + 6 N4), мигрированы из прежнего раздела «Тексты»
  в курс градуированного чтения (план 5). Японский текст, перевод и вопросы не менялись.
```

(Остальной текст раздела — атрибуция источников — корректен и не трогается.)

- [ ] **Step 8: пересобрать content.db и прогнать всё**

Run: `npm run build-content && npm run typecheck && npm run lint && npx vitest run`
Expected: `content.db` собирается; typecheck и lint чисто; vitest — все зелёные. Записать фактические числа файлов/тестов из вывода (для памяти).

- [ ] **Step 9: сборка приложения + полный e2e**

Run: `npm run build && npx playwright test`
Expected: все e2e зелёные (19 spec-файлов). Особое внимание: `texts-browse.spec.ts`, `progress.spec.ts`, `today.spec.ts` — не должны затрагиваться (SRS/планировщик план 5-1 не трогает).

- [ ] **Step 10: сборка установщика**

Run: `npm run build:desktop:installer`
Expected: `dist/JLPT Setup 1.4.0.exe` создан без ошибок. (Если первая упаковка падает на распаковке `winCodeSign*.7z` — включить Developer Mode или запустить из консоли администратора, см. `docs/RELEASE-CHECKLIST.md`. Это инфраструктура, не регресс кода.)

- [ ] **Step 11: коммит**

```bash
git add -A
git commit -m "refactor(lessons): remove the texts model — parser, tables, types, fixtures, content/texts"
```

---

### Task 6: визуальное исправление — интерактивные области и кнопки вписаны в окно

CSS-only + e2e. Пользовательское требование: активные (кликабельные) области и блоки «текст + кнопки» должны **помещаться** в окно приложения на любой ширине и **не обрезаться** — ни искусственным `overflow: hidden`, ни выходом за край окна. Корень проблемы: дети CSS-grid (`.q-options`, `.rating-row`) имеют неявный `min-width: auto` и при длинном неразрывном тексте варианта раздвигают колонку шире контейнера — кнопки уезжают под край окна / появляется горизонтальный скролл всего экрана. Классы `.q-options`/`.q-opt` общие для `QuestionView` (тест/плейсмент) и `TextDetailScreen`, поэтому фикс закрывает и текущие экраны `/texts`, и будущий плеер урока (план 5-2 переиспользует `QuestionView`).

**Files:**
- Modify: `src/ui/theme.css`
- Modify: `tests/e2e/texts-browse.spec.ts` (добавить тест узкого окна)

**Interfaces:** новых экспортов нет. Гарантия: на окне шириной 360-400px экраны `/texts` и `/texts/:id` не дают горизонтального переполнения корня документа, и ни одна кнопка-вариант/кнопка-действие не выходит за `window.innerWidth`.

- [ ] **Step 1: добавить тест узкого окна в `tests/e2e/texts-browse.spec.ts` (падающий, если фикс не применён)**

Дописать новый тест в конец файла:

```typescript
test('экраны урока помещаются в узкое окно без горизонтального обрезания', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'jlpt-e2e-texts-narrow-'));
  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/main.js'), `--user-data-dir=${userData}`],
  });
  const win = await app.firstWindow();
  await win.waitForSelector('[data-testid="user-db-ready"]', { state: 'attached', timeout: 20_000 });
  await win.setViewportSize({ width: 380, height: 800 });

  await win.getByRole('link', { name: /Тексты/ }).click();
  await expect(win.getByRole('heading', { name: 'Тексты' })).toBeVisible();

  // список: без горизонтального переполнения корня
  const listOverflow = await win.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(listOverflow).toBeLessThanOrEqual(1);

  await win.getByRole('link', { name: /キツネとツル/ }).click();
  await expect(win.getByRole('heading', { name: 'キツネとツル' })).toBeVisible();

  // деталь урока: первый вопрос виден сразу, варианты внутри окна
  const detailOverflow = await win.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(detailOverflow).toBeLessThanOrEqual(1);

  const anyOptClipped = await win.evaluate(
    () =>
      [...document.querySelectorAll('.q-opt')].some(
        (el) => el.getBoundingClientRect().right > window.innerWidth + 1,
      ),
  );
  expect(anyOptClipped).toBe(false);

  // кнопка «Показать перевод» — тоже внутри окна
  const revealClipped = await win.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((el) => el.textContent?.includes('Показать перевод'));
    return b ? b.getBoundingClientRect().right > window.innerWidth + 1 : true;
  });
  expect(revealClipped).toBe(false);

  await app.close();
});
```

Run (после `npm run build-content && npm run build`): `npx playwright test tests/e2e/texts-browse.spec.ts`
Expected: новый тест FAIL (варианты `.q-opt` в `grid 1fr 1fr` с длинным русским текстом «Они помирились и поели вместе» переполняют колонку → `scrollWidth > clientWidth` или `q-opt.right > innerWidth`). Первые два теста файла — PASS.

- [ ] **Step 2: применить CSS-фикс в `src/ui/theme.css`**

Дописать в конец файла отдельный блок:

```css
/* --- Plan 5-1: интерактивные области вписаны в окно, ничего не обрезается --- */
/* Дети CSS-grid по умолчанию имеют min-width:auto и раздвигают трек шире
   контейнера при длинном неразрывном содержимом. min-width:0 + перенос по
   любому месту удерживают кнопки в колонке экрана. */
.q-options,
.rating-row { max-width: 100%; }
.q-opt,
.rating { min-width: 0; overflow-wrap: anywhere; }
/* На узком окне два столбца вариантов не помещаются — переходим в один. */
@media (max-width: 28rem) {
  .q-options { grid-template-columns: 1fr; }
}
/* Кнопки-действия с крупным паддингом не должны быть шире своей колонки. */
.btn-primary,
.btn-ghost { max-width: 100%; box-sizing: border-box; overflow-wrap: anywhere; }
/* Вкладки уровней при нехватке ширины переносятся, а не режутся краем окна. */
.level-tabs { flex-wrap: wrap; }
```

(`overflow-x: hidden` на контейнерах **не** добавляем — это спрятало бы переполнение, а не устранило; требование — чтобы содержимое помещалось. Гарантия отсутствия скролла — ассерт `scrollWidth <= clientWidth` в тесте шага 1.)

- [ ] **Step 3: прогнать e2e текстов — тест узкого окна зелёный**

Run: `npm run build && npx playwright test tests/e2e/texts-browse.spec.ts`
Expected: все три теста файла PASS.

- [ ] **Step 4: убедиться, что фикс не сломал тест/плейсмент (общие классы `.q-*`)**

Run: `npx vitest run && npx playwright test tests/e2e/review.spec.ts tests/e2e/placement.spec.ts`
Expected: всё зелёное — CSS-правки аддитивны (перенос текста + `min-width:0`), поведение и разметку не меняют.

- [ ] **Step 5: typecheck + lint + коммит**

Run: `npm run typecheck && npm run lint`
Expected: чисто (CSS eslint не проверяет; `.tsx` не тронут — только новый e2e-тест).

```bash
git add src/ui/theme.css tests/e2e/texts-browse.spec.ts
git commit -m "fix(ui): keep option buttons and actions inside the window on narrow widths"
```

- [ ] **Step 6: обновить память**

В `C:\Users\am200\.claude\projects\C--Users-am200-Documents-ClaudeWork\memory\jlpt-desktop-app.md` — отметить: план 5-1 реализован (модель `Lesson`, `content/lessons/*.md`, таблицы `lessons`/`lesson_questions`/`lesson_introduces`/`lesson_markers`, 15 текстов мигрированы со `stage` 2..18 / 42..52 как свободное чтение, `/texts`-экраны на `getLesson`, CSS-фикс вписывания интерактива в окно); след. — план 5-2 (плеер урока): `writing-plans` по 5-2 в свежей сессии. Обновить строку-указатель в `MEMORY.md` при необходимости.

---

## Self-Review

**1. Покрытие спеки (§ «План 5-1» и §1):**

| Требование спеки | Задача |
|---|---|
| §1.1 формат `content/lessons/*.md` (stage/kind/теги, те же секции) | 1 (парсер), 2 (миграция) |
| §1.1 `kind: dialogue` + префикс говорящего + паритет абзацев | 1 (`parseMarkers`/валидация, тест диалога) |
| §1.2 inline-маркеры `{{TYPE:id\|surface}}`, только первое вхождение, резолв id, тело с развёрнутым маркером + таблица маркеров с предложением-контекстом | 1 (`parseMarkers`), 2 (`validateLessonRefs`, `insertLessons`) |
| §1.3 схема content.db: `texts`→`lessons` + 3 таблицы, `level`/индекс убраны, без миграции | 1 (schema.sql), 5 (удаление `texts`) |
| §1.4 порядок `(stage, id)`; обязательные vs свободное чтение (`introducesCount`/`isFreeReading`); 15 текстов → `kind: text`, ручной `stage`, пустые `introduces` | 2 (миграция), 3 (`listLessons`) |
| §1.5 `content-db.ts`: `listLessons`/`getLesson`, `LessonFull` расширяет прежний `TextPoint` (bodyRuby/translationRu/questions) | 3 |
| §1.5 `src/core/types.ts`: `TextPoint`/`TextQuestion` → `LessonMeta`/`LessonFull`/`LessonQuestion` | 1 (добавить), 5 (удалить старое) |
| §1.6 пайплайн `lessons.ts` зеркалит `parse-texts.ts` + маркеры + `introduces` + жёсткая валидация (резолв id, паритет, префиксы диалога, диапазон answer_index) | 1 (парсер+`validateLessons`), 2 (`validateLessonRefs`+`insertLessons`) |
| §1.6 `index.ts`: `textsDir` → `lessonsDir` | 2 (добавить `lessonsDir`), 5 (убрать `textsDir`) |
| §1.6 `migrate-texts-to-lessons.ts` + прогон + удаление `content/texts/` | 2 (скрипт+прогон), 5 (удаление) |
| §1.7 `TextsListScreen`/`TextDetailScreen` работают на новых данных, роуты `/texts` те же | 4 |
| §6 тесты: парсер (резолв id, извлечение предложений, split диалога, паритет); `content-db` `listLessons`/`getLesson`; (гейтинг курса — плана 5-2, здесь только `introducesCount`/`isFreeReading`) | 1, 2, 3 |
| Требование пользователя (2026-09-08): интерактивные области и кнопки вписаны в окно, ничего не обрезается искусственно | 6 |

Не в объёме 5-1 (подтверждено спекой): плеер урока (5-2), связь с SRS / `course_progress` / `course_completed_ids` / `migrateTextsRead` / изменения планировщика / «Продолжить курс» (5-3), `sectionBody('Кратко')` и синтетические `GrammarPointFull` (5-2).

**2. Скан плейсхолдеров:** код приведён полностью в каждом шаге (парсер, миграция, `insertLessons`, методы `content-db`, диффы экранов, тела всех новых тестов). «Add validation» нет — все проверки перечислены явными строками ошибок. Единственные отсылки «как раньше»/«без изменений» — там, где файл **буквально не меняется** (тело `parseQuestions` скопировано из `parse-texts.ts` дословно в шаге 1.7; правки экранов — точечные, показана строка до/после).

**3. Согласованность типов и имён:**
- `ParsedLesson` (build-time, экспортируется из `lessons.ts`) ≠ `LessonFull` (runtime, из `types.ts`) — разведены намеренно: `ParsedLesson.introduces` = `{type,id}[]` без `role`, `reviews` отдельным сырым списком; `LessonFull.introduces` = `LessonIntroduce[]` c `role`. `insertLessons` строит `lesson_introduces` из обоих.
- `ItemType` (`'grammar'|'kanji'|'vocab'`) — общий и для `LessonIntroduce.type`, и для `ParsedLesson`, и для `TYPE_MAP` в парсере (`v→vocab`, `g→grammar`, `k→kanji`).
- Имена методов: `listLessons`/`getLesson` — единообразно во всех задачах (3 определяет, 4 потребляет, тесты в 1/2/3).
- `STAGE_LEVEL_SPLIT = 40` — одно значение и в шиме `TextsListScreen` (задача 4), и в грубых обёртках `content-db` (задача 3, живут только между 3 и 4). Миграция (задача 2) кладёт N5 в 2..18, N4 в 42..52 — обе стороны от 40 с запасом.
- `validateLessons` (без множеств) vs `validateLessonRefs` (с множествами) — обе из `lessons.ts`, обе зовутся из `write-db.ts` перед `insertLessons`.
- Таблицы: `lessons`, `lesson_questions`, `lesson_introduces`, `lesson_markers` — имена колонок в schema.sql (шаг 1.2) сходятся с `INSERT` в `insertLessons` (шаг 2.5) и `SELECT` в `content-db.ts` (шаг 3.2): `item_type`/`item_id`/`role`/`ord`, `surface`/`sentence_ruby`/`sentence_ru`.

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-09-08-plan-5-1-lesson-model.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — свежий субагент на задачу, ревью между задачами, быстрая итерация.

**2. Inline Execution** — задачи в этой сессии через executing-plans, батчами с чекпойнтами.

**Which approach?**
