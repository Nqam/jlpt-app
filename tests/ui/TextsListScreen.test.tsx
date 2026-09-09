import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

import { MemoryRouter as BaseMemoryRouter } from 'react-router-dom';
import type { ComponentProps } from 'react';
import { ContentDbContext } from '@/ui/ContentDbProvider';

const FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true } as const;
const MemoryRouter = (props: ComponentProps<typeof BaseMemoryRouter>) => (
  <BaseMemoryRouter future={FUTURE} {...props} />
);

const readIds: { value: string[] } = { value: [] };
vi.mock('@/ui/useUserDb', () => ({
  useUserDb: () => ({ getSetting: () => readIds.value }),
}));

import { TextsListScreen } from '@/ui/screens/TextsListScreen';
import type { LessonMeta, Level } from '@/core/types';

const levels: Level[] = [
  { code: 'N5', ord: 1, status: 'available', titleRu: 'N5' },
  { code: 'N4', ord: 2, status: 'coming_soon', titleRu: 'N4' },
];
// listLessons already returns rows ORDER BY stage, id.
const lessons: LessonMeta[] = [
  { id: 'n5-a', stage: 4, kind: 'text', title: 'キツネとツル' },
  { id: 'n5-b', stage: 10, kind: 'text', title: '二匹のかえる' },
  { id: 'n4-a', stage: 44, kind: 'text', title: '温泉' },
];
const fakeDb = {
  listLessons: () => lessons,
} as unknown as import('@/storage/content-db').ContentDb;

function renderScreen() {
  return render(
    <ContentDbContext.Provider value={{ db: fakeDb, levels }}>
      <MemoryRouter><TextsListScreen /></MemoryRouter>
    </ContentDbContext.Provider>,
  );
}

describe('TextsListScreen', () => {
  beforeEach(() => {
    readIds.value = [];
  });

  it('splits texts into JLPT-level tabs (stage < 40 = N5), N5 active first', () => {
    const { container, getAllByRole } = renderScreen();
    const tabs = [...container.querySelectorAll('.level-tabs [role="tab"]')];
    expect(tabs.map((t) => t.textContent)).toEqual(['N5', 'N4']);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    const links = getAllByRole('link').filter((a) => a.getAttribute('href')?.includes('/texts/'));
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/texts/n5-a', '/texts/n5-b']);
    expect(links.map((a) => a.textContent)).toEqual(['キツネとツル', '二匹のかえる']);
  });

  it('switching to the N4 tab shows only the N4 texts', async () => {
    const { container, getAllByRole } = renderScreen();
    fireEvent.click(container.querySelectorAll('.level-tabs [role="tab"]')[1]!);
    const links = getAllByRole('link').filter((a) => a.getAttribute('href')?.includes('/texts/'));
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/texts/n4-a']);
  });

  it('shows no read badge when nothing is read', () => {
    const { container } = renderScreen();
    expect(container.querySelector('.text-read-badge')).toBeNull();
  });

  it('shows a read badge only for a text whose id is in texts_read_ids', () => {
    readIds.value = ['n5-b'];
    const { container, getAllByRole } = renderScreen();
    const links = getAllByRole('link').filter((a) => a.getAttribute('href')?.includes('/texts/'));
    expect(links[0]!.querySelector('.text-read-badge')).toBeNull();
    expect(links[1]!.querySelector('.text-read-badge')).not.toBeNull();
    expect(container.querySelectorAll('.text-read-badge')).toHaveLength(1);
  });

  it('shows an empty-state message when there are no lessons', () => {
    const emptyDb = { listLessons: () => [] } as unknown as import('@/storage/content-db').ContentDb;
    const { getByText } = render(
      <ContentDbContext.Provider value={{ db: emptyDb, levels }}>
        <MemoryRouter><TextsListScreen /></MemoryRouter>
      </ContentDbContext.Provider>,
    );
    expect(getByText(/Текстов пока нет/i)).toBeInTheDocument();
  });
});
