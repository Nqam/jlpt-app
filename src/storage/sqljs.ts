import initSqlJs, { type SqlJsStatic } from 'sql.js';

let promise: Promise<SqlJsStatic> | null = null;

/**
 * Грузит sql.js, передавая ему байты wasm-модуля напрямую (`wasmBinary`).
 *
 * sql.js по умолчанию тянет `.wasm` через `fetch`/XHR по `locateFile`, что не
 * работает в упакованном Electron-рендерере (origin `file://`). Поэтому байты
 * приходят от вызывающего кода через `PlatformAdapter` (IPC на десктопе, чтение
 * с диска в тестах). Инициализация кешируется — sql.js создаётся один раз.
 */
export function loadSqlJs(wasmBinary: Uint8Array): Promise<SqlJsStatic> {
  if (promise) return promise;
  // emscripten принимает и ArrayBuffer, и typed array; типы sql.js знают только
  // про ArrayBuffer, поэтому точечный каст.
  promise = initSqlJs({ wasmBinary: wasmBinary as unknown as ArrayBuffer });
  return promise;
}
