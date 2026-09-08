/**
 * Шов между платформенно-независимым кодом (`src/**`) и конкретной оболочкой
 * (Electron / Android). Это ПОДМНОЖЕСТВО полного интерфейса из спеки — ровно то,
 * что нужно плану 1 (bootstrap контента).
 */
export interface PlatformAdapter {
  readonly platform: 'desktop' | 'android';
  /** Байты поставляемого вместе с приложением `content.db`. */
  readBundledContentDb(): Promise<Uint8Array>;
  /** Сырые байты WebAssembly-модуля sql.js (через `file://` fetch недоступен). */
  readSqlWasm(): Promise<Uint8Array>;
  /** Байты `user.db` из приватного хранилища приложения. `null` — файла ещё нет. */
  readUserDb(): Promise<Uint8Array | null>;
  /** Атомарно записать `user.db`. */
  writeUserDb(bytes: Uint8Array): Promise<void>;
  /** Диалог "Сохранить как", пишет байты по выбранному пользователем пути. `false`, если отменено. */
  exportUserDb(bytes: Uint8Array): Promise<boolean>;
  /** Диалог "Открыть", читает выбранный пользователем файл. `null`, если отменено. */
  importUserDb(): Promise<Uint8Array | null>;
  /**
   * Проверка новой версии на GitHub. `null` — сеть недоступна, релизов нет
   * или репозиторий ещё не настроен (`GITHUB_REPO` пуст).
   */
  checkForUpdate(): Promise<{ latest: string; url: string } | null>;
  /** Открыть URL во внешнем браузере. Реализация обязана проверить безопасность URL. */
  openExternal(url: string): Promise<void>;
  /**
   * Авто-бэкап `user.db`: записать копию за текущий день, оставить `keep`
   * самых свежих. Ошибки ввода-вывода глотает — бэкап не должен ломать старт.
   */
  autoBackupUserDb(bytes: Uint8Array, keep: number): Promise<void>;
}
