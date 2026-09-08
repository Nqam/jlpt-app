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
import type { TextPoint, Level } from '@/core/types';

const levels: Level[] = [
  { code: 'N5', ord: 1, status: 'available', titleRu: 'N5' },
  { code: 'N4', ord: 2, status: 'coming_soon', titleRu: 'N4' },
];
const n5: TextPoint[] = [
  { id: 'n5-a', level: 'N5', title: 'キツネとツル', bodyRuby: '', translationRu: '', questions: [] },
  { id: 'n5-b', level: 'N5', title: '二匹のかえる', bodyRuby: '', translationRu: '', questions: [] },
];
const fakeDb = {
  listTexts: (l: string) => (l === 'N5' ? n5 : []),
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

  it('shows N5 texts by default', () => {
    const { getAllByRole } = renderScreen();
    const links = getAllByRole('link').filter((a) => a.getAttribute('href')?.includes('/texts/'));
    expect(links).toHaveLength(2);
    expect(links[0]!).toHaveTextContent('キツネとツル');
  });

  it('marks a coming-soon level as empty', () => {
    const { getByRole, getByText } = renderScreen();
    fireEvent.click(getByRole('tab', { name: /N4/ }));
    expect(getByText(/скоро/i)).toBeInTheDocument();
  });

  it('shows no read badge for an unread text', () => {
    const { container } = renderScreen();
    expect(container.querySelector('.text-read-badge')).toBeNull();
  });

  it('shows a read badge only for a text whose id is in texts_read_ids', () => {
    readIds.value = ['n5-a'];
    const { container, getAllByRole } = renderScreen();
    const links = getAllByRole('link').filter((a) => a.getAttribute('href')?.includes('/texts/'));
    expect(links[0]!.querySelector('.text-read-badge')).not.toBeNull();
    expect(links[1]!.querySelector('.text-read-badge')).toBeNull();
    expect(container.querySelectorAll('.text-read-badge')).toHaveLength(1);
  });
});
