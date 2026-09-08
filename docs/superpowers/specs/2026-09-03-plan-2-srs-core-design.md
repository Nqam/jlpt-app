# Дизайн: План 2 — SRS-ядро (карточки, FSRS, «Сегодня», прогресс)

- **Дата:** 2026-09-03
- **Статус:** черновик на ревью
- **Родительская спека:** `docs/superpowers/specs/2026-09-03-jlpt-desktop-app-design.md` (§3 архитектура, §5 цикл обучения, §6 прогрессия). Этот документ уточняет и сужает её под план 2; при расхождении родительская спека — источник истины по общей архитектуре, этот — по объёму плана 2.
- **Предыдущий план:** План 1 (фундамент + справочник грамматики N5) влит в `master`, merge `2e17bbe`.

## 1. Цель и рамки

### Цель

Превратить справочник грамматики из плана 1 в работающее приложение интервального
повторения: карточки грамматики, движок FSRS, ежедневный цикл «Сегодня» с флеш-повторением,
экран прогресса со шкалами, heatmap активности и стриком. Все данные пользователя — в
локальном `user.db`, переживают обновление приложения.

### В рамках плана 2

- `user.db` — схема, миграции, персист (расширение `PlatformAdapter` на запись).
- `core/srs` — обёртка над `ts-fsrs`: жизненный цикл карточки, оценка, вывод статуса.
- `core/scheduler` — сбор дневной пачки: due-карточки + новые (лимит/день, порядок по слоям,
  стоп при переполнении очереди).
- `core/progress` — расчёт «Изучено/Закреплено», счётчики статусов, стрик, данные heatmap.
- Экраны: «Сегодня» (заменяет заглушку), «Повторение» (флеш-цикл), «Прогресс» (заменяет
  заглушку).
- `ui/UserDbProvider` — открытие `user.db` один раз, инвалидация после записи.

### Вне рамок (планы 3+)

- Типы вопросов и автооценка (`quiz-engine`); в плане 2 оценку ставит пользователь вручную
  (флеш-карточка, 4 кнопки).
- `session-builder` и состав ежедневного испытания сверх «due + новые»; мини-тест дня.
- Ввод нового материала отдельным мастером/экраном «Учить новое».
- Вступительный (адаптивный) тест уровня.
- Кандзи, слова, тексты — карточки только типа `grammar`.
- Прогноз «уровень закреплён через N недель», раздел «слабые места», автоподстройка весов
  FSRS, механика разблокировки следующего уровня (реализует план, наполняющий N4).

### Поставка после плана 2

Полноценное офлайн-приложение интервального повторения грамматики JLPT N5 на ПК:
пользователь каждый день открывает «Сегодня», проходит повторения и новые пункты,
видит рост шкал и стрик. Android — как и в плане 1, отдельным планом.

## 2. Архитектура

### Принципы

Следуем плану 1: ядро (`src/core`, `src/storage`) — чистый браузеро-совместимый TypeScript,
тестируется с фейковым `PlatformAdapter`; никаких Node/Electron импортов в `src/**`
(правило ESLint `no-restricted-imports` уже стоит). Время в ядро передаётся параметром
`now: Date`, внутренних `Date.now()` нет — интервалы и стрик детерминированно тестируются.

### Модули

| Модуль | Ответственность | Зависит от |
|---|---|---|
| `src/storage/user-db.ts` | Открыть `user.db` (или создать), применить миграции, типизированные чтения/записи состояния, пометка на персист | `PlatformAdapter`, `src/storage/sqljs.ts`, sql.js |
| `src/core/srs.ts` | FSRS через `ts-fsrs`: `newCard`, `review`, `statusOf`, доступ к параметрам | `ts-fsrs` |
| `src/core/scheduler.ts` | `buildQueue(now)`, `summary(now)` — состав дневной пачки | `src/core/srs.ts`, `content-db`, `user-db` |
| `src/core/progress.ts` | `levelProgress`, `statusCounts`, `streak(now)`, `heatmap(now)` | `user-db`, `content-db` |
| `src/ui/UserDbProvider.tsx` | Открывает `user.db` один раз; `useUserDb()` даёт хендл + `invalidate()` после записи | `user-db` |
| `src/ui/screens/TodayScreen.tsx` | Сводка + кнопка «Начать» | `scheduler` |
| `src/ui/screens/ReviewScreen.tsx` | Флеш-цикл: карточка → раскрыть → 4 оценки | `scheduler`, `srs`, `content-db` |
| `src/ui/screens/ProgressScreen.tsx` | Лента уровней, полоски, счётчики, heatmap, стрик | `core/progress` |

### Расширение `PlatformAdapter`

Сейчас интерфейс (`src/platform/adapter.ts`) только для чтения. Добавляется:

```ts
interface PlatformAdapter {
  // ... существующее: platform, readBundledContentDb, readSqlWasm
  readUserDb(): Promise<Uint8Array | null>;   // null — файла ещё нет (первый запуск)
  writeUserDb(bytes: Uint8Array): Promise<void>;
}
```

**Desktop-реализация** (`src/platform/desktop.ts` + `shells/electron/`):
- `readUserDb` → IPC `user-db:read` → main читает `join(app.getPath('userData'), 'user.db')`,
  возвращает `ArrayBuffer` или `null`, если файла нет.
- `writeUserDb` → IPC `user-db:write` (принимает `ArrayBuffer`) → main пишет **атомарно**:
  во временный файл рядом, `fsync`, `rename` поверх `user.db`.
- IPC-канал записи принимает только байты, путь фиксирован в main — рендер не управляет
  путём.

**Персист:** `user-db` после каждой мутации помечает состояние «грязным» и планирует запись
через **дебаунс 500 мс** (`export()` всей БД → `writeUserDb`). Плюс принудительный flush по
событию `before-quit` (main шлёт рендеру запрос «сохранись», ждёт подтверждения с таймаутом
~1 с). Размер `user.db` на горизонте планов 2–5 — сотни килобайт; полная выгрузка приемлема.

### Связь `content.db` ↔ `user.db`

Разные файлы, FK между ними невозможен. `content.db` — источник истины по составу контента.
`cards.item_id` / `review_log.item_id` — строковый id из `content.db` (`grammar_points.id`).
При чтении: строки `user.db`, чей `item_id` отсутствует в `content.db` (контент удалён/
переименован), молча игнорируются в расчётах и не показываются. Осиротевшие строки не
удаляются автоматически (данные пользователя не трогаем без нужды).

## 3. `user.db`: схема и миграции

### Механизм миграций

Массив `MIGRATIONS: { version: number; up(db): void }[]`, упорядоченный по `version`.
При открытии `user-db`:
1. Прочитать `PRAGMA user_version` (0 для новой БД).
2. Для каждой миграции с `version > user_version` — выполнить `up(db)` **в одной
   транзакции**, затем `PRAGMA user_version = version`.
3. Вниз миграций нет. Неизвестная (более новая) версия БД, чем знает приложение → отказ
   открытия с понятной ошибкой (не портить данные новее себя).

### Схема v1

```sql
-- миграция v1: создание схемы

CREATE TABLE cards (
  item_type      TEXT    NOT NULL,          -- 'grammar' (позже 'kanji', 'vocab')
  item_id        TEXT    NOT NULL,          -- = content.db grammar_points.id
  due            TEXT    NOT NULL,          -- ISO 8601 UTC
  stability      REAL    NOT NULL,
  difficulty     REAL    NOT NULL,
  elapsed_days   INTEGER NOT NULL,
  scheduled_days INTEGER NOT NULL,
  reps           INTEGER NOT NULL,
  lapses         INTEGER NOT NULL,
  state          INTEGER NOT NULL,          -- ts-fsrs State (0 New,1 Learning,2 Review,3 Relearning)
  last_review    TEXT,                      -- ISO 8601 UTC, NULL до первой оценки
  introduced_at  TEXT    NOT NULL,          -- ISO 8601 UTC — когда карточка заведена
  PRIMARY KEY (item_type, item_id)
);
CREATE INDEX ix_cards_due ON cards(due);

CREATE TABLE review_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  item_type       TEXT    NOT NULL,
  item_id         TEXT    NOT NULL,
  reviewed_at     TEXT    NOT NULL,         -- ISO 8601 UTC
  day_key         TEXT    NOT NULL,         -- YYYY-MM-DD в локальной зоне на момент повторения
  rating          INTEGER NOT NULL,         -- 1 Again, 2 Hard, 3 Good, 4 Easy
  state_before    INTEGER NOT NULL,
  stability_after REAL    NOT NULL,
  elapsed_ms      INTEGER NOT NULL          -- от раскрытия карточки до нажатия оценки
);
CREATE INDEX ix_review_log_day ON review_log(day_key);
CREATE INDEX ix_review_log_item ON review_log(item_type, item_id);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL                       -- JSON-значение
);
-- сеются: new_per_day=5, review_queue_cap=100, fsrs_request_retention=0.9,
--          fsrs_maximum_interval=365, fsrs_enable_fuzz=true

CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- сеются: schema_version='1', app_version=<из package.json>, created_at=<ISO UTC>
```

### Время и «дни пользователя»

- Все моменты (`due`, `reviewed_at`, `last_review`, `introduced_at`) — UTC ISO 8601.
- `day_key` — **локальная** календарная дата на момент повторения, вычисляется один раз
  при записи и больше не пересчитывается. Стрик и heatmap оперируют `day_key`, поэтому
  переезд пользователя в другой часовой пояс не переписывает историю.
- «Конец сегодня» для отбора due — `endOfLocalDay(now)` в UTC.

## 4. `core/srs` — FSRS

Тонкая обёртка над `ts-fsrs` (MIT, реализует FSRS-6; современный эталон планирования,
точнее SM-2 — меньше лишних повторений при той же удерживаемости).

```ts
type Rating = 1 | 2 | 3 | 4;               // Again | Hard | Good | Easy
type Status = 'new' | 'learning' | 'learned' | 'mastered';

function newCard(itemType: string, itemId: string, now: Date): CardRow;
function review(card: CardRow, rating: Rating, now: Date, elapsedMs: number):
  { card: CardRow; log: ReviewLogRow };
function statusOf(card: CardRow): Status;
function previewIntervals(card: CardRow, now: Date):
  Record<Rating, string>;                   // человекочитаемо: "10 мин", "1 д", "3 д", "8 д"
```

- `newCard` — `ts-fsrs.createEmptyCard(now)`, `reps=0`, `state=New`, `introduced_at=now`,
  `due=now` (сразу доступна к первому показу в той же сессии).
- `review` — `fsrs(params).next(card, now, rating)`; из результата собираются новая строка
  `cards` и строка `review_log` (`state_before` = состояние до, `elapsed_ms` = переданное).
- `statusOf` — `reps === 0` → `new`; иначе по `stability`: `< 7` → `learning`, `< 30` →
  `learned`, `>= 30` → `mastered` (пороги из родительской спеки §6).
- Параметры FSRS читаются из `settings` (`fsrs_request_retention` деф. 0.9,
  `fsrs_maximum_interval` 365, `fsrs_enable_fuzz` true — разброс интервалов, чтобы
  повторения не сбивались в один день). Веса — дефолтные `ts-fsrs`; автоподстройка — план 3+.

## 5. `core/scheduler` — дневная пачка

```ts
interface DaySummary {
  dueCount: number;
  newCount: number;          // сколько новых будет предложено
  reviewedToday: number;     // уже сделано сегодня (по review_log.day_key)
  queueOverCap: boolean;     // очередь due больше cap — новые на паузе
  allDone: boolean;          // due и новые на сегодня исчерпаны
  nextDueAt: string | null;  // когда подойдёт следующая карточка (для «на сегодня всё»)
}

function summary(now: Date): DaySummary;
function buildQueue(now: Date): QueueItem[];   // QueueItem = { itemType, itemId, kind: 'due' | 'new' }
```

**`buildQueue`:**
1. **Due**: `cards` где `due <= endOfLocalDay(now)`, сортировка по `due` возр., срез до
   `review_queue_cap` (деф. 100). Остаток просто не входит в пачку (перенесётся сам —
   завтра снова попадёт под отбор).
2. **Новые**: пункты грамматики из `content.db` (все уровни со `status='available'`, сейчас
   N5), у которых нет строки в `cards`; порядок `layer` возр., затем `id`. Количество =
   `new_per_day` − (сколько карточек с `introduced_at` внутри `[startOfLocalDay, now]`).
   **Если** `dueCount > review_queue_cap` → новых 0 (`queueOverCap = true`).
3. Пачка = due ∪ новые, **перемешаны** детерминированным seeded-shuffle (интерливинг
   улучшает удержание), с ограничением: первым элементом не ставится новая карточка
   (первый контакт — через режим изучения, см. §6).

**Идемпотентность:** повторный `buildQueue` во время сессии корректен — оценённая карточка
уходит из выборки, как только её `due` уехало в будущее; новые, уже заведённые сегодня,
больше не считаются «без строки в `cards`».

## 6. Экраны

### «Сегодня» (`TodayScreen`) — главный

- Крупная кнопка **«Начать»** (неактивна при `allDone`).
- Одна строка статуса: `{dueCount} повторить · {newCount} новых · стрик {streak}`.
- `allDone` → «На сегодня всё» + «Следующая карточка — {relative(nextDueAt)}».
- `queueOverCap` → мягкая плашка «Много повторений — новые пункты пока на паузе».
- Никаких других решений на экране (принцип родительской спеки §7).

### «Повторение» (`ReviewScreen`) — полноэкранный флеш-цикл

1. Точки прогресса сверху: `сделано / всего в пачке`.
2. **Новая карточка** (`kind='new'`): режим **изучения** — заголовок пункта, объяснение
   (Markdown через существующий `GrammarMarkdown`), примеры с фуриганой (`Furigana`),
   кнопка «Понятно». Затем тот же пункт показывается как обычная карточка (шаг 3) — первая
   оценка идёт в FSRS.
3. **Лицо карточки**: заголовок пункта (напр. `は (тема предложения)`) + подпись «Вспомни
   правило». `Space` / тап → **раскрыть**.
4. **Раскрыто**: краткое объяснение + примеры. Ряд из 4 кнопок **Снова / Трудно / Хорошо /
   Легко**; под каждой — прогноз интервала из `previewIntervals`. Клавиши `1–4`.
5. Оценка → `srs.review()` → запись `cards` + `review_log` (`elapsed_ms` = от раскрытия до
   нажатия) → пометка `user.db` на персист → следующий элемент пачки.
6. Конец пачки: сводка `сделано N · «снова» M · новых введено K`, обновление стрика, кнопка
   «Готово» → «Сегодня».
7. `Esc` / кнопка выхода — прервать. Все оценённые карточки уже сохранены; повторный вход
   пересобирает пачку.

**Адаптив:** на узком экране — крупные кнопки в 2×2, те же клавиши на ПК.

### «Прогресс» (`ProgressScreen`) — заменяет заглушку

- **Лента уровней** N5→N1 из `content-db.listLevels()`. Заполнение N5 = «Закреплено» по
  грамматике. N4–N1 — «скоро».
- **Полоски уровня N5, категория «Грамматика»:**
  - Изучено = `(learning + learned + mastered) / всего пунктов N5`.
  - Закреплено = `(learned + mastered) / всего пунктов N5`.
  - Подпись числами: `{изучено} / {всего}`.
- **Счётчики статусов:** 4 числа — new / learning / learned / mastered. `new` = `всего
  пунктов N5 − строк cards(item_type='grammar')`.
- **Heatmap** — последние ~17 недель, ячейка на день, интенсивность = число повторений в
  `day_key` (`SELECT day_key, COUNT(*) ... GROUP BY day_key`).
- **Стрик** — текущий (подряд идущие `day_key` с ≥1 повторением, оканчивающиеся сегодня или
  вчера) + рекорд.
- **Правило разблокировки** N4 — показано текстом, без механики: «N4 откроется при ≥ 60%
  закреплено по грамматике N5».

## 7. `core/progress`

```ts
interface LevelBars { studied: number; consolidated: number; total: number; }  // доли 0..1 + total
interface StatusCounts { new: number; learning: number; learned: number; mastered: number; }
interface HeatCell { dayKey: string; count: number; }

function levelBars(levelCode: string): LevelBars;          // категория grammar
function statusCounts(levelCode: string): StatusCounts;
function streak(now: Date): { current: number; best: number };
function heatmap(now: Date, weeks: number): HeatCell[];
function levelRibbon(now: Date): { code: string; status: string; fill: number }[];
```

Все функции синхронные поверх уже открытых `user.db` + `content.db` (обе в памяти через
sql.js). `now` параметром для тестируемости стрика.

## 8. Тестирование

TDD; Vitest для ядра/хранилища (фейковый `PlatformAdapter` на Node `fs`, временный файл),
Playwright для сценариев (Electron + мобильная ширина).

| Модуль | Тесты |
|---|---|
| `storage/user-db` | пустой запуск → схема v1, `user_version=1`; миграция применяется в транзакции и поднимает `user_version`; БД с версией больше известной → отказ открытия; записал → `export` → открыл заново → состояние идентично; дебаунс схлопывает несколько мутаций в одну запись; атомарная запись не оставляет полуфайла при исключении |
| `core/srs` | `Good` растит `stability`, `Again` роняет и растит `lapses`; `statusOf` ровно на порогах 7 и 30; `newCard` → `reps=0`, `state=New`, `due=now`; `review` возвращает `log` с верными `state_before` и `elapsed_ms`; `previewIntervals` даёт 4 разных строки |
| `core/scheduler` | due с `due<=endOfLocalDay` в пачке, будущие — нет; срез по `review_queue_cap`; новые не выдаются при `dueCount>cap`; `new_per_day` учитывает уже введённые сегодня; порядок новых `layer→id`; первый элемент пачки не `kind='new'`; повторный `buildQueue` идемпотентен |
| `core/progress` | пороги статусов → доли полосок; `new = total − cards`; стрик: занимался сегодня / только вчера / разрыв вчера-позавчера; `best` ≥ `current`; heatmap группировка и длина окна; смена локальной зоны не меняет старые `day_key` |
| e2e | первый запуск → «Сегодня»: 5 новых, стрик 0 → пройти сессию (изучение + оценки всех) → «Прогресс»: полоски и счётчики ненулевые, стрик 1, heatmap отметка на сегодня → перезапуск приложения → прогресс сохранён → (packaged) `user.db` создаётся и читается из `userData` |

**Детерминизм времени:** ядро берёт `now: Date` параметром; тесты гоняют фиксированные
даты для интервалов, порогов «конца дня», стрика.

**Регрессии плана 1:** существующие vitest 42 + e2e 5 остаются зелёными; расширение
`PlatformAdapter` не ломает desktop-реализацию и правило браузеро-безопасности.

## 9. Открытые вопросы

- Точная сериализация `ts-fsrs.Card` ↔ строки `cards`: свериться с актуальным API
  `ts-fsrs` на момент реализации (имена полей `elapsed_days`/`scheduled_days` могли
  измениться между мажорными версиями) — заложить адаптер сериализации в `core/srs`, а не
  размазывать по `user-db`.
- Поведение `before-quit` flush в Electron при аварийном завершении (kill): считаем
  приемлемой потерю ≤ 500 мс последних действий (дебаунс); журнал `review_log` пишется тем
  же дебаунсом, отдельного WAL не вводим в плане 2.
- Формат хранения `settings.value` (JSON-строка на ключ) против типизированных колонок —
  выбран JSON-на-ключ ради простоты миграций; ревизия при росте числа настроек.
