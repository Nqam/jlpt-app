import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { parseGrammarFile, loadAllGrammar, validateGrammar } from '../../scripts/build-content/parse-grammar';
import type { GrammarPoint } from '../../src/core/types';

const fix = (n: string) => resolve(__dirname, '../fixtures', n);
const grammarDir = resolve(__dirname, '../../content/grammar');

describe('parseGrammarFile', () => {
  it('parses frontmatter and examples', () => {
    const p = parseGrammarFile(fix('grammar-valid.md'));
    expect(p.id).toBe('fix-valid');
    expect(p.level).toBe('N5');
    expect(p.examples.length).toBeGreaterThanOrEqual(3);
    expect(p.examples[0]!.jaRuby).toMatch(/\S/);
    expect(p.examples[0]!.ru).toMatch(/\S/);
    expect(p.bodyMarkdown).toContain('## Кратко');
  });

  it('throws when a required section is missing', () => {
    expect(() => parseGrammarFile(fix('grammar-missing-section.md'))).toThrow(/Примеры/);
  });
});

describe('curated N5 layer', () => {
  const points = loadAllGrammar(grammarDir);

  it('loads all 43 N5 points', () => {
    expect(points.filter((p) => p.level === 'N5')).toHaveLength(43);
  });

  it('loads all 50 N4 points', () => {
    expect(points.filter((p) => p.level === 'N4')).toHaveLength(50);
  });

  it('passes validation (related ids resolve, >=3 examples, sections present)', () => {
    expect(validateGrammar(points)).toEqual([]);
  });
});

describe('validateGrammar ruby-base rule', () => {
  const base = (examples: { jaRuby: string; ru: string }[]): GrammarPoint => ({
    id: 'fix-ruby',
    level: 'N5',
    title: 't',
    layer: 1,
    tags: [],
    related: [],
    bodyMarkdown: '',
    examples,
  });

  it('rejects an example whose ruby base contains kana', () => {
    const errors = validateGrammar([
      base([
        { jaRuby: 'おちゃ[ちゃ]です', ru: 'чай' },
        { jaRuby: 'これは 本[ほん]です', ru: 'книга' },
        { jaRuby: 'それも 本[ほん]です', ru: 'тоже книга' },
      ]),
    ]);
    expect(errors.some((e) => /ruby base .* contains kana/.test(e))).toBe(true);
  });

  it('accepts a correctly authored kana-prefix example', () => {
    const errors = validateGrammar([
      base([
        { jaRuby: 'お茶[ちゃ]を 飲[の]みます', ru: 'пью чай' },
        { jaRuby: 'これは 本[ほん]です', ru: 'книга' },
        { jaRuby: 'それも 本[ほん]です', ru: 'тоже книга' },
      ]),
    ]);
    expect(errors).toEqual([]);
  });
});
