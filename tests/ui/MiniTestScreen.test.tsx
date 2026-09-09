import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { MemoryRouter as BaseMemoryRouter, Routes, Route } from 'react-router-dom';
import type { ComponentProps } from 'react';
import type { Question } from '@/core/quiz/types';

const FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true } as const;
const MemoryRouter = (p: ComponentProps<typeof BaseMemoryRouter>) => (
  <BaseMemoryRouter future={FUTURE} {...p} />
);

const upsertCard = vi.fn();
const insertReviewLog = vi.fn();
vi.mock('@/ui/useUserDb', () => ({
  useUserDb: () => ({ upsertCard, insertReviewLog, getSetting: (_k: string, fb: unknown) => fb }),
}));
vi.mock('@/ui/useContentDb', () => ({ useContentDb: () => ({}) }));

const q = (id: string): Question => ({
  id, kind: 'choice', itemType: 'grammar', itemId: id,
  prompt: `Вопрос ${id}`, choices: ['A', 'B', 'C', 'D'], answerIndex: 0,
});
const built: { value: Question[] } = { value: [] };
vi.mock('@/core/session', () => ({
  buildMiniTest: () =>
    built.value.map((question, index) => ({
      phase: 'minitest' as const, question, sourceItemId: question.itemId, index,
    })),
}));

import { MiniTestScreen } from '@/ui/screens/MiniTestScreen';

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/minitest']}>
      <Routes>
        <Route path="/minitest" element={<MiniTestScreen />} />
        <Route path="/" element={<div>СЕГОДНЯ</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('MiniTestScreen', () => {
  beforeEach(() => {
    upsertCard.mockClear();
    insertReviewLog.mockClear();
    built.value = [];
  });

  it('shows an unavailable message when the mini-test has no questions', () => {
    renderScreen();
    expect(screen.getByText(/Мини-тест откроется/)).toBeInTheDocument();
  });

  it('walks the questions, scores them, and never writes to FSRS', async () => {
    built.value = [q('g1'), q('g2')];
    renderScreen();
    expect(screen.getByText('Вопрос g1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'A' })); // correct
    fireEvent.click(screen.getByRole('button', { name: /Далее/ }));
    fireEvent.click(screen.getByRole('button', { name: 'B' })); // wrong
    fireEvent.click(screen.getByRole('button', { name: /Завершить/ }));
    expect(screen.getByText(/Верно 1 из 2/)).toBeInTheDocument();
    expect(upsertCard).not.toHaveBeenCalled();
    expect(insertReviewLog).not.toHaveBeenCalled();
  });

  it('"Готово" returns to Сегодня', async () => {
    built.value = [q('g1')];
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    fireEvent.click(screen.getByRole('button', { name: /Завершить/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Готово' }));
    expect(screen.getByText('СЕГОДНЯ')).toBeInTheDocument();
  });
});
