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
import { VocabListScreen } from '@/ui/screens/VocabListScreen';
import type { VocabPoint, Level } from '@/core/types';

const levels: Level[] = [
  { code: 'N5', ord: 1, status: 'available', titleRu: 'N5' },
  { code: 'N4', ord: 2, status: 'coming_soon', titleRu: 'N4' },
];

type EffLevel = { code: string; ord: number; titleRu: string; status: string; rawStatus: string };
const defaultEff: EffLevel[] = [
  { code: 'N5', ord: 1, titleRu: 'N5', status: 'available', rawStatus: 'available' },
  { code: 'N4', ord: 2, titleRu: 'N4', status: 'coming_soon', rawStatus: 'coming_soon' },
];
const effLevels: { value: EffLevel[] } = { value: defaultEff };
vi.mock('@/ui/useContentDb', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/ui/useContentDb')>()),
  useEffectiveLevels: () => effLevels.value,
}));
beforeEach(() => {
  effLevels.value = defaultEff;
});
const n5: VocabPoint[] = [
  { id: 'n5-一つ-ひとつ', level: 'N5', headword: '一つ', reading: 'ひとつ', pos: 'сущ.', meaningRu: 'один' },
  { id: 'n5-学校-がっこう', level: 'N5', headword: '学校', reading: 'がっこう', pos: 'сущ.', meaningRu: 'школа' },
];
const n4Hit: VocabPoint = {
  id: 'n4-犬-いぬ', level: 'N4', headword: '犬', reading: 'いぬ', pos: 'сущ.', meaningRu: 'собака',
};
const fakeDb = {
  listVocab: (l: string) => (l === 'N5' ? n5 : []),
  searchVocab: (q: string) =>
    [...n5, n4Hit].filter((v) => v.meaningRu.toLowerCase().includes(q.toLowerCase())),
} as unknown as import('@/storage/content-db').ContentDb;

function renderScreen() {
  return render(
    <ContentDbContext.Provider value={{ db: fakeDb, levels }}>
      <MemoryRouter><VocabListScreen /></MemoryRouter>
    </ContentDbContext.Provider>,
  );
}

describe('VocabListScreen', () => {
  it('shows N5 vocab by default', () => {
    const { getAllByRole } = renderScreen();
    const links = getAllByRole('link').filter((a) => a.getAttribute('href')?.includes('/vocab/'));
    expect(links).toHaveLength(2);
    expect(links[0]!).toHaveTextContent('一つ');
  });

  it('marks a coming-soon level as empty', () => {
    const { getByRole, getByText } = renderScreen();
    fireEvent.click(getByRole('tab', { name: /N4/ }));
    expect(getByText(/скоро/i)).toBeInTheDocument();
  });

  it('filters by search query', () => {
    const { getByRole, queryByText } = renderScreen();
    const input = getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'школа' } });
    expect(queryByText('один')).toBeNull();
    expect(queryByText('школа')).toBeInTheDocument();
  });

  it('shows the unlock hint (not the list) for a locked active level', () => {
    effLevels.value = [
      { code: 'N5', ord: 1, titleRu: 'N5', status: 'locked', rawStatus: 'available' },
      ...defaultEff.slice(1),
    ];
    const { getByText, queryByRole } = renderScreen();
    expect(getByText(/откроется после 90% завершения/i)).toBeInTheDocument();
    expect(queryByRole('listitem')).toBeNull();
  });

  it('names the previous level in the locked hint when one exists', () => {
    effLevels.value = [
      defaultEff[0]!,
      { code: 'N4', ord: 2, titleRu: 'N4', status: 'locked', rawStatus: 'available' },
    ];
    const { getByRole, getByText } = renderScreen();
    fireEvent.click(getByRole('tab', { name: /N4/ }));
    expect(getByText(/откроется после 90% завершения уровня N5\./i)).toBeInTheDocument();
  });

  it('shows a level badge only on search results, not on browsed-by-tab items', () => {
    const { container, getByRole } = renderScreen();
    expect(container.querySelector('.level-badge')).toBeNull();
    const input = getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'собака' } });
    const badges = container.querySelectorAll('.level-badge');
    expect(badges).toHaveLength(1);
    expect(badges[0]).toHaveTextContent('N4');
  });
});
