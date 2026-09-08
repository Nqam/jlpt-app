import type { ContentDb } from '@/storage/content-db';
import type { UserDb } from '@/storage/user-db';
import { levelCompletion } from '@/core/progress';

export type EffectiveLevelStatus = 'available' | 'locked' | 'coming_soon';

/** Average "consolidated" fraction over N5's three categories needed to open the next level. */
export const UNLOCK_THRESHOLD = 0.9;

/**
 * A level's status as the learner experiences it. `content.db`'s stored status is
 * only a content-readiness flag (`available` = shipped, `coming_soon` = not built).
 * A shipped level past the first one stays `locked` until the previous level is
 * `>= UNLOCK_THRESHOLD` complete or the user unlocked it by hand.
 * `now` is currently unused (card recency already lives inside `statusOf`) but is
 * kept for signature parity with the rest of core.
 */
export function effectiveLevelStatus(
  user: UserDb, content: ContentDb, levelCode: string, now: Date,
): EffectiveLevelStatus {
  void now;
  const levels = content.listLevels();
  const lvl = levels.find((l) => l.code === levelCode);
  if (!lvl) return 'coming_soon';
  if (lvl.status === 'coming_soon') return 'coming_soon';

  const lowestOrd = Math.min(...levels.map((l) => l.ord));
  if (lvl.ord === lowestOrd) return 'available';

  if (user.getSetting<string[]>('unlocked_levels', []).includes(levelCode)) return 'available';

  const prev = levels
    .filter((l) => l.ord < lvl.ord)
    .sort((a, b) => b.ord - a.ord)[0];
  if (prev && levelCompletion(user, content, prev.code) >= UNLOCK_THRESHOLD) return 'available';

  return 'locked';
}

export function availableLevelCodes(user: UserDb, content: ContentDb, now: Date): Set<string> {
  const out = new Set<string>();
  for (const l of content.listLevels()) {
    if (effectiveLevelStatus(user, content, l.code, now) === 'available') out.add(l.code);
  }
  return out;
}

export function unlockLevel(user: UserDb, levelCode: string): void {
  const cur = user.getSetting<string[]>('unlocked_levels', []);
  if (cur.includes(levelCode)) return;
  user.setSetting('unlocked_levels', [...cur, levelCode]);
}
