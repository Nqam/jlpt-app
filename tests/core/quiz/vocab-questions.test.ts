import { describe, it, expect } from 'vitest';
import {
  genVocabMeaning, genVocabReading, genVocabReadingTyped, generateVocabQuestion,
} from '@/core/quiz/vocab-questions';
import type { VocabPoint } from '@/core/types';

const aisatsu: VocabPoint = {
  id: 'n5-挨拶-あいさつ', level: 'N5', headword: '挨拶', reading: 'あいさつ', pos: 'сущ.', meaningRu: 'приветствие',
};
const others: VocabPoint[] = [
  { id: 'n5-味-あじ', level: 'N5', headword: '味', reading: 'あじ', pos: 'сущ.', meaningRu: 'вкус' },
  { id: 'n5-遊び-あそび', level: 'N5', headword: '遊び', reading: 'あそび', pos: 'сущ.', meaningRu: 'игра' },
  { id: 'n5-案内-あんない', level: 'N5', headword: '案内', reading: 'あんない', pos: 'сущ.', meaningRu: 'сопровождение' },
];
const kanaOnly: VocabPoint = {
  id: 'n5-あんな', level: 'N5', headword: 'あんな', reading: 'あんな', pos: '', meaningRu: 'такой',
};

describe('genVocabMeaning', () => {
  it('correct answer is the point meaning, distractors from other points', () => {
    const q = genVocabMeaning(aisatsu, others, 's');
    expect(q.kind).toBe('choice');
    expect(q.itemType).toBe('vocab');
    expect(q.itemId).toBe('n5-挨拶-あいさつ');
    expect(q.prompt).toContain('挨拶');
    expect(q.choices).toHaveLength(4);
    expect(q.choices[q.answerIndex]).toBe('приветствие');
    const distractors = q.choices.filter((_, i) => i !== q.answerIndex);
    distractors.forEach((d) => expect(['вкус', 'игра', 'сопровождение']).toContain(d));
  });

  it('is deterministic for a seed', () => {
    expect(genVocabMeaning(aisatsu, others, 's')).toEqual(genVocabMeaning(aisatsu, others, 's'));
  });
});

describe('genVocabReading', () => {
  it('correct answer is the point reading, distractors from other points', () => {
    const q = genVocabReading(aisatsu, others, 's');
    expect(q.kind).toBe('choice');
    expect(q.choices).toHaveLength(4);
    expect(q.choices[q.answerIndex]).toBe('あいさつ');
    const distractors = q.choices.filter((_, i) => i !== q.answerIndex);
    const otherReadings = ['あじ', 'あそび', 'あんない'];
    distractors.forEach((d) => expect(otherReadings).toContain(d));
  });

  it('is deterministic for a seed', () => {
    expect(genVocabReading(aisatsu, others, 's')).toEqual(genVocabReading(aisatsu, others, 's'));
  });
});

describe('genVocabReadingTyped', () => {
  it('is a typed-recall question whose accepted answer is the reading', () => {
    const q = genVocabReadingTyped(aisatsu, 's');
    expect(q.kind).toBe('type');
    expect(q.itemType).toBe('vocab');
    expect(q.itemId).toBe('n5-挨拶-あいさつ');
    expect(q.prompt).toContain('挨拶');
    expect(q.answerText).toEqual(['あいさつ']);
  });
});

describe('generateVocabQuestion', () => {
  it('rotates meaning / reading (choice) / reading (typed) by reps mod 3', () => {
    const meaning = genVocabMeaning(aisatsu, others, 'x:0');
    const reading = genVocabReading(aisatsu, others, 'x:0');
    const typed = genVocabReadingTyped(aisatsu, 'x:0');
    expect(generateVocabQuestion(aisatsu, others, 0, 'x:0')).toEqual(meaning);
    expect(generateVocabQuestion(aisatsu, others, 1, 'x:0')).toEqual(reading);
    expect(generateVocabQuestion(aisatsu, others, 2, 'x:0')).toEqual(typed);
    expect(generateVocabQuestion(aisatsu, others, 3, 'x:0')).toEqual(meaning);
  });

  it('always asks meaning for a kana-only word, regardless of reps parity', () => {
    const meaning = genVocabMeaning(kanaOnly, others, 'y:0');
    expect(generateVocabQuestion(kanaOnly, others, 0, 'y:0')).toEqual(meaning);
    expect(generateVocabQuestion(kanaOnly, others, 1, 'y:0')).toEqual(meaning);
    expect(generateVocabQuestion(kanaOnly, others, 2, 'y:0')).toEqual(meaning);
  });
});
