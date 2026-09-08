import type { GrammarPointFull, ContentDb } from '@/storage/content-db';

/** All grammar points of a level, fully loaded. */
export function levelPointsFor(
  content: Pick<ContentDb, 'listGrammar' | 'getGrammar'>,
  level: string,
): GrammarPointFull[] {
  return content
    .listGrammar(level)
    .map((g) => content.getGrammar(g.id))
    .filter((p): p is GrammarPointFull => p !== null);
}
