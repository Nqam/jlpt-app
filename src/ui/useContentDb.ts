import { useContext } from 'react';
import { ContentDbContext } from './ContentDbProvider';

export function useContentDb() {
  const ctx = useContext(ContentDbContext);
  if (!ctx) throw new Error('useContentDb used outside ContentDbProvider');
  return ctx.db;
}

export function useLevels() {
  const ctx = useContext(ContentDbContext);
  if (!ctx) throw new Error('useLevels used outside ContentDbProvider');
  return ctx.levels;
}
