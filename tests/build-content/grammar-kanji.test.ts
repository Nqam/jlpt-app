import { describe, it, expect } from 'vitest';
import { extractGrammarKanji } from '../../scripts/build-content/grammar-kanji';

describe('extractGrammarKanji', () => {
  const kanjiIds = new Set(['n5-学', 'n5-校', 'n5-行', 'n4-薬']);
  const levels = ['N5', 'N4'];

  it('collects resolvable JLPT kanji from example furigana, first-appearance order, deduped', () => {
    const examples = [
      { jaRuby: '学校[がっこう]で 勉強[べんきょう]します。' }, // 学 校 勉 強 — 勉/強 not in set
      { jaRuby: '学校[がっこう]へ 行[い]きます。' },            // 学 校 again, + 行
    ];
    expect(extractGrammarKanji(examples, kanjiIds, levels)).toEqual(['n5-学', 'n5-校', 'n5-行']);
  });

  it('ignores kana, punctuation, and ideographs with no matching id', () => {
    const examples = [{ jaRuby: 'これは 薬[くすり]です、ね。' }];
    expect(extractGrammarKanji(examples, kanjiIds, levels)).toEqual(['n4-薬']);
  });

  it('returns [] when there are no examples', () => {
    expect(extractGrammarKanji([], kanjiIds, levels)).toEqual([]);
  });

  it('emits only the first level id when a char resolves under two level codes', () => {
    const bothLevels = new Set(['n5-日', 'n4-日']);
    const examples = [{ jaRuby: '日[ひ]' }];
    expect(extractGrammarKanji(examples, bothLevels, ['N5', 'N4'])).toEqual(['n5-日']);
  });
});
