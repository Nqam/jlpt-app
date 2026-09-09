import { describe, it, expect } from 'vitest';
import { buildGrammarReinforce } from '@/core/quiz/grammar-reinforce';
import type { GrammarPointFull } from '@/storage/content-db';

const point: GrammarPointFull = {
  id: 'n5-x', level: 'N5', title: 'X', layer: 1, tags: [], related: [], relatedTitles: [],
  kanjiIds: [],
  bodyMarkdown: '## Кратко\n\nテスト。\n\n## Образование\n\nA + B\n\n## Примеры\n\n## Частые ошибки\n\nn/a',
  examples: [
    { jaRuby: '学校[がっこう]で 勉強[べんきょう]します。', ru: 'Учусь в школе.' },
    { jaRuby: '公園[こうえん]で 遊[あそ]びます。', ru: 'Играю в парке.' },
    { jaRuby: '電車[でんしゃ]で 行[い]きます。', ru: 'Еду на поезде.' },
  ],
};

describe('buildGrammarReinforce', () => {
  it('produces up to `count` questions for a point with usable examples', () => {
    const qs = buildGrammarReinforce(point, [point], 's', 3);
    expect(qs.length).toBeGreaterThan(0);
    expect(qs.length).toBeLessThanOrEqual(3);
    // deterministic for a fixed seed
    expect(buildGrammarReinforce(point, [point], 's', 3).map((q) => q.id))
      .toEqual(qs.map((q) => q.id));
  });

  it('returns [] for a point whose generators cannot produce anything', () => {
    // no examples (cloze/assemble fail) and no "## Кратко" section (choice fails)
    const empty = { ...point, examples: [], bodyMarkdown: '' };
    expect(buildGrammarReinforce(empty, [empty], 's', 3)).toEqual([]);
  });
});
