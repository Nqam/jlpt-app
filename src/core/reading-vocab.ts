import { parseRuby } from '@/core/ruby';
import type { VocabPoint } from '@/core/types';

/**
 * Vocab whose headword appears verbatim in a lesson/text body (ruby stripped
 * first, same technique as the course's build-time auto-kanji extraction).
 * There is no Japanese segmentation in this project, so this is a
 * best-effort substring match — a real, accepted tradeoff here, not a bug.
 * Sorted longest-headword-first so a more specific match (e.g. 学校) is
 * listed ahead of a shorter one that happens to be its substring.
 */
export function wordsInText(bodyRuby: string, pool: readonly VocabPoint[]): VocabPoint[] {
  const bare = parseRuby(bodyRuby).map((s) => s.base).join('');
  const seen = new Set<string>();
  const out: VocabPoint[] = [];
  for (const v of [...pool].sort((a, b) => b.headword.length - a.headword.length)) {
    if (seen.has(v.id) || !v.headword || !bare.includes(v.headword)) continue;
    seen.add(v.id);
    out.push(v);
  }
  return out;
}
