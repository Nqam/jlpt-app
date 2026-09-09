import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { MemoryRouter as BaseMemoryRouter } from 'react-router-dom';
import type { ComponentProps } from 'react';
import { ContentDbContext } from '@/ui/ContentDbProvider';

const FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true } as const;
const MemoryRouter = (p: ComponentProps<typeof BaseMemoryRouter>) => (
  <BaseMemoryRouter future={FUTURE} {...p} />
);

const completed: { value: string[] } = { value: [] };
const carded: { value: { item_id: string }[] } = { value: [] };
vi.mock('@/ui/useUserDb', () => ({
  useUserDb: () => ({
    getSetting: (key: string, fb: unknown) =>
      key === 'course_completed_ids' ? completed.value : fb,
    allCards: () => carded.value,
  }),
}));

import { CourseScreen } from '@/ui/screens/CourseScreen';
import type { GrammarPoint, Level } from '@/core/types';

const levels: Level[] = [{ code: 'N5', ord: 1, status: 'available', titleRu: 'N5' }];
const gp = (id: string, title: string, level = 'N5'): GrammarPoint =>
  ({ id, level, title, layer: 1, tags: [], related: [], bodyMarkdown: '', examples: [], kanjiIds: [] });
const points: GrammarPoint[] = [gp('g1', 'A'), gp('g2', 'B'), gp('g3', 'C')];

const fakeDb = {
  listCourseGrammar: () => points,
} as unknown as import('@/storage/content-db').ContentDb;

function renderScreen() {
  return render(
    <ContentDbContext.Provider value={{ db: fakeDb, levels }}>
      <MemoryRouter><CourseScreen /></MemoryRouter>
    </ContentDbContext.Provider>,
  );
}

describe('CourseScreen', () => {
  beforeEach(() => {
    completed.value = [];
    carded.value = [];
  });

  it('has a "Курс" heading', () => {
    renderScreen();
    expect(screen.getByRole('heading', { name: 'Курс' })).toBeInTheDocument();
  });

  it('lists every grammar point with done / current / ahead markers', () => {
    completed.value = ['g1'];
    renderScreen();
    expect(screen.getByText('A').closest('[data-state]')).toHaveAttribute('data-state', 'done');
    expect(screen.getByText('B').closest('[data-state]')).toHaveAttribute('data-state', 'current');
    expect(screen.getByText('C').closest('[data-state]')).toHaveAttribute('data-state', 'ahead');
  });

  it('a point that already has a card counts as done', () => {
    carded.value = [{ item_id: 'g1' }];
    const { container } = renderScreen();
    const byId = (id: string) => container.querySelector(`.course-item[data-lesson="${id}"]`)!;
    expect(byId('g1')).toHaveAttribute('data-state', 'done');
    expect(byId('g2')).toHaveAttribute('data-state', 'current');
  });

  it('the CTA says "Начать курс" and targets the current point when nothing is done', () => {
    renderScreen();
    const cta = screen.getByRole('link', { name: /Начать курс/ });
    expect(cta).toHaveAttribute('href', '/course/g1');
  });

  it('the CTA says "Продолжить" once at least one point is done', () => {
    completed.value = ['g1'];
    renderScreen();
    expect(screen.getByRole('link', { name: /Продолжить/ })).toHaveAttribute('href', '/course/g2');
  });

  it('every point is a link (no locked state)', () => {
    const { container } = renderScreen();
    for (const el of container.querySelectorAll('.course-item')) {
      expect(el.querySelector('a')).not.toBeNull();
    }
  });

  it('shows a "курс пройден" state and no CTA when every point is done', () => {
    completed.value = ['g1', 'g2', 'g3'];
    renderScreen();
    expect(screen.queryByRole('link', { name: /Продолжить|Начать курс/ })).toBeNull();
    expect(screen.getByText(/курс пройден/i)).toBeInTheDocument();
  });

  it('splits the list into JLPT-level tabs and shows only the active level', async () => {
    const orig = points.slice();
    points.length = 0;
    points.push(gp('g1', 'A', 'N5'), gp('g2', 'B', 'N5'), gp('n4a', 'D', 'N4'), gp('n4b', 'E', 'N4'));
    try {
      const { container } = renderScreen();
      const tabs = [...container.querySelectorAll('.level-tabs [role="tab"]')];
      expect(tabs.map((t) => t.textContent)).toEqual(['N5', 'N4']);
      // default tab = level of the current point (g1 → N5)
      expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
      expect(container.querySelectorAll('.course-item')).toHaveLength(2);
      expect(screen.queryByText('D')).toBeNull();

      fireEvent.click(tabs[1]!);
      expect(container.querySelectorAll('.course-item')).toHaveLength(2);
      expect(screen.getByText('D')).toBeInTheDocument();
      expect(screen.queryByText('A')).toBeNull();
      // the CTA stays visible across tabs and still targets the current point
      expect(screen.getByRole('link', { name: /Начать курс/ })).toHaveAttribute('href', '/course/g1');
    } finally {
      points.length = 0;
      points.push(...orig);
    }
  });
});
