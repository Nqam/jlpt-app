import { describe, it, expect, vi } from 'vitest';
import { maybeAutoBackup } from '@/ui/auto-backup';
import type { UserDb } from '@/storage/user-db';
import type { PlatformAdapter } from '@/platform';

const bytes = new Uint8Array([1, 2, 3]);

function fakeDb(lastBackup: string | null) {
  const setSetting = vi.fn();
  const db = {
    getSetting: (key: string, fallback: unknown) =>
      key === 'last_auto_backup' ? (lastBackup ?? fallback) : fallback,
    setSetting,
    export: () => bytes,
  } as unknown as UserDb;
  return { db, setSetting };
}

function fakeAdapter(impl?: () => Promise<void>) {
  const autoBackupUserDb = vi.fn(impl ?? (async () => {}));
  return { adapter: { autoBackupUserDb } as unknown as PlatformAdapter, autoBackupUserDb };
}

const NOW = new Date('2026-09-08T12:00:00Z');

describe('maybeAutoBackup', () => {
  it('does nothing when a backup was made less than a week ago', async () => {
    const { db, setSetting } = fakeDb('2026-09-05T12:00:00Z');
    const { adapter, autoBackupUserDb } = fakeAdapter();
    await maybeAutoBackup(db, adapter, NOW);
    expect(autoBackupUserDb).not.toHaveBeenCalled();
    expect(setSetting).not.toHaveBeenCalled();
  });

  it('backs up and records the timestamp when due (no prior backup)', async () => {
    const { db, setSetting } = fakeDb(null);
    const { adapter, autoBackupUserDb } = fakeAdapter();
    await maybeAutoBackup(db, adapter, NOW);
    expect(autoBackupUserDb).toHaveBeenCalledWith(bytes, 4);
    expect(setSetting).toHaveBeenCalledWith('last_auto_backup', NOW.toISOString());
  });

  it('does not record a timestamp if the adapter throws, and does not rethrow', async () => {
    const { db, setSetting } = fakeDb(null);
    const { adapter } = fakeAdapter(async () => {
      throw new Error('io');
    });
    await expect(maybeAutoBackup(db, adapter, NOW)).resolves.toBeUndefined();
    expect(setSetting).not.toHaveBeenCalled();
  });
});
