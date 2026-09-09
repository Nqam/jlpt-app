import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { UserDb } from '@/storage/user-db';
import { getPlatformAdapter } from '@/platform';
import { maybeAutoBackup } from '@/ui/auto-backup';
import { backfillUnlockedFromProgress } from '@/core/levels';
import { migratePlacementMarks } from '@/core/placement';
import { migrateCourseKeys } from '@/core/course';
import { ContentDbContext } from './ContentDbProvider';

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
  // ContentDbProvider renders this component only once its own db is ready, so
  // the content db is available here for the one-time grandfather backfill.
  const contentCtx = useContext(ContentDbContext);
  const contentRef = useRef(contentCtx?.db ?? null);
  contentRef.current = contentCtx?.db ?? null;

  useEffect(() => {
    let cancelled = false;
    UserDb.open(getPlatformAdapter(), APP_VERSION, new Date())
      .then((db) => {
        if (cancelled) return;
        // Разовая доводка: пользователи, у которых уже есть прогресс по уровню,
        // закрывшемуся правилом 90%, сохраняют доступ к нему. Идемпотентно.
        if (contentRef.current) backfillUnlockedFromProgress(db, contentRef.current);
        // Одноразовая миграция grammar-only ключа теста в per-type. Идемпотентна.
        migratePlacementMarks(db);
        if (contentRef.current) migrateCourseKeys(db, contentRef.current);
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
