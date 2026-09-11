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
const points: { value: Array<{ id: string; title: string }> } = {
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
    getCard: () => null,
  }),
}));
vi.mock('@/ui/useContentDb', () => ({
  useContentDb: () => ({ listCourseGrammar: () => points.value }),
}));
vi.mock('@/core/scheduler', () => ({ daySummary: () => summary.value }));
const activityToday: { value: boolean } = { value: true };
vi.mock('@/core/progress', () => ({
  streak: () => ({ current: 4, best: 9 }),
  hasActivityToday: () => activityToday.value,
}));
vi.mock('@/core/course', () => ({
  currentCourseLessonId: () => courseState.currentId,
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
    points.value = [];
    activityToday.value = true;
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

  it('links the course card to the current grammar point when one exists, labelled "Начать курс" before any point is done', () => {
    summary.value = { ...summary.value, dueCount: 0, reviewedToday: 0, allDone: true, miniTestEligible: false };
    courseState.currentId = 'l-5';
    courseState.completed = [];
    points.value = [{ id: 'l-5', title: 'Утро' }];
    renderScreen();
    const link = screen.getByRole('link', { name: /Утро/ });
    expect(link).toHaveAttribute('href', '/course/l-5');
    expect(link).toHaveTextContent(/Начать курс/);
    expect(link).toHaveTextContent(/Утро/);
    expect(link).not.toHaveTextContent(/Урок 5/);
  });

  it('labels the course card "Продолжить курс" once a point has been completed', () => {
    summary.value = { ...summary.value, dueCount: 0, reviewedToday: 0, allDone: true, miniTestEligible: false };
    courseState.currentId = 'l-5';
    courseState.completed = ['l-4'];
    points.value = [{ id: 'l-5', title: 'Утро' }];
    renderScreen();
    const link = screen.getByRole('link', { name: /Утро/ });
    expect(link).toHaveAttribute('href', '/course/l-5');
    expect(link).toHaveTextContent(/Продолжить курс/);
  });

  it('warns the streak is at risk when there is a streak but no activity yet today', () => {
    activityToday.value = false;
    renderScreen();
    expect(screen.getByText(/под угрозой/)).toBeInTheDocument();
  });

  it('does not warn when today already has activity', () => {
    activityToday.value = true;
    renderScreen();
    expect(screen.queryByText(/под угрозой/)).toBeNull();
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
