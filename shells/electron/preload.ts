import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('jlmpBridge', {
  readContentDb: (): Promise<ArrayBuffer> => ipcRenderer.invoke('content-db:read'),
  readSqlWasm: (): Promise<ArrayBuffer> => ipcRenderer.invoke('sql-wasm:read'),
  readUserDb: (): Promise<ArrayBuffer | null> => ipcRenderer.invoke('user-db:read'),
  writeUserDb: (bytes: ArrayBuffer): Promise<void> => ipcRenderer.invoke('user-db:write', bytes),
  exportUserDb: (bytes: ArrayBuffer): Promise<boolean> => ipcRenderer.invoke('user-db:export', bytes),
  importUserDb: (): Promise<ArrayBuffer | null> => ipcRenderer.invoke('user-db:import'),
  checkForUpdate: (repo: string): Promise<{ latest: string; url: string } | null> =>
    ipcRenderer.invoke('updates:check', repo),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:open-external', url),
  autoBackupUserDb: (bytes: ArrayBuffer, keep: number): Promise<void> =>
    ipcRenderer.invoke('user-db:auto-backup', bytes, keep),
  onFlushUserDb: (cb: () => Promise<void> | void): void => {
    ipcRenderer.on('app:flush-user-db', async () => {
      await cb();
      ipcRenderer.send('app:flush-user-db:done');
    });
  },
});
