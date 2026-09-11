import { describe, it, expect } from 'vitest';
import { grade } from '@/core/quiz/grade';
import type { ClozeQuestion, ChoiceQuestion, AssembleQuestion, TypeQuestion } from '@/core/quiz/types';

const cloze: ClozeQuestion = {
  id: 'g:2026-09-04:cloze', itemType: 'grammar', itemId: 'g', kind: 'cloze',
  prompt: 'Выбери пропущенное', sentenceRuby: 'これは ___ です。', translationRu: 'Это книга.',
  choices: ['は', 'を', 'に', 'も'], answerIndex: 0,
};
const choice: ChoiceQuestion = {
  id: 'g:2026-09-04:choice', itemType: 'grammar', itemId: 'g', kind: 'choice',
  prompt: 'Что выражает «は»?', choices: ['тема', 'объект', 'место', 'цель'], answerIndex: 0,
};
const assemble: AssembleQuestion = {
  id: 'g:2026-09-04:assemble', itemType: 'grammar', itemId: 'g', kind: 'assemble',
  prompt: 'Собери предложение', tokens: ['です。', '学生[がくせい]', 'は', '私[わたし]'],
  answerOrder: [3, 2, 1, 0], translationRu: 'Я студент.',
};

describe('core/quiz/grade', () => {
  it('cloze / choice: matching index is Good, non-matching is Again', () => {
    expect(grade(cloze, { kind: 'index', value: 0 })).toEqual({ correct: true, rating: 3 });
    expect(grade(cloze, { kind: 'index', value: 2 })).toEqual({ correct: false, rating: 1 });
    expect(grade(choice, { kind: 'index', value: 0 })).toEqual({ correct: true, rating: 3 });
    expect(grade(choice, { kind: 'index', value: 1 })).toEqual({ correct: false, rating: 1 });
  });

  it('assemble: exact element-wise order is Good', () => {
    expect(grade(assemble, { kind: 'order', value: [3, 2, 1, 0] }))
      .toEqual({ correct: true, rating: 3 });
    expect(grade(assemble, { kind: 'order', value: [3, 2, 0, 1] }))
      .toEqual({ correct: false, rating: 1 });
    expect(grade(assemble, { kind: 'order', value: [3, 2, 1] }))
      .toEqual({ correct: false, rating: 1 });
  });

  it('wrong answer shape never crashes and never grades correct', () => {
    expect(grade(cloze, { kind: 'order', value: [0] })).toEqual({ correct: false, rating: 1 });
    expect(grade(assemble, { kind: 'index', value: 0 })).toEqual({ correct: false, rating: 1 });
  });

  it('scales a correct answer by response time: fast=Easy, mid=Good, slow=Hard', () => {
    expect(grade(choice, { kind: 'index', value: 0 }, 1_000)).toEqual({ correct: true, rating: 4 });
    expect(grade(choice, { kind: 'index', value: 0 }, 8_000)).toEqual({ correct: true, rating: 3 });
    expect(grade(choice, { kind: 'index', value: 0 }, 20_000)).toEqual({ correct: true, rating: 2 });
  });

  it('a wrong answer is always Again regardless of response time', () => {
    expect(grade(choice, { kind: 'index', value: 1 }, 500)).toEqual({ correct: false, rating: 1 });
  });

  it('omitting elapsedMs keeps the old always-Good-on-correct behaviour', () => {
    expect(grade(choice, { kind: 'index', value: 0 })).toEqual({ correct: true, rating: 3 });
  });

  it('type: matches after trimming/collapsing whitespace, rejects a wrong string', () => {
    const type: TypeQuestion = {
      id: 'v:0:type', itemType: 'vocab', itemId: 'v', kind: 'type',
      prompt: 'Напишите чтение', answerText: ['あいさつ'],
    };
    expect(grade(type, { kind: 'text', value: 'あいさつ' })).toEqual({ correct: true, rating: 3 });
    expect(grade(type, { kind: 'text', value: '  あい さつ  ' })).toEqual({ correct: true, rating: 3 });
    expect(grade(type, { kind: 'text', value: 'あさいつ' })).toEqual({ correct: false, rating: 1 });
    expect(grade(type, { kind: 'text', value: '' })).toEqual({ correct: false, rating: 1 });
    expect(grade(type, { kind: 'index', value: 0 })).toEqual({ correct: false, rating: 1 });
  });
});
