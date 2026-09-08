# Дизайн: план 4g — прогресс по кандзи/словам + разблокировка N4 по прогрессу

Дата: 2026-09-08. Статус: согласовано, готово к написанию плана.

## Цель

1. Экран «Прогресс» показывает полосы и счётчики не только по грамматике, но и по
   кандзи и словам активного уровня. Кандзи/слова уже копятся в `user.db` из
   ежедневного `/review` (планы 4b-1/4b-2) — просто не отображаются.
2. Уровень N4 перестаёт быть всегда открытым: он разблокируется, когда средняя
   доля «закреплено» по трём категориям N5 (грамматика, кандзи, слова) достигает
   90%, либо вручную кнопкой. То же правило обобщается на будущие уровни (N3 после
   N4 и т.д.).

Метод: план 4g, TDD напрямую в `main`, коммит на задачу, без SDD-леджера.

## Не входит

- Новый режим «Учить» (викторина «1 верно → начато, 3 верно → известно») — это
  отдельная фича со своей моделью, отдельный брейншторм.
- Изменение самой формулы FSRS или порогов статусов `learning/learned/mastered`.
- Контент N3–N1.
- Гейтинг **повторения** уже начатых карточек. Блокируется только выдача НОВЫХ
  карточек, вступительный тест по заблокированному уровню и просмотр вкладки
  уровня в справочниках. Карточка N4, которую пользователь уже начал (например,
  когда N4 был открыт в прошлых версиях), продолжает приходить на повторение —
  ровно как сейчас разведены `knownItemIds` и `availableItemIds` в scheduler.

## 1. Обобщение `src/core/progress.ts`

Сейчас `levelBars`, `statusCounts` захардкожены под грамматику
(`content.listGrammar`, `user.allCards('grammar')`, `content.grammarCountByLevel`).

### `totalForLevel(content, itemType, levelCode): number`

Новый внутренний хелпер:
- `grammar` → `content.grammarCountByLevel(levelCode)` (как сейчас)
- `kanji` → `content.listKanji(levelCode).length`
- `vocab` → `content.listVocab(levelCode).length`

### `levelBars(user, content, levelCode, itemType): LevelBars`

Добавляется 4-й параметр `itemType: ItemType` (`'grammar' | 'kanji' | 'vocab'` из
`@/core/types`). Внутри:
- `total = totalForLevel(content, itemType, levelCode)`
- карточки уровня = `user.allCards(itemType)` ∩ множество id пунктов уровня
- логика не меняется: `studied` = статус `learning|learned|mastered`,
  `consolidated` = `learned|mastered`; возвращает доли `studied/total`,
  `consolidated/total` и `total`.

Все существующие вызовы `levelBars(user, content, code)` получают явный
4-й аргумент `'grammar'`.

### `statusCounts(user, content, levelCode, itemType): StatusCounts`

Аналогично — 4-й параметр `itemType`, `total` через `totalForLevel`.

### `levelCompletion(user, content, levelCode): number`

Новая чистая функция. **Среднее долей «закреплено» по трём категориям**:

```
pct(type) = levelBars(user, content, levelCode, type).consolidated   // доля 0..1
levelCompletion = среднее pct('grammar'), pct('kanji'), pct('vocab')
```

Категории с `total === 0` в среднее не входят (защита для будущих уровней с
частичным контентом); если все три пусты — `levelCompletion` = 0.

### `levelRibbon`

`RibbonSegment.status` меняет тип на `EffectiveLevelStatus` (см. §2). `fill`
остаётся долей закреплённого ИМЕННО этого уровня (`levelBars(...).consolidated`,
усреднённой по 3 категориям — переиспользуем `levelCompletion`); для
`locked`/`coming_soon` это 0, т.к. карточек уровня ещё нет. Лента красит сегмент
по трём состояниям.

## 2. Правило разблокировки — `src/core/levels.ts` (новый файл)

`levels.status` в `content.db` остаётся флагом готовности **контента**
(`available` = собран и отгружается, `coming_soon` = N3+ ещё нет). Эффективный
статус для пользователя вычисляется в коде и нигде не хранится, кроме флага
ручной разблокировки.

### `type EffectiveLevelStatus = 'available' | 'locked' | 'coming_soon'`

### `UNLOCK_THRESHOLD = 0.9`

### `effectiveLevelStatus(user, content, levelCode, now): EffectiveLevelStatus`

- Находит `Level` по коду в `content.listLevels()`.
- Если сырой `status === 'coming_soon'` → `'coming_soon'` (не трогаем).
- Иначе (сырой `available`):
  - самый младший уровень (минимальный `ord`) → всегда `'available'`;
  - код в `user.getSetting<string[]>('unlocked_levels', [])` → `'available'`;
  - предыдущий по `ord` уровень существует и
    `levelCompletion(user, content, prevCode) >= UNLOCK_THRESHOLD` →
    `'available'`;
  - иначе → `'locked'`.
- `now` пока не используется (карточные статусы уже завязаны на время внутри
  `statusOf`), но параметр оставлен для единообразия сигнатур ядра и на будущее.

### `availableLevelCodes(user, content, now): Set<string>`

Прогоняет `effectiveLevelStatus` по всем уровням, возвращает множество кодов со
статусом `'available'`. Вызывается один раз на входе в планировщик / тест / хук.

### `unlockLevel(user, levelCode): void`

Добавляет код в `settings.unlocked_levels` (без дублей). Идемпотентна.

## 3. Проброс эффективного статуса

### `src/core/scheduler.ts`

`availableItemIds(content, itemType)` → `availableItemIds(content, itemType,
availableCodes: ReadonlySet<string>)`. Внутри `if (lvl.status !== 'available')`
заменяется на `if (!availableCodes.has(lvl.code))`. (Сырой `coming_soon` тоже
не попадёт в `availableCodes`, так что поведение для N3+ не меняется.)

Функция-снимок очереди (`queueSnapshot`, там же где вызывается на строке ~113)
получает `availableCodes` параметром и прокидывает.

### `src/core/session.ts`

`buildDailySession(user, content, now)` вычисляет
`availableLevelCodes(user, content, now)` и прокидывает во все вызовы снимков
очереди.

### `src/core/placement.ts`

`initPlacement(content)` → `initPlacement(content, availableCodes)`; передаёт в
`availableItemIds`. `PlacementScreen` вычисляет `availableLevelCodes` из
`useUserDb()`/`useContentDb()` и передаёт.

## 4. Хук эффективных уровней — `src/ui/useContentDb.ts`

Новый `useEffectiveLevels(): { code, ord, titleRu, status: EffectiveLevelStatus,
rawStatus }[]`. Комбинирует `useLevels()` + `useUserDb()` + `effectiveLevelStatus`.
Экраны переходят с `useLevels()` на `useEffectiveLevels()` там, где статус
используется для гейтинга UI:
- `ProgressScreen`
- `GrammarListScreen`, `KanjiListScreen`, `VocabListScreen`
- `TextsListScreen` — тексты не гейтятся правилом (отдельный раздел, не SRS), но
  вкладка `coming_soon` для N3 остаётся; менять поведение не нужно, достаточно
  чтобы `locked` рендерился так же, как `coming_soon` (сообщение «уровень
  откроется позже»). Практически: N4-тексты уже отгружены и `n4` попадёт в
  `locked` для новичка — это ок, тексты N4 просто станут видны после
  разблокировки N4, консистентно с остальными разделами.

## 5. Экран «Прогресс» (`ProgressScreen.tsx`)

- Лента уровней: класс сегмента по `EffectiveLevelStatus` — три состояния
  (`available` / `locked` / `coming_soon`), у `locked` свой стиль (например
  приглушённый с иконкой замка), отличный от «скоро».
- Для активного уровня — три блока подряд, каждый как текущий блок грамматики:
  - «Грамматика {level}» → 2 бара (Изучено/Закреплено) + строка счётчиков
  - «Кандзи {level}» → то же
  - «Слова {level}» → то же
  Активный уровень = первый со `status === 'available'` (как сейчас).
- Блок разблокировки следующего уровня: если существует следующий по `ord`
  уровень, чей сырой статус `available`, а эффективный — `locked`:
  > «{nextCode} откроется при среднем 90% «закреплено» по {activeCode}.
  > Сейчас: {Math.round(levelCompletion*100)}%.»
  > [кнопка «Открыть {nextCode} сейчас»]
  Кнопка вызывает `unlockLevel(user, nextCode)` и вызывает ре-рендер
  (тот же приём `resetTick`, что в `SettingsScreen`, или `window.location.reload`).
  Если следующий уровень уже `available` — блок не показывается. Старую строку
  «N4 откроется при ≥ 60 %…» удалить.

## 6. Экраны-справочники

`GrammarListScreen.tsx:46` (`activeLevelObj?.status === 'coming_soon'`) и
аналоги в Kanji/Vocab: условие «показывать заглушку вместо списка» расширяется на
`status === 'locked'` тоже, с другим текстом:
- `coming_soon` → «Материал уровня {level} появится скоро.» (как сейчас)
- `locked` → «Уровень {level} откроется после 90% завершения {prevLevel}.»

Поиск (кросс-уровневый) и detail-страницы `locked`-уровня не блокируются — как
сейчас у `coming_soon` (осознанно, memory 4a-2).

## 7. Данные пользователя

Новый ключ `settings.unlocked_levels` — JSON-массив строк-кодов. Пишется только
`unlockLevel`. Миграции схемы не нужно (`settings` — свободная таблица
ключ-значение). Дефолт `[]`.

`levels.yml` не меняется: N4 остаётся `status: available` (контент готов).
Гейтинг целиком в коде.

## 8. Тесты

### Vitest — ядро
- `levelBars` / `statusCounts` для `itemType='kanji'` и `'vocab'`: total берётся
  из нужного списка; карточки фильтруются по типу; доли считаются верно.
- `levelCompletion`: пустой `user.db` → 0; всё закреплено по всем 3 → 1;
  грамматика 100% + кандзи 0% + слова 0% → ~0.333; уровень без части контента —
  среднее только по непустым категориям.
- `effectiveLevelStatus`: N5 всегда `available`; N4 при `levelCompletion(N5)`
  0.89 → `locked`, 0.90 → `available`; `unlocked_levels:['N4']` → `available`
  даже при 0%; сырой `coming_soon` (N3) → `coming_soon` независимо от прогресса.
- `availableLevelCodes`: множество кодов; N4 не входит пока `locked`.
- `availableItemIds(content, type, codes)`: с `codes` без N4 не возвращает
  n4-пункты; с N4 в `codes` — возвращает, в прежнем порядке (level.ord → layer →
  id). Все прежние grammar-тесты обновляются на новую сигнатуру (передают Set со
  всеми `available`-кодами → поведение как раньше).
- `session.buildDailySession` / `scheduler`: свежий юзер получает только N5
  новые карточки; после `unlockLevel('N4')` — начинают предлагаться и N4.
- `initPlacement(content, codes)`: тест только по грамматике `available`-уровней.

### Vitest — UI
- `ProgressScreen`: рендерит 3 блока (Грамматика/Кандзи/Слова) с барами;
  показывает блок разблокировки с процентом, когда следующий уровень `locked`;
  клик по кнопке зовёт `unlockLevel`.
- `GrammarListScreen` (и Kanji/Vocab): для `locked`-уровня показывает текст про
  90%, не список.

### Playwright — e2e
- Свежий `user.db`: вкладка N4 в «Грамматика» показывает «откроется после 90%
  завершения N5», не грид/список.
- На экране «Прогресс» есть кнопка «Открыть N4 сейчас»; клик → вкладка N4
  становится доступной (грид/список виден), проверка переживает рестарт
  (флаг `unlocked_levels` персистится).
- Существующие e2e, где N4 предполагался открытым (`n4-unlocked.spec.ts` и
  сиды): расширить `writeSeededUserDb`-хелпер флагом `unlockedLevels`, либо
  засидить `settings.unlocked_levels=['N4']`, чтобы эти тесты продолжали
  проверять N4-контент. НЕ ослаблять правило под тесты — чинить тесты.

## 9. Порядок задач

1. `progress.ts`: `totalForLevel`, `itemType` в `levelBars`/`statusCounts`,
   обновить существующие вызовы (передать `'grammar'`). Тесты kanji/vocab bars.
2. `src/core/levels.ts`: `EffectiveLevelStatus`, `levelCompletion`,
   `effectiveLevelStatus`, `availableLevelCodes`, `unlockLevel`. Тесты.
3. `scheduler.ts` / `session.ts` / `placement.ts`: проброс `availableCodes`.
   Обновить все затронутые тесты на новую сигнатуру.
4. `useEffectiveLevels` хук; перевод `ProgressScreen` + 3 справочника на него;
   тексты заглушек `locked`. Тесты UI.
5. `ProgressScreen`: 3 блока прогресса + блок разблокировки + кнопка. Тесты UI.
6. e2e: N4 заблокирован для новичка / открывается кнопкой / переживает рестарт;
   починка `n4-unlocked` и сидов. Финальная регрессия (typecheck, lint, vitest,
   playwright, `build:desktop:installer`).
