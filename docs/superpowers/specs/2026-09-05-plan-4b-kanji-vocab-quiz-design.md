# Дизайн: План 4b — типы вопросов и SRS-карточки для кандзи/слов

- **Дата:** 2026-09-05
- **Статус:** черновик на ревью
- **Родительская спека:** `docs/superpowers/specs/2026-09-03-jlpt-desktop-app-design.md` (§5 типы карточек), `docs/superpowers/specs/2026-09-04-plan-4a-kanji-vocab-content-design.md` (§«Вне рамок плана 4a» — этот план закрывает описанный там разрыв).
- **Предыдущие планы:** План 4a (4a-1..4a-5) — контент кандзи+слов+грамматика N5/N4, влит в master. `content.db` содержит `kanji_points` (81 N5 + 177 N4), `vocab_points` (681 N5 + 630 N4) — полностью готовы к чтению, `ContentDb.listKanji/getKanji/searchKanji` и `listVocab/getVocab/searchVocab` уже существуют.
- **Место в декомпозиции плана 4:** 4a (контент) → **4b (этот документ)** → 4c (Тексты+настройки) → 4d (Android).

## 1. Цель и рамки

### Цель

Довести кандзи и слова до того же уровня вовлечённости, что и грамматика: SRS-карточки в
`user.db`, вопросы в ежедневной сессии, повторение по FSRS. Сейчас кандзи/слова — только
справочник (карточка + поиск), не участвуют в обучении.

### В рамках плана 4b

- Два новых типа вопросов: «что значит X» и «как читается X» — для кандзи и для слов
  отдельно (4 генератора вопросов итого, все типа `choice`).
- Кандзи/слова полноценно участвуют в ежедневной очереди: due-повторения мёрджатся по
  всем трём типам (грамматика/кандзи/слова), новые карточки распределяются поровну между
  типами из общего `new_per_day`.
- Экран обучения новой карточки (`ReviewScreen`, фаза `learn`) — новые компактные карточки
  для кандзи/слов взамен текущего жёстко-грамматического рендера (title+markdown+examples).
- `QuestionView`'s ссылка «Подробнее» — типизируется по `itemType`, ведёт на `/kanji/:id`
  или `/vocab/:id` вместо всегда `/grammar/:id`.

### Вне рамок плана 4b (описано, не реализуется)

- **Свободный ввод чтения каной** — новый `QuestionKind`, новый `Answer`-вариант, новая
  ветка грейдинга, новый рендер в `QuestionView` (сейчас в приложении вообще нет ни одного
  текстового поля-ответа). Осознанно отложено: choice уже покрывает распознавание чтения,
  ввод — это другой навык (активное вспоминание), достаточно большая отдельная фича.
- **Вопрос «кандзи↔слово»** (кликнуть кандзи внутри слова) — нет таблицы `vocab_kanji`
  (осознанно вырезана в 4a-3/4a-4), данных для связи нет. Не переоткрывать это решение
  здесь; если понадобится — отдельный план с добавлением junction-таблицы.
- **Мини-тест** (`session.ts`'s `minitest`-блок) остаётся grammar-only. Не расширяется.
- **`progress.ts`** (уровневые бары, `statusCounts`, unlock-правило ≥60%) остаётся
  grammar-only. Кандзи/слова копят карточки и due/new счётчики, но не участвуют в прогресс-
  барах уровня и не влияют на разблокировку следующего уровня.
- Схема `user.db` **не меняется** — `cards`/`review_log`.`item_type` уже свободная строка
  без CHECK-ограничения (проверено), `getCard`/`allCards`/`introducedOnOrAfter` уже
  принимают `itemType` параметром. Миграция не нужна.

### Разбивка на подпланы

- **4b-1** — вся генерализация инфраструктуры (типы, scheduler, session, общие quiz-хелперы)
  + кандзи-вопросы end-to-end (кандзи изучаются и повторяются).
- **4b-2** — слова поверх готовой с 4b-1 инфраструктуры (генераторы вопросов + подключение
  к уже обобщённым scheduler/session — по объёму меньше 4b-1, зеркалит как vocab N4 после
  готового пайплайна N5).

## 2. Текущее состояние (по факту, не по спекам)

Обследовано агентом перед дизайном, ключевые находки:

- `src/core/quiz/types.ts`: `QuestionBase.itemType` — строковый литерал `'grammar'`, НЕ
  дискриминант вариантов (`Question` дискриминируется по `kind`, не по `itemType`).
  `QuestionKind = 'cloze' | 'choice' | 'assemble'`. Никакого текстового input-типа нет.
- `src/core/quiz/registry.ts` (`generateForCard`/`generateOfKind`/`ROTATION`) типизирован
  на `GrammarPointFull`, но сама логика (rotation по `reps%3`, fallback-цепочка) не
  завязана на грамматику — просто вызывает `GENERATORS[kind](point, levelPoints, seed)`.
- `src/core/quiz/grammar-questions.ts`: `sectionBody`/`coreCandidates` завязаны на
  `bodyMarkdown`/`title` — этих полей у `KanjiPoint`/`VocabPoint` НЕТ. `pickDistractors`
  (`distractors.ts`), `seededShuffle`/`makeRng` (`rng.ts`), `shuffleWithAnswer` — уже
  полностью generic (`string[]`), переиспользуются без изменений.
- `src/core/session.ts`: `SessionStep`'s `review`-вариант хардкодит `itemType: 'grammar'`;
  `learn`-вариант вообще не несёт `itemType` — скрытая дыра, экран не может определить,
  какой контент грузить для новой карточки, если это не грамматика.
- `src/core/scheduler.ts`: `QueueItem.itemType` хардкодит `'grammar'`. `availableGrammarIds`
  сортирует по `(level.ord, layer, id)` — у кандзи/слов нет поля `layer` вообще.
  `split()` жёстко однотипный: `user.allCards('grammar')`, `introducedOnOrAfter(..,
  'grammar')`, один вызов `availableGrammarIds`.
- `src/storage/user-db.ts` и `src/core/srs.ts` — **уже полностью типо-агностичны**.
  `cards.item_type`/`review_log.item_type` — `TEXT NOT NULL` без CHECK, `getCard(itemType,
  id)`/`allCards(itemType?)`/`introducedOnOrAfter(iso, itemType?)` уже принимают строку
  параметром. Миграция схемы не требуется.
- `src/ui/components/QuestionView.tsx`: рендер полностью по `question.kind`, никаких
  грамматика-специфичных полей не читает — переиспользуется как есть, кроме хардкода
  ссылки `#/grammar/${itemId}` (`QuestionView.tsx:30`).
- `src/ui/screens/ReviewScreen.tsx`: **главная точка связности с грамматикой**. Строка
  `content.getGrammar(stepItemId)` хардкодит источник контента для ЛЮБОЙ фазы (learn/review/
  retry). Learn-фаза рендерит `point.title`+`GrammarMarkdown source={point.bodyMarkdown}`+
  `point.examples` — структурно несовместимо с `KanjiPoint`/`VocabPoint` (нет этих полей).
- `KanjiPoint`/`VocabPoint`: нет `title`/`bodyMarkdown`/`examples`/`layer`. Есть всё нужное
  для choice-вопросов: `onyomi`/`kunyomi`/`meaningRu`/`char` (кандзи), `headword`/`reading`/
  `meaningRu` (слово). `ContentDb.listKanji(level)`/`listVocab(level)` уже возвращают
  ПОЛНЫЙ объект без дополнительного join (в отличие от грамматики, где `listGrammar`
  даёт укороченную строку и нужен второй `getGrammar` на each id) — для пула дистракторов
  кандзи/слов достаточно одного вызова `listKanji`/`listVocab`.

## 3. Архитектура

### 3.1 Типы (`src/core/quiz/types.ts`)

```ts
export interface QuestionBase {
  id: string;
  itemType: 'grammar' | 'kanji' | 'vocab';
  itemId: string;
  kind: QuestionKind;
  prompt: string;
}
```
`QuestionKind`/`ClozeQuestion`/`AssembleQuestion`/`Answer`/`GradedAnswer` — без изменений.
`ChoiceQuestion` уже полностью generic по форме (choices+answerIndex) — кандзи/слова
используют её как есть, отличие только в значении `itemType`.

### 3.2 Общие quiz-хелперы

`distractorPool` (сейчас в `grammar-questions.ts`, типизирован на `GrammarPointFull`)
переносится в `src/core/quiz/distractors.ts` (уже содержит `pickDistractors`) и
генерализуется:
```ts
export function distractorPool<T extends { id: string }>(
  levelPoints: readonly T[], excludeId: string, extract: (p: T) => string[],
): string[]
```
`grammar-questions.ts` импортирует его оттуда вместо локального определения (без
поведенческих изменений — чистый рефакторинг переноса, покрыт существующими тестами
`grammar-questions.test.ts`).

### 3.3 Новые генераторы вопросов

`src/core/quiz/kanji-questions.ts`:
```ts
export const genKanjiMeaning: (point: KanjiPoint, levelPoints: readonly KanjiPoint[], seed: string) => ChoiceQuestion;
export const genKanjiReading: (point: KanjiPoint, levelPoints: readonly KanjiPoint[], seed: string) => ChoiceQuestion;
export function generateKanjiQuestion(point, levelPoints, reps: number, seed: string): Question;
```
- `genKanjiMeaning`: prompt `Что означает 食?`, correct = `point.meaningRu`, дистракторы —
  `meaningRu` других кандзи того же уровня через `distractorPool`+`pickDistractors`.
- `genKanjiReading`: prompt `Как читается 食?`, correct — один случайный (seeded) элемент
  из `[...onyomi, ...kunyomi]`, дистракторы — читения других кандзи (тот же пул, он+кун
  вперемешку, чтобы нельзя было угадать тип чтения по виду).
- `generateKanjiQuestion` чередует meaning/reading по `reps % 2` (проще ROTATION-цепочки
  грамматики: оба генератора всегда успешны — `validateKanji` гарантирует ≥1 чтение и
  непустой `meaningRu`, fallback-цепочка не нужна).

`src/core/quiz/vocab-questions.ts` — зеркально: `genVocabMeaning`/`genVocabReading`
(reading — просто `point.reading`, без выбора между он/кун), `generateVocabQuestion`.

Тесты: `tests/core/quiz/kanji-questions.test.ts`, `.../vocab-questions.test.ts` — по
образцу `grammar-questions.test.ts` (детерминированность по seed, корректный
answerIndex, дистракторы не совпадают с ответом).

### 3.4 Scheduler (`src/core/scheduler.ts`)

```ts
export interface QueueItem {
  itemType: 'grammar' | 'kanji' | 'vocab';
  itemId: string;
  kind: 'due' | 'new';
}
```

`availableGrammarIds` → `availableItemIds(content, itemType)`:
- `'grammar'`: без изменений (level.ord, layer, id).
- `'kanji'`/`'vocab'`: `content.listKanji(lvl.code)`/`listVocab(lvl.code)` по всем
  `available`-уровням, сортировка `(level.ord, id)` — нет `layer`, порядок внутри уровня
  по id (детерминированно, лучшего сигнала без доп. данных о частотности нет — не в
  рамках плана добавлять frequency-поле).

`knownGrammarIds` → `knownItemIds(content, itemType)` — аналогично.

`split()` меняется на функцию по одному типу + оркестратор:
```ts
function splitForType(user, content, now, itemType, newBudget): Split
function split(user, content, now): { grammar: Split; kanji: Split; vocab: Split }
```
Общий `new_per_day` делится поровну между типами, у которых есть доступный контент
(`available` хотя бы для одного уровня) — round-robin остаток: 5 → [2,2,1] в порядке
grammar,kanji,vocab. `due` каждого типа считается независимо (уже поддерживается
`user.allCards(itemType)`), НЕ делится бюджетом — все просроченные карточки идут в
очередь независимо от типа, только `review_queue_cap` общий на все due суммарно (не по
типам — иначе легко превысить реальный кап при мёрдже).

`buildQueue`: мёрджит `QueueItem[]` всех трёх `Split`, дальше существующая логика
(seeded shuffle по day-key, "due первым, если есть due") без изменений — она уже
type-agnostic (работает по `kind`, не по `itemType`).

`daySummary`: `dueCount`/`newCount` — суммы по трём типам. `miniTestEligible` — БЕЗ
изменений, только `user.allCards('grammar')` (решено оставить grammar-only).

### 3.5 Session (`src/core/session.ts`)

```ts
export type SessionStep =
  | { phase: 'learn'; itemType: 'grammar' | 'kanji' | 'vocab'; itemId: string }
  | { phase: 'review'; item: { itemType: 'grammar' | 'kanji' | 'vocab'; itemId: string; kind: 'due' | 'new' }; question: Question }
  | { phase: 'minitest'; question: Question; sourceItemId: string; index: number };
```
`buildDailySession`: для каждого `QueueItem` — диспетчинг по `itemType`:
- получить точку: `getGrammar`/`getKanji`/`getVocab`.
- пул уровня для дистракторов: `levelPointsFor` (грамматика, как сейчас) /
  `content.listKanji(level)` / `content.listVocab(level)` (уже полные объекты).
- вопрос: `generateForCard` (грамматика) / `generateKanjiQuestion` / `generateVocabQuestion`.
- `user.getCard(qi.itemType, qi.itemId)` вместо хардкода `'grammar'`.

Мини-тест-блок — без изменений (остаётся на `user.allCards('grammar')`).

### 3.6 UI

`QuestionView.tsx`: `href={`#/${question.itemType}/${question.itemId}`}` вместо хардкода
`#/grammar/...` (`/kanji/:id`, `/vocab/:id` уже зарегистрированы в `routes.tsx` с 4a).

`ReviewScreen.tsx`:
- `content.getGrammar(stepItemId)` → диспетчинг по `itemType` текущего шага
  (`getGrammar`/`getKanji`/`getVocab`).
- Новые компоненты `src/ui/components/KanjiLearnCard.tsx` /
  `src/ui/components/VocabLearnCard.tsx` для фазы `learn` — компактная карточка
  (кандзи: символ крупно + он/кун + значение + число черт; слово: заголовок+чтение +
  часть речи + значение), кнопка «Понятно» как сейчас.
- `user.getCard(step.item.itemType, ...)`/`newCard(step.item.itemType, ...)` вместо
  хардкода `'grammar'` во всех точках вызова (`next()`, retry-эффект).

`levelPointsFor`-аналог для кандзи/слов не нужен как отдельная функция — `listKanji`/
`listVocab` уже достаточны напрямую (см. §2).

## 4. Тестирование

- Новые unit-тесты генераторов (kanji-questions.test.ts, vocab-questions.test.ts).
- `distractorPool` remains covered by existing grammar-questions.test.ts (перенос, не
  новая логика) + при желании отдельный маленький тест на generic-сигнатуру.
- `scheduler.test.ts`: расширить `fakeContent` кандзи/слова-заглушками, тесты на
  round-robin бюджета между типами, на мёрдж due по типам, на то, что кандзи/слова
  не портят grammar-only `miniTestEligible`.
- `session.test.ts`: расширить `fakeContent`, тесты на диспетчинг по itemType,
  на корректный вызов нужного генератора.
- `ReviewScreen`/`QuestionView` UI-тесты: расширить фикстуры кандзи/слова-шагами,
  тест на рендер `KanjiLearnCard`/`VocabLearnCard`, тест на itemType-ссылку.
- Новый e2e: полный проход сессии с кандзи-карточкой (learn → review → grade),
  аналогично существующему `review.spec.ts`.

## 5. Самопроверка спеки

**Плейсхолдеры:** нет TBD — все сигнатуры конкретны, основаны на реальном коде (см. §2
цитаты агента-разведчика).
**Согласованность:** `user-db.ts`/`srs.ts` не меняются (уже generic) — не противоречит
нигде в тексте. Мини-тест/прогресс явно and последовательно исключены из рамок везде,
где упоминаются.
**Объём:** решено разбить на 4b-1 (инфраструктура+кандзи) и 4b-2 (слова) — каждый по
объёму сравним с одним из планов 4a, подходит для одного implementation-plan файла.
**Неоднозначность:** бюджет new_per_day между типами — явно зафиксирован round-robin
[2,2,1] порядок grammar→kanji→vocab (не альтернативы), due-кап — явно общий, не по типам.
