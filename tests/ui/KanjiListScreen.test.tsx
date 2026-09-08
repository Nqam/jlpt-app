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
import { KanjiListScreen } from '@/ui/screens/KanjiListScreen';
import type { KanjiPoint, Level } from '@/core/types';

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
const userCards: { value: { item_id: string; reps: number; stability: number }[] } = { value: [] };
vi.mock('@/ui/useUserDb', () => ({
  useUserDb: () => ({ allCards: () => userCards.value }),
}));
beforeEach(() => {
  effLevels.value = defaultEff;
  userCards.value = [];
});
const n5: KanjiPoint[] = [
  { id: 'n5-一', level: 'N5', char: '一', onyomi: ['イチ'], kunyomi: ['ひと.つ'], strokeCount: 1, meaningRu: 'один' },
  { id: 'n5-学', level: 'N5', char: '学', onyomi: ['ガク'], kunyomi: ['まな.ぶ'], strokeCount: 8, meaningRu: 'учиться' },
];
const n4Hit: KanjiPoint = {
  id: 'n4-犬', level: 'N4', char: '犬', onyomi: ['ケン'], kunyomi: ['いぬ'], strokeCount: 4, meaningRu: 'собака',
};
const fakeDb = {
  listKanji: (l: string) => (l === 'N5' ? n5 : []),
  searchKanji: (q: string) =>
    [...n5, n4Hit].filter((k) => k.meaningRu.toLowerCase().includes(q.toLowerCase())),
} as unknown as import('@/storage/content-db').ContentDb;

function renderScreen() {
  return render(
    <ContentDbContext.Provider value={{ db: fakeDb, levels }}>
      <MemoryRouter><KanjiListScreen /></MemoryRouter>
    </ContentDbContext.Provider>,
  );
}

describe('KanjiListScreen', () => {
  it('shows N5 kanji by default', () => {
    const { getAllByRole } = renderScreen();
    const links = getAllByRole('link').filter((a) => a.getAttribute('href')?.includes('/kanji/'));
    expect(links).toHaveLength(2);
    expect(links[0]!).toHaveTextContent('一');
  });

  it('marks a coming-soon level as empty', () => {
    const { getByRole, getByText } = renderScreen();
    fireEvent.click(getByRole('tab', { name: /N4/ }));
    expect(getByText(/скоро/i)).toBeInTheDocument();
  });

  it('filters by search query', () => {
    const { getByRole, queryByText } = renderScreen();
    const input = getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'учиться' } });
    expect(queryByText('один')).toBeNull();
    expect(queryByText('учиться')).toBeInTheDocument();
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
    // browsing N5 by tab: no badge
    expect(container.querySelector('.level-badge')).toBeNull();

    const input = getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'собака' } }); // matches only n4Hit
    const badges = container.querySelectorAll('.level-badge');
    expect(badges).toHaveLength(1);
    expect(badges[0]).toHaveTextContent('N4');
  });

  it('shows a status dot for a kanji with a learned card', () => {
    userCards.value = [{ item_id: 'n5-学', reps: 5, stability: 15 }]; // stability 7..30 -> "learned"
    const { container } = renderScreen();
    expect(container.querySelector('.status-dot-learned')).toBeInTheDocument();
    // exactly one item has a dot; the other ('n5-一') has none
    expect(container.querySelectorAll('.status-dot')).toHaveLength(1);
  });

  it('links to the section placement test when the active level is available', () => {
    const { getByRole } = renderScreen();
    expect(getByRole('link', { name: /пройти тест по разделу/i })).toHaveAttribute(
      'href', expect.stringContaining('/placement/kanji'),
    );
  });

  it('hides the section-test link for a locked active level', () => {
    effLevels.value = [
      { code: 'N5', ord: 1, titleRu: 'N5', status: 'locked', rawStatus: 'available' },
      ...defaultEff.slice(1),
    ];
    const { queryByRole } = renderScreen();
    expect(queryByRole('link', { name: /пройти тест по разделу/i })).toBeNull();
  });
});
