import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ChoiceQuestion } from '@/core/quiz/types';

const upsertCard = vi.fn();
const insertReviewLog = vi.fn();
const getCard = vi.fn<(type: string, id: string) => unknown>(() => null);
const setSetting = vi.fn();
vi.mock('@/ui/useUserDb', () => ({
  useUserDb: () => ({
    getCard,
    upsertCard,
    insertReviewLog,
    setSetting,
    getSetting: (_k: string, d: unknown) => d,
  }),
}));
vi.mock('@/ui/useContentDb', () => ({ useContentDb: () => ({}) }));

function choiceQ(id: string, itemId: string): ChoiceQuestion {
  return {
    id, itemType: 'grammar', itemId, kind: 'choice',
    prompt: 'Вопрос?', choices: ['A', 'B', 'C', 'D'], answerIndex: 0,
  };
}

interface FakeState { step: number; }
const script: { value: { itemId: string; question: ChoiceQuestion }[] } = { value: [] };
const frontier: { value: string[] } = { value: [] };
vi.mock('@/core/placement', () => ({
  initPlacement: (): FakeState => ({ step: 0 }),
  nextPlacementQuestion: (state: FakeState) => script.value[state.step] ?? null,
  applyPlacementAnswer: (state: FakeState) => ({ step: state.step + 1 }),
  isPlacementDone: (state: FakeState) => state.step >= script.value.length,
  placementFrontierIds: () => frontier.value,
}));

import { PlacementScreen } from '@/ui/screens/PlacementScreen';
const renderScreen = () => render(<MemoryRouter><PlacementScreen /></MemoryRouter>);

describe('PlacementScreen', () => {
  beforeEach(() => {
    upsertCard.mockClear();
    insertReviewLog.mockClear();
    getCard.mockClear();
    getCard.mockImplementation(() => null);
    setSetting.mockClear();
  });

  it('answering every question marks the frontier ids as known and shows the summary', () => {
    script.value = [
      { itemId: 'p1', question: choiceQ('p1:0', 'p1') },
      { itemId: 'p2', question: choiceQ('p2:1', 'p2') },
    ];
    frontier.value = ['p1', 'p2'];
    renderScreen();

    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    fireEvent.click(screen.getByRole('button', { name: /далее/i }));
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    fireEvent.click(screen.getByRole('button', { name: /далее/i }));

    expect(screen.getByText(/Отмечено как уже известные: 2/)).toBeInTheDocument();
    expect(upsertCard).toHaveBeenCalledTimes(2);
    expect(insertReviewLog).not.toHaveBeenCalled();
    expect(setSetting).toHaveBeenCalledWith('placement_offered', true);
    expect(setSetting).toHaveBeenCalledWith('placement_marked_ids', expect.arrayContaining(['p1', 'p2']));
  });

  it('does not record placement_marked_ids when nothing new was marked', () => {
    script.value = [{ itemId: 'p1', question: choiceQ('p1:0', 'p1') }];
    frontier.value = ['p1', 'p2'];
    getCard.mockImplementation(() => ({ item_id: 'existing' })); // both already have cards
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    fireEvent.click(screen.getByRole('button', { name: /далее/i }));
    expect(screen.getByText(/Отмечено как уже известные: 0/)).toBeInTheDocument();
    expect(setSetting).not.toHaveBeenCalledWith('placement_marked_ids', expect.anything());
  });

  it('skips creating a card for a frontier item that already has one', () => {
    script.value = [{ itemId: 'p1', question: choiceQ('p1:0', 'p1') }];
    frontier.value = ['p1', 'p2'];
    getCard.mockImplementation((_type: string, id: string) => (id === 'p2' ? { item_id: 'p2' } : null));
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    fireEvent.click(screen.getByRole('button', { name: /далее/i }));
    expect(screen.getByText(/Отмечено как уже известные: 1/)).toBeInTheDocument();
    expect(upsertCard).toHaveBeenCalledTimes(1);
  });

  it('applies immediately when the test has nothing to ask (already done at mount)', () => {
    script.value = [];
    frontier.value = [];
    renderScreen();
    expect(screen.getByText(/Отмечено как уже известные: 0/)).toBeInTheDocument();
    expect(upsertCard).not.toHaveBeenCalled();
    expect(setSetting).toHaveBeenCalledWith('placement_offered', true);
  });
});
