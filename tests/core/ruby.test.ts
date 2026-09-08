import { describe, it, expect } from 'vitest';
import { parseRuby, stringifyRuby } from '@/core/ruby';

describe('parseRuby', () => {
  it('splits a kanji group with reading', () => {
    expect(parseRuby('学生[がくせい]')).toEqual([{ base: '学生', ruby: 'がくせい' }]);
  });

  it('keeps kana outside brackets as plain segments', () => {
    expect(parseRuby('私[わたし]は')).toEqual([
      { base: '私', ruby: 'わたし' },
      { base: 'は', ruby: null },
    ]);
  });

  it('handles a full sentence with spaces', () => {
    expect(parseRuby('私[わたし]は 学生[がくせい]です。')).toEqual([
      { base: '私', ruby: 'わたし' },
      { base: 'は', ruby: null },
      { base: ' ', ruby: null },
      { base: '学生', ruby: 'がくせい' },
      { base: 'です。', ruby: null },
    ]);
  });

  it('returns a single plain segment when there are no brackets', () => {
    expect(parseRuby('これはペンです')).toEqual([{ base: 'これはペンです', ruby: null }]);
  });

  it('throws on an unclosed bracket', () => {
    expect(() => parseRuby('学生[がくせい')).toThrow();
  });

  it('does not stretch the reading over a leading kana prefix', () => {
    expect(parseRuby('お茶[ちゃ]')).toEqual([
      { base: 'お', ruby: null },
      { base: '茶', ruby: 'ちゃ' },
    ]);
  });

  it('flushes leading kana then kanji-with-reading inside one space-delimited run', () => {
    expect(parseRuby('これはお茶[ちゃ]です')).toEqual([
      { base: 'これはお', ruby: null },
      { base: '茶', ruby: 'ちゃ' },
      { base: 'です', ruby: null },
    ]);
  });
});

describe('stringifyRuby', () => {
  it('is the inverse of parseRuby for a typical sentence', () => {
    const src = '私[わたし]は 学生[がくせい]です。';
    expect(stringifyRuby(parseRuby(src))).toBe(src);
  });

  it('round-trips a sentence with kana before a kanji run', () => {
    const src = 'お茶[ちゃ]を 飲[の]みます。';
    expect(stringifyRuby(parseRuby(src))).toBe(src);
  });

  it('emits plain segments untouched', () => {
    expect(stringifyRuby([{ base: 'これは', ruby: null }, { base: '本', ruby: 'ほん' }]))
      .toBe('これは本[ほん]');
  });
});
