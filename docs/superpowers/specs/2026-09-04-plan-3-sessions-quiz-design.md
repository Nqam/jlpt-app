# Дизайн: План 3 — сессии, quiz-engine, автооценка, мини-тест дня

- **Дата:** 2026-09-04
- **Статус:** черновик на ревью
- **Родительская спека:** `docs/superpowers/specs/2026-09-03-jlpt-desktop-app-design.md` (§5 цикл обучения). Уточняет её под план 3; при расхождении общей архитектуры родительская спека — источник истины.
- **Предыдущие планы:** План 1 (справочник N5, merge `2e17bbe`) и План 2 (SRS-ядро, merge `c3496e5`) влиты в `master`.

## 1. Цель и рамки

### Цель

Заменить флеш-цикл повторения из плана 2 на настоящие вопросы с автоматической оценкой,
добавить сборщик дневной сессии (`session-builder`) и мини-тест дня. После плана 3
пользователь проходит ежедневную сессию из вопросов, а не переворачивания карточек.

### В рамках плана 3

- `quiz-engine` — расширяемый реестр типов вопросов; генерация вопроса из пункта
  грамматики; подбор дистракторов; автооценка (неверно → Again, верно → Good).
- Типы вопросов v1 (только грамматика): **пропуск в предложении** (клоуз), **выбор из 4**
  (значение конструкции), **сборка предложения** из перемешанных слов.
- `core/session` — `buildDailySession(now)`: упорядоченный список шагов
  (изучение нового / повторение / мини-тест).
- `ReviewScreen` переписан под шаги сессии и вопросы (заменяет флеш-раскрытие плана 2).
- Учебная сессия нового пункта: панель изучения (из плана 2) → первый вопрос.
- Мини-тест дня: 5–8 смешанных вопросов из выученного материала; провал помечает пункт для
  повтора внутри мини-теста; НЕ влияет на FSRS; засчитывается в «день закрыт» для стрика.
- `TodayScreen` — строка статуса включает состояние мини-теста.

### Вне рамок (планы 4–5)

- Кандзи и слова как контент, и их типы вопросов (кандзи ↔ слово, ввод чтения каной).
- Аудио-вопросы (нужен TTS-адаптер).
- Тонкая настройка автооценки по времени (Hard/Easy из `elapsed_ms`), адаптивные пороги.
- Адаптивный вступительный тест уровня.
- Механика разблокировки следующего уровня.
- Раздел «Тексты», экран настроек, сборка Android APK.
- Колонка `review_log.mode` и полноценный лог мини-теста (план тюнинга).

### Поставка после плана 3

Рабочее приложение интервального повторения грамматики N5, где ежедневная сессия —
это вопросы с автооценкой плюс мини-тест закрепления. Android — отдельным планом.

## 2. Архитектура

### Принципы (как в планах 1–2)

`src/core/**` и `src/storage/**` — чистый браузеро-совместимый TypeScript, без Node/Electron
импортов (правило ESLint `no-restricted-imports` держит инвариант; `npm run lint` зелёный,
`npm run build` без предупреждения `externalized for browser compatibility`).
Время в ядро — параметром `now: Date`; внутренних `Date.now()` нет
(в `src/ui/**` `Date.now()` для `elapsed_ms` допустим). Генерация вопросов детерминирована
seed-строкой — один и тот же вопрос в течение дня, тесты воспроизводимы. TDD:
Vitest для ядра, Playwright для сценариев Electron.

### Новые модули

| Модуль | Ответственность | Зависит от |
|---|---|---|
| `src/core/quiz/types.ts` | `QuestionKind`, `Question` (union), `Answer`, `GradedAnswer` | — |
| `src/core/quiz/distractors.ts` | `pickDistractors(pool, correct, n, seed)` — n неверных вариантов | `src/core/quiz/types.ts` |
| `src/core/quiz/grammar-questions.ts` | генераторы `cloze` / `choice` / `assemble` из `GrammarPointFull` | `content-db` (тип), `distractors`, `@/core/ruby` (токенизация) |
| `src/core/quiz/registry.ts` | реестр `Map<QuestionKind, Generator>`; `generateQuestion(kind, point, level, seed)` с фолбэком | `grammar-questions` |
| `src/core/quiz/grade.ts` | `grade(question, answer): GradedAnswer` | `types` |
| `src/core/session.ts` | `buildDailySession(user, content, now): SessionStep[]` | `scheduler` (`buildQueue`), `quiz/registry`, `srs` (`statusOf`), `content-db`, `user-db` |
| `src/ui/components/QuestionView.tsx` | рендер вопроса по типу, сбор ответа, разбор после ответа | `quiz/types`, `Furigana` |
| `src/ui/screens/ReviewScreen.tsx` | **переписан**: ведёт по `SessionStep[]`, вопросы + автооценка + мини-тест | `session`, `quiz`, `srs`, `useUserDb`, `useContentDb`, `GrammarMarkdown`, `Furigana`, `QuestionView` |

### Не изменяется

- `src/core/srs.ts` — `review()` / `newCard()` / `statusOf()` как есть.
- `src/core/scheduler.ts` — `buildQueue()` остаётся источником due + new. `daySummary`
  расширяется одним полем (см. §5), логика отбора не трогается.
- `src/core/progress.ts`, `src/storage/**` (`user.db` схема v1 достаточна — `review_log.elapsed_ms`
  уже есть), `src/platform/**`, `src/ui/UserDbProvider.tsx`, `src/ui/routes.tsx`, `Nav`,
  `ProgressScreen`.
- `src/ui/components/RatingButtons.tsx` из плана 2 — становится неиспользуемым; удаляется
  в плане 3 вместе с его тестом.

## 3. quiz-engine

### Типы (`src/core/quiz/types.ts`)

```ts
export type QuestionKind = 'cloze' | 'choice' | 'assemble';

interface QuestionBase {
  /** Детерминированный id: `${itemId}:${dayKey}:${kind}` (или `:mt:${n}` для мини-теста). */
  id: string;
  itemType: 'grammar';
  itemId: string;
  kind: QuestionKind;
  /** Текст задания на русском. */
  prompt: string;
}

/** Пропуск в предложении. `sentence` содержит маркер `___`; варианты — строки; ответ — индекс. */
export interface ClozeQuestion extends QuestionBase {
  kind: 'cloze';
  sentenceRuby: string;      // японское предложение в записи фуриганы с `___`
  choices: string[];         // длина 4, ровно один правильный
  answerIndex: number;
}

/** Выбор значения конструкции. */
export interface ChoiceQuestion extends QuestionBase {
  kind: 'choice';
  choices: string[];         // длина 4 (краткие описания)
  answerIndex: number;
}

/** Сборка предложения из перемешанных токенов. */
export interface AssembleQuestion extends QuestionBase {
  kind: 'assemble';
  tokens: string[];          // перемешанные (фуригана-токены)
  answerOrder: number[];     // индексы `tokens` в правильном порядке
  translationRu: string;     // перевод для подсказки в разборе
}

export type Question = ClozeQuestion | ChoiceQuestion | AssembleQuestion;

export type Answer =
  | { kind: 'index'; value: number }        // cloze / choice
  | { kind: 'order'; value: number[] };     // assemble

export interface GradedAnswer {
  correct: boolean;
  rating: 1 | 3;              // 1 = Again, 3 = Good (ts-fsrs Rating)
}
```

### Генераторы (`src/core/quiz/grammar-questions.ts`)

Вход: `GrammarPointFull` из `content-db.getGrammar(id)` (`{ id, title, level, layer, bodyMarkdown,
examples: { jaRuby, ru }[], relatedTitles: { id, title }[] }`), список пунктов того же уровня
для дистракторов, `seed: string`.

- **cloze**: выбрать пример (seeded). Вырезать ядро конструкции — эвристика: подстрока
  `jaRuby`, соответствующая кане из `title` до первой скобки/пробела (напр. `は`, `です`,
  `〜ます`); если не находится — пункт не поддерживает cloze, фолбэк. Заменить на `___`.
  `choices` = вырезанное ядро + 3 дистрактора из ядер других пунктов уровня. `prompt` =
  «Вставь подходящее».
- **choice**: `prompt` = `Что выражает «${title}»?`. Правильный вариант — первая непустая
  строка секции `## Кратко` из `bodyMarkdown` (усечь до ~80 символов). Дистракторы — те же
  строки `## Кратко` 3 других пунктов уровня.
- **assemble**: выбрать пример с ≥ 4 токенами (токен = разделённое пробелом в `jaRuby`).
  `tokens` = перемешанные (seeded Fisher–Yates) токены. `answerOrder` восстанавливает
  исходный порядок. `translationRu` = `ru` примера. Если ни один пример не даёт ≥ 4
  токенов — фолбэк.

Фолбэк-цепочка: `assemble → cloze → choice`. `choice` генерится всегда (нужен только
`title` + `## Кратко`, которые обязательны по валидатору плана 1).

### Дистракторы (`src/core/quiz/distractors.ts`)

```ts
pickDistractors(pool: string[], correct: string, n: number, seed: string): string[]
```

- `pool` — кандидаты (ядра конструкций / краткие описания того же уровня).
- Исключить точное совпадение с `correct` и дубли.
- Порядок предпочтения: сначала визуально/фонетически близкие к `correct` (общий префикс
  каны, близкая длина), затем остальные; добить seeded-случайными при нехватке.
- Всегда вернуть ровно `n` (при пустом пуле — заглушки `'—'`, но это сигнал бага контента,
  а не норма; тест ловит).

### Реестр (`src/core/quiz/registry.ts`)

```ts
type Generator = (point: GrammarPointFull, levelPoints: GrammarPointFull[], seed: string) => Question | null;
const GENERATORS: Record<QuestionKind, Generator>;

/** Выбор типа для карточки: ротация по reps (`reps % 3`) с фолбэком по цепочке. */
generateForCard(point, levelPoints, reps: number, seed: string): Question;
/** Явный тип (мини-тест). */
generateOfKind(kind, point, levelPoints, seed: string): Question;   // с фолбэком
```

### Автооценка (`src/core/quiz/grade.ts`)

```ts
grade(question: Question, answer: Answer): GradedAnswer
```

- `cloze` / `choice`: `answer.value === question.answerIndex` → `{ correct:true, rating:3 }`,
  иначе `{ correct:false, rating:1 }`.
- `assemble`: `answer.value` (массив) поэлементно равен `question.answerOrder` → верно.
- Hard/Easy не выводятся. `elapsed_ms` замеряет `ReviewScreen` и передаёт в `srs.review()`
  и в `review_log` как в плане 2 — тут не используется.

## 4. `core/session`

```ts
export type SessionStep =
  | { phase: 'learn';    itemId: string }
  | { phase: 'review';   item: { itemType: 'grammar'; itemId: string; kind: 'due' | 'new' }; question: Question }
  | { phase: 'minitest'; question: Question; sourceItemId: string; index: number };

export function buildDailySession(user: UserDb, content: ContentDb, now: Date): SessionStep[];
```

**Сборка:**
1. `scheduler.buildQueue(user, content, now)` → упорядоченный `QueueItem[]` (due + new,
   уже перемешаны, первым не `new`).
2. Для каждого элемента:
   - `kind: 'new'` → `{ phase:'learn', itemId }`, затем `{ phase:'review', item, question }`.
   - `kind: 'due'` → `{ phase:'review', item, question }`.
   - `question` = `registry.generateForCard(point, levelPoints, card.reps ?? 0, seed)`,
     `seed = \`${itemId}:${localDayKey(now)}:${reps}\``.
3. **Мини-тест** добавляется в конец, ЕСЛИ число карточек в статусе `learned` или `mastered`
   (по `srs.statusOf`) ≥ 5. Иначе шагов `minitest` нет.
   - Источники: seeded-выборка (`seed = \`mt:${localDayKey(now)}\``) из выученных пунктов,
     `min(8, max(5, floor(learnedCount / 2)))` штук.
   - Тип вопроса — ротация (`index % 3`), `generateOfKind`.
   - `id` вопроса = `${sourceItemId}:mt:${index}`.

**Идемпотентность:** повторный `buildDailySession` в тот же день даёт те же вопросы (seed по
`dayKey`); прогресс сессии живёт в состоянии `ReviewScreen`, не в результате сборки.

## 5. UI

### `QuestionView.tsx`

Пропсы: `{ question: Question; onAnswer: (a: Answer) => void; revealed: GradedAnswer | null }`.

- `cloze` / `choice`: 4 кнопки-варианта, клавиши `1`–`4`. Японский текст — через `Furigana`.
  После ответа (`revealed !== null`) — кнопки заблокированы, правильная подсвечена зелёным,
  выбранная неверная — красным.
- `assemble`: ряд жетонов (`tokens`); тап по жетону добавляет его в строку ответа снизу; тап
  по жетону в строке ответа убирает; кнопка «Готово» (активна когда использованы все токены)
  → `onAnswer({ kind:'order', value })`.
- Разбор после ответа: «Верно» / «Неверно», для `assemble` показать правильное предложение +
  `translationRu`, ссылка «Подробнее» → `/grammar/${itemId}`.

### `ReviewScreen.tsx` (переписан)

- На маунт: `steps = buildDailySession(user, content, new Date())`; `idx` от 0.
- `learn`-шаг: заголовок пункта + `GrammarMarkdown` + примеры с `Furigana` + «Понятно» → `idx+1`.
- `review`-шаг: `QuestionView`. `questionShownAt = Date.now()` при показе. На `onAnswer`:
  `elapsedMs = Date.now() - questionShownAt`; `g = grade(question, answer)`; показать разбор;
  по «Далее»: `card = user.getCard('grammar', itemId) ?? newCard(...)`;
  `{ card: next, log } = srs.review(card, g.rating, new Date(), elapsedMs, params)`;
  `user.upsertCard(next)`; `user.insertReviewLog(log)`; `idx+1`.
  (`params` из `settings` как в плане 2.)
- `minitest`-шаг: `QuestionView`. `g = grade(...)`. НЕ вызывает `srs.review` / `insertReviewLog`.
  Провал → `retryIds.add(sourceItemId)` + пометка в счётчике. После последнего `minitest`-шага,
  если `retryIds` непуст — прогнать по ним ещё один круг вопросов (тип `choice`), затем конец.
- Сброс состояния между шагами — `useLayoutEffect` на `idx` (урок плана 2: пассивный
  `useEffect` даёт кадр мелькания ответа).
- Клавиатура: `1`–`4` выбор, `Enter` подтвердить (assemble / «Далее»), `Esc` выход в `/`.
- Прерывание: оценённые `review`-шаги персистятся сразу; мини-тест не персистится — при
  повторном входе собирается заново.
- Конец сессии: сводка `Верно {r}/{R} · мини-тест {m}/{M}` (или «мини-тест —» если не было),
  кнопка «Готово» → `navigate('/')`.

### `TodayScreen.tsx`

- Строка: `{dueCount} повторить · {newCount} новых · мини-тест {done ? '✓' : '—'}`.
- `daySummary` расширяется полем `miniTestEligible: boolean` (`learnedCount >= 5`).
  «мини-тест ✓» показывается, когда `miniTestEligible && сегодня сессия пройдена` — признак
  «сессия пройдена сегодня» = запись в `review_log` с `day_key === сегодня` (уже доступно).
  До первого прохода — `—`.
- `allDone`, `queueOverCap`, кнопка «Начать» → `/review` — без изменений.

### `daySummary` (одно поле)

`src/core/scheduler.ts` `DaySummary` получает `miniTestEligible: boolean`. Вычисление —
`user.allCards('grammar').filter(c => statusOf(c) === 'learned' || 'mastered').length >= 5`.
Импорт `statusOf` из `@/core/srs` в `scheduler.ts` (уже допустимо — `progress.ts` так делает).
Логика отбора due/new не трогается.

## 6. Тестирование

TDD; Vitest для ядра (фейковые `ContentDb`/`UserDb`, `now` параметром, seeded), Playwright
для Electron.

| Модуль | Тесты |
|---|---|
| `quiz/grammar-questions` | cloze: `___` присутствует, `choices.length === 4`, ровно один `answerIndex` правильный, ядро вырезано из примера; choice: правильный из `## Кратко`, 3 дистрактора из чужих `## Кратко`; assemble: `tokens` — перестановка примера, `answerOrder` восстанавливает `jaRuby`, отказ при < 4 токенов; тот же seed → идентичный вопрос |
| `quiz/distractors` | ровно `n`; нет `correct`; нет дублей; из переданного пула; детерминизм при seed |
| `quiz/registry` | `generateForCard` ротация по `reps % 3`; фолбэк `assemble → cloze → choice` когда генератор вернул `null`; `choice` генерится всегда |
| `quiz/grade` | cloze/choice: индекс совпал → `rating 3`, не совпал → `rating 1`; assemble: массив поэлементно |
| `core/session` | new → `learn` затем `review`; due → только `review`; первый шаг не `review`-`new`; мини-тест отсутствует при `learned < 5`, присутствует и 5–8 вопросов при `learned >= 5`; источники мини-теста — выученные пункты; seed-детерминизм; идемпотентность |
| `ReviewScreen` (компонент, jsdom) | ответ на `review`-шаг зовёт `upsertCard` + `insertReviewLog` ровно по разу; `minitest`-шаг НЕ зовёт `insertReviewLog`; провал в мини-тесте добавляет в retry-круг; конец → сводка; смена шага без кадра мелькания |
| e2e (Electron) | первый запуск → сессия: изучить пункт → ответить на вопрос выбором → пройти все → (мини-тест пропущен: `learned < 5`) → сводка → «Готово» → снова на «Сегодня»; перезапуск приложения → прогресс на месте (оценённые карточки) |
| e2e (мини-тест) | сценарий с предзаполненным `user.db` (≥ 5 карточек `learned`) → сессия показывает шаги `minitest` в конце; провал одного → повтор в конце мини-теста |
| регрессия | vitest (78) + e2e (10) из плана 2 зелёные; `scheduler`/`progress`/`srs`/`user-db` не сломаны; `RatingButtons` и его тест удалены без битых импортов |

**Детерминизм времени:** ядро берёт `now: Date`; тесты с TZ-зависимостью пиннят
`process.env.TZ` (`if (saved === undefined) delete …; else restore` — как в планах 1–2).

## 7. Открытые вопросы

- Эвристика вырезания ядра конструкции для `cloze` — надёжность на 8 сид-пунктах N5 проверить
  при реализации; при слабой точности сузить `cloze` до пунктов-частиц, остальным — `choice`.
- Токенизация `assemble` по пробелам зависит от того, что автор контента ставил пробелы между
  бунсэцу в `jaRuby` (валидатор плана 1 это поощряет, но не требует) — измерить покрытие,
  при нехватке примеров `assemble` тихо уходит в фолбэк (тест это допускает).
- Признак «сессия пройдена сегодня» через `review_log.day_key` не отличает «прошёл повторения»
  от «прошёл и мини-тест» — для стрика это приемлемо (мастер-спека: день закрыт при закрытых
  повторениях), точный учёт мини-теста — с колонкой `review_log.mode` в плане тюнинга.
