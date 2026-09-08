import type { PlatformAdapter } from './adapter';
import { GITHUB_REPO } from '@/config';

declare global {
  interface Window {
    jlmpBridge?: {
      readContentDb(): Promise<ArrayBuffer>;
      readSqlWasm(): Promise<ArrayBuffer>;
      readUserDb(): Promise<ArrayBuffer | null>;
      writeUserDb(bytes: ArrayBuffer): Promise<void>;
      exportUserDb(bytes: ArrayBuffer): Promise<boolean>;
      importUserDb(): Promise<ArrayBuffer | null>;
      checkForUpdate(repo: string): Promise<{ latest: string; url: string } | null>;
      openExternal(url: string): Promise<void>;
      autoBackupUserDb(bytes: ArrayBuffer, keep: number): Promise<void>;
      onFlushUserDb?(cb: () => Promise<void> | void): void;
    };
  }
}

function bridge(): NonNullable<Window['jlmpBridge']> {
  if (!window.jlmpBridge) {
    throw new Error('jlmpBridge missing — preload not loaded');
  }
  return window.jlmpBridge;
}

/** Плоский ArrayBuffer-срез (structuredClone-safe для IPC). */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

/** Десктопный адаптер: тянет байты через preload-мост Electron. */
export function createDesktopAdapter(): PlatformAdapter {
  return {
    platform: 'desktop',
    async readBundledContentDb(): Promise<Uint8Array> {
      return new Uint8Array(await bridge().readContentDb());
    },
    async readSqlWasm(): Promise<Uint8Array> {
      return new Uint8Array(await bridge().readSqlWasm());
    },
    async readUserDb(): Promise<Uint8Array | null> {
      const buf = await bridge().readUserDb();
      return buf ? new Uint8Array(buf) : null;
    },
    async writeUserDb(bytes: Uint8Array): Promise<void> {
      await bridge().writeUserDb(toArrayBuffer(bytes));
    },
    async exportUserDb(bytes: Uint8Array): Promise<boolean> {
      return bridge().exportUserDb(toArrayBuffer(bytes));
    },
    async importUserDb(): Promise<Uint8Array | null> {
      const buf = await bridge().importUserDb();
      return buf ? new Uint8Array(buf) : null;
    },
    async checkForUpdate(): Promise<{ latest: string; url: string } | null> {
      if (!GITHUB_REPO) return null;
      return bridge().checkForUpdate(GITHUB_REPO);
    },
    async openExternal(url: string): Promise<void> {
      await bridge().openExternal(url);
    },
    async autoBackupUserDb(bytes: Uint8Array, keep: number): Promise<void> {
      await bridge().autoBackupUserDb(toArrayBuffer(bytes), keep);
    },
  };
}
