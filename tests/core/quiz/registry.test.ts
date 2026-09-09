import { describe, it, expect } from 'vitest';
import { ROTATION, generateForCard, generateOfKind } from '@/core/quiz/registry';
import type { GrammarPointFull } from '@/storage/content-db';

function point(over: Partial<GrammarPointFull> = {}): GrammarPointFull {
  return {
    id: 'n5-wa', level: 'N5', title: 'は (тема)', layer: 1, tags: [], related: [], relatedTitles: [], kanjiIds: [],
    bodyMarkdown: '## Кратко\nЧастица は отмечает тему предложения.',
    examples: [
      { jaRuby: '私[わたし]は 毎日[まいにち] 日本語[にほんご]を 勉強[べんきょう]します。', ru: 'Я учу японский.' },
      { jaRuby: 'これは 本[ほん]です。', ru: 'Это книга.' },
    ],
    ...over,
  };
}
const others = [point({ id: 'n5-wo', title: 'を (объект)' }), point({ id: 'n5-ni', title: 'に (место)' })];

describe('core/quiz/registry', () => {
  it('ROTATION is cloze, choice, assemble', () => {
    expect([...ROTATION]).toEqual(['cloze', 'choice', 'assemble']);
  });

  it('generateForCard rotates kind by reps % 3', () => {
    expect(generateForCard(point(), others, 0, 'd').kind).toBe('cloze');
    expect(generateForCard(point(), others, 1, 'd').kind).toBe('choice');
    expect(generateForCard(point(), others, 2, 'd').kind).toBe('assemble');
    expect(generateForCard(point(), others, 3, 'd').kind).toBe('cloze');
  });

  it('falls back when the rotated kind cannot generate', () => {
    // no examples >= 4 tokens and no example holds the core -> assemble & cloze fail,
    // reps % 3 == 2 asks for assemble, must fall through to choice
    const bare = point({
      examples: [{ jaRuby: '本[ほん]です。', ru: '' }],
      title: 'ぜんぜん (совсем)',
    });
    expect(generateForCard(bare, others, 2, 'd').kind).toBe('choice');
  });

  it('generateForCard id encodes point, day and kind', () => {
    const q = generateForCard(point(), others, 1, '2026-09-04');
    expect(q.id).toBe('n5-wa:2026-09-04:choice');
  });

  it('generateOfKind honours the requested kind and seeds the id', () => {
    const q = generateOfKind('choice', point(), others, 'n5-wa:mt:2');
    expect(q.kind).toBe('choice');
    expect(q.id).toBe('n5-wa:mt:2');
  });

  it('generateOfKind falls back but keeps a deterministic id', () => {
    const bare = point({ examples: [{ jaRuby: '本[ほん]です。', ru: '' }], title: 'ぜんぜん (совсем)' });
    const q = generateOfKind('assemble', bare, others, 'n5-wa:mt:0');
    expect(q.kind).toBe('choice');
    expect(q.id).toBe('n5-wa:mt:0:fb:choice');
  });
});
