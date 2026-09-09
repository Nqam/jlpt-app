import { parseRuby } from '../../src/core/ruby';

/** CJK ideograph range (kanji). Excludes 々/〻 repeat marks — not real kanji ids. */
const KANJI = /[㐀-鿿]/u;

/**
 * Every JLPT kanji id that appears in a grammar point's example sentences,
 * in first-appearance order, deduped. "Appears" = a bare ideograph in the
 * ruby-stripped text whose `${levelcode}-${char}` resolves in `kanjiIdSet`
 * for one of `levelCodes`.
 */
export function extractGrammarKanji(
  examples: { jaRuby: string }[],
  kanjiIdSet: ReadonlySet<string>,
  levelCodes: readonly string[],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const ex of examples) {
    // Drop the reading groups: parseRuby gives us the base text without "[...]".
    const bare = parseRuby(ex.jaRuby).map((s) => s.base).join('');
    for (const ch of bare) {
      if (!KANJI.test(ch)) continue;
      for (const code of levelCodes) {
        const id = `${code.toLowerCase()}-${ch}`;
        if (kanjiIdSet.has(id) && !seen.has(id)) {
          seen.add(id);
          out.push(id);
        }
      }
    }
  }
  return out;
}
