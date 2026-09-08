import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import { join } from 'node:path';
import { readFile, writeFile, rename, mkdir, rm, readdir, unlink } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { isSafeExternalUrl } from './safe-url';
import { backupFileName, backupsToPrune } from '../../src/core/backup';

// isDev — про транспорт рендерера (dev-сервер vs собранный index.html);
// app.isPackaged — про пути к ресурсам (корень репо vs process.resourcesPath).
// Это намеренно независимые флаги: `electron-vite build` без упаковки даёт
// !isDev && !isPackaged, и оба пути должны работать.
const isDev = !!process.env['ELECTRON_RENDERER_URL'];

// Имя приложения сменилось на «Kotsukotsu», но `%APPDATA%/JLPT/` уже хранит
// user.db существующих пользователей. Пиним каталог данных под старым именем,
// чтобы прогресс пережил переименование. `--user-data-dir` (e2e) не трогаем.
if (!process.argv.some((a) => a.startsWith('--user-data-dir'))) {
  app.setPath('userData', join(app.getPath('appData'), 'JLPT'));
}

/** Путь к поставляемому `content.db`: dev — `resources/` в корне репо, prod — `process.resourcesPath`. */
function contentDbPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'content.db')
    : join(__dirname, '../../resources/content.db');
}

ipcMain.handle('content-db:read', async (): Promise<ArrayBuffer> => {
  const buf = await readFile(contentDbPath());
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
});

/**
 * Путь к wasm-модулю sql.js: prod — рядом с приложением в `process.resourcesPath`
 * (кладётся через `extraResources`, задача 11), dev — из установленного пакета.
 */
function sqlWasmPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'sql-wasm.wasm')
    : createRequire(import.meta.url).resolve('sql.js/dist/sql-wasm.wasm');
}

ipcMain.handle('sql-wasm:read', async (): Promise<ArrayBuffer> => {
  const buf = await readFile(sqlWasmPath());
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
});

/** Путь к приватному `user.db` в каталоге данных приложения (`userData`). */
function userDbPath(): string {
  return join(app.getPath('userData'), 'user.db');
}

ipcMain.handle('user-db:read', async (): Promise<ArrayBuffer | null> => {
  try {
    const buf = await readFile(userDbPath());
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
});

ipcMain.handle('user-db:write', async (_evt, bytes: ArrayBuffer): Promise<void> => {
  const dir = app.getPath('userData');
  await mkdir(dir, { recursive: true });
  const target = userDbPath();
  const tmp = `${target}.tmp-${randomUUID()}`;
  try {
    await writeFile(tmp, Buffer.from(bytes));
    await rename(tmp, target); // atomic on same filesystem
  } finally {
    // Clean up a leftover temp file on write/rename failure. After a successful
    // rename this is a harmless no-op (the file is already gone).
    await rm(tmp, { force: true }).catch(() => {});
  }
});

ipcMain.handle('user-db:export', async (evt, bytes: ArrayBuffer): Promise<boolean> => {
  const win = BrowserWindow.fromWebContents(evt.sender);
  const options = {
    title: 'Экспорт резервной копии',
    defaultPath: `kotsukotsu-backup-${new Date().toISOString().slice(0, 10)}.db`,
    filters: [{ name: 'Kotsukotsu backup', extensions: ['db'] }],
  };
  const { canceled, filePath } = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
  if (canceled || !filePath) return false;
  await writeFile(filePath, Buffer.from(bytes));
  return true;
});

ipcMain.handle('user-db:import', async (evt): Promise<ArrayBuffer | null> => {
  const win = BrowserWindow.fromWebContents(evt.sender);
  const options: Electron.OpenDialogOptions = {
    title: 'Импорт резервной копии',
    filters: [{ name: 'Kotsukotsu backup', extensions: ['db'] }],
    properties: ['openFile'],
  };
  const { canceled, filePaths } = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
  if (canceled || filePaths.length === 0) return null;
  const buf = await readFile(filePaths[0]!);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
});

/** Каталог еженедельных авто-бэкапов `user.db`. */
function backupsDir(): string {
  return join(app.getPath('userData'), 'backups');
}

/**
 * Записать копию `user.db` за сегодня и удалить самые старые, оставив `keep`.
 * Любая ошибка ввода-вывода проглатывается — авто-бэкап не должен ломать старт.
 */
ipcMain.handle('user-db:auto-backup', async (_evt, bytes: ArrayBuffer, keep: number): Promise<void> => {
  try {
    const dir = backupsDir();
    await mkdir(dir, { recursive: true });
    const target = join(dir, backupFileName(new Date()));
    const tmp = `${target}.tmp-${randomUUID()}`;
    try {
      await writeFile(tmp, Buffer.from(bytes));
      await rename(tmp, target);
    } finally {
      await rm(tmp, { force: true }).catch(() => {});
    }
    const names = await readdir(dir);
    for (const name of backupsToPrune(names, keep)) {
      await unlink(join(dir, name)).catch(() => {});
    }
  } catch (e) {
    console.error('auto-backup failed:', e);
  }
});

/** Открыть внешний URL в браузере — только https на github.com (см. safe-url.ts). */
ipcMain.handle('shell:open-external', async (_evt, url: string): Promise<void> => {
  if (isSafeExternalUrl(url)) await shell.openExternal(url);
});

/**
 * Последний релиз на GitHub. `null` при любой ошибке (нет сети, не-200,
 * репозиторий без релизов). Запрос с таймаутом, без токена — публичный API.
 */
ipcMain.handle(
  'updates:check',
  async (_evt, repo: string): Promise<{ latest: string; url: string } | null> => {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return null;
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
        headers: { 'User-Agent': 'JLPT-app', Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { tag_name?: string; html_url?: string };
      if (!body.tag_name || !body.html_url) return null;
      return { latest: body.tag_name, url: body.html_url };
    } catch {
      return null;
    }
  },
);

// Флаг «прогресс уже сброшен на диск» — общий для обоих путей выхода (кнопка X /
// Alt+F4 через событие `close` окна, и macOS Cmd+Q через `before-quit`). Как
// только один путь завершил сброс, другой становится no-op — без взаимных
// блокировок. Сбрасывается в `createWindow`, чтобы повторное открытие окна
// (macOS `activate`) снова сохраняло прогресс при закрытии.
let dbFlushed = false;

/**
 * Просит рендерер записать `user.db` и вызывает `done()` по подтверждению
 * (`app:flush-user-db:done`) либо по таймауту 1.5 с. Вызывается из `close`
 * окна (рендерер ещё жив) — там, где дебаунс-таймер ещё не успел сработать.
 */
function flushUserDb(win: BrowserWindow, done: () => void): void {
  if (dbFlushed || win.isDestroyed()) {
    done();
    return;
  }
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    dbFlushed = true;
    ipcMain.removeListener('app:flush-user-db:done', finish);
    done();
  };
  ipcMain.once('app:flush-user-db:done', finish);
  win.webContents.send('app:flush-user-db');
  setTimeout(finish, 1500); // не зависаем на выходе
}

function wireFlushOnClose(win: BrowserWindow): void {
  win.on('close', (evt) => {
    if (dbFlushed) return;
    evt.preventDefault();
    flushUserDb(win, () => {
      if (!win.isDestroyed()) win.close();
    });
  });
}

/**
 * Content-Security-Policy для собранного рендерера (`file://`). В dev не
 * ставится: Vite-HMR использует inline-скрипты и ws-соединение, строгая
 * политика их ломает, а поверхность атаки в dev неинтересна.
 *   script-src 'wasm-unsafe-eval' — sql.js компилирует WASM из байтов.
 *   style-src 'unsafe-inline'     — inline-стили React-компонентов
 *                                   (сузить — отдельная задача).
 * Сеть рендереру не нужна вообще (обновления проверяет main-процесс), поэтому
 * connect-src ограничен 'self'.
 */
const CSP =
  "default-src 'self'; " +
  "script-src 'self' 'wasm-unsafe-eval'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; " +
  "font-src 'self'; " +
  "connect-src 'self'; " +
  "base-uri 'none'; " +
  "form-action 'none'";

/** Внешняя навигация: новые окна не открываем, безопасные ссылки — в браузер. */
function lockNavigation(win: BrowserWindow, homeUrl: string): void {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (evt, url) => {
    // hash-роутинг (`#/...`) не поднимает will-navigate — перехватываем только
    // реальный уход со страницы приложения.
    if (url !== homeUrl && !url.startsWith(`${homeUrl}#`)) evt.preventDefault();
  });
}

async function createWindow(): Promise<void> {
  dbFlushed = false;
  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (!isDev) {
    win.webContents.session.webRequest.onHeadersReceived((details, cb) => {
      cb({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [CSP],
        },
      });
    });
  }

  wireFlushOnClose(win);
  win.on('ready-to-show', () => win.show());
  if (isDev) {
    const url = process.env['ELECTRON_RENDERER_URL']!;
    lockNavigation(win, url);
    await win.loadURL(url);
  } else {
    const file = join(__dirname, '../renderer/index.html');
    lockNavigation(win, `file://${file.replace(/\\/g, '/')}`);
    await win.loadFile(file);
  }
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// macOS Cmd+Q завершает приложение, не закрывая окно через `close` первым —
// сбрасываем прогресс и здесь. На Windows/Linux к моменту `before-quit` окно уже
// уничтожено (`close` отработал), поэтому этот обработчик просто пропускает.
app.on('before-quit', (evt) => {
  if (dbFlushed) return;
  const win = BrowserWindow.getAllWindows()[0];
  if (!win || win.isDestroyed()) return;
  evt.preventDefault();
  flushUserDb(win, () => app.quit());
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
