import { describe, it, expect } from 'vitest';
import { genKanjiMeaning, genKanjiReading, generateKanjiQuestion } from '@/core/quiz/kanji-questions';
import type { KanjiPoint } from '@/core/types';

const gaku: KanjiPoint = {
  id: 'n5-学', level: 'N5', char: '学', onyomi: ['ガク'], kunyomi: ['まな.ぶ'], strokeCount: 8, meaningRu: 'учиться',
};
const others: KanjiPoint[] = [
  { id: 'n5-一', level: 'N5', char: '一', onyomi: ['イチ'], kunyomi: ['ひと.つ'], strokeCount: 1, meaningRu: 'один' },
  { id: 'n5-水', level: 'N5', char: '水', onyomi: ['スイ'], kunyomi: ['みず'], strokeCount: 4, meaningRu: 'вода' },
  { id: 'n5-木', level: 'N5', char: '木', onyomi: ['モク', 'ボク'], kunyomi: ['き'], strokeCount: 4, meaningRu: 'дерево' },
];

describe('genKanjiMeaning', () => {
  it('correct answer is the point meaning, distractors from other points', () => {
    const q = genKanjiMeaning(gaku, others, 's');
    expect(q.kind).toBe('choice');
    expect(q.itemType).toBe('kanji');
    expect(q.itemId).toBe('n5-学');
    expect(q.prompt).toContain('学');
    expect(q.choices).toHaveLength(4);
    expect(q.choices[q.answerIndex]).toBe('учиться');
    const distractors = q.choices.filter((_, i) => i !== q.answerIndex);
    distractors.forEach((d) => expect(['один', 'вода', 'дерево']).toContain(d));
  });

  it('is deterministic for a seed', () => {
    expect(genKanjiMeaning(gaku, others, 's')).toEqual(genKanjiMeaning(gaku, others, 's'));
  });
});

describe('genKanjiReading', () => {
  it('correct answer is one of the point readings (on or kun), distractors from other points', () => {
    const q = genKanjiReading(gaku, others, 's');
    expect(q.kind).toBe('choice');
    expect(q.choices).toHaveLength(4);
    expect(['ガク', 'まな.ぶ']).toContain(q.choices[q.answerIndex]);
    const distractors = q.choices.filter((_, i) => i !== q.answerIndex);
    const otherReadings = ['イチ', 'ひと.つ', 'スイ', 'みず', 'モク', 'ボク', 'き'];
    distractors.forEach((d) => expect(otherReadings).toContain(d));
  });

  it('is deterministic for a seed', () => {
    expect(genKanjiReading(gaku, others, 's')).toEqual(genKanjiReading(gaku, others, 's'));
  });
});

describe('generateKanjiQuestion', () => {
  it('alternates meaning/reading by reps parity', () => {
    const meaning = genKanjiMeaning(gaku, others, 'x:0');
    const reading = genKanjiReading(gaku, others, 'x:0');
    expect(generateKanjiQuestion(gaku, others, 0, 'x:0')).toEqual(meaning);
    expect(generateKanjiQuestion(gaku, others, 1, 'x:0')).toEqual(reading);
    expect(generateKanjiQuestion(gaku, others, 2, 'x:0')).toEqual(meaning);
  });
});
