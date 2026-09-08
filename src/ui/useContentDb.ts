import { useContext } from 'react';
import { ContentDbContext } from './ContentDbProvider';
import { useUserDb } from './useUserDb';
import { effectiveLevelStatus, type EffectiveLevelStatus } from '@/core/levels';

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

export interface EffectiveLevel {
  code: string;
  ord: number;
  titleRu: string;
  /** The learner-facing status: `coming_soon` (not built), `locked` (gated), `available`. */
  status: EffectiveLevelStatus;
  /** The stored content-readiness flag, before the unlock rule is applied. */
  rawStatus: 'available' | 'coming_soon';
}

/**
 * The content levels annotated with their effective (learner-facing) status,
 * which folds in the level-unlock rule from `@/core/levels`.
 */
export function useEffectiveLevels(): EffectiveLevel[] {
  const ctx = useContext(ContentDbContext);
  if (!ctx) throw new Error('useEffectiveLevels used outside ContentDbProvider');
  const user = useUserDb();
  const now = new Date();
  return ctx.levels.map((l) => ({
    code: l.code,
    ord: l.ord,
    titleRu: l.titleRu,
    rawStatus: l.status,
    status: effectiveLevelStatus(user, ctx.db, l.code, now),
  }));
}
