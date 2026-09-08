import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { SessionStep } from '@/core/session';
import type { ChoiceQuestion } from '@/core/quiz/types';

const upsertCard = vi.fn();
const insertReviewLog = vi.fn();
vi.mock('@/ui/useUserDb', () => ({
  useUserDb: () => ({
    getCard: () => null,
    upsertCard,
    insertReviewLog,
    getSetting: (_k: string, d: unknown) => d,
  }),
}));
vi.mock('@/ui/useContentDb', () => ({
  useContentDb: () => ({
    getGrammar: (id: string) => ({
      id, title: `${id} (частица)`, level: 'N5', layer: 1, tags: [], related: [], relatedTitles: [],
      bodyMarkdown: '## Кратко\nОписание.',
      examples: [{ jaRuby: '私[わたし]', ru: 'я' }],
    }),
    listGrammar: () => [{ id: 'p1', level: 'N5', title: 'p1', layer: 1 }],
    getKanji: (id: string) =>
      id === 'n5-学'
        ? { id: 'n5-学', level: 'N5', char: '学', onyomi: ['ガク'], kunyomi: ['まな.ぶ'], strokeCount: 8, meaningRu: 'учиться' }
        : null,
    listKanji: () => [
      { id: 'n5-学', level: 'N5', char: '学', onyomi: ['ガク'], kunyomi: ['まな.ぶ'], strokeCount: 8, meaningRu: 'учиться' },
    ],
    getVocab: (id: string) =>
      id === 'n5-挨拶-あいさつ'
        ? { id: 'n5-挨拶-あいさつ', level: 'N5', headword: '挨拶', reading: 'あいさつ', pos: 'сущ.', meaningRu: 'приветствие' }
        : null,
    listVocab: () => [
      { id: 'n5-挨拶-あいさつ', level: 'N5', headword: '挨拶', reading: 'あいさつ', pos: 'сущ.', meaningRu: 'приветствие' },
    ],
  }),
}));

function choiceQ(id: string): ChoiceQuestion {
  return {
    id, itemType: 'grammar', itemId: id.split(':')[0]!, kind: 'choice',
    prompt: 'Вопрос?', choices: ['A', 'B', 'C', 'D'], answerIndex: 0,
  };
}

const steps: { value: SessionStep[] } = { value: [] };
vi.mock('@/core/session', async (orig) => {
  const real = await orig<typeof import('@/core/session')>();
  return { ...real, buildDailySession: () => steps.value };
});

vi.mock('@/core/quiz/registry', () => ({
  generateOfKind: (_kind: string, point: { id: string }) => choiceQ(`${point.id}:retry:0`),
}));

import { ReviewScreen } from '@/ui/screens/ReviewScreen';

const renderScreen = () =>
  render(<MemoryRouter><ReviewScreen /></MemoryRouter>);

describe('ReviewScreen', () => {
  beforeEach(() => {
    upsertCard.mockClear();
    insertReviewLog.mockClear();
  });

  it('a review step persists exactly one card and one log row', () => {
    steps.value = [{
      phase: 'review',
      item: { itemType: 'grammar', itemId: 'p1', kind: 'due' },
      question: choiceQ('p1:d:choice'),
    }];
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'A' })); // correct
    fireEvent.click(screen.getByRole('button', { name: /далее/i }));
    expect(upsertCard).toHaveBeenCalledTimes(1);
    expect(insertReviewLog).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Верно 1\/1/)).toBeInTheDocument();
    expect(screen.getByText(/мини-тест —/)).toBeInTheDocument();
  });

  it('a mini-test step never persists, and a failure triggers a retry round', () => {
    steps.value = [{
      phase: 'minitest', sourceItemId: 'p1', index: 0, question: choiceQ('p1:mt:0'),
    }];
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'B' })); // wrong
    fireEvent.click(screen.getByRole('button', { name: /далее/i }));
    // retry round: one more question appears, still no persistence
    expect(screen.getByRole('button', { name: 'A' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    fireEvent.click(screen.getByRole('button', { name: /далее/i }));
    expect(insertReviewLog).not.toHaveBeenCalled();
    expect(upsertCard).not.toHaveBeenCalled();
    expect(screen.getByText(/мини-тест 0\/1/)).toBeInTheDocument();
  });

  it('advancing steps does not flash the previous breakdown', () => {
    steps.value = [
      { phase: 'review', item: { itemType: 'grammar', itemId: 'p1', kind: 'due' }, question: choiceQ('p1:d:choice') },
      { phase: 'review', item: { itemType: 'grammar', itemId: 'p2', kind: 'due' }, question: choiceQ('p2:d:choice') },
    ];
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    fireEvent.click(screen.getByRole('button', { name: /далее/i }));
    // now on step 2: no "Далее", no verdict text
    expect(screen.queryByRole('button', { name: /далее/i })).toBeNull();
    expect(screen.queryByText('Верно')).toBeNull();
  });

  it('a kanji learn step renders KanjiLearnCard, and a kanji review step persists under item_type "kanji"', () => {
    steps.value = [
      { phase: 'learn', itemType: 'kanji', itemId: 'n5-学' },
      {
        phase: 'review',
        item: { itemType: 'kanji', itemId: 'n5-学', kind: 'new' },
        question: { id: 'n5-学:d:choice', itemType: 'kanji', itemId: 'n5-学', kind: 'choice', prompt: 'Что означает «学»?', choices: ['A', 'B', 'C', 'D'], answerIndex: 0 },
      },
    ];
    renderScreen();
    expect(screen.getByText('学')).toBeInTheDocument();
    expect(screen.getByText('учиться')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /понятно/i }));
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    fireEvent.click(screen.getByRole('button', { name: /далее/i }));
    expect(upsertCard).toHaveBeenCalledTimes(1);
    const cardArg = upsertCard.mock.calls[0]![0] as { item_type: string; item_id: string };
    expect(cardArg.item_type).toBe('kanji');
    expect(cardArg.item_id).toBe('n5-学');
  });

  it('a vocab learn step renders VocabLearnCard, and a vocab review step persists under item_type "vocab"', () => {
    steps.value = [
      { phase: 'learn', itemType: 'vocab', itemId: 'n5-挨拶-あいさつ' },
      {
        phase: 'review',
        item: { itemType: 'vocab', itemId: 'n5-挨拶-あいさつ', kind: 'new' },
        question: { id: 'n5-挨拶-あいさつ:d:choice', itemType: 'vocab', itemId: 'n5-挨拶-あいさつ', kind: 'choice', prompt: 'Что означает «挨拶»?', choices: ['A', 'B', 'C', 'D'], answerIndex: 0 },
      },
    ];
    renderScreen();
    expect(screen.getByText('挨拶')).toBeInTheDocument();
    expect(screen.getByText('приветствие')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /понятно/i }));
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    fireEvent.click(screen.getByRole('button', { name: /далее/i }));
    expect(upsertCard).toHaveBeenCalledTimes(1);
    const cardArg = upsertCard.mock.calls[0]![0] as { item_type: string; item_id: string };
    expect(cardArg.item_type).toBe('vocab');
    expect(cardArg.item_id).toBe('n5-挨拶-あいさつ');
  });
});
