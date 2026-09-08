import { createContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { UserDb } from '@/storage/user-db';
import { getPlatformAdapter } from '@/platform';
import { maybeAutoBackup } from '@/ui/auto-backup';

const APP_VERSION =
  (import.meta.env.VITE_APP_VERSION as string | undefined) ?? '0.0.0';

interface Ctx {
  db: UserDb;
}
export const UserDbContext = createContext<Ctx | null>(null);

export function UserDbProvider({ children }: { children: ReactNode }) {
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [error, setError] = useState<string | null>(null);
  const flushWired = useRef(false);

  useEffect(() => {
    let cancelled = false;
    UserDb.open(getPlatformAdapter(), APP_VERSION, new Date())
      .then((db) => {
        if (cancelled) return;
        setCtx({ db });
        // Еженедельный авто-бэкап — побочный эффект вне критического пути рендера.
        void maybeAutoBackup(db, getPlatformAdapter(), new Date());
        if (!flushWired.current) {
          flushWired.current = true;
          // The callback must never reject: a rejecting handler means
          // `app:flush-user-db:done` is never sent and quit waits out the
          // 1.5s timeout. Swallow any flush error.
          window.jlmpBridge?.onFlushUserDb?.(() => db.flush().catch(() => {}));
        }
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="fatal">
        Не удалось открыть базу прогресса ({error}). Файл: user.db в папке данных
        приложения — удаление сбросит прогресс.
      </div>
    );
  }
  if (!ctx) return <div className="loading">Загрузка…</div>;
  return (
    <UserDbContext.Provider value={ctx}>
      <span data-testid="user-db-ready" hidden />
      {children}
    </UserDbContext.Provider>
  );
}
