import '@testing-library/jest-dom/vitest';
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { MemoryRouter as BaseMemoryRouter } from 'react-router-dom';
import type { ComponentProps } from 'react';
import { ContentDbContext } from '@/ui/ContentDbProvider';

const FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true } as const;
const MemoryRouter = (props: ComponentProps<typeof BaseMemoryRouter>) => (
  <BaseMemoryRouter future={FUTURE} {...props} />
);
import { GrammarListScreen } from '@/ui/screens/GrammarListScreen';
import type { GrammarPoint, Level } from '@/core/types';

const levels: Level[] = [
  { code: 'N5', ord: 1, status: 'available', titleRu: 'N5' },
  { code: 'N4', ord: 2, status: 'available', titleRu: 'N4' },
  { code: 'N3', ord: 3, status: 'coming_soon', titleRu: 'N3' },
];
const n5: GrammarPoint[] = [
  { id: 'n5-wa-particle', level: 'N5', title: 'は (тема предложения)', layer: 1, tags: [], related: [], bodyMarkdown: '', examples: [] },
  { id: 'n5-mo-particle', level: 'N5', title: 'も (тоже)', layer: 2, tags: [], related: [], bodyMarkdown: '', examples: [] },
];
const fakeDb = {
  listLevels: () => levels,
  listGrammar: (l: string) => (l === 'N5' ? n5 : []),
  grammarCountByLevel: (l: string) => (l === 'N5' ? n5.length : 0),
  searchGrammar: (q: string) => n5.filter((p) => p.title.toLowerCase().includes(q.toLowerCase())),
} as unknown as import('@/storage/content-db').ContentDb;

function renderScreen() {
  return render(
    <ContentDbContext.Provider value={{ db: fakeDb, levels }}>
      <MemoryRouter><GrammarListScreen /></MemoryRouter>
    </ContentDbContext.Provider>,
  );
}

describe('GrammarListScreen', () => {
  it('shows N5 points by default, sorted by layer', () => {
    const { getAllByRole } = renderScreen();
    const links = getAllByRole('link').filter((a) => a.getAttribute('href')?.includes('/grammar/'));
    expect(links[0]!).toHaveTextContent('は (тема предложения)');
  });

  it('marks a coming-soon level as empty', () => {
    const { getByRole, getByText } = renderScreen();
    fireEvent.click(getByRole('tab', { name: /N3/ }));
    expect(getByText(/скоро/i)).toBeInTheDocument();
  });

  it('filters by search query', () => {
    const { getByRole, queryByText } = renderScreen();
    const input = getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'тоже' } });
    expect(queryByText('は (тема предложения)')).toBeNull();
  });
});
