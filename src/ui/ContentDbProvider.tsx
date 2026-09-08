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
  return (
    <ContentDbContext.Provider value={ctx}>
      <span data-testid="db-ready" hidden />
      {children}
    </ContentDbContext.Provider>
  );
}
