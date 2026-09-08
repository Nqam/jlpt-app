import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const summary = {
  value: {
    dueCount: 3, newCount: 5, reviewedToday: 0,
    queueOverCap: false, allDone: false, nextDueAt: null, miniTestEligible: false,
  },
};

const userState: { settings: Record<string, unknown>; grammarCards: unknown[] } = {
  settings: {},
  grammarCards: [],
};
const setSetting = vi.fn((key: string, value: unknown) => {
  userState.settings[key] = value;
});
vi.mock('@/ui/useUserDb', () => ({
  useUserDb: () => ({
    getSetting: (key: string, fallback: unknown) => userState.settings[key] ?? fallback,
    setSetting,
    allCards: () => userState.grammarCards,
  }),
}));
vi.mock('@/ui/useContentDb', () => ({ useContentDb: () => ({}) }));
vi.mock('@/core/scheduler', () => ({ daySummary: () => summary.value }));
vi.mock('@/core/progress', () => ({ streak: () => ({ current: 4, best: 9 }) }));

import { TodayScreen } from '@/ui/screens/TodayScreen';
const renderScreen = () => render(<MemoryRouter><TodayScreen /></MemoryRouter>);

describe('TodayScreen', () => {
  beforeEach(() => {
    userState.settings = {};
    // Non-empty by default so the existing "normal day" tests below keep exercising
    // the day-summary branch, not the placement offer -- tests that need the offer
    // branch override this explicitly.
    userState.grammarCards = [{ item_id: 'p1' }];
    setSetting.mockClear();
  });

  it('shows the due/new/streak line with a mini-test dash when not eligible', () => {
    summary.value = { ...summary.value, dueCount: 3, newCount: 5, reviewedToday: 0, allDone: false, miniTestEligible: false };
    renderScreen();
    expect(screen.getByText(/3 повторить/)).toBeInTheDocument();
    expect(screen.getByText(/5 новых/)).toBeInTheDocument();
    expect(screen.getByText(/мини-тест —/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /начать/i })).toHaveAttribute('href', expect.stringContaining('/review'));
  });

  it('marks the mini-test done when eligible and something was reviewed today', () => {
    summary.value = { ...summary.value, dueCount: 0, newCount: 0, reviewedToday: 6, allDone: true, miniTestEligible: true };
    renderScreen();
    expect(screen.getByText(/мини-тест ✓/)).toBeInTheDocument();
  });

  it('offers Start on a pure mini-test day', () => {
    summary.value = { ...summary.value, dueCount: 0, newCount: 0, reviewedToday: 0, allDone: true, miniTestEligible: true };
    renderScreen();
    expect(screen.getByText(/мини-тест —/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /начать/i })).toBeInTheDocument();
  });

  it('offers the placement test on a fresh db with no grammar cards and no prior decision', () => {
    userState.grammarCards = [];
    renderScreen();
    expect(screen.getByText(/вступительный тест/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /пройти/i })).toHaveAttribute(
      'href', expect.stringContaining('/placement/grammar'),
    );
    expect(screen.getByText(/тесты по кандзи и словам/i)).toBeInTheDocument();
  });

  it('does not offer the placement test once placement_offered is set, even with zero cards', () => {
    userState.grammarCards = [];
    userState.settings['placement_offered'] = true;
    renderScreen();
    expect(screen.queryByText(/вступительный тест/i)).toBeNull();
  });

  it('skipping the offer sets placement_offered and shows the normal Today content', () => {
    userState.grammarCards = [];
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: /пропустить/i }));
    expect(setSetting).toHaveBeenCalledWith('placement_offered', true);
    expect(screen.queryByText(/вступительный тест/i)).toBeNull();
  });
});
