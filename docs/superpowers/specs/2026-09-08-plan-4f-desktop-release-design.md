# Дизайн: план 4f — завершение ПК-версии (release polish + GitHub + проверка обновлений)

Дата: 2026-09-08. Статус: согласовано, готово к написанию плана.

## Цель

Довести ПК-версию (Windows / Electron) до состояния «v1.0.0, можно раздавать
и ставить»: бренд-полировка, две небольшие функции из раздела 9 общей дизайн-спеки
(проверка обновлений, авто-бэкап), security-hardening оболочки, публичный
GitHub-репозиторий с исходниками (без учебного контента) и релизами.

Android (план 4d) не трогается. Функционально приложение уже полное для N5/N4 —
это отделочный слой, не новые учебные фичи.

## Объём

Семь пунктов. Каждый — отдельная задача с TDD и коммитом, работаем напрямую
в `master` (как 4a-3 / 4a-5 / 4c-2). SDD-леджер не заводим.

### 1. Иконка приложения

- `build/icon.svg` — простой авторский знак (кандзи 日 или «あ» в скруглённом
  квадрате, один акцентный цвет + фон, светлый и тёмный варианты не нужны —
  иконка ОС одна).
- `scripts/make-icon.mjs` — рендерит SVG в PNG 256/512 через уже установленный
  Chromium из `@playwright/test` (`chromium.launch()` → `page.setContent` →
  `screenshot`), затем собирает `build/icon.ico` пакетом `png-to-ico`
  (чистый JS, ~50 КБ, новая dev-зависимость). Ничего не качает из сети.
- `npm run make-icon` — ручной шаг разработчика (иконка коммитится, не
  пересобирается на каждый билд).
- `electron-builder.yml` → `win.icon: build/icon.ico`; `build/README.md`
  обновить (плейсхолдер убрать).
- Тест: `scripts`-тест проверяет, что `make-icon` создаёт валидный `.ico`
  (magic bytes `00 00 01 00`) и PNG нужных размеров. Chromium в CI-среде уже
  ставится (playwright e2e идут) — если `chromium.launch()` недоступен, тест
  `skip` с явным сообщением, а не падает.

### 2. Японский шрифт в комплекте (офлайн)

- Noto Sans JP, лицензия SIL OFL 1.1 (разрешает вложение и распространение).
- Загрузка: `Noto Sans JP` static woff2 (полный, ~4 МБ) с
  `https://fonts.gstatic.com` разово, кладётся в `src/ui/fonts/NotoSansJP.woff2`.
  Файл коммитится в репозиторий (это код/ассет, не учебный контент).
- `src/ui/fonts/noto-sans-jp.css` — `@font-face` (`font-display: swap`,
  `unicode-range` не сужаем — нужен весь JIS). Импорт в `theme.css`.
- `content/CREDITS.md` → секция «Шрифты»: Noto Sans JP, OFL 1.1, ссылка на текст
  лицензии; сам текст лицензии — `src/ui/fonts/OFL.txt`.
- `--font-ja` остаётся с системным фоллбэком (`"Noto Sans JP", "Yu Gothic UI",
  "Meiryo", system-ui, sans-serif`) на случай, если шрифт не успел загрузиться.
- Тест: unit — `@font-face` присутствует в собранном CSS и указывает на
  реальный, непустой файл; размер woff2 в ожидаемом диапазоне (1–6 МБ).

### 3. Метаданные пакета

- `package.json`: `description` (рус. одна строка), `author` (имя + email
  пользователя), `license: "UNLICENSED"` (репо публичный, но приложение не
  под открытой лицензией — код виден, но не лицензирован на переиспользование;
  это законно и снимает предупреждение electron-builder).
- Проверка: `electron-builder` больше не пишет `description is missed` /
  `author is missed` (визуальная проверка вывода сборки в отчёте задачи).

### 4. Версия 1.0.0

- `package.json` `version: "1.0.0"`.
- `VITE_APP_VERSION` уже прокидывается из `npm_package_version` — попадёт в
  `UserDbProvider` и в UI автоматически.
- `user.db` не мигрируется от смены версии приложения (миграции завязаны на
  `PRAGMA user_version` схемы, не на строку версии) — проверить существующим
  тестом миграций, не добавляя новый.

### 5. Кнопка «Проверить обновления»

Лёгкий вариант (без `electron-updater` / авто-скачивания).

- `src/config.ts` — `export const GITHUB_REPO = '<owner>/jlpt-app'` (слаг
  подставляется, когда репозиторий создан; до этого — заглушка, кнопка
  показывает «репозиторий ещё не настроен»).
- `src/core/version.ts` — `compareVersions(a, b): -1|0|1` (semver-lite:
  `major.minor.patch`, лидирующий `v` срезается, суффиксы игнорируются) +
  `isNewer(latest, current): boolean`. Чистая функция, полностью
  юнит-тестируется.
- `PlatformAdapter` + метод:
  ```ts
  checkForUpdate(): Promise<{ latest: string; url: string } | null>;
  openExternal(url: string): Promise<void>;
  ```
  `null` — сеть недоступна / нет релизов / репо не настроен.
- Electron: IPC `updates:check` → `fetch(
  'https://api.github.com/repos/${GITHUB_REPO}/releases/latest',
  { headers: { 'User-Agent': 'JLPT-app' }, signal: AbortSignal.timeout(8000) })`
  → `{ latest: tag_name, url: html_url }`; любая ошибка / не-200 → `null`.
  IPC `shell:open-external` → `shell.openExternal(url)` (только `https:`
  URL на `github.com`, иначе игнор — защита от подстановки).
- `SettingsScreen` — блок «Обновления»: кнопка «Проверить обновления»
  → `checking…` → один из:
  - «Установлена последняя версия (1.0.0)»
  - «Доступна версия X.Y.Z» + кнопка «Открыть страницу загрузки»
    (`openExternal(url)`)
  - «Не удалось проверить обновления (нет сети?)»
- Тесты: `compareVersions`/`isNewer` — таблица кейсов; `SettingsScreen` с
  мок-адаптером — три ветки отображения; мок возвращает `null` → ветка ошибки.
  Реальный `fetch` к GitHub в тестах не дёргаем.

### 6. Авто-бэкап user.db раз в неделю

- `src/core/backup.ts` — `backupDue(lastIso: string | null, now: Date):
  boolean` (нет отметки или прошло ≥ 7 дней). Чистая функция.
- `PlatformAdapter` + метод:
  ```ts
  autoBackupUserDb(bytes: Uint8Array, keep: number): Promise<void>;
  ```
  Записать `userData/backups/jlpt-auto-YYYY-MM-DD.db`, затем удалить самые
  старые файлы `jlpt-auto-*.db`, оставив `keep` штук (сортировка по имени =
  по дате, формат ISO-даты это гарантирует).
- Electron: IPC `user-db:auto-backup` — `mkdir` каталога, атомарная запись
  (tmp + rename, как `user-db:write`), затем `readdir` + prune. Ошибки
  логируются, не пробрасываются (бэкап не должен ронять старт приложения).
- Триггер: `UserDbProvider`, сразу после `UserDb.open`, вне критического пути
  рендера — `void maybeAutoBackup(db)`. Если `backupDue`, вызвать адаптер и
  записать `settings.last_auto_backup = now.toISOString()`.
- Android impl метода — no-op-заглушка (`план 4d`), как и другие адаптерные
  методы.
- Тесты: `backupDue` — таблица (null; 6 дней; 7 дней; 8 дней; будущее);
  prune-логика — unit с мок-адаптером (7 файлов, keep=4 → удаляются 3
  старейших); `UserDbProvider` не тестируем на бэкап (побочный эффект вне
  рендера) — покрытие через unit триггер-функции `maybeAutoBackup` с
  мок-`db` и мок-адаптером.

### 7. CSP + навигационные guardы Electron

- `index.html` `<head>` — `<meta http-equiv="Content-Security-Policy"
  content="default-src 'self'; script-src 'self' 'wasm-unsafe-eval';
  style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self';
  connect-src 'self' https://api.github.com; base-uri 'none';
  form-action 'none'">`.
  - `'wasm-unsafe-eval'` — нужен sql.js (компиляция WASM из байтов).
  - `'unsafe-inline'` для стилей — React inline-стили компонентов; убрать
    отдельной задачей позже, не в этом плане.
  - `connect-src` включает `api.github.com` для пункта 5.
- `shells/electron/main.ts` в `createWindow`:
  - `win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternal(url)) shell.openExternal(url);
    return { action: 'deny' };
    })` — новые окна не открываются никогда, безопасные внешние ссылки уходят
    в браузер.
  - `win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(rendererOrigin)) e.preventDefault();
    })` — внутри окна навигация только по своему origin (hash-роутинг не
    затрагивается — это не навигация).
  - `isSafeExternal` — общий хелпер с IPC `shell:open-external` из пункта 5
    (`https:` + host `github.com` или поддомен). Вынести в
    `shells/electron/safe-url.ts`, покрыть unit-тестом (компилируется отдельным
    tsconfig оболочки — тест кладём в `tests/electron/`, добавить в
    `vitest` include, если ещё не покрыт).
- Тесты: `isSafeExternal` unit-таблица; e2e — окно грузится с активным CSP
  (нет console-ошибок про CSP при нормальной работе: старт, сессия, sql.js);
  e2e — клик по внешней ссылке (если такая есть в UI после пункта 5) не
  меняет `window.location`. CSP meta присутствует в собранном `index.html`
  (assert в существующем `build`-тесте или новом).

## GitHub-репозиторий (вне задач плана — операционный шаг)

Вариант C (согласовано):

- **Публичный** репозиторий `<owner>/jlpt-app`.
- `.gitignore` дополняется: `content/`, `resources/content.db`,
  `dist/`, `out/`, `build/icon.ico` НЕ игнорируется (иконка нужна для сборки).
  Уже игнорируются: `node_modules/`, `.superpowers/`.
- Учебный контент (`content/**`, собранная `content.db`) остаётся только
  локально. Кто склонирует репо — получит рабочий код, но `npm run
  build-content` у него не будет исходных `.md` → приложение без базы.
  Это осознанный компромисс: цель — раздавать готовый installer, не исходники
  контента (тексты по мотивам Tadoku CC BY-NC-ND, не для публикации).
- `README.md` — краткое описание, скриншот, ссылка на Releases, дисклеймер
  про контент и про неподписанный installer (SmartScreen).
- Релизы: `npm run build:desktop:installer` локально → загрузка
  `dist/JLPT Setup <version>.exe` как asset в GitHub Release с тегом
  `v<version>`. `latest.yml` от electron-builder тоже кладём (пригодится, если
  позже включим `electron-updater`).
- Создание репо и первый push — через `gh` CLI после `gh auth login`
  (интерактивный шаг пользователя). Дальнейшие доработки: обычный `git push`
  + `gh release create` при смене версии.

## Не входит

- `electron-updater` / авто-скачивание и авто-установка обновлений.
- Подпись кода (платный сертификат).
- Публикация учебного контента.
- Code-splitting бандла (781 КБ — приемлемо для десктопа).
- `npm audit` fixes (только dev-зависимости, не runtime).
- Android (план 4d).
- Убирание `'unsafe-inline'` из `style-src`.

## Порядок задач

1. Метаданные пакета + версия 1.0.0 + `.gitignore` (пункты 3, 4 + подготовка репо).
2. Иконка (пункт 1).
3. Японский шрифт (пункт 2) — требует разовой загрузки woff2.
4. `compareVersions` + `backupDue` + `src/config.ts` (чистое ядро пунктов 5, 6).
5. Расширение `PlatformAdapter` + desktop-impl + preload + IPC (пункты 5, 6, 7
   — все три добавляют методы адаптера и IPC, дешевле одной задачей).
6. `SettingsScreen` UI: обновления + провод авто-бэкапа в `UserDbProvider`
   (пункты 5, 6).
7. CSP meta + `will-navigate`/`setWindowOpenHandler` + `safe-url` (пункт 7),
   финальная регрессия (typecheck, lint, vitest, playwright, build:desktop:installer).

## Тестовая стратегия

Как в проекте: Vitest для чистой логики (`compareVersions`, `backupDue`,
prune, `isSafeExternal`) и React-экранов с мок-адаптером; Playwright — старт
приложения с активным CSP и внешние ссылки. Реальных сетевых вызовов в тестах
нет. `make-icon` и шрифт — `scripts`-тесты на артефакт (magic bytes, размер).
Финальная регрессия обязательно включает `npm run build:desktop:installer`
(собирает реальный installer с иконкой).
