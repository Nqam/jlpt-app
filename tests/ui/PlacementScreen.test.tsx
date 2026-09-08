import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { ChoiceQuestion } from '@/core/quiz/types';

const upsertCard = vi.fn();
const insertReviewLog = vi.fn();
const getCard = vi.fn<(type: string, id: string) => unknown>(() => null);
const setSetting = vi.fn();
const settings: Record<string, unknown> = {};
vi.mock('@/ui/useUserDb', () => ({
  useUserDb: () => ({
    getCard,
    upsertCard,
    insertReviewLog,
    setSetting,
    getSetting: (k: string, d: unknown) => (k in settings ? settings[k] : d),
  }),
}));
vi.mock('@/ui/useContentDb', () => ({ useContentDb: () => ({}) }));
vi.mock('@/core/levels', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  availableLevelCodes: () => new Set(['N5', 'N4', 'N3', 'N2', 'N1']),
}));

// availableItemIds decides the volume-screen total; mock it to a fixed pool.
const pool: { value: string[] } = { value: [] };
vi.mock('@/core/scheduler', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  availableItemIds: () => pool.value,
}));

function choiceQ(id: string, itemId: string): ChoiceQuestion {
  return {
    id, itemType: 'grammar', itemId, kind: 'choice',
    prompt: 'Вопрос?', choices: ['A', 'B', 'C', 'D'], answerIndex: 0,
  };
}

interface FakeState { itemType: string; ids: string[]; index: number; correctIds: string[]; }
const known: { value: string[] } = { value: [] };
vi.mock('@/core/placement', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  return {
    ...real,
    initPlacement: (_c: unknown, _u: unknown, type: string, _a: unknown, pct: number): FakeState => ({
      itemType: type, ids: scriptFor(pct), index: 0, correctIds: [],
    }),
    nextPlacementQuestion: (s: FakeState) =>
      s.index < s.ids.length
        ? { itemId: s.ids[s.index], question: choiceQ(`${s.ids[s.index]}:${s.index}`, s.ids[s.index]!) }
        : null,
    applyPlacementAnswer: (s: FakeState, correct: boolean): FakeState => ({
      ...s, index: s.index + 1,
      correctIds: correct ? [...s.correctIds, s.ids[s.index]!] : s.correctIds,
    }),
    isPlacementDone: (s: FakeState) => s.index >= s.ids.length,
    placementQuestionNumber: (s: FakeState) => s.index + 1,
    placementTotal: (s: FakeState) => s.ids.length,
    placementKnownIds: () => known.value,
    // real placementCount used by the volume screen
  };
});
// pct -> id list the fake initPlacement returns
function scriptFor(pct: number): string[] {
  return pct === 10 ? ['p1', 'p2'] : ['p1', 'p2', 'p3', 'p4'];
}

import { PlacementScreen } from '@/ui/screens/PlacementScreen';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/placement/:type" element={<PlacementScreen />} />
        <Route path="/" element={<div>СЕГОДНЯ</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PlacementScreen', () => {
  beforeEach(() => {
    upsertCard.mockClear();
    insertReviewLog.mockClear();
    getCard.mockClear();
    getCard.mockImplementation(() => null);
    setSetting.mockClear();
    for (const k of Object.keys(settings)) delete settings[k];
    pool.value = Array.from({ length: 43 }, (_, i) => `g${i}`);
    known.value = [];
  });

  it('shows a volume-choice screen with four percentage buttons', () => {
    renderAt('/placement/grammar');
    expect(screen.getByRole('button', { name: /10\s*%/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /25\s*%/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /50\s*%/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /100\s*%/ })).toBeInTheDocument();
  });

  it('shows one "whole section" button when the pool is 10 or fewer', () => {
    pool.value = ['g0', 'g1', 'g2'];
    renderAt('/placement/grammar');
    expect(screen.getByRole('button', { name: /весь раздел \(3\)/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /10\s*%/ })).toBeNull();
  });

  it('picking a percentage starts the questions with a "N из M" counter', () => {
    renderAt('/placement/grammar');
    fireEvent.click(screen.getByRole('button', { name: /10\s*%/ }));
    expect(screen.getByText(/Вопрос 1 из 2/)).toBeInTheDocument();
  });

  it('completing a kanji test upserts a card per known id, tags placement_marked_kanji_ids, writes no review log', () => {
    known.value = ['p1', 'p2'];
    renderAt('/placement/kanji');
    fireEvent.click(screen.getByRole('button', { name: /10\s*%/ }));
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    fireEvent.click(screen.getByRole('button', { name: /далее/i }));
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    fireEvent.click(screen.getByRole('button', { name: /далее/i }));

    expect(screen.getByText(/Отмечено как уже известные: 2/)).toBeInTheDocument();
    expect(upsertCard).toHaveBeenCalledTimes(2);
    expect(insertReviewLog).not.toHaveBeenCalled();
    expect(setSetting).toHaveBeenCalledWith('placement_offered', true);
    expect(setSetting).toHaveBeenCalledWith(
      'placement_marked_kanji_ids', expect.arrayContaining(['p1', 'p2']),
    );
    expect(setSetting).not.toHaveBeenCalledWith('placement_marked_grammar_ids', expect.anything());
  });

  it('does not create a card for a known id that already has one', () => {
    known.value = ['p1', 'p2'];
    getCard.mockImplementation((_t: string, id: string) => (id === 'p2' ? { item_id: 'p2' } : null));
    renderAt('/placement/grammar');
    fireEvent.click(screen.getByRole('button', { name: /10\s*%/ }));
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    fireEvent.click(screen.getByRole('button', { name: /далее/i }));
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    fireEvent.click(screen.getByRole('button', { name: /далее/i }));
    expect(screen.getByText(/Отмечено как уже известные: 1/)).toBeInTheDocument();
    expect(upsertCard).toHaveBeenCalledTimes(1);
  });

  it('one-ways placement_offered even when the test marks zero cards', () => {
    known.value = ['p1'];
    getCard.mockImplementation((_t: string, id: string) => ({ item_id: id })); // every id already has a card
    renderAt('/placement/grammar');
    fireEvent.click(screen.getByRole('button', { name: /10\s*%/ }));
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    fireEvent.click(screen.getByRole('button', { name: /далее/i }));
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    fireEvent.click(screen.getByRole('button', { name: /далее/i }));

    expect(screen.getByText(/Отмечено как уже известные: 0/)).toBeInTheDocument();
    expect(upsertCard).not.toHaveBeenCalled();
    expect(setSetting).toHaveBeenCalledWith('placement_offered', true);
    expect(setSetting).not.toHaveBeenCalledWith(
      expect.stringMatching(/^placement_marked_.*_ids$/),
      expect.anything(),
    );
  });

  it('redirects an unknown :type to the grammar volume screen', () => {
    renderAt('/placement/bogus');
    // grammar volume screen still renders its buttons (no crash, no blank)
    expect(screen.getByRole('button', { name: /10\s*%/ })).toBeInTheDocument();
  });
});
