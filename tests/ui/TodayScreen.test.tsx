import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const summary = {
  value: {
    dueCount: 3, reviewedToday: 0,
    queueOverCap: false, allDone: false, nextDueAt: null, miniTestEligible: false,
  },
};

const courseState = { currentId: null as string | null, completed: [] as string[] };
const lessons: { value: Array<{ id: string; stage: number; kind: string; title: string; introducesCount: number; isFreeReading: boolean }> } = {
  value: [],
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
vi.mock('@/ui/useContentDb', () => ({
  useContentDb: () => ({ listLessons: () => lessons.value }),
}));
vi.mock('@/core/scheduler', () => ({ daySummary: () => summary.value }));
vi.mock('@/core/progress', () => ({ streak: () => ({ current: 4, best: 9 }) }));
vi.mock('@/core/course', () => ({
  currentMandatoryLessonId: () => courseState.currentId,
  courseCompletedIds: () => courseState.completed,
}));

import { TodayScreen } from '@/ui/screens/TodayScreen';
const renderScreen = () => render(<MemoryRouter><TodayScreen /></MemoryRouter>);

describe('TodayScreen', () => {
  beforeEach(() => {
    userState.settings = {};
    // Non-empty by default so the existing "normal day" tests below keep exercising
    // the day-summary branch, not the placement offer -- tests that need the offer
    // branch override this explicitly.
    userState.grammarCards = [{ item_id: 'p1' }];
    courseState.currentId = null;
    courseState.completed = [];
    lessons.value = [];
    setSetting.mockClear();
  });

  it('shows the due/streak line with a mini-test dash when not eligible, without a "new" counter', () => {
    summary.value = { ...summary.value, dueCount: 3, reviewedToday: 0, allDone: false, miniTestEligible: false };
    renderScreen();
    const line = screen.getByText(/3 повторить/);
    expect(line).toBeInTheDocument();
    expect(line).toHaveTextContent(/стрик/);
    expect(line).not.toHaveTextContent(/новых/);
    expect(screen.queryByText(/новых/)).toBeNull();
    expect(screen.getByText(/мини-тест —/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /начать/i })).toHaveAttribute('href', expect.stringContaining('/review'));
  });

  it('marks the mini-test done when eligible and something was reviewed today', () => {
    summary.value = { ...summary.value, dueCount: 0, reviewedToday: 6, allDone: true, miniTestEligible: true };
    renderScreen();
    expect(screen.getByText(/мини-тест ✓/)).toBeInTheDocument();
  });

  it('offers Start on a pure mini-test day', () => {
    summary.value = { ...summary.value, dueCount: 0, reviewedToday: 0, allDone: true, miniTestEligible: true };
    renderScreen();
    expect(screen.getByText(/мини-тест —/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /начать/i })).toBeInTheDocument();
  });

  it('renders a course card linking to /course when no mandatory lesson is current', () => {
    summary.value = { ...summary.value, dueCount: 3, reviewedToday: 0, allDone: false, miniTestEligible: false };
    renderScreen();
    expect(screen.getByRole('link', { name: /курс/i })).toHaveAttribute('href', '/course');
  });

  it('links the course card to the current mandatory lesson when one exists', () => {
    summary.value = { ...summary.value, dueCount: 0, reviewedToday: 0, allDone: true, miniTestEligible: false };
    courseState.currentId = 'l-5';
    lessons.value = [
      { id: 'l-5', stage: 5, kind: 'story', title: 'Утро', introducesCount: 2, isFreeReading: false },
    ];
    renderScreen();
    const link = screen.getByRole('link', { name: /Урок 5/ });
    expect(link).toHaveAttribute('href', '/lesson/l-5');
    expect(link).toHaveTextContent(/Урок 5/);
    expect(link).toHaveTextContent(/Утро/);
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
