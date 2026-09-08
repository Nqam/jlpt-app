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

/**
 * Разовая доводка для пользователей, у которых уже есть прогресс по уровню,
 * закрывшемуся правилом 90% в этой версии: любой уровень, где есть хотя бы одна
 * карточка, добавляется в `unlocked_levels`. Идемпотентна. Вызывать один раз
 * при старте (нужен `content`, чтобы сопоставить карточку с уровнем).
 */
export function backfillUnlockedFromProgress(user: UserDb, content: ContentDb): void {
  const codeOf = new Map<string, string>();
  for (const lvl of content.listLevels()) {
    for (const g of content.listGrammar(lvl.code)) codeOf.set(g.id, lvl.code);
    for (const k of content.listKanji(lvl.code)) codeOf.set(k.id, lvl.code);
    for (const v of content.listVocab(lvl.code)) codeOf.set(v.id, lvl.code);
  }
  const lowestOrd = Math.min(...content.listLevels().map((l) => l.ord));
  const lowestCode = content.listLevels().find((l) => l.ord === lowestOrd)?.code;
  const withCards = new Set<string>();
  for (const type of ['grammar', 'kanji', 'vocab'] as const) {
    for (const c of user.allCards(type)) {
      const code = codeOf.get(c.item_id);
      if (code && code !== lowestCode) withCards.add(code);
    }
  }
  for (const code of withCards) unlockLevel(user, code);
}
