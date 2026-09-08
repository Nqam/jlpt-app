import type { UserDb } from '@/storage/user-db';
import type { PlatformAdapter } from '@/platform';
import { backupDue } from '@/core/backup';

const KEEP = 4;

/**
 * Раз в неделю просит платформу сохранить копию `user.db`. Вызывается при
 * старте, вне критического пути рендера. Сам по себе не бросает: адаптер
 * глотает ошибки ввода-вывода, а отметку времени ставим только после
 * успешного возврата из адаптера.
 */
export async function maybeAutoBackup(
  db: UserDb,
  adapter: PlatformAdapter,
  now: Date,
): Promise<void> {
  const last = db.getSetting<string | null>('last_auto_backup', null);
  if (!backupDue(last, now)) return;
  try {
    await adapter.autoBackupUserDb(db.export(), KEEP);
    db.setSetting('last_auto_backup', now.toISOString());
  } catch {
    // адаптер уже глушит I/O-ошибки; сюда попадём только на неожиданном сбое —
    // не мешаем старту, повторим при следующем запуске.
  }
}
