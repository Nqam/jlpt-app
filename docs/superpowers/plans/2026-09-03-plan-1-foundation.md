# План 1 — Фундамент и справочник грамматики

> **Для агентов-исполнителей:** ОБЯЗАТЕЛЬНЫЙ САБ-СКИЛЛ — используй
> superpowers:subagent-driven-development (рекомендуется) или
> superpowers:executing-plans для реализации по задачам. Шаги помечены
> чекбоксами (`- [ ]`).

**Цель:** запускающееся на Windows Electron-приложение с адаптивной навигацией, тёмной/светлой темой и рабочим справочником грамматики JLPT (список + карточка пункта, поиск, фуригана), где содержимое собрано контент-пайплайном в `content.db` из курируемых Markdown-файлов.

**Про объём контента:** этот план закладывает пайплайн, UI и **сид** реального контента — 8 пунктов грамматики N5. Полный объём грамматики N5, затем N4, а также кандзи, слова и тексты — это планы 2–5, там основная контент-работа. Уровни N4–N1 присутствуют в данных как «скоро» (сегмент на ленте есть, контента пока нет), N4 переводится в «available» в плане, который его наполняет.

**Архитектура:** единый веб-код (React + TypeScript + Vite). Оболочка ПК — Electron через `electron-vite`. Учебные данные лежат в `content.db` (SQLite, читается через `sql.js` WASM в рендерере). Файловый ввод-вывод спрятан за интерфейсом `PlatformAdapter`; в этом плане реализуется только десктопная версия адаптера. Контент-пайплайн — Node-скрипт, запускается разработчиком, собирает `content.db` из `content/grammar/**/*.md`.

**Стек:** Node 24, TypeScript 5.6, React 18.3, Vite 6, electron-vite 2, Electron 33, electron-builder 25, sql.js 1.12, react-router-dom 6, markdown-it 14, gray-matter 4, Vitest 2, Playwright 1.48.

**Спека:** `docs/superpowers/specs/2026-09-03-jlpt-desktop-app-design.md` — план аргументируется из спеки, читать оба документа.

## Глобальные ограничения

Требования всех задач неявно включают этот раздел.

- **Платформы:** код не должен зависеть от Electron/Node API вне `shells/electron/**` и `scripts/**`. Всё в `src/core/**`, `src/storage/**`, `src/ui/**` обязано работать в обычном браузере (для будущего Android через Capacitor).
- **Уровень — это данные.** Никаких хардкод-констант `"N5"`/`"N4"` в логике и UI. Список уровней и их порядок берётся из таблицы `levels` базы `content.db`.
- **Офлайн.** В этом плане приложение не делает ни одного сетевого запроса в рантайме.
- **Хранилище:** только `sql.js` (WASM). Нативные модули (`better-sqlite3` и подобные) не добавлять.
- **Язык интерфейса и объяснений:** русский. Японский текст — с поддержкой фуриганы.
- **Node:** проект должен собираться на Node 24 (`"engines": { "node": ">=22" }`).
- **content.db пересобирается с нуля** каждым запуском пайплайна — миграций у него нет (миграции есть только у `user.db`, это следующий план).
- **TDD:** для каждой задачи сначала падающий тест, потом реализация. Тесты логики — Vitest, сценарии UI — Playwright.
- **Коммиты:** маленькие, в конце каждой задачи. Тело коммита на обычном английском.
  Подпись коммита:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  ```

## Структура файлов

Создаётся в этом плане:

```
jlpt-app/
  package.json                       # скрипты, зависимости, engines
  tsconfig.json                      # база для src/**
  tsconfig.node.json                 # для scripts/** и electron-vite конфигов
  electron.vite.config.ts            # main / preload / renderer
  vitest.config.ts
  playwright.config.ts
  index.html                         # HTML-точка входа рендерера
  electron-builder.yml               # конфиг установщика
  public/
    sql-wasm.wasm                    # копия из пакета sql.js (в гите)
  resources/
    content.db                       # СОБИРАЕТСЯ пайплайном (в .gitignore)
  src/
    core/
      types.ts                       # доменные типы
      ruby.ts                        # парсер записи фуриганы 私[わたし] -> сегменты
    storage/
      sqljs.ts                       # инициализация sql.js (locateFile)
      content-db.ts                  # read-only запросы к content.db
    platform/
      adapter.ts                     # интерфейс PlatformAdapter (+ типы)
      desktop.ts                     # реализация через window.jlmpBridge (IPC)
      index.ts                       # выбор реализации в рантайме
    ui/
      main.tsx                       # монтирование React
      App.tsx                        # провайдеры + роутер
      routes.tsx                     # таблица маршрутов
      theme.css                      # переменные тем, базовые стили
      ContentDbProvider.tsx          # контекст: экземпляр ContentDb + список уровней
      useContentDb.ts                # хук доступа к контексту
      components/
        Nav.tsx                      # адаптивная навигация (боковая / нижняя)
        Furigana.tsx                 # рендер ruby из записи core/ruby
        ThemeToggle.tsx
        LevelBadge.tsx
      screens/
        GrammarListScreen.tsx
        GrammarDetailScreen.tsx
        PlaceholderScreen.tsx        # заглушка для Сегодня/Кандзи/Слова/Прогресс/Настройки
  shells/
    electron/
      main.ts                        # процесс Electron: окно, IPC-обработчики
      preload.ts                     # мост window.jlmpBridge
      tsconfig.json
  scripts/
    build-content/
      schema.sql                     # DDL content.db (levels, grammar_*)
      lists.ts                       # чтение content/levels.yml
      parse-grammar.ts               # Markdown+frontmatter -> GrammarPoint
      write-db.ts                    # запись собранных данных в sql.js Database
      index.ts                       # оркестратор: читает всё, пишет resources/content.db
  content/
    levels.yml                       # порядок и статус уровней N5..N1
    grammar/
      n5/
        wa-particle.md
        desu.md
        ka-question.md
        no-noun-linking.md
        mo-particle.md
        wo-particle.md
        ni-place-time.md
        masu-form.md
  tests/
    core/
      ruby.test.ts
    storage/
      content-db.test.ts
    scripts/
      parse-grammar.test.ts
      build-content.test.ts
      grammar-content.test.ts        # валидация всего курируемого слоя
    ui/
      Furigana.test.tsx
      Nav.test.tsx
      GrammarListScreen.test.tsx
    e2e/
      smoke.spec.ts
      grammar-browse.spec.ts
    fixtures/
      grammar-valid.md
      grammar-missing-section.md
  .gitignore
```

---

### Task 1 — Каркас проекта и инструменты

**Файлы:**
- Создать: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `electron.vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `index.html`, `.gitignore`
- Создать: `src/ui/main.tsx`, `src/ui/App.tsx`, `src/ui/theme.css`
- Создать: `shells/electron/main.ts`, `shells/electron/preload.ts`, `shells/electron/tsconfig.json`
- Тест: `tests/core/ruby.test.ts` (временный тривиальный, заменяется в задаче 3)

**Интерфейсы:**
- Consumes: —
- Produces: рабочие команды `npm run dev`, `npm run build`, `npm test`, `npm run test:e2e`, `npm run typecheck`. Точка монтирования React — элемент `#root` в `index.html`.

- [ ] **Шаг 1: package.json**

```json
{
  "name": "jlpt-app",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "main": "out/main/main.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "npm run typecheck && electron-vite build",
    "build:desktop": "npm run build && electron-builder --win --dir",
    "build:desktop:installer": "npm run build && electron-builder --win",
    "build-content": "tsx scripts/build-content/index.ts",
    "typecheck": "tsc -p tsconfig.json --noEmit && tsc -p shells/electron/tsconfig.json --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "lint": "eslint ."
  },
  "dependencies": {
    "markdown-it": "^14.1.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.28.0",
    "sql.js": "^1.12.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.48.0",
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.1",
    "@types/markdown-it": "^14.1.2",
    "@types/node": "^22.7.0",
    "@types/react": "^18.3.11",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.2",
    "electron": "^33.0.0",
    "electron-builder": "^25.1.8",
    "electron-vite": "^2.3.0",
    "eslint": "^9.12.0",
    "gray-matter": "^4.0.3",
    "jsdom": "^25.0.1",
    "tsx": "^4.19.1",
    "typescript": "^5.6.2",
    "vite": "^6.0.0",
    "vitest": "^2.1.2",
    "yaml": "^2.6.0"
  }
}
```

- [ ] **Шаг 2: установить зависимости**

Run: `npm install`
Expected: `node_modules/` создан, ошибок нет. Если `electron` не докачал бинарь — повторить `npm install` (в спеке отмечено: Node 24, при странностях рассмотреть v22, но сначала просто повторить).

- [ ] **Шаг 3: tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"],
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src", "tests", "scripts", "electron.vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Шаг 4: tsconfig.node.json и shells/electron/tsconfig.json**

`tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["scripts"]
}
```

`shells/electron/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node", "electron"],
    "outDir": "../../out"
  },
  "include": ["."]
}
```

- [ ] **Шаг 5: electron.vite.config.ts**

```ts
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  main: {
    build: {
      outDir: 'out/main',
      lib: { entry: resolve(__dirname, 'shells/electron/main.ts') },
    },
  },
  preload: {
    build: {
      outDir: 'out/preload',
      lib: { entry: resolve(__dirname, 'shells/electron/preload.ts') },
    },
  },
  renderer: {
    root: '.',
    base: './',
    resolve: { alias: { '@': resolve(__dirname, 'src') } },
    build: {
      outDir: 'out/renderer',
      rollupOptions: { input: resolve(__dirname, 'index.html') },
    },
    plugins: [react()],
  },
});
```

- [ ] **Шаг 6: index.html + минимальный React**

`index.html`:
```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>JLPT</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/ui/main.tsx"></script>
  </body>
</html>
```

`src/ui/main.tsx`:
```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './theme.css';

const el = document.getElementById('root');
if (!el) throw new Error('#root not found');
createRoot(el).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

`src/ui/App.tsx` (временный, расширяется в задаче 8):
```tsx
export default function App() {
  return <h1 data-testid="app-title">JLPT</h1>;
}
```

`src/ui/theme.css` (временный):
```css
:root { color-scheme: light dark; font-family: system-ui, sans-serif; }
body { margin: 0; }
```

- [ ] **Шаг 7: Electron main + preload (минимум)**

`shells/electron/main.ts`:
```ts
import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';

const isDev = !!process.env['ELECTRON_RENDERER_URL'];

async function createWindow(): Promise<void> {
  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      sandbox: false,
    },
  });
  win.on('ready-to-show', () => win.show());
  if (isDev) {
    await win.loadURL(process.env['ELECTRON_RENDERER_URL']!);
  } else {
    await win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
```

`shells/electron/preload.ts` (мост расширяется в задаче 7 общего плана):
```ts
import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('jlmpBridge', {
  ping: () => 'pong',
});
```

- [ ] **Шаг 8: конфиги тестов**

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: [],
    environmentMatchGlobs: [['tests/ui/**', 'jsdom']],
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
```

`playwright.config.ts`:
```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
});
```

- [ ] **Шаг 9: .gitignore**

```gitignore
node_modules/
out/
dist/
resources/content.db
data/raw/
*.log
.DS_Store
test-results/
playwright-report/
release/
```

- [ ] **Шаг 10: временный тест — проверить, что раннер работает**

`tests/core/ruby.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('toolchain smoke', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Шаг 11: прогнать всё**

Run: `npm run typecheck && npm test`
Expected: typecheck без ошибок; 1 тест PASS.

- [ ] **Шаг 12: проверить запуск Electron вручную**

Run: `npm run dev`
Expected: открывается окно с заголовком «JLPT». Закрыть.

- [ ] **Шаг 13: коммит**

```bash
git add -A
git commit -m "chore: scaffold electron-vite + react + typescript + test runners"
```

---

### Task 2 — Доменные типы и схема `content.db`

**Файлы:**
- Создать: `src/core/types.ts`
- Создать: `scripts/build-content/schema.sql`
- Создать: `content/levels.yml`
- Тест: `tests/scripts/build-content.test.ts` (частично; дополняется в задаче 5)

**Интерфейсы:**
- Consumes: —
- Produces:
  - типы `LevelCode` (`string`, напр. `"N5"`), `Level`, `GrammarPoint`, `GrammarExample`, `RubySegment`
  - `schema.sql` создаёт таблицы `levels`, `grammar_points`, `grammar_examples`, `grammar_relations`
  - `content/levels.yml` — источник строк таблицы `levels`

- [ ] **Шаг 1: типы**

`src/core/types.ts`:
```ts
/** Код уровня JLPT как строка из content.db, например "N5". Не enum — уровни расширяемы. */
export type LevelCode = string;

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
}

export interface RubySegment {
  base: string;
  /** Чтение над кандзи; null для сегментов без фуриганы (кана, пунктуация). */
  ruby: string | null;
}
```

- [ ] **Шаг 2: схема**

`scripts/build-content/schema.sql`:
```sql
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

CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

- [ ] **Шаг 3: levels.yml**

`content/levels.yml`:
```yaml
- code: N5
  ord: 1
  status: available
  titleRu: "N5 — начальный"
- code: N4
  ord: 2
  status: coming_soon
  titleRu: "N4 — элементарный"
- code: N3
  ord: 3
  status: coming_soon
  titleRu: "N3 — средний"
- code: N2
  ord: 4
  status: coming_soon
  titleRu: "N2 — выше среднего"
- code: N1
  ord: 5
  status: coming_soon
  titleRu: "N1 — продвинутый"
```

- [ ] **Шаг 4: тест — схема исполняется в sql.js**

`tests/scripts/build-content.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import initSqlJs from 'sql.js';

describe('content.db schema', () => {
  it('executes without error and creates expected tables', async () => {
    const SQL = await initSqlJs({
      locateFile: () => resolve(__dirname, '../../node_modules/sql.js/dist/sql-wasm.wasm'),
    });
    const db = new SQL.Database();
    const ddl = readFileSync(resolve(__dirname, '../../scripts/build-content/schema.sql'), 'utf8');
    db.run(ddl);
    const res = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    const tables = res[0]!.values.map((r) => r[0]);
    expect(tables).toEqual([
      'grammar_examples',
      'grammar_points',
      'grammar_relations',
      'levels',
      'meta',
    ]);
    db.close();
  });
});
```

- [ ] **Шаг 5: запустить тест**

Run: `npx vitest run tests/scripts/build-content.test.ts`
Expected: PASS. Если sql.js не находит wasm — путь в `locateFile` указывает на файл внутри `node_modules/sql.js/dist/sql-wasm.wasm`; проверить, что он там есть (`ls node_modules/sql.js/dist`).

- [ ] **Шаг 6: коммит**

```bash
git add -A
git commit -m "feat: domain types, content.db schema, levels.yml"
```

---

### Task 3 — Парсер записи фуриганы (`core/ruby.ts`)

**Файлы:**
- Создать: `src/core/ruby.ts`
- Заменить: `tests/core/ruby.test.ts`

**Интерфейсы:**
- Consumes: тип `RubySegment` из `@/core/types`
- Produces: `parseRuby(input: string): RubySegment[]`

Запись: кандзи-группа со чтением в квадратных скобках сразу после неё — `漢字[かんじ]`. Всё, что вне такой пары, — сегмент без чтения. Пробел — разделитель токенов, в вывод не попадает как отдельный видимый сегмент (сохраняется как `base: ' '`, `ruby: null`, чтобы верстка дышала).

- [ ] **Шаг 1: падающий тест**

`tests/core/ruby.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseRuby } from '@/core/ruby';

describe('parseRuby', () => {
  it('splits a kanji group with reading', () => {
    expect(parseRuby('学生[がくせい]')).toEqual([{ base: '学生', ruby: 'がくせい' }]);
  });

  it('keeps kana outside brackets as plain segments', () => {
    expect(parseRuby('私[わたし]は')).toEqual([
      { base: '私', ruby: 'わたし' },
      { base: 'は', ruby: null },
    ]);
  });

  it('handles a full sentence with spaces', () => {
    expect(parseRuby('私[わたし]は 学生[がくせい]です。')).toEqual([
      { base: '私', ruby: 'わたし' },
      { base: 'は', ruby: null },
      { base: ' ', ruby: null },
      { base: '学生', ruby: 'がくせい' },
      { base: 'です。', ruby: null },
    ]);
  });

  it('returns a single plain segment when there are no brackets', () => {
    expect(parseRuby('これはペンです')).toEqual([{ base: 'これはペンです', ruby: null }]);
  });

  it('throws on an unclosed bracket', () => {
    expect(() => parseRuby('学生[がくせい')).toThrow();
  });
});
```

- [ ] **Шаг 2: убедиться, что падает**

Run: `npx vitest run tests/core/ruby.test.ts`
Expected: FAIL — `parseRuby is not a function` / модуль не найден.

- [ ] **Шаг 3: реализация**

`src/core/ruby.ts`:
```ts
import type { RubySegment } from './types';

/**
 * Разбирает строку с записью фуриганы вида "私[わたし]は 学生[がくせい]です。"
 * в последовательность сегментов. Группа "X[Y]" -> { base: 'X', ruby: 'Y' }.
 * Остальные подстроки -> { base, ruby: null }. Пробел сохраняется отдельным
 * сегментом " " для читаемой вёрстки.
 */
export function parseRuby(input: string): RubySegment[] {
  const segments: RubySegment[] = [];
  let plain = '';

  const flushPlain = () => {
    if (plain !== '') {
      segments.push({ base: plain, ruby: null });
      plain = '';
    }
  };

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (ch === ' ') {
      flushPlain();
      segments.push({ base: ' ', ruby: null });
      continue;
    }
    if (ch === '[') {
      throw new Error(`parseRuby: '[' without a preceding base at index ${i} in ${JSON.stringify(input)}`);
    }
    // заглянуть вперёд: это база с последующей скобкой?
    const next = input.indexOf('[', i);
    if (next !== -1 && !input.slice(i, next).includes(' ') && input.slice(i, next).length > 0) {
      const close = input.indexOf(']', next);
      if (close === -1) {
        throw new Error(`parseRuby: unclosed '[' in ${JSON.stringify(input)}`);
      }
      const base = input.slice(i, next);
      const ruby = input.slice(next + 1, close);
      // символы базы до кандзи-группы могут быть каной: отдать их plain,
      // если между i и next есть кана перед кандзи — упрощаем: вся база до '[' идёт как одна группа.
      flushPlain();
      segments.push({ base, ruby });
      i = close;
      continue;
    }
    plain += ch;
  }
  flushPlain();
  return segments;
}
```

Примечание для исполнителя: тест «private sentence» ожидает, что `です。` после `学生[がくせい]` станет одним plain-сегментом — реализация выше это даёт, потому что после `]` идёт обычный набор символов без следующей `[`. Если тест на смешанную базу (кана+кандзи перед скобкой) провалится, скорректировать: сузить «базу» до последней последовательности не-кана символов перед `[`. Для сид-контента задачи 4 запись всегда «кандзи-группа сразу со скобкой», поэтому текущей логики достаточно; добавлять сложность только если реальный пример её требует.

- [ ] **Шаг 4: тест зелёный**

Run: `npx vitest run tests/core/ruby.test.ts`
Expected: PASS (все 5).

- [ ] **Шаг 5: коммит**

```bash
git add -A
git commit -m "feat: furigana notation parser (core/ruby)"
```

---

### Task 4 — Курируемый контент грамматики N5 (сид)

**Файлы:**
- Создать: `content/grammar/n5/` — `wa-particle.md`, `desu.md`, `ka-question.md`, `no-noun-linking.md`, `mo-particle.md`, `wo-particle.md`, `ni-place-time.md`, `masu-form.md`
- Создать: `tests/fixtures/grammar-valid.md`, `tests/fixtures/grammar-missing-section.md`
- Тест: `tests/scripts/grammar-content.test.ts` (валидация всего слоя — зависит от парсера задачи 5; в этой задаче добавить как `it.todo`, раскрыть в задаче 5)

**Интерфейсы:**
- Consumes: формат из спеки §4 «Курируемый слой грамматики»
- Produces: 8 валидных `.md` пунктов N5, каждый с секциями `## Кратко`, `## Образование`, `## Нюансы`, `## Примеры` (≥ 3), `## Частые ошибки`; frontmatter `id/level/title/tags/related/layer`

- [ ] **Шаг 1: формат (эталон)**

Каждый файл строго такой структуры (пример — `wa-particle.md`):

```markdown
---
id: n5-wa-particle
level: N5
title: "は (тема предложения)"
tags: [частицы, базовое]
related: [n5-ka-question, n5-mo-particle]
layer: 1
---

## Кратко

Частица は (читается «wa») ставится после слова и помечает его как тему —
то, о чём idёт речь. Тема уже известна собеседнику; новое сообщается дальше.

## Образование

[существительное] + は + [остальная часть предложения]

## Нюансы

は выделяет тему и часто противопоставляет её другим вариантам.
Отличие от が: が вводит новое подлежащее и отвечает на вопрос «кто/что?»,
は говорит «что касается X — ...».

## Примеры

- 私[わたし]は 学生[がくせい]です。 — Я студент. (что касается меня — студент)
- これは 本[ほん]です。 — Это книга.
- 田中[たなか]さんは 先生[せんせい]ですか。 — Танака-сан — учитель?

## Частые ошибки

- Писать/произносить は в роли частицы как «ha». Как частица — всегда «wa».
- Путать с が в первом предложении рассказа о новом предмете: там нужен が.
```

- [ ] **Шаг 2: написать 8 файлов**

Наполнение (короткое ТЗ на каждый — тексты писать полно, по эталону, примеры реальные и корректные, переводы на русский, ≥ 3 примера, все секции):

| файл | id | title | layer | related |
|---|---|---|---|---|
| `wa-particle.md` | `n5-wa-particle` | `は (тема предложения)` | 1 | `n5-ka-question`, `n5-mo-particle` |
| `desu.md` | `n5-desu` | `です／だ (связка)` | 1 | `n5-wa-particle`, `n5-ka-question` |
| `ka-question.md` | `n5-ka-question` | `か (вопросительная частица)` | 1 | `n5-desu`, `n5-wa-particle` |
| `no-noun-linking.md` | `n5-no-noun-linking` | `の (связь существительных)` | 1 | `n5-wa-particle` |
| `mo-particle.md` | `n5-mo-particle` | `も (тоже, также)` | 2 | `n5-wa-particle` |
| `wo-particle.md` | `n5-wo-particle` | `を (прямое дополнение)` | 2 | `n5-masu-form` |
| `ni-place-time.md` | `n5-ni-place-time` | `に (время и место существования)` | 2 | `n5-wo-particle` |
| `masu-form.md` | `n5-masu-form` | `〜ます (вежливая форма глагола)` | 2 | `n5-wo-particle` |

Требование целостности: каждый `related`-id должен существовать среди этих 8 файлов (иначе тест задачи 5 упадёт). Таблица выше согласована — соблюсти.

- [ ] **Шаг 3: фикстуры для тестов парсера**

`tests/fixtures/grammar-valid.md` — копия структуры эталона с `id: fix-valid`, `level: N5`, `related: []`, 3 примера.

`tests/fixtures/grammar-missing-section.md` — тот же frontmatter (`id: fix-broken`), но БЕЗ секции `## Примеры`.

- [ ] **Шаг 4: заглушка теста валидации**

`tests/scripts/grammar-content.test.ts`:
```ts
import { describe, it } from 'vitest';

describe('curated grammar layer', () => {
  it.todo('every related id resolves to an existing point');
  it.todo('every point has >= 3 examples');
  it.todo('every point has all required sections');
});
```

- [ ] **Шаг 5: коммит**

```bash
git add -A
git commit -m "content: seed 8 N5 grammar points + parser fixtures"
```

---

### Task 5 — Парсер грамматики + валидация слоя

**Файлы:**
- Создать: `scripts/build-content/parse-grammar.ts`
- Создать: `scripts/build-content/lists.ts`
- Тест: `tests/scripts/parse-grammar.test.ts`
- Заменить: `tests/scripts/grammar-content.test.ts`

**Интерфейсы:**
- Consumes: `GrammarPoint`, `Level` из `@/core/types`; фикстуры задачи 4
- Produces:
  - `parseGrammarFile(path: string): GrammarPoint` — бросает при отсутствии обязательной секции или битом frontmatter
  - `loadAllGrammar(dir: string): GrammarPoint[]`
  - `validateGrammar(points: GrammarPoint[]): string[]` — список ошибок (пустой = ок)
  - `loadLevels(ymlPath: string): Level[]`

- [ ] **Шаг 1: падающие тесты парсера**

`tests/scripts/parse-grammar.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { parseGrammarFile, loadAllGrammar, validateGrammar } from '../../scripts/build-content/parse-grammar';

const fix = (n: string) => resolve(__dirname, '../fixtures', n);
const grammarDir = resolve(__dirname, '../../content/grammar');

describe('parseGrammarFile', () => {
  it('parses frontmatter and examples', () => {
    const p = parseGrammarFile(fix('grammar-valid.md'));
    expect(p.id).toBe('fix-valid');
    expect(p.level).toBe('N5');
    expect(p.examples.length).toBeGreaterThanOrEqual(3);
    expect(p.examples[0]!.jaRuby).toMatch(/\S/);
    expect(p.examples[0]!.ru).toMatch(/\S/);
    expect(p.bodyMarkdown).toContain('## Кратко');
  });

  it('throws when a required section is missing', () => {
    expect(() => parseGrammarFile(fix('grammar-missing-section.md'))).toThrow(/Примеры/);
  });
});

describe('curated N5 layer', () => {
  const points = loadAllGrammar(grammarDir);

  it('loads all 8 seeded points', () => {
    expect(points.filter((p) => p.level === 'N5')).toHaveLength(8);
  });

  it('passes validation (related ids resolve, >=3 examples, sections present)', () => {
    expect(validateGrammar(points)).toEqual([]);
  });
});
```

- [ ] **Шаг 2: убедиться, что падает**

Run: `npx vitest run tests/scripts/parse-grammar.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Шаг 3: реализация парсера**

`scripts/build-content/parse-grammar.ts`:
```ts
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import type { GrammarPoint, GrammarExample } from '../../src/core/types';

const REQUIRED_SECTIONS = ['## Кратко', '## Образование', '## Нюансы', '## Примеры', '## Частые ошибки'];

export function parseGrammarFile(path: string): GrammarPoint {
  const raw = readFileSync(path, 'utf8');
  const { data, content } = matter(raw);

  for (const key of ['id', 'level', 'title', 'layer'] as const) {
    if (data[key] === undefined) throw new Error(`${path}: frontmatter missing "${key}"`);
  }
  for (const section of REQUIRED_SECTIONS) {
    if (!content.includes(section)) {
      throw new Error(`${path}: missing section "${section}"`);
    }
  }

  const examples = parseExamples(content, path);

  return {
    id: String(data['id']),
    level: String(data['level']),
    title: String(data['title']),
    layer: Number(data['layer']),
    tags: Array.isArray(data['tags']) ? data['tags'].map(String) : [],
    related: Array.isArray(data['related']) ? data['related'].map(String) : [],
    bodyMarkdown: content.trim(),
    examples,
  };
}

function parseExamples(content: string, path: string): GrammarExample[] {
  const lines = content.split('\n');
  const start = lines.findIndex((l) => l.trim() === '## Примеры');
  if (start === -1) throw new Error(`${path}: no "## Примеры" section`);
  const out: GrammarExample[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line.startsWith('## ')) break;
    if (!line.startsWith('- ')) continue;
    const body = line.slice(2);
    const dash = body.indexOf(' — ');
    if (dash === -1) throw new Error(`${path}: example without " — " separator: ${line}`);
    out.push({ jaRuby: body.slice(0, dash).trim(), ru: body.slice(dash + 3).trim() });
  }
  return out;
}

export function loadAllGrammar(dir: string): GrammarPoint[] {
  const out: GrammarPoint[] = [];
  for (const level of readdirSync(dir)) {
    const levelDir = join(dir, level);
    let files: string[];
    try {
      files = readdirSync(levelDir).filter((f) => f.endsWith('.md'));
    } catch {
      continue;
    }
    for (const f of files) out.push(parseGrammarFile(join(levelDir, f)));
  }
  return out;
}

export function validateGrammar(points: GrammarPoint[]): string[] {
  const errors: string[] = [];
  const ids = new Set(points.map((p) => p.id));
  for (const p of points) {
    if (p.examples.length < 3) errors.push(`${p.id}: only ${p.examples.length} examples (need >= 3)`);
    for (const r of p.related) {
      if (!ids.has(r)) errors.push(`${p.id}: related id "${r}" does not exist`);
    }
    if (!Number.isInteger(p.layer) || p.layer < 1) errors.push(`${p.id}: bad layer ${p.layer}`);
  }
  return errors;
}
```

- [ ] **Шаг 4: реализация загрузчика уровней**

`scripts/build-content/lists.ts`:
```ts
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import type { Level } from '../../src/core/types';

export function loadLevels(ymlPath: string): Level[] {
  const rows = parse(readFileSync(ymlPath, 'utf8')) as unknown;
  if (!Array.isArray(rows)) throw new Error(`${ymlPath}: expected a YAML list`);
  return rows.map((r, i) => {
    const row = r as Record<string, unknown>;
    for (const k of ['code', 'ord', 'status', 'titleRu']) {
      if (row[k] === undefined) throw new Error(`${ymlPath}[${i}]: missing "${k}"`);
    }
    const status = String(row['status']);
    if (status !== 'available' && status !== 'coming_soon') {
      throw new Error(`${ymlPath}[${i}]: bad status "${status}"`);
    }
    return {
      code: String(row['code']),
      ord: Number(row['ord']),
      status,
      titleRu: String(row['titleRu']),
    };
  });
}
```

- [ ] **Шаг 5: раскрыть тест валидации слоя**

`tests/scripts/grammar-content.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { loadAllGrammar, validateGrammar } from '../../scripts/build-content/parse-grammar';
import { loadLevels } from '../../scripts/build-content/lists';

const points = loadAllGrammar(resolve(__dirname, '../../content/grammar'));
const levels = loadLevels(resolve(__dirname, '../../content/levels.yml'));

describe('curated grammar layer', () => {
  it('validates clean', () => {
    expect(validateGrammar(points)).toEqual([]);
  });

  it('every point references an existing level', () => {
    const codes = new Set(levels.map((l) => l.code));
    for (const p of points) expect(codes.has(p.level)).toBe(true);
  });

  it('N5 has exactly the 8 seeded points', () => {
    const n5 = points.filter((p) => p.level === 'N5').map((p) => p.id).sort();
    expect(n5).toEqual(
      [
        'n5-desu',
        'n5-ka-question',
        'n5-masu-form',
        'n5-mo-particle',
        'n5-ni-place-time',
        'n5-no-noun-linking',
        'n5-wa-particle',
        'n5-wo-particle',
      ].sort(),
    );
  });
});
```

- [ ] **Шаг 6: тесты зелёные**

Run: `npx vitest run tests/scripts/parse-grammar.test.ts tests/scripts/grammar-content.test.ts`
Expected: PASS. Если валидация ругается на `related` — поправить frontmatter сид-файлов задачи 4 (id должны совпадать с таблицей).

- [ ] **Шаг 7: коммит**

```bash
git add -A
git commit -m "feat: grammar markdown parser + curated-layer validation"
```

---

### Task 6 — Сборка `content.db` (writer + оркестратор)

**Файлы:**
- Создать: `scripts/build-content/write-db.ts`
- Создать: `scripts/build-content/index.ts`
- Тест: дополнить `tests/scripts/build-content.test.ts`

**Интерфейсы:**
- Consumes: `loadAllGrammar`, `validateGrammar` (задача 5), `loadLevels` (задача 5), `schema.sql` (задача 2)
- Produces:
  - `buildContentDb(opts: { grammarDir: string; levelsYml: string; schemaPath: string }): Uint8Array` — чистая функция, возвращает байты БД
  - `scripts/build-content/index.ts` — CLI: пишет `resources/content.db`, печатает счётчики
  - строка `meta.content_version`

- [ ] **Шаг 1: падающий тест**

Дополнить `tests/scripts/build-content.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import initSqlJs from 'sql.js';
import { buildContentDb } from '../../scripts/build-content/write-db';

const opts = {
  grammarDir: resolve(__dirname, '../../content/grammar'),
  levelsYml: resolve(__dirname, '../../content/levels.yml'),
  schemaPath: resolve(__dirname, '../../scripts/build-content/schema.sql'),
};

describe('buildContentDb', () => {
  it('produces a db with levels and grammar rows and intact FKs', async () => {
    const bytes = buildContentDb(opts);
    const SQL = await initSqlJs({
      locateFile: () => resolve(__dirname, '../../node_modules/sql.js/dist/sql-wasm.wasm'),
    });
    const db = new SQL.Database(bytes);

    const levels = db.exec('SELECT count(*) FROM levels')[0]!.values[0]![0];
    expect(levels).toBe(5);

    const grammar = db.exec("SELECT count(*) FROM grammar_points WHERE level='N5'")[0]!.values[0]![0];
    expect(grammar).toBe(8);

    const examples = db.exec('SELECT count(*) FROM grammar_examples')[0]!.values[0]![0] as number;
    expect(examples).toBeGreaterThanOrEqual(24);

    // осиротевших связей нет
    const orphans = db.exec(`
      SELECT count(*) FROM grammar_relations r
      LEFT JOIN grammar_points a ON a.id = r.from_id
      LEFT JOIN grammar_points b ON b.id = r.to_id
      WHERE a.id IS NULL OR b.id IS NULL
    `)[0]!.values[0]![0];
    expect(orphans).toBe(0);

    const version = db.exec("SELECT value FROM meta WHERE key='content_version'")[0]!.values[0]![0];
    expect(String(version)).toMatch(/\d/);

    db.close();
  });

  it('is deterministic (two builds give identical bytes)', () => {
    const a = buildContentDb(opts);
    const b = buildContentDb(opts);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });
});
```

- [ ] **Шаг 2: убедиться, что падает**

Run: `npx vitest run tests/scripts/build-content.test.ts`
Expected: FAIL — `write-db` не найден.

- [ ] **Шаг 3: writer**

`scripts/build-content/write-db.ts`:
```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import initSqlJsFactory from 'sql.js';
import type { SqlJsStatic } from 'sql.js';
import { loadAllGrammar, validateGrammar } from './parse-grammar';
import { loadLevels } from './lists';

export interface BuildOpts {
  grammarDir: string;
  levelsYml: string;
  schemaPath: string;
  /** По умолчанию — фиксированное значение, чтобы сборка была детерминированной в тестах. */
  contentVersion?: string;
}

let sqlJs: SqlJsStatic | null = null;
function getSqlJsSync(): SqlJsStatic {
  // sql.js init асинхронна из-за загрузки wasm; в Node грузим синхронно из файла.
  if (sqlJs) return sqlJs;
  throw new Error('call initWriter() once before buildContentDb()');
}

export async function initWriter(): Promise<void> {
  if (sqlJs) return;
  sqlJs = await initSqlJsFactory({
    locateFile: () => resolve(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm'),
  });
}

export function buildContentDb(opts: BuildOpts): Uint8Array {
  const SQL = getSqlJsSync();
  const db = new SQL.Database();
  db.run(readFileSync(opts.schemaPath, 'utf8'));

  const levels = loadLevels(opts.levelsYml).sort((a, b) => a.ord - b.ord);
  const grammar = loadAllGrammar(opts.grammarDir).sort((a, b) => a.id.localeCompare(b.id));

  const errors = validateGrammar(grammar);
  if (errors.length) throw new Error(`grammar validation failed:\n${errors.join('\n')}`);

  const levelCodes = new Set(levels.map((l) => l.code));
  for (const g of grammar) {
    if (!levelCodes.has(g.level)) throw new Error(`grammar ${g.id}: unknown level ${g.level}`);
  }

  const insLevel = db.prepare('INSERT INTO levels (code, ord, status, title_ru) VALUES (?,?,?,?)');
  for (const l of levels) insLevel.run([l.code, l.ord, l.status, l.titleRu]);
  insLevel.free();

  const insG = db.prepare(
    'INSERT INTO grammar_points (id, level, title, layer, tags_json, body_markdown) VALUES (?,?,?,?,?,?)',
  );
  const insE = db.prepare('INSERT INTO grammar_examples (grammar_id, ord, ja_ruby, ru) VALUES (?,?,?,?)');
  const insR = db.prepare('INSERT INTO grammar_relations (from_id, to_id) VALUES (?,?)');
  const ids = new Set(grammar.map((g) => g.id));
  for (const g of grammar) {
    insG.run([g.id, g.level, g.title, g.layer, JSON.stringify(g.tags), g.bodyMarkdown]);
    g.examples.forEach((e, i) => insE.run([g.id, i, e.jaRuby, e.ru]));
    for (const r of [...g.related].sort()) {
      if (ids.has(r)) insR.run([g.id, r]);
    }
  }
  insG.free();
  insE.free();
  insR.free();

  db.run("INSERT INTO meta (key, value) VALUES ('content_version', ?)", [
    opts.contentVersion ?? '0.1.0',
  ]);
  db.run("INSERT INTO meta (key, value) VALUES ('schema_version', '1')");

  const bytes = db.export();
  db.close();
  return bytes;
}
```

Примечание: тесты задачи 6 вызывают `buildContentDb` синхронно. Чтобы `getSqlJsSync` не бросал, тестовый файл должен вызвать `initWriter()` в `beforeAll`. Добавить в начало обоих describe:
```ts
import { beforeAll } from 'vitest';
import { initWriter } from '../../scripts/build-content/write-db';
beforeAll(async () => { await initWriter(); });
```
Внести эту правку в `tests/scripts/build-content.test.ts` на шаге 1 (или сразу здесь).

- [ ] **Шаг 4: оркестратор CLI**

`scripts/build-content/index.ts`:
```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initWriter, buildContentDb } from './write-db';

async function main(): Promise<void> {
  await initWriter();
  const root = resolve(__dirname, '../..');
  const bytes = buildContentDb({
    grammarDir: resolve(root, 'content/grammar'),
    levelsYml: resolve(root, 'content/levels.yml'),
    schemaPath: resolve(root, 'scripts/build-content/schema.sql'),
    contentVersion: process.env['CONTENT_VERSION'] ?? '0.1.0',
  });
  const outDir = resolve(root, 'resources');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, 'content.db');
  writeFileSync(outPath, bytes);
  console.log(`content.db written: ${outPath} (${bytes.byteLength} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Шаг 5: тесты зелёные**

Run: `npx vitest run tests/scripts/build-content.test.ts`
Expected: PASS (schema + build + determinism).

- [ ] **Шаг 6: реальная сборка**

Run: `npm run build-content`
Expected: `content.db written: .../resources/content.db (NNNNN bytes)`, файл существует.

- [ ] **Шаг 7: коммит**

```bash
git add -A
git commit -m "feat: content.db builder (writer + CLI orchestrator)"
```

---

### Task 7 — `PlatformAdapter` + десктопная реализация + мост Electron

**Файлы:**
- Создать: `src/platform/adapter.ts`, `src/platform/desktop.ts`, `src/platform/index.ts`
- Изменить: `shells/electron/main.ts`, `shells/electron/preload.ts`
- Изменить: `electron.vite.config.ts` (копировать `resources/content.db` в сборку)
- Тест: `tests/e2e/smoke.spec.ts`

**Интерфейсы:**
- Consumes: `resources/content.db` (задача 6)
- Produces:
  - интерфейс `PlatformAdapter` (подмножество из спеки, нужное этому плану):
    ```ts
    interface PlatformAdapter {
      readonly platform: 'desktop' | 'android';
      readBundledContentDb(): Promise<Uint8Array>;
    }
    ```
  - `getPlatformAdapter(): PlatformAdapter` из `src/platform/index.ts`
  - `window.jlmpBridge.readContentDb(): Promise<ArrayBuffer>` через preload

- [ ] **Шаг 1: интерфейс**

`src/platform/adapter.ts`:
```ts
export interface PlatformAdapter {
  readonly platform: 'desktop' | 'android';
  /** Байты поставляемого content.db. */
  readBundledContentDb(): Promise<Uint8Array>;
}
```

- [ ] **Шаг 2: типизация моста + десктопный адаптер**

`src/platform/desktop.ts`:
```ts
import type { PlatformAdapter } from './adapter';

declare global {
  interface Window {
    jlmpBridge?: {
      readContentDb(): Promise<ArrayBuffer>;
    };
  }
}

export function createDesktopAdapter(): PlatformAdapter {
  return {
    platform: 'desktop',
    async readBundledContentDb() {
      if (!window.jlmpBridge) throw new Error('jlmpBridge missing — preload not loaded');
      const buf = await window.jlmpBridge.readContentDb();
      return new Uint8Array(buf);
    },
  };
}
```

`src/platform/index.ts`:
```ts
import type { PlatformAdapter } from './adapter';
import { createDesktopAdapter } from './desktop';

let cached: PlatformAdapter | null = null;

export function getPlatformAdapter(): PlatformAdapter {
  if (cached) return cached;
  // Android-ветка добавляется в плане сборки (Capacitor). Пока только desktop.
  cached = createDesktopAdapter();
  return cached;
}

export type { PlatformAdapter };
```

- [ ] **Шаг 3: preload-мост**

`shells/electron/preload.ts`:
```ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('jlmpBridge', {
  readContentDb: (): Promise<ArrayBuffer> => ipcRenderer.invoke('content-db:read'),
});
```

- [ ] **Шаг 4: main — IPC-обработчик чтения content.db**

`shells/electron/main.ts` — добавить:
```ts
import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';

function contentDbPath(): string {
  // dev: resources/ в корне репо; prod: process.resourcesPath
  return app.isPackaged
    ? join(process.resourcesPath, 'content.db')
    : join(__dirname, '../../resources/content.db');
}

ipcMain.handle('content-db:read', async () => {
  const buf = await readFile(contentDbPath());
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
});
```
(Обработчик регистрировать до `createWindow`.)

- [ ] **Шаг 5: класть content.db в сборку**

`electron.vite.config.ts` — в секцию `main` добавить копирование через плагин `vite-plugin-static-copy` ИЛИ проще: в `electron-builder.yml` (задача 11) прописать `extraResources`. Для dev достаточно, что файл лежит в `resources/`. Здесь добавить только проверку в main (шаг 4 уже это делает). Отметить чекбокс без изменений кода, если `vite-plugin-static-copy` не ставим.

- [ ] **Шаг 6: e2e smoke через Playwright + Electron**

`tests/e2e/smoke.spec.ts`:
```ts
import { test, expect, _electron as electron } from '@playwright/test';

test('app boots and exposes content-db bridge', async () => {
  const app = await electron.launch({ args: ['out/main/main.js'] });
  const win = await app.firstWindow();
  await expect(win.getByTestId('app-title')).toBeVisible();

  const size = await win.evaluate(async () => {
    const buf = await window.jlmpBridge!.readContentDb();
    return buf.byteLength;
  });
  expect(size).toBeGreaterThan(1000);

  await app.close();
});
```

- [ ] **Шаг 7: собрать и прогнать e2e**

Run: `npm run build-content && npm run build && npx playwright test tests/e2e/smoke.spec.ts`
Expected: PASS. Если Playwright просит браузеры — `npx playwright install` (Chromium не нужен для Electron-режима, но CLI может потребовать; ставить только если ругается).

- [ ] **Шаг 8: коммит**

```bash
git add -A
git commit -m "feat: PlatformAdapter + desktop impl + electron content.db IPC bridge"
```

---

### Task 8 — `content-db.ts` — read-only запросы (рендерер)

**Файлы:**
- Создать: `src/storage/sqljs.ts`, `src/storage/content-db.ts`
- Создать: `public/sql-wasm.wasm` (копия из `node_modules/sql.js/dist/sql-wasm.wasm`)
- Тест: `tests/storage/content-db.test.ts`

**Интерфейсы:**
- Consumes: `PlatformAdapter.readBundledContentDb()`; типы из `@/core/types`
- Produces: класс `ContentDb` с методами:
  ```ts
  class ContentDb {
    static open(adapter: PlatformAdapter): Promise<ContentDb>;
    listLevels(): Level[];
    listGrammar(level: LevelCode): GrammarPoint[];      // без bodyMarkdown, для списка
    getGrammar(id: string): GrammarPointFull | null;    // с bodyMarkdown, examples, related
    searchGrammar(query: string): GrammarPoint[];        // по title, регистронезависимо
    grammarCountByLevel(level: LevelCode): number;
  }
  ```
  `GrammarPointFull = GrammarPoint & { relatedTitles: { id: string; title: string }[] }`

- [ ] **Шаг 1: падающий тест**

`tests/storage/content-db.test.ts`:
```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PlatformAdapter } from '@/platform/adapter';
import { ContentDb } from '@/storage/content-db';

// адаптер, читающий собранный resources/content.db с диска
const fakeAdapter: PlatformAdapter = {
  platform: 'desktop',
  async readBundledContentDb() {
    return new Uint8Array(readFileSync(resolve(__dirname, '../../resources/content.db')));
  },
};

describe('ContentDb', () => {
  let db: ContentDb;
  beforeAll(async () => {
    db = await ContentDb.open(fakeAdapter);
  });

  it('lists levels ordered by ord', () => {
    const levels = db.listLevels();
    expect(levels.map((l) => l.code)).toEqual(['N5', 'N4', 'N3', 'N2', 'N1']);
    expect(levels[2]!.status).toBe('coming_soon');
  });

  it('lists N5 grammar sorted by layer', () => {
    const g = db.listGrammar('N5');
    expect(g).toHaveLength(8);
    for (let i = 1; i < g.length; i++) expect(g[i]!.layer).toBeGreaterThanOrEqual(g[i - 1]!.layer);
  });

  it('gets a full grammar point with examples and resolved related titles', () => {
    const p = db.getGrammar('n5-wa-particle');
    expect(p).not.toBeNull();
    expect(p!.examples.length).toBeGreaterThanOrEqual(3);
    expect(p!.bodyMarkdown).toContain('## Кратко');
    expect(p!.relatedTitles.every((r) => r.title.length > 0)).toBe(true);
  });

  it('returns null for an unknown id', () => {
    expect(db.getGrammar('nope')).toBeNull();
  });

  it('searches grammar by title, case-insensitive', () => {
    expect(db.searchGrammar('вопрос').some((p) => p.id === 'n5-ka-question')).toBe(true);
    expect(db.searchGrammar('ВОПРОС').length).toBe(db.searchGrammar('вопрос').length);
  });

  it('counts grammar for a coming-soon level as zero', () => {
    expect(db.grammarCountByLevel('N3')).toBe(0);
  });
});
```

- [ ] **Шаг 2: убедиться, что падает**

Run: `npm run build-content && npx vitest run tests/storage/content-db.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Шаг 3: копия wasm в public/**

Run: `cp node_modules/sql.js/dist/sql-wasm.wasm public/sql-wasm.wasm`
(Файл коммитится — он нужен рендереру в рантайме и не должен зависеть от путей `node_modules` в проде.)

- [ ] **Шаг 4: инициализация sql.js**

`src/storage/sqljs.ts`:
```ts
import initSqlJs, { type SqlJsStatic } from 'sql.js';

let promise: Promise<SqlJsStatic> | null = null;

/**
 * Грузит sql.js. В браузере/Electron-рендерере wasm лежит в public/ и доступен
 * по относительному пути от base. В Node-тестах (environment: 'node') fetch wasm
 * не работает — там передаётся байтовый путь через VITEST-ветку.
 */
export function loadSqlJs(): Promise<SqlJsStatic> {
  if (promise) return promise;
  promise = initSqlJs({
    locateFile: (file) => {
      // vitest node-окружение
      if (typeof window === 'undefined') {
        return new URL(`../../node_modules/sql.js/dist/${file}`, import.meta.url).pathname;
      }
      return `sql-wasm.wasm`;
    },
  });
  return promise;
}
```

- [ ] **Шаг 5: ContentDb**

`src/storage/content-db.ts`:
```ts
import type { Database } from 'sql.js';
import type { PlatformAdapter } from '@/platform/adapter';
import type { GrammarExample, GrammarPoint, Level, LevelCode } from '@/core/types';
import { loadSqlJs } from './sqljs';

export type GrammarPointFull = GrammarPoint & {
  relatedTitles: { id: string; title: string }[];
};

export class ContentDb {
  private constructor(private readonly db: Database) {}

  static async open(adapter: PlatformAdapter): Promise<ContentDb> {
    const SQL = await loadSqlJs();
    const bytes = await adapter.readBundledContentDb();
    return new ContentDb(new SQL.Database(bytes));
  }

  private all<T>(sql: string, params: unknown[] = []): T[] {
    const stmt = this.db.prepare(sql);
    stmt.bind(params as never);
    const rows: T[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject() as T);
    stmt.free();
    return rows;
  }

  listLevels(): Level[] {
    return this.all<{ code: string; ord: number; status: string; title_ru: string }>(
      'SELECT code, ord, status, title_ru FROM levels ORDER BY ord',
    ).map((r) => ({
      code: r.code,
      ord: r.ord,
      status: r.status as Level['status'],
      titleRu: r.title_ru,
    }));
  }

  private rowToPoint(r: {
    id: string;
    level: string;
    title: string;
    layer: number;
    tags_json: string;
    body_markdown: string;
  }): GrammarPoint {
    return {
      id: r.id,
      level: r.level,
      title: r.title,
      layer: r.layer,
      tags: JSON.parse(r.tags_json) as string[],
      related: [],
      bodyMarkdown: r.body_markdown,
      examples: [],
    };
  }

  listGrammar(level: LevelCode): GrammarPoint[] {
    return this.all<Parameters<ContentDb['rowToPoint']>[0]>(
      'SELECT id, level, title, layer, tags_json, body_markdown FROM grammar_points WHERE level = ? ORDER BY layer, title',
      [level],
    ).map((r) => ({ ...this.rowToPoint(r), bodyMarkdown: '' }));
  }

  grammarCountByLevel(level: LevelCode): number {
    const r = this.all<{ n: number }>('SELECT count(*) AS n FROM grammar_points WHERE level = ?', [level]);
    return r[0]?.n ?? 0;
  }

  getGrammar(id: string): GrammarPointFull | null {
    const rows = this.all<Parameters<ContentDb['rowToPoint']>[0]>(
      'SELECT id, level, title, layer, tags_json, body_markdown FROM grammar_points WHERE id = ?',
      [id],
    );
    const row = rows[0];
    if (!row) return null;
    const point = this.rowToPoint(row);
    point.examples = this.all<GrammarExample & { ja_ruby: string }>(
      'SELECT ja_ruby, ru FROM grammar_examples WHERE grammar_id = ? ORDER BY ord',
      [id],
    ).map((e) => ({ jaRuby: (e as { ja_ruby: string }).ja_ruby, ru: e.ru }));
    const related = this.all<{ id: string; title: string }>(
      `SELECT p.id AS id, p.title AS title
       FROM grammar_relations r JOIN grammar_points p ON p.id = r.to_id
       WHERE r.from_id = ? ORDER BY p.layer, p.title`,
      [id],
    );
    point.related = related.map((r) => r.id);
    return { ...point, relatedTitles: related };
  }

  searchGrammar(query: string): GrammarPoint[] {
    const q = `%${query.trim().toLowerCase()}%`;
    return this.all<Parameters<ContentDb['rowToPoint']>[0]>(
      'SELECT id, level, title, layer, tags_json, body_markdown FROM grammar_points WHERE lower(title) LIKE ? ORDER BY level, layer',
      [q],
    ).map((r) => ({ ...this.rowToPoint(r), bodyMarkdown: '' }));
  }
}
```

- [ ] **Шаг 6: тесты зелёные**

Run: `npx vitest run tests/storage/content-db.test.ts`
Expected: PASS (7). Если `loadSqlJs` в node не находит wasm — проверить `node_modules/sql.js/dist/sql-wasm.wasm`, при необходимости заменить в `sqljs.ts` node-ветку на `require.resolve('sql.js/dist/sql-wasm.wasm')`.

- [ ] **Шаг 7: коммит**

```bash
git add -A
git commit -m "feat: sql.js loader + ContentDb read queries"
```

---

### Task 9 — Оболочка UI — роутер, адаптивная навигация, тема, Furigana

**Файлы:**
- Заменить: `src/ui/App.tsx`, `src/ui/theme.css`
- Создать: `src/ui/routes.tsx`, `src/ui/ContentDbProvider.tsx`, `src/ui/useContentDb.ts`
- Создать: `src/ui/components/Nav.tsx`, `src/ui/components/Furigana.tsx`, `src/ui/components/ThemeToggle.tsx`, `src/ui/components/LevelBadge.tsx`
- Создать: `src/ui/screens/PlaceholderScreen.tsx`
- Тест: `tests/ui/Furigana.test.tsx`, `tests/ui/Nav.test.tsx`

**Интерфейсы:**
- Consumes: `ContentDb` (задача 8), `parseRuby` (задача 3), `getPlatformAdapter` (задача 7)
- Produces:
  - `useContentDb(): ContentDb` (бросает, если не готов) и `useLevels(): Level[]`
  - `<Furigana text={string} />` — рендерит `<ruby>` из записи фуриганы
  - `<Nav />` — `<nav data-variant="sidebar">` при ширине ≥ 768px, `data-variant="bottom"` иначе
  - маршруты: `/` (Сегодня-заглушка), `/grammar`, `/grammar/:id`, `/kanji`, `/vocab`, `/progress`, `/settings`

- [ ] **Шаг 1: падающий тест Furigana**

`tests/ui/Furigana.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Furigana } from '@/ui/components/Furigana';

describe('Furigana', () => {
  it('renders ruby for kanji groups and plain text for kana', () => {
    const { container } = render(<Furigana text="私[わたし]は 学生[がくせい]です。" />);
    const rubies = container.querySelectorAll('ruby');
    expect(rubies).toHaveLength(2);
    expect(rubies[0]!.querySelector('rt')!.textContent).toBe('わたし');
    expect(container.textContent).toContain('です。');
  });

  it('hides furigana when showFurigana is false', () => {
    const { container } = render(<Furigana text="私[わたし]" showFurigana={false} />);
    expect(container.querySelector('rt')).toBeNull();
    expect(container.textContent).toBe('私');
  });
});
```

- [ ] **Шаг 2: убедиться, что падает**

Run: `npx vitest run tests/ui/Furigana.test.tsx`
Expected: FAIL.

- [ ] **Шаг 3: Furigana**

`src/ui/components/Furigana.tsx`:
```tsx
import { parseRuby } from '@/core/ruby';

export function Furigana({
  text,
  showFurigana = true,
}: {
  text: string;
  showFurigana?: boolean;
}) {
  const segs = parseRuby(text);
  return (
    <span className="furigana">
      {segs.map((s, i) => {
        if (s.ruby && showFurigana) {
          return (
            <ruby key={i}>
              {s.base}
              <rt>{s.ruby}</rt>
            </ruby>
          );
        }
        return <span key={i}>{s.base}</span>;
      })}
    </span>
  );
}
```

- [ ] **Шаг 4: тест Nav (адаптивность)**

`tests/ui/Nav.test.tsx`:
```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Nav } from '@/ui/components/Nav';

function setWidth(w: number) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: w });
  window.dispatchEvent(new Event('resize'));
}

describe('Nav', () => {
  beforeEach(() => setWidth(1200));

  it('is a sidebar on wide viewports', () => {
    const { container } = render(
      <MemoryRouter><Nav /></MemoryRouter>,
    );
    expect(container.querySelector('nav')!.getAttribute('data-variant')).toBe('sidebar');
  });

  it('is a bottom bar on narrow viewports', () => {
    setWidth(400);
    const { container } = render(
      <MemoryRouter><Nav /></MemoryRouter>,
    );
    expect(container.querySelector('nav')!.getAttribute('data-variant')).toBe('bottom');
  });

  it('lists the five primary destinations', () => {
    const { getByRole } = render(<MemoryRouter><Nav /></MemoryRouter>);
    for (const label of ['Сегодня', 'Грамматика', 'Кандзи', 'Слова', 'Прогресс']) {
      expect(getByRole('link', { name: new RegExp(label) })).toBeTruthy();
    }
  });
});
```

- [ ] **Шаг 5: Nav + хук ширины**

`src/ui/components/Nav.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';

const DESTINATIONS = [
  { to: '/', label: 'Сегодня', icon: '🗓' },
  { to: '/grammar', label: 'Грамматика', icon: '📘' },
  { to: '/kanji', label: 'Кандзи', icon: '㊗' },
  { to: '/vocab', label: 'Слова', icon: '📝' },
  { to: '/progress', label: 'Прогресс', icon: '📈' },
];

function useIsWide(breakpoint = 768): boolean {
  const [wide, setWide] = useState(() => window.innerWidth >= breakpoint);
  useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= breakpoint);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpoint]);
  return wide;
}

export function Nav() {
  const wide = useIsWide();
  return (
    <nav data-variant={wide ? 'sidebar' : 'bottom'} className="nav">
      {DESTINATIONS.map((d) => (
        <NavLink key={d.to} to={d.to} end={d.to === '/'} className="nav-link">
          <span className="nav-icon" aria-hidden>{d.icon}</span>
          <span className="nav-label">{d.label}</span>
        </NavLink>
      ))}
      <NavLink to="/settings" className="nav-link nav-link--settings">
        <span className="nav-icon" aria-hidden>⚙</span>
        <span className="nav-label">Настройки</span>
      </NavLink>
    </nav>
  );
}
```

- [ ] **Шаг 6: тема, провайдер, роутер, заглушка**

`src/ui/components/ThemeToggle.tsx`:
```tsx
import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem('jlmp.theme') as Theme) ?? 'system',
  );
  useEffect(() => {
    localStorage.setItem('jlmp.theme', theme);
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);
  const next: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };
  const label: Record<Theme, string> = { system: 'Тема: как в системе', light: 'Тема: светлая', dark: 'Тема: тёмная' };
  return (
    <button className="theme-toggle" onClick={() => setTheme(next[theme])}>
      {label[theme]}
    </button>
  );
}
```

`src/ui/components/LevelBadge.tsx`:
```tsx
import type { LevelCode } from '@/core/types';

export function LevelBadge({ level }: { level: LevelCode }) {
  return <span className="level-badge" data-level={level}>{level}</span>;
}
```

`src/ui/ContentDbProvider.tsx`:
```tsx
import { createContext, useEffect, useState, type ReactNode } from 'react';
import type { Level } from '@/core/types';
import { ContentDb } from '@/storage/content-db';
import { getPlatformAdapter } from '@/platform';

interface Ctx {
  db: ContentDb;
  levels: Level[];
}
export const ContentDbContext = createContext<Ctx | null>(null);

export function ContentDbProvider({ children }: { children: ReactNode }) {
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ContentDb.open(getPlatformAdapter())
      .then((db) => setCtx({ db, levels: db.listLevels() }))
      .catch((e) => setError(String(e)));
  }, []);

  if (error) return <div className="fatal">Не удалось загрузить учебную базу: {error}</div>;
  if (!ctx) return <div className="loading">Загрузка…</div>;
  return <ContentDbContext.Provider value={ctx}>{children}</ContentDbContext.Provider>;
}
```

`src/ui/useContentDb.ts`:
```ts
import { useContext } from 'react';
import { ContentDbContext } from './ContentDbProvider';

export function useContentDb() {
  const ctx = useContext(ContentDbContext);
  if (!ctx) throw new Error('useContentDb used outside ContentDbProvider');
  return ctx.db;
}

export function useLevels() {
  const ctx = useContext(ContentDbContext);
  if (!ctx) throw new Error('useLevels used outside ContentDbProvider');
  return ctx.levels;
}
```

`src/ui/screens/PlaceholderScreen.tsx`:
```tsx
export function PlaceholderScreen({ title }: { title: string }) {
  return (
    <section className="screen">
      <h1>{title}</h1>
      <p className="muted">Этот раздел появится в следующих версиях.</p>
    </section>
  );
}
```

`src/ui/routes.tsx`:
```tsx
import { PlaceholderScreen } from './screens/PlaceholderScreen';
import { GrammarListScreen } from './screens/GrammarListScreen';
import { GrammarDetailScreen } from './screens/GrammarDetailScreen';
import type { RouteObject } from 'react-router-dom';

export const routes: RouteObject[] = [
  { path: '/', element: <PlaceholderScreen title="Сегодня" /> },
  { path: '/grammar', element: <GrammarListScreen /> },
  { path: '/grammar/:id', element: <GrammarDetailScreen /> },
  { path: '/kanji', element: <PlaceholderScreen title="Кандзи" /> },
  { path: '/vocab', element: <PlaceholderScreen title="Слова" /> },
  { path: '/progress', element: <PlaceholderScreen title="Прогресс" /> },
  { path: '/settings', element: <PlaceholderScreen title="Настройки" /> },
];
```

`src/ui/App.tsx`:
```tsx
import { createHashRouter, RouterProvider, Outlet } from 'react-router-dom';
import { ContentDbProvider } from './ContentDbProvider';
import { Nav } from './components/Nav';
import { ThemeToggle } from './components/ThemeToggle';
import { routes } from './routes';

function Shell() {
  return (
    <ContentDbProvider>
      <div className="app-shell">
        <Nav />
        <main className="app-main">
          <header className="app-header">
            <span data-testid="app-title" className="app-brand">JLPT</span>
            <ThemeToggle />
          </header>
          <Outlet />
        </main>
      </div>
    </ContentDbProvider>
  );
}

const router = createHashRouter([{ element: <Shell />, children: routes }]);

export default function App() {
  return <RouterProvider router={router} />;
}
```

(`createHashRouter` — потому что Electron грузит `file://`, а на Android WebView тоже нет history-сервера.)

- [ ] **Шаг 7: theme.css**

`src/ui/theme.css`:
```css
:root {
  color-scheme: light dark;
  --bg: #faf8f4;
  --surface: #ffffff;
  --text: #1e1b16;
  --muted: #6b645a;
  --accent: #b4472e;
  --border: #e6e0d6;
  --ok: #2e7d32;
  --bad: #c62828;
  --font-ja: "Noto Sans JP", system-ui, sans-serif;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
}
:root[data-theme='dark'], :root:not([data-theme='light']) {
  /* применяется, только если пользователь не выбрал light */
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    --bg: #17150f; --surface: #211d16; --text: #ece5da;
    --muted: #9a9184; --accent: #e0805f; --border: #322c22;
  }
}
:root[data-theme='dark'] {
  --bg: #17150f; --surface: #211d16; --text: #ece5da;
  --muted: #9a9184; --accent: #e0805f; --border: #322c22;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); }
.app-shell { display: flex; min-height: 100vh; }
.nav[data-variant='sidebar'] {
  display: flex; flex-direction: column; gap: 4px; width: 220px;
  padding: 16px 8px; border-right: 1px solid var(--border); background: var(--surface);
}
.nav[data-variant='bottom'] {
  position: fixed; bottom: 0; left: 0; right: 0; display: flex; justify-content: space-around;
  padding: 6px env(safe-area-inset-right) calc(6px + env(safe-area-inset-bottom)) env(safe-area-inset-left);
  border-top: 1px solid var(--border); background: var(--surface); z-index: 10;
}
.nav-link { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 8px;
  color: var(--text); text-decoration: none; font-size: 14px; min-height: 44px; }
.nav-link.active { background: color-mix(in srgb, var(--accent) 15%, transparent); color: var(--accent); }
.nav[data-variant='bottom'] .nav-link { flex-direction: column; gap: 2px; font-size: 11px; padding: 4px 8px; }
.nav[data-variant='bottom'] .nav-link--settings { display: none; }
.app-main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.app-header { display: flex; align-items: center; justify-content: space-between;
  padding: 12px 20px; border-bottom: 1px solid var(--border); }
.app-brand { font-weight: 700; letter-spacing: 0.08em; }
.screen { padding: 20px; max-width: 780px; }
.muted, .loading, .fatal { color: var(--muted); }
.fatal { padding: 24px; color: var(--bad); }
.furigana { font-family: var(--font-ja); line-height: 2; }
.furigana ruby rt { font-size: 0.5em; color: var(--muted); }
.theme-toggle { background: transparent; border: 1px solid var(--border); color: var(--muted);
  padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 12px; }
.level-badge { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 12px;
  border: 1px solid var(--border); color: var(--muted); }
@media (max-width: 767px) { .app-shell { flex-direction: column; } .app-main { padding-bottom: 64px; } }
```

- [ ] **Шаг 8: тесты зелёные**

Run: `npx vitest run tests/ui/Furigana.test.tsx tests/ui/Nav.test.tsx`
Expected: PASS.

- [ ] **Шаг 9: коммит**

```bash
git add -A
git commit -m "feat: UI shell — hash router, adaptive Nav, theming, Furigana"
```

---

### Task 10 — Экраны грамматики (список + карточка)

**Файлы:**
- Создать: `src/ui/screens/GrammarListScreen.tsx`, `src/ui/screens/GrammarDetailScreen.tsx`
- Создать: `src/ui/components/GrammarMarkdown.tsx`
- Тест: `tests/ui/GrammarListScreen.test.tsx`, `tests/e2e/grammar-browse.spec.ts`

**Интерфейсы:**
- Consumes: `useContentDb`, `useLevels`, `Furigana`, `LevelBadge`
- Produces: рабочие экраны `/grammar` и `/grammar/:id`

- [ ] **Шаг 1: тест списка (с мок-контекстом)**

`tests/ui/GrammarListScreen.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ContentDbContext } from '@/ui/ContentDbProvider';
import { GrammarListScreen } from '@/ui/screens/GrammarListScreen';
import type { GrammarPoint, Level } from '@/core/types';

const levels: Level[] = [
  { code: 'N5', ord: 1, status: 'available', titleRu: 'N5' },
  { code: 'N4', ord: 2, status: 'available', titleRu: 'N4' },
  { code: 'N3', ord: 3, status: 'coming_soon', titleRu: 'N3' },
];
const n5: GrammarPoint[] = [
  { id: 'n5-wa-particle', level: 'N5', title: 'は (тема предложения)', layer: 1, tags: [], related: [], bodyMarkdown: '', examples: [] },
  { id: 'n5-mo-particle', level: 'N5', title: 'も (тоже)', layer: 2, tags: [], related: [], bodyMarkdown: '', examples: [] },
];
const fakeDb = {
  listLevels: () => levels,
  listGrammar: (l: string) => (l === 'N5' ? n5 : []),
  grammarCountByLevel: (l: string) => (l === 'N5' ? n5.length : 0),
  searchGrammar: (q: string) => n5.filter((p) => p.title.toLowerCase().includes(q.toLowerCase())),
} as unknown as import('@/storage/content-db').ContentDb;

function renderScreen() {
  return render(
    <ContentDbContext.Provider value={{ db: fakeDb, levels }}>
      <MemoryRouter><GrammarListScreen /></MemoryRouter>
    </ContentDbContext.Provider>,
  );
}

describe('GrammarListScreen', () => {
  it('shows N5 points by default, sorted by layer', () => {
    const { getAllByRole } = renderScreen();
    const links = getAllByRole('link').filter((a) => a.getAttribute('href')?.includes('/grammar/'));
    expect(links[0]!).toHaveTextContent('は (тема предложения)');
  });

  it('marks a coming-soon level as empty', () => {
    const { getByRole, getByText } = renderScreen();
    getByRole('tab', { name: /N3/ }).click();
    expect(getByText(/скоро/i)).toBeInTheDocument();
  });

  it('filters by search query', () => {
    const { getByRole, queryByText } = renderScreen();
    const input = getByRole('searchbox');
    input.focus();
    (input as HTMLInputElement).value = 'тоже';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(queryByText('は (тема предложения)')).toBeNull();
  });
});
```

- [ ] **Шаг 2: убедиться, что падает**

Run: `npx vitest run tests/ui/GrammarListScreen.test.tsx`
Expected: FAIL.

- [ ] **Шаг 3: список**

`src/ui/screens/GrammarListScreen.tsx`:
```tsx
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useContentDb, useLevels } from '../useContentDb';
import { LevelBadge } from '../components/LevelBadge';

export function GrammarListScreen() {
  const db = useContentDb();
  const levels = useLevels();
  const [activeLevel, setActiveLevel] = useState(levels[0]?.code ?? 'N5');
  const [query, setQuery] = useState('');

  const activeLevelObj = levels.find((l) => l.code === activeLevel);
  const points = useMemo(() => {
    if (query.trim()) return db.searchGrammar(query);
    return db.listGrammar(activeLevel);
  }, [db, activeLevel, query]);

  return (
    <section className="screen">
      <h1>Грамматика</h1>
      <div role="tablist" className="level-tabs">
        {levels.map((l) => (
          <button
            key={l.code}
            role="tab"
            aria-selected={l.code === activeLevel}
            className="level-tab"
            onClick={() => { setActiveLevel(l.code); setQuery(''); }}
          >
            {l.code}
          </button>
        ))}
      </div>
      <input
        type="search"
        role="searchbox"
        placeholder="Поиск по названию…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="grammar-search"
      />
      {!query && activeLevelObj?.status === 'coming_soon' ? (
        <p className="muted">Материал уровня {activeLevel} появится скоро.</p>
      ) : points.length === 0 ? (
        <p className="muted">Ничего не найдено.</p>
      ) : (
        <ul className="grammar-list">
          {points.map((p) => (
            <li key={p.id}>
              <Link to={`/grammar/${p.id}`} className="grammar-list-item">
                <span className="grammar-list-title">{p.title}</span>
                {query && <LevelBadge level={p.level} />}
                <span className="grammar-list-layer">слой {p.layer}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Шаг 4: рендер markdown тела**

`src/ui/components/GrammarMarkdown.tsx`:
```tsx
import { useMemo } from 'react';
import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({ html: false, linkify: false, breaks: false });

export function GrammarMarkdown({ source }: { source: string }) {
  // отрезаем секцию "## Примеры" и ниже — примеры рендерятся отдельным блоком с фуриганой
  const trimmed = useMemo(() => {
    const idx = source.indexOf('## Примеры');
    return idx === -1 ? source : source.slice(0, idx).trim();
  }, [source]);
  return <div className="grammar-md" dangerouslySetInnerHTML={{ __html: md.render(trimmed) }} />;
}
```

- [ ] **Шаг 5: карточка пункта**

`src/ui/screens/GrammarDetailScreen.tsx`:
```tsx
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useContentDb } from '../useContentDb';
import { Furigana } from '../components/Furigana';
import { GrammarMarkdown } from '../components/GrammarMarkdown';
import { LevelBadge } from '../components/LevelBadge';

export function GrammarDetailScreen() {
  const { id = '' } = useParams();
  const db = useContentDb();
  const point = useMemo(() => db.getGrammar(id), [db, id]);

  if (!point) {
    return (
      <section className="screen">
        <p className="muted">Пункт не найден.</p>
        <Link to="/grammar">← к списку</Link>
      </section>
    );
  }

  return (
    <section className="screen grammar-detail">
      <Link to="/grammar" className="back-link">← Грамматика</Link>
      <h1>
        {point.title} <LevelBadge level={point.level} />
      </h1>

      <GrammarMarkdown source={point.bodyMarkdown} />

      <h2>Примеры</h2>
      <ul className="examples">
        {point.examples.map((ex, i) => (
          <li key={i} className="example">
            <div className="example-ja"><Furigana text={ex.jaRuby} /></div>
            <div className="example-ru">{ex.ru}</div>
          </li>
        ))}
      </ul>

      {point.relatedTitles.length > 0 && (
        <>
          <h2>Связанные пункты</h2>
          <ul className="related">
            {point.relatedTitles.map((r) => (
              <li key={r.id}><Link to={`/grammar/${r.id}`}>{r.title}</Link></li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
```

- [ ] **Шаг 6: стили экранов — добавить в `theme.css`**

```css
.level-tabs { display: flex; gap: 6px; margin: 12px 0; }
.level-tab { border: 1px solid var(--border); background: var(--surface); color: var(--muted);
  padding: 6px 12px; border-radius: 6px; cursor: pointer; min-height: 36px; }
.level-tab[aria-selected='true'] { border-color: var(--accent); color: var(--accent); }
.grammar-search { width: 100%; padding: 10px 12px; border: 1px solid var(--border);
  border-radius: 8px; background: var(--surface); color: var(--text); margin-bottom: 16px; }
.grammar-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
.grammar-list-item { display: flex; align-items: center; gap: 10px; padding: 12px 14px;
  border: 1px solid var(--border); border-radius: 8px; background: var(--surface);
  color: var(--text); text-decoration: none; min-height: 44px; }
.grammar-list-item:hover { border-color: var(--accent); }
.grammar-list-title { flex: 1; font-weight: 500; }
.grammar-list-layer { color: var(--muted); font-size: 12px; }
.grammar-detail h1 { display: flex; align-items: center; gap: 10px; }
.back-link, .related a { color: var(--accent); text-decoration: none; }
.grammar-md { line-height: 1.7; }
.grammar-md h2 { font-size: 1.05rem; margin-top: 1.4em; }
.examples { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.example { border-left: 3px solid var(--border); padding-left: 12px; }
.example-ja { font-size: 1.2rem; }
.example-ru { color: var(--muted); margin-top: 2px; }
```

- [ ] **Шаг 7: e2e просмотра грамматики**

`tests/e2e/grammar-browse.spec.ts`:
```ts
import { test, expect, _electron as electron } from '@playwright/test';

test('browse grammar: list -> detail -> related', async () => {
  const app = await electron.launch({ args: ['out/main/main.js'] });
  const win = await app.firstWindow();

  await win.getByRole('link', { name: /Грамматика/ }).click();
  await expect(win.getByRole('heading', { name: 'Грамматика' })).toBeVisible();

  await win.getByRole('link', { name: /は \(тема предложения\)/ }).click();
  await expect(win.getByRole('heading', { name: /は \(тема предложения\)/ })).toBeVisible();
  await expect(win.locator('ruby').first()).toBeVisible();
  await expect(win.getByRole('heading', { name: 'Примеры' })).toBeVisible();

  await win.getByRole('link', { name: /か \(вопросительная частица\)/ }).click();
  await expect(win.getByRole('heading', { name: /か \(вопросительная частица\)/ })).toBeVisible();

  await app.close();
});

test('mobile width shows bottom nav', async () => {
  const app = await electron.launch({ args: ['out/main/main.js'] });
  const win = await app.firstWindow();
  await win.setViewportSize({ width: 400, height: 800 });
  await expect(win.locator('nav[data-variant="bottom"]')).toBeVisible();
  await app.close();
});
```

- [ ] **Шаг 8: собрать и прогнать всё**

Run: `npm run build-content && npm run build && npm test && npx playwright test`
Expected: все Vitest PASS; оба e2e-файла PASS.

- [ ] **Шаг 9: коммит**

```bash
git add -A
git commit -m "feat: grammar reference screens (list + detail) with furigana"
```

---

### Task 11 — Упаковка десктопа (electron-builder) + чек-лист

**Файлы:**
- Создать: `electron-builder.yml`
- Изменить: `package.json` (поле `build` не нужно — конфиг в yml; проверить скрипты)
- Создать: `docs/RELEASE-CHECKLIST.md`

**Интерфейсы:**
- Consumes: `out/**` от `electron-vite build`, `resources/content.db`
- Produces: `npm run build:desktop` → распакованная сборка в `release/win-unpacked/`; `npm run build:desktop:installer` → NSIS `.exe`

- [ ] **Шаг 1: electron-builder.yml**

```yaml
appId: com.jlmp.app
productName: JLPT
directories:
  output: release
  buildResources: build
files:
  - out/**/*
  - package.json
extraResources:
  - from: resources/content.db
    to: content.db
win:
  target:
    - target: nsis
      arch: [x64]
nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
  shortcutName: JLPT
```

- [ ] **Шаг 2: сборка распакованной версии (быстро, без установщика)**

Run: `npm run build-content && npm run build:desktop`
Expected: `release/win-unpacked/JLPT.exe` существует. Запустить вручную — приложение открывается, грамматика на месте (значит `extraResources` сработал: main читает `process.resourcesPath/content.db`).

- [ ] **Шаг 3: проверить prod-путь к content.db**

Открыть `release/win-unpacked/JLPT.exe`, перейти в Грамматика → открыть пункт. Если пусто/ошибка — в `shells/electron/main.ts` проверить `app.isPackaged` ветку (`join(process.resourcesPath, 'content.db')`).

- [ ] **Шаг 4: собрать установщик**

Run: `npm run build:desktop:installer`
Expected: `release/JLPT Setup 0.1.0.exe`. Тест-установка на своей машине: ставится, ярлык создан, запускается, при удалении — удаляется.

- [ ] **Шаг 5: RELEASE-CHECKLIST.md**

```markdown
# Чек-лист релиза (ручной)

## Сборка
- [ ] `npm ci`
- [ ] `npm run build-content` — content.db пересобран
- [ ] `npm test` — зелёно
- [ ] `npm run test:e2e` — зелёно
- [ ] `npm run build:desktop:installer` — установщик собран

## Дымовой тест (Windows)
- [ ] Установщик ставится, каталог выбирается
- [ ] Ярлык в меню Пуск и на рабочем столе
- [ ] Приложение открывается, тема переключается
- [ ] Грамматика: список N5 (8 пунктов), карточка, фуригана, связанные пункты
- [ ] Узкое окно (< 768px) → нижняя навигация
- [ ] Переустановка поверх — открывается (данных пользователя пока нет)
- [ ] Удаление — приложение и ярлыки убираются

## Известные ограничения версии
- Только справочник грамматики N5 (8 пунктов). Кандзи/слова/прогресс — заглушки.
```

- [ ] **Шаг 6: коммит**

```bash
git add -A
git commit -m "build: electron-builder config + desktop packaging + release checklist"
```

---

## Самопроверка плана

**1. Покрытие спеки (для рамок плана 1):**

| Требование спеки | Задача |
|---|---|
| Единый веб-код, платформенная логика за `PlatformAdapter` | 7 |
| Electron-оболочка ПК, `electron-vite` | 1, 7 |
| `sql.js` (WASM), без нативных модулей | 8 |
| content.db — read-only, поставляется, `meta` версия | 6, 7 |
| Контент-пайплайн из курируемого Markdown, тесты пайплайна | 5, 6 |
| Формат пункта грамматики (секции, ≥3 примера, related) | 4, 5 |
| Уровень = данные (`levels`), не код | 2, 6, 8, 9 |
| Адаптивная навигация (боковая / нижняя) | 9 |
| Светлая/тёмная тема, фуригана вкл/выкл | 9 |
| Экран «Грамматика»: список по уровням, поиск, статус | 10 |
| Карточка пункта: объяснение, примеры, связанные | 10 |
| Установщик NSIS Windows x64 | 11 |
| TDD, Vitest + Playwright | все |

Вне рамок плана 1 (последующие планы, не пробелы): кандзи/слова/тексты, SRS/`user.db`, прогресс, сессии, вступительный тест, Android/Capacitor, TTS, сеть.

**2. Плейсхолдеры:** нет «TBD»/«позже»/«добавить обработку ошибок» без кода. Сид-контент грамматики (задача 4) описан форматом-эталоном + таблицей id/related — исполнитель пишет прозу пунктов; это контент-работа, не код-плейсхолдер, границы заданы жёстко (8 файлов, точные id, тест целостности в задаче 5).

**3. Согласованность типов:**
- `LevelCode = string`, `Level {code, ord, status, titleRu}` — задачи 2, 5, 8, 9 совпадают.
- `GrammarPoint` из `@/core/types` — поля неизменны; `listGrammar` возвращает его с пустым `bodyMarkdown`, `getGrammar` — `GrammarPointFull` с `relatedTitles`. Тесты задач 8/10 это учитывают.
- `PlatformAdapter` в плане 1 — подмножество (`platform`, `readBundledContentDb`); полный интерфейс из спеки расширяется в следующих планах, существующие сигнатуры не меняются.
- Мост: `window.jlmpBridge.readContentDb(): Promise<ArrayBuffer>` — одинаково в `preload.ts`, `desktop.ts`, тестах задачи 7.
- Команды npm (`build-content`, `build`, `build:desktop`, `test`, `test:e2e`) — определены в задаче 1, используются далее без переименований.

**4. Неоднозначности:** запись фуриганы зафиксирована в задаче 3 (`漢字[かんじ]`), формат примера — строка `дефис-пробел…​ — …` (тире с пробелами) в задачах 4–5, парсер и рендер согласованы.
