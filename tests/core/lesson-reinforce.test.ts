import { describe, it, expect } from 'vitest';
import type { LessonFull } from '@/core/types';
import { buildReinforceQuestions, type ReinforceContent } from '@/core/quiz/lesson-reinforce';

const GRAMMAR = {
  'g-teiru': {
    id: 'g-teiru', level: 'N5', title: '〜ている (сейчас/состояние)', layer: 3,
    tags: [], related: [], relatedTitles: [],
    bodyMarkdown: '## Кратко\nДействие сейчас или результат-состояние.\n\n## Образование\nて + いる\n\n## Нюансы\nx\n\n## Примеры\n- x\n\n## Частые ошибки\ny',
    examples: [],
  },
};
const VOCAB = {
  'v-asa': { id: 'v-asa', level: 'N5', headword: '朝', reading: 'あさ', pos: 'сущ.', meaningRu: 'утро' },
  'v-hayai': { id: 'v-hayai', level: 'N5', headword: '早い', reading: 'はやい', pos: 'прил.', meaningRu: 'ранний' },
};
const KANJI = {
  'k-asa': { id: 'k-asa', level: 'N5', char: '朝', onyomi: ['チョウ'], kunyomi: ['あさ'], meaningRu: 'утро', strokeCount: 12 },
};

const content: ReinforceContent = {
  getGrammar: (id: string) => (GRAMMAR as Record<string, unknown>)[id] as never ?? null,
  getVocab: (id: string) => (VOCAB as Record<string, unknown>)[id] as never ?? null,
  getKanji: (id: string) => (KANJI as Record<string, unknown>)[id] as never ?? null,
  listGrammar: () => Object.values(GRAMMAR) as never,
  listVocab: () => Object.values(VOCAB) as never,
  listKanji: () => Object.values(KANJI) as never,
};

const lesson = (over: Partial<LessonFull> = {}): LessonFull => ({
  id: 'l1', stage: 3, kind: 'text', title: 'T', introducesCount: 3, isFreeReading: false,
  bodyRuby: 'x', translationRu: 'y', questions: [],
  introduces: [
    { type: 'grammar', id: 'g-teiru', role: 'introduce' },
    { type: 'vocab', id: 'v-asa', role: 'introduce' },
    { type: 'kanji', id: 'k-asa', role: 'introduce' },
  ],
  markers: [
    {
      type: 'grammar', id: 'g-teiru',
      surface: '起[お]きています',
      sentenceRuby: '毎朝[まいあさ] 六時[ろくじ]に 起[お]きています。',
      sentenceRu: 'Каждое утро встаю в шесть.',
    },
    {
      type: 'vocab', id: 'v-asa', surface: '朝[あさ]',
      sentenceRuby: '朝[あさ]は 早[はや]いです。', sentenceRu: 'Утром рано.',
    },
  ],
  ...over,
});

describe('buildReinforceQuestions', () => {
  it('produces at most 3 questions in introduces order, one per introduce that yields something', () => {
    const items = buildReinforceQuestions(lesson(), content, 'seed');
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items.length).toBeLessThanOrEqual(3);
    expect(items[0]!.question.itemType).toBe('grammar');
    expect(items[0]!.question.itemId).toBe('g-teiru');
  });

  it('the grammar question is built from the marker sentence (cloze/assemble/choice), not a blank one', () => {
    const items = buildReinforceQuestions(lesson(), content, 'seed');
    const g = items.find((i) => i.question.itemType === 'grammar')!;
    expect(['cloze', 'assemble', 'choice']).toContain(g.question.kind);
    if (g.question.kind === 'cloze') {
      expect(g.question.sentenceRuby).toContain('___');
      // the cloze sentence descends from the marker context, not a template
      expect(g.question.translationRu).toBe('Каждое утро встаю в шесть.');
    }
    expect(g.contextRu).toBe('Каждое утро встаю в шесть.');
  });

  it('a grammar introduce with no usable marker still yields a choice question from its Кратко', () => {
    const items = buildReinforceQuestions(
      lesson({ markers: [], introduces: [{ type: 'grammar', id: 'g-teiru', role: 'introduce' }] }),
      content, 'seed',
    );
    // genCloze/genAssemble need examples; synthetic point has none -> genChoice
    // from "## Кратко" is the only shot, and it succeeds (now with real level
    // distractors), so this yields a choice question.
    expect(items).toHaveLength(1);
    expect(items[0]!.question.kind).toBe('choice');
    expect(items[0]!.question.itemType).toBe('grammar');
  });

  it('vocab and kanji introduces always yield a choice question', () => {
    const items = buildReinforceQuestions(
      lesson({
        introduces: [
          { type: 'vocab', id: 'v-hayai', role: 'introduce' },
          { type: 'kanji', id: 'k-asa', role: 'introduce' },
        ],
        markers: [],
      }),
      content, 'seed',
    );
    expect(items.map((i) => i.question.itemType)).toEqual(['vocab', 'kanji']);
    expect(items.every((i) => i.question.kind === 'choice')).toBe(true);
  });

  it('is deterministic for a fixed seed', () => {
    const a = buildReinforceQuestions(lesson(), content, 'seed-x');
    const b = buildReinforceQuestions(lesson(), content, 'seed-x');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('skips role="review" introduces (only "introduce" reinforced)', () => {
    const items = buildReinforceQuestions(
      lesson({ introduces: [{ type: 'vocab', id: 'v-asa', role: 'review' }], markers: [] }),
      content, 'seed',
    );
    expect(items).toEqual([]);
  });
});
