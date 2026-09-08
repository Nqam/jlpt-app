# Дизайн: план 4h — вступительный тест как выборка (отдельно грамматика/кандзи/слова) + маркеры «изучено» в справочниках

Дата: 2026-09-08. Статус: согласовано.

## Проблема

Текущий вступительный тест — только по грамматике, бинарный поиск по каноническому
порядку. При всех верных ответах помечает все 43 пункта N5 известными за ~6 вопросов
(экстраполяция — предполагает монотонность знаний). У кандзи и слов порядка по
сложности НЕТ (`layer` только у грамматики), бинарный поиск для них неприменим.

## Решение

Единый алгоритм для всех трёх типов — **выборка без экстраполяции**:

1. Пользователь выбирает объём в **процентах от числа пунктов раздела**:
   **10 / 25 / 50 / 100 %**. Число вопросов:
   `count = clamp(round(pct/100 * total), min(total, 10), min(total, 100))`.
   Экран показывает посчитанное число («25% ≈ 20 вопросов»). Если `total <= 10` —
   одна кнопка «Весь раздел ({total})».
2. **Приоритет выборки при повторных тестах**: пул делится на «ещё не пройдено»
   (нет SRS-карточки, либо карточка в статусе `new`) и «пройдено» (карточка в
   `learning`/`learned`/`mastered`). Каждая часть перемешивается seeded-шафлом,
   склеивается `[не пройдено] ++ [пройдено]`, берутся первые `count`. Так повторный
   тест сперва добивает непройденные пункты, а если они кончились — повторяет
   пройденные (полезно как быстрый чек).
3. Каждый вопрос — существующим генератором с `reps=0` (грамматика —
   `generateForCard`, кандзи — `generateKanjiQuestion`, слова —
   `generateVocabQuestion`).
4. **Верный ответ** → пункт помечается «известно»: SRS-карточка с оценкой «Легко»
   (rating 4), id тегируется в `settings.placement_marked_{type}_ids`.
5. **Неверный ответ ИЛИ пункт не в выборке** → ничего не создаётся. Пункт остаётся
   обычной «новой» карточкой и всплывает в ежедневном повторении. Дыры в знаниях
   сохраняются и проявляются потом — это и есть цель.

Бинарный поиск, «граница», проверочный проход, двойное подтверждение — удаляются.
`src/core/placement.ts` переписывается целиком.

## Не входит

- Экстраполяция «ответили 19/20, отметить остальные?» — сознательно нет.
- Отдельный режим «Учить» (викторина 1/3) — другая фича.
- Тест по разделу для `locked`-уровня недоступен (тянет
  `availableItemIds(content, type, availableCodes)`).

## 1. `src/core/placement.ts` (переписать целиком)

```ts
import type { ItemType } from '@/core/types';
import type { ContentDb } from '@/storage/content-db';
import type { UserDb } from '@/storage/user-db';
import type { Question } from '@/core/quiz/types';
import { availableItemIds } from '@/core/scheduler';
import { statusOf } from '@/core/srs';
import { seededShuffle } from '@/core/quiz/rng';
import { generateForCard } from '@/core/quiz/registry';
import { generateKanjiQuestion } from '@/core/quiz/kanji-questions';
import { generateVocabQuestion } from '@/core/quiz/vocab-questions';
import { levelPointsFor } from '@/core/session';

export type PlacementPercent = 10 | 25 | 50 | 100;

export interface PlacementState {
  itemType: ItemType;
  ids: string[];        // выборка пунктов, длина = count (см. §Решение п.1)
  index: number;        // текущий вопрос, 0-based
  correctIds: string[]; // id, на которые ответили верно
}

/** Число вопросов для процента и размера раздела. */
export function placementCount(total: number, pct: PlacementPercent): number {
  const raw = Math.round((pct / 100) * total);
  return Math.min(Math.max(raw, Math.min(total, 10)), Math.min(total, 100));
}

/**
 * Строит тест. `pool` = availableItemIds(content, itemType, availableCodes).
 * Делит pool на непройденные / пройденные по наличию карточки со статусом
 * learning+, шафлит каждую часть по `seed`, склеивает [непройдено]++[пройдено],
 * берёт первые placementCount(pool.length, pct).
 */
export function initPlacement(
  content: ContentDb,
  user: UserDb,
  itemType: ItemType,
  availableCodes: ReadonlySet<string>,
  pct: PlacementPercent,
  seed: string,
): PlacementState;

export function isPlacementDone(s: PlacementState): boolean;         // index >= ids.length
export function placementQuestionNumber(s: PlacementState): number;  // index + 1
export function placementTotal(s: PlacementState): number;           // ids.length

/** Вопрос текущего пункта. `null` если тест окончен или пункт не резолвится. */
export function nextPlacementQuestion(
  s: PlacementState, content: ContentDb, seed: string,
): { itemId: string; question: Question } | null;
// id = s.ids[s.index]; по s.itemType — соответствующий генератор, seed `${seed}:${id}`

export function applyPlacementAnswer(s: PlacementState, correct: boolean): PlacementState;
// { ...s, index: index+1, correctIds: correct ? [...correctIds, s.ids[s.index]] : correctIds }

export function placementKnownIds(s: PlacementState): string[];      // s.correctIds

/** Одноразовая миграция старого grammar-only ключа в per-type. Идемпотентна. */
export function migratePlacementMarks(user: UserDb): void;
// old = getSetting('placement_marked_ids', [])
// if (old.length && getSetting('placement_marked_grammar_ids', []).length === 0)
//   setSetting('placement_marked_grammar_ids', old)
```

Удалить: `placementFrontierIds`, `placementRemaining`, `lo`/`hi`/`askedCount`,
`nextPlacementQuestion` со старой сигнатурой.

## 2. Данные пользователя

- `settings.placement_marked_grammar_ids: string[]`
- `settings.placement_marked_kanji_ids: string[]`
- `settings.placement_marked_vocab_ids: string[]`

`migratePlacementMarks(user)` вызывается в `src/ui/UserDbProvider.tsx` после
`UserDb.open` (рядом с `backfillUnlockedFromProgress`).

`placement_offered` (bool) — без изменений; первый запуск предлагает тест грамматики.

## 3. `PlacementScreen` (`src/ui/screens/PlacementScreen.tsx`, переписать)

Роут `/placement/:type` (`type ∈ grammar|kanji|vocab`). Старый `/placement` →
редирект-компонент на `/placement/grammar` в `routes.tsx`.

1. **Экран выбора объёма** (пока `pct` не выбран): «Тест: {раздел}». Кнопки
   `10% · ≈{placementCount(total,10)}` … `100% · ≈{placementCount(total,100)}`
   (или одна «Весь раздел ({total})» при `total<=10`). Подпись: «Верные ответы
   отметят пункты как известные. Остальные останутся в ежедневном повторении.»
   `total` = длина `availableItemIds(content, type, availableCodes)`.
2. **Вопросы**: `<p className="placement-counter">Вопрос {n} из {placementTotal}</p>`
   + `<QuestionView showExplainLink={false}>` + кнопка «Далее».
3. **Итог**: «Готово. Отмечено как уже известные: {marked}.» + кнопка «На сегодня».

При выборе процента — `initPlacement(content, user, type, availableCodes, pct,
Date.now().toString())` один раз в `useState`. Завершение (эффект по
`isPlacementDone`): для каждого `placementKnownIds(state)` без карточки —
`review(newCard(type, id, now), 4, now, 0, params)` → `upsertCard`; дописать
`newlyMarked` в `settings.placement_marked_{type}_ids`; `setSetting('placement_offered', true)`;
`setMarkedCount(newlyMarked.length)`.

## 4. Маркеры «изучено» в справочниках

Экраны `GrammarListScreen` / `KanjiListScreen` / `VocabListScreen` красят элементы
списка по статусу SRS-карточки. Раздел «Тексты» уже помечает прочитанные
(`.text-read-badge`) — не трогаем, но приводим стиль к общему.

- Новый компонент `src/ui/components/StatusDot.tsx`:
  `{ status: 'new' | 'learning' | 'learned' | 'mastered' }` → маленькая точка
  (`<span className="status-dot status-dot-{status}" title="{подпись}">`).
  `new` → ничего не рендерит (или прозрачная точка для выравнивания).
  Подписи: learning «изучается», learned «изучено», mastered «освоено».
- В каждом из 3 экранов: `const cards = user.allCards(type)` → `Map<id, CardRow>`;
  для каждого элемента списка `statusOf(card)` (или `'new'`), рендерить `StatusDot`
  слева/справа от названия.
- CSS: `.status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }`
  `.status-dot-learning { background: var(--heat-2); }`
  `.status-dot-learned { background: var(--heat-3); }`
  `.status-dot-mastered { background: var(--heat-4); }`
  (переиспользуем heat-палитру — она уже адаптирована под тёмную тему.)
- Экраны сейчас не используют `useUserDb()` — добавить импорт и хук. Проверить,
  что их тесты рендерятся внутри `UserDbProvider`-мока (как `SettingsScreen.test`),
  иначе расширить моки.
- Поиск (кросс-уровневый) — маркеры показывать и там (тот же `Map`).

## 5. Точки входа теста

### Шапки справочников
`GrammarListScreen` / `KanjiListScreen` / `VocabListScreen`: рядом с табами уровней —
`<Link className="btn-ghost" to="/placement/{type}">Пройти тест по разделу</Link>`.
Только если активный уровень эффективно `available`.

### Настройки
Блок «Вступительный тест»: три ссылки «Тест: грамматика / кандзи / слова»
(`/placement/{type}`) вместо одной «Пройти вступительный тест заново».
Кнопки сброса: для каждого типа с непустым `placement_marked_{type}_ids` — кнопка
«Сбросить тест: {раздел} ({N})» → `user.deleteCard(type, id)` для каждого +
очистка списка. Разбивку по уровням убрать.

### Первый запуск
`TodayScreen` offer: `<Link to="/placement/grammar">`. Текст дополнить: «тесты по
кандзи и словам — в их разделах или в Настройках».

## 6. Тесты

### Vitest — ядро (`tests/core/placement.test.ts`, переписать)
- `placementCount`: границы (10% от 43 → 10; 100% от 43 → 43; 25% от 681 → 100 потолок;
  total 5 → 5).
- `initPlacement`: длина = `placementCount`; детерминизм по seed; **непройденные
  идут раньше пройденных** (засеять карточки на часть pool, проверить порядок `ids`).
- `nextPlacementQuestion`: по типу — свой генератор, `question.itemType` совпадает;
  `null` после конца.
- `applyPlacementAnswer` / `placementKnownIds` / `placementQuestionNumber` /
  `placementTotal` / `isPlacementDone`.
- `migratePlacementMarks`: старый ключ → grammar-ключ, одноразово, идемпотентно.

### Vitest — UI
- `PlacementScreen` (переписать): экран выбора (4 кнопки % или 1 «весь раздел»);
  клик → первый вопрос + счётчик «Вопрос 1 из N»; прохождение → `upsertCard` N раз,
  `insertReviewLog` не вызван, `setSetting('placement_marked_kanji_ids', …)` для
  kanji-теста; итог с числом.
- 3 экрана-списка: `StatusDot` рендерится по статусу карточки (learned → класс
  `status-dot-learned`); кнопка «Пройти тест по разделу» ведёт на `/placement/{type}`,
  скрыта для `locked`.
- `SettingsScreen`: 3 ссылки на тесты; кнопка сброса типа зовёт `deleteCard(type,id)`
  и чистит `placement_marked_{type}_ids`.
- `StatusDot`: `new` → пусто; каждый статус → свой класс + `title`.

### Playwright (`tests/e2e/placement.spec.ts`, обновить)
- `/placement/grammar`: выбрать «10%», пройти N вопросов (первый вариант каждый раз),
  дойти до «Отмечено как уже известные», флаг `placement_offered` переживает рестарт.
- Новый: из шапки «Кандзи» кнопка «Пройти тест по разделу» → `/placement/kanji`,
  виден экран выбора объёма.
- Существующий тест на список кандзи/слов N4 — если ломается от `StatusDot`,
  поправить селекторы (маркер не должен ломать `.grammar-list-item`/`.kanji-grid-item`
  счётчики).

## 7. Порядок задач

1. `src/core/placement.ts` переписать (выборка + `placementCount` + приоритет
   непройденных + `migratePlacementMarks`). Ядро-тесты.
2. `PlacementScreen` — роут `/placement/:type`, экран выбора %, завершение с per-type
   тегами, редирект старого роута. `migratePlacementMarks` в `UserDbProvider`. UI-тесты.
3. `StatusDot` + маркеры в 3 экранах-списках (+ поиск). CSS. UI-тесты.
4. Точки входа: 3 шапки справочников + `SettingsScreen` (3 ссылки + обобщённые кнопки
   сброса) + `TodayScreen` offer. UI-тесты.
5. e2e (обновить `placement.spec.ts` + новый kanji-тест, починить затронутые списки) +
   финальная регрессия (typecheck, lint, vitest, playwright, `build:desktop:installer`).
   Затем: bump версии в `package.json` (→ 1.4.0), коммит, `git push origin main`,
   `npm run build:desktop:installer`, `gh release create v1.4.0 "dist/Kotsukotsu Setup 1.4.0.exe" ...`,
   удалить старые `dist/JLPT Setup *.exe` / `dist/Kotsukotsu Setup 1.{0,1,2,3}.*` и
   сопутствующие `.blockmap`. Обновить оба файла памяти.
