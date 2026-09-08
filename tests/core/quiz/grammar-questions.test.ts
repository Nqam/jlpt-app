import { describe, it, expect } from 'vitest';
import { genCloze, genChoice, genAssemble, coreCandidates, sectionBody, firstSentence }
  from '@/core/quiz/grammar-questions';
import { parseRuby, stringifyRuby } from '@/core/ruby';
import type { GrammarPointFull } from '@/storage/content-db';

function point(over: Partial<GrammarPointFull> = {}): GrammarPointFull {
  return {
    id: 'n5-wa', level: 'N5', title: 'は (тема предложения)', layer: 1, tags: [], related: [],
    relatedTitles: [],
    bodyMarkdown: '## Кратко\nЧастица は отмечает тему предложения — то, о чём идёт речь.\n\n## Образование\n[X] は',
    examples: [
      { jaRuby: '私[わたし]は 学生[がくせい]です。', ru: 'Я студент.' },
      { jaRuby: 'これは 本[ほん]です。', ru: 'Это книга.' },
    ],
    ...over,
  };
}

const others: GrammarPointFull[] = [
  point({ id: 'n5-wo', title: 'を (прямое дополнение)', bodyMarkdown: '## Кратко\nЧастица を отмечает прямой объект действия.', examples: [{ jaRuby: 'водуを 飲[の]みます。', ru: '' }] }),
  point({ id: 'n5-ni', title: 'に (время и место)', bodyMarkdown: '## Кратко\nЧастица に указывает точку во времени или место существования.', examples: [] }),
  point({ id: 'n5-mo', title: 'も (тоже)', bodyMarkdown: '## Кратко\nЧастица も значит «тоже, также».', examples: [] }),
];

describe('coreCandidates', () => {
  it('splits alternatives and strips tildes', () => {
    expect(coreCandidates('です／だ (связка)')).toEqual(['です', 'だ']);
    expect(coreCandidates('〜ます (вежливая форма глагола)')).toEqual(['ます']);
    expect(coreCandidates('は (тема предложения)')).toEqual(['は']);
  });

  it('keeps only the Japanese run from a title with Latin/Cyrillic words', () => {
    expect(coreCandidates('Основа глагола + たいです (хочу сделать…)')).toContain('たいです');
  });

  it('adds polite / voiced conjugation variants so cloze can match real examples', () => {
    const c = coreCandidates('〜ている (делаю сейчас / состояние)');
    expect(c).toContain('ている');
    expect(c).toContain('ています'); // 開いています
    expect(c).toContain('でいます'); // 読んでいます
    const m = coreCandidates('まだ〜ていません (ещё не сделал)');
    expect(m).toContain('ていません');
    expect(m).toContain('でいません');
  });

  it('produces a cloze (not the weak "what does X express" fallback) for a ている-style point', () => {
    const point: GrammarPointFull = {
      id: 'n5-teiru', level: 'N5', title: '〜ている (делаю сейчас / состояние)',
      layer: 4, tags: [], related: [], relatedTitles: [],
      bodyMarkdown: '## Кратко\nТе-форма + いる.',
      examples: [
        { jaRuby: '私[わたし]は 本[ほん]を 読[よ]んでいます。', ru: 'Я читаю книгу.' },
        { jaRuby: 'ドアが 開[ひら]いています。', ru: 'Дверь открыта.' },
      ],
    };
    const q = genCloze(point, [point], 'seed');
    expect(q).not.toBeNull();
    expect(q!.kind).toBe('cloze');
    expect((q as { sentenceRuby: string }).sentenceRuby).toContain('___');
  });
});

describe('sectionBody / firstSentence', () => {
  it('extracts the Кратко section', () => {
    expect(sectionBody(point().bodyMarkdown, 'Кратко')).toMatch(/^Частица は отмечает тему/);
    expect(sectionBody('## Образование\nX', 'Кратко')).toBeNull();
  });
  it('truncates on a word boundary with an ellipsis', () => {
    expect(firstSentence('a'.repeat(200), 20)).toHaveLength(21); // 20 chars + …
    expect(firstSentence('короткая строка', 80)).toBe('короткая строка');
  });
});

describe('genCloze', () => {
  it('blanks the construction core and offers 4 choices with one correct', () => {
    const q = genCloze(point(), others, 'n5-wa:2026-09-04:cloze')!;
    expect(q).not.toBeNull();
    expect(q.kind).toBe('cloze');
    if (q.kind !== 'cloze') throw new Error('expected cloze');
    expect(q.sentenceRuby).toContain('___');
    expect(q.choices).toHaveLength(4);
    expect(q.choices[q.answerIndex]).toBe('は');
    // the blank replaced a real token from a real example
    expect(q.sentenceRuby.replace('___', 'は')).toBe(
      stringifyRuby(parseRuby('私[わたし]は 学生[がくせい]です。')),
    );
  });

  it('is deterministic for a seed', () => {
    expect(genCloze(point(), others, 's')).toEqual(genCloze(point(), others, 's'));
  });

  it('returns null when the title core appears in no example', () => {
    const p = point({ title: 'ぜんぜん (совсем не)', examples: [{ jaRuby: '本[ほん]です。', ru: '' }] });
    expect(genCloze(p, others, 's')).toBeNull();
  });
});

describe('genChoice', () => {
  it('correct answer is from this point Кратко, distractors from others', () => {
    const q = genChoice(point(), others, 's')!;
    expect(q.kind).toBe('choice');
    if (q.kind !== 'choice') throw new Error('expected choice');
    expect(q.choices).toHaveLength(4);
    expect(q.choices[q.answerIndex]).toMatch(/отмечает тему/);
    const distractors = q.choices.filter((_, i) => i !== q.answerIndex);
    distractors.forEach((d) => expect(d === '—' || /を|に|も/.test(d)).toBe(true));
  });

  it('returns null without a Кратко section', () => {
    expect(genChoice(point({ bodyMarkdown: '## Образование\nX' }), others, 's')).toBeNull();
  });
});

describe('genAssemble', () => {
  const p4 = point({
    examples: [{ jaRuby: '私[わたし]は 毎日[まいにち] 日本語[にほんご]を 勉強[べんきょう]します。', ru: 'Я каждый день учу японский.' }],
  });

  it('scrambles tokens and answerOrder rebuilds the sentence', () => {
    const q = genAssemble(p4, others, 's')!;
    expect(q.kind).toBe('assemble');
    if (q.kind !== 'assemble') throw new Error('expected assemble');
    expect(q.tokens).toHaveLength(4);
    expect([...q.tokens].sort()).toEqual(
      ['私[わたし]は', '毎日[まいにち]', '日本語[にほんご]を', '勉強[べんきょう]します。'].sort(),
    );
    expect(q.answerOrder.map((i) => q.tokens[i]).join(' ')).toBe(
      '私[わたし]は 毎日[まいにち] 日本語[にほんご]を 勉強[べんきょう]します。',
    );
    expect(q.translationRu).toBe('Я каждый день учу японский.');
  });

  it('returns null when no example has >= 4 tokens', () => {
    expect(genAssemble(point(), others, 's')).toBeNull();
  });

  it('is deterministic', () => {
    expect(genAssemble(p4, others, 's')).toEqual(genAssemble(p4, others, 's'));
  });
});
