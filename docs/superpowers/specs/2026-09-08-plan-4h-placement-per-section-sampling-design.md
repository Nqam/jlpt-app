# Дизайн: план 4h — вступительный тест как случайная выборка, отдельно по грамматике / кандзи / словам

Дата: 2026-09-08. Статус: согласовано.

## Проблема

Текущий вступительный тест — только по грамматике, бинарный поиск по каноническому
порядку. При всех верных ответах помечает все 43 пункта N5 известными за ~6 вопросов
(экстраполяция: предполагает монотонность знаний). У кандзи и слов порядка по
сложности НЕТ (`layer` есть только у грамматики), поэтому бинарный поиск для них
неприменим в принципе.

## Решение

Единый алгоритм для всех трёх типов — **случайная выборка без экстраполяции**:

1. Пользователь выбирает длину: **короткий 15 / средний 30 / длинный 60** вопросов.
2. Берётся seeded-перемешанная выборка пунктов уровня этого типа; если пунктов
   меньше запрошенного — берутся все.
3. Каждый вопрос генерируется существующим генератором с `reps=0`
   (грамматика — `generateForCard`, кандзи — `generateKanjiQuestion`, слова —
   `generateVocabQuestion`).
4. **Верный ответ** → пункт помечается «известно»: создаётся SRS-карточка с оценкой
   «Легко» (rating 4, как сейчас), id тегируется в `settings`.
5. **Неверный ответ ИЛИ пункт не попал в выборку** → ничего не создаётся. Пункт
   остаётся обычной «новой» карточкой и всплывает в ежедневном повторении. Дыры в
   знаниях сохраняются и проявляются потом — это и есть цель.

Бинарный поиск, «граница», проверочный проход, двойное подтверждение — всё удаляется.
`src/core/placement.ts` переписывается целиком под выборку.

## Не входит

- Экстраполяция «вы ответили 19/20, отметить остальные?» — сознательно нет.
- Отдельный режим «Учить» (викторина 1/3) — другая фича.
- Гейтинг: тест по разделу для `locked`-уровня недоступен так же, как сейчас (тянет
  `availableItemIds(content, type, availableCodes)`).

## 1. `src/core/placement.ts` (переписать)

```ts
import type { ItemType } from '@/core/types';

export type PlacementLength = 15 | 30 | 60;

export interface PlacementState {
  itemType: ItemType;
  ids: string[];        // seeded-перемешанная выборка, длина = min(length, доступно)
  index: number;        // текущий вопрос, 0-based
  correctIds: string[]; // id, на которые ответили верно (в порядке ответов)
}

/** Пул пунктов типа `itemType` в доступных уровнях (тот же порядок, что у scheduler). */
// grammar: availableItemIds(content, 'grammar', codes)
// kanji  : availableItemIds(content, 'kanji', codes)
// vocab  : availableItemIds(content, 'vocab', codes)

export function initPlacement(
  content: ContentDb,
  itemType: ItemType,
  availableCodes: ReadonlySet<string>,
  length: PlacementLength,
  seed: string,
): PlacementState;
// pool = availableItemIds(...); ids = seededShuffle(pool, seed).slice(0, length);
// { itemType, ids, index: 0, correctIds: [] }

export function isPlacementDone(s: PlacementState): boolean;   // s.index >= s.ids.length
export function placementQuestionNumber(s: PlacementState): number;  // s.index + 1
export function placementTotal(s: PlacementState): number;     // s.ids.length

/** Вопрос для текущего пункта. `null` если тест окончен или пункт не резолвится. */
export function nextPlacementQuestion(
  s: PlacementState, content: ContentDb, seed: string,
): { itemId: string; question: Question } | null;
// idx = s.index; id = s.ids[idx];
// grammar: point=content.getGrammar(id); generateForCard(point, levelPointsFor(content, point.level), 0, `${seed}:${id}`)
// kanji  : point=content.getKanji(id);   generateKanjiQuestion(point, content.listKanji(point.level), 0, `${seed}:${id}`)
// vocab  : point=content.getVocab(id);   generateVocabQuestion(point, content.listVocab(point.level), 0, `${seed}:${id}`)

export function applyPlacementAnswer(s: PlacementState, correct: boolean): PlacementState;
// id = s.ids[s.index];
// { ...s, index: s.index + 1, correctIds: correct ? [...s.correctIds, id] : s.correctIds }

/** id, которые тест считает известными (ответ верный). */
export function placementKnownIds(s: PlacementState): string[];  // s.correctIds
```

Убрать: `placementFrontierIds`, `placementRemaining`, `lo`/`hi`/`askedCount`.

## 2. Данные пользователя

Тегирование помеченных тестом карточек — per-type, чтобы кнопки сброса в Настройках
работали раздельно:

- `settings.placement_marked_grammar_ids: string[]`
- `settings.placement_marked_kanji_ids: string[]`
- `settings.placement_marked_vocab_ids: string[]`

Миграция существующего `settings.placement_marked_ids` (был grammar-only): при первом
чтении, если старый ключ непуст и `placement_marked_grammar_ids` пуст — скопировать
старый в grammar-ключ (одноразово, в helper при монтировании — рядом с
`backfillUnlockedFromProgress`, или прямо в `SettingsScreen`/`PlacementScreen` при
записи). Простейший вариант: helper `migratePlacementMarks(user)` в
`src/core/placement.ts`, вызвать в `UserDbProvider` после `UserDb.open`.

`placement_offered` (bool) — без изменений, первый запуск предлагает тест грамматики.

## 3. `PlacementScreen` (`src/ui/screens/PlacementScreen.tsx`)

Роут: `/placement/:type` где `type ∈ {grammar, kanji, vocab}`. Старый `/placement` →
редирект на `/placement/grammar` (или отдельный компонент-редирект в routes).

Экран:
1. **Экран выбора длины** (пока `length` не выбрана): заголовок «Тест: {раздел}»,
   три кнопки «Короткий · 15», «Средний · 30», «Длинный · 60». Под ними подпись
   «Верные ответы отметят пункты как известные. Остальные останутся в ежедневном
   повторении.» Если пунктов в разделе меньше 15 — показать только «Пройти тест
   (N вопросов)».
2. **Вопросы** (после выбора): `<p className="placement-counter">Вопрос {n} из {total}</p>`
   + `<QuestionView showExplainLink={false}>` + кнопка «Далее». (Как сейчас, но
   счётчик теперь точный `n / total`.)
3. **Итог**: «Готово. Отмечено как уже известные: {marked}.» + кнопка «На сегодня».
   `marked` = сколько новых карточек реально создано (пропускаем те, у кого карточка
   уже есть).

Логика завершения (эффект по `isPlacementDone`): для каждого `placementKnownIds(state)`
без существующей карточки — `review(newCard(itemType, id, now), 4, now, 0, params)` →
`upsertCard`; собрать `newlyMarked`; дописать в
`settings.placement_marked_{itemType}_ids`; `setSetting('placement_offered', true)`.

При выборе длины экран вызывает `initPlacement(content, itemType, availableCodes,
length, seed)` один раз, где `seed = Date.now().toString()` (свежая выборка при
каждом заходе; тесты передают фиксированный seed). Результат кладётся в `useState`.
`availableCodes` = `availableLevelCodes(user, content, now)`. Вопросный seed в
`nextPlacementQuestion` — тоже `'placement'` (постоянный, вопрос детерминирован
парой `id`+генератор).

## 4. Точки входа

### Шапки справочников

`GrammarListScreen` / `KanjiListScreen` / `VocabListScreen`: рядом с заголовком/
табами уровней — ссылка-кнопка `<Link className="btn-ghost" to="/placement/{type}">
Пройти тест по разделу</Link>`. Показывать только если активный уровень
`available` (не `locked`/`coming_soon`).

### Настройки

Блок «Вступительный тест» расширяется: три ссылки — «Тест: грамматика» / «Тест:
кандзи» / «Тест: слова» (`/placement/grammar` и т.д.). Существующую единственную
ссылку «Пройти вступительный тест заново» заменить этими тремя.

Кнопки сброса: сейчас «Сбросить результаты N5/N4 (N)» по грамматике. Обобщить:
для каждого типа, где `placement_marked_{type}_ids` непуст — кнопка «Сбросить тест:
{раздел} (N)», удаляющая эти карточки (`user.deleteCard(type, id)` для каждого) и
чистящая соответствующий список. (Разбивку по уровням можно убрать — тип + счётчик
достаточно; при сбросе удаляются все помеченные тестом карточки этого типа.)

### Первый запуск

`TodayScreen` offer: `<Link to="/placement/grammar">`. Текст можно дополнить: «…а
тесты по кандзи и словам — в соответствующих разделах или в Настройках».

## 5. Тесты

### Vitest — ядро (`tests/core/placement.test.ts`, переписать)
- `initPlacement`: `ids` — перемешанная выборка длины `min(length, pool)`; детерминизм
  по seed; для типа с пулом < length берутся все.
- `nextPlacementQuestion`: грамматика/кандзи/слова — правильный генератор, `itemType`
  в вопросе совпадает; `null` после конца.
- `applyPlacementAnswer`: `index++`; верный → id в `correctIds`, неверный → нет.
- `placementKnownIds` = только верно отвеченные; `placementQuestionNumber` 1-based;
  `placementTotal` = длина выборки; `isPlacementDone`.
- `migratePlacementMarks`: старый ключ → grammar-ключ, одноразово, идемпотентно.

### Vitest — UI (`tests/ui/PlacementScreen.test.tsx`, переписать)
- Экран выбора длины: 3 кнопки; клик по «15» → появляется первый вопрос, счётчик
  «Вопрос 1 из 15».
- Прохождение до конца: верные ответы → `upsertCard` вызван N раз, `insertReviewLog`
  не вызван, `setSetting('placement_marked_kanji_ids', ...)` для kanji-теста.
- Итог показывает число отмеченных.
- Мок `@/core/placement` покрывает новый набор экспортов.

### Vitest — UI списков
- Каждый из 3 экранов: кнопка «Пройти тест по разделу» ведёт на `/placement/{type}`,
  скрыта для `locked`-уровня.
- `SettingsScreen`: 3 ссылки на тесты; кнопка сброса на тип с помеченными id зовёт
  `deleteCard(type, id)` и чистит список.

### Playwright (`tests/e2e/placement.spec.ts`, обновить)
- `/placement/grammar`: выбрать «короткий», пройти 15 вопросов (первый вариант
  каждый раз), дойти до «Отмечено как уже известные», флаг `placement_offered`
  персистится через рестарт.
- Новый лёгкий тест: из шапки «Кандзи» кнопка «Пройти тест по разделу» открывает
  `/placement/kanji`, виден выбор длины.

## 6. Порядок задач

1. `src/core/placement.ts` переписать под выборку + `migratePlacementMarks`. Ядро-тесты.
2. `PlacementScreen` — роут `/placement/:type`, экран выбора длины, завершение с
   per-type тегами. UI-тесты. Редирект старого `/placement`.
3. Точки входа: 3 шапки справочников + `SettingsScreen` (3 ссылки + обобщённые кнопки
   сброса) + `TodayScreen` offer. UI-тесты. `migratePlacementMarks` в `UserDbProvider`.
4. e2e (обновить `placement.spec.ts` + новый kanji-тест) + финальная регрессия
   (typecheck, lint, vitest, playwright, `build:desktop:installer`).
