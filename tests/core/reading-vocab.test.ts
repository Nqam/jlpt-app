import { describe, it, expect } from 'vitest';
import { wordsInText } from '@/core/reading-vocab';
import type { VocabPoint } from '@/core/types';

const gakkou: VocabPoint = {
  id: 'n5-学校-がっこう', level: 'N5', headword: '学校', reading: 'がっこう', pos: 'сущ.', meaningRu: 'школа',
};
const gaku: VocabPoint = {
  id: 'n5-学', level: 'N5', headword: '学', reading: 'がく', pos: 'сущ.', meaningRu: 'учёба',
};
const ame: VocabPoint = {
  id: 'n5-雨-あめ', level: 'N5', headword: '雨', reading: 'あめ', pos: 'сущ.', meaningRu: 'дождь',
};
const pool = [gakkou, gaku, ame];

describe('wordsInText', () => {
  it('finds a headword appearing verbatim in the ruby-stripped body', () => {
    const words = wordsInText('私[わたし]は 学校[がっこう]へ 行[い]きます。', pool);
    expect(words.map((w) => w.id)).toContain('n5-学校-がっこう');
    expect(words.map((w) => w.id)).not.toContain('n5-雨-あめ');
  });

  it('lists a longer overlapping match before its substring', () => {
    const words = wordsInText('学校[がっこう]です。', pool);
    // both 学校 and 学 match the same text -- 学校 (more specific) first
    expect(words.map((w) => w.id)).toEqual(['n5-学校-がっこう', 'n5-学']);
  });

  it('dedupes a headword that appears more than once', () => {
    const words = wordsInText('学校[がっこう]と 学校[がっこう]。', pool);
    expect(words.filter((w) => w.id === 'n5-学校-がっこう')).toHaveLength(1);
  });

  it('returns [] when nothing in the pool matches', () => {
    expect(wordsInText('私[わたし]は 元気[げんき]です。', [ame])).toEqual([]);
  });

  it('is insensitive to the furigana readings themselves, only the base text', () => {
    // a headword that only matches inside a *reading*, never the base, must not match
    const readingOnly: VocabPoint = { ...ame, headword: 'あめ' };
    expect(wordsInText('雨[あめ]です。', [readingOnly])).toEqual([]);
  });
});
