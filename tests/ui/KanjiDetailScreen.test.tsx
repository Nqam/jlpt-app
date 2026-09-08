import '@testing-library/jest-dom/vitest';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter as BaseMemoryRouter, Routes, Route } from 'react-router-dom';
import type { ComponentProps } from 'react';
import { ContentDbContext } from '@/ui/ContentDbProvider';

const FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true } as const;
const MemoryRouter = (props: ComponentProps<typeof BaseMemoryRouter>) => (
  <BaseMemoryRouter future={FUTURE} {...props} />
);
import { KanjiDetailScreen } from '@/ui/screens/KanjiDetailScreen';
import type { KanjiPoint, Level } from '@/core/types';

const levels: Level[] = [{ code: 'N5', ord: 1, status: 'available', titleRu: 'N5' }];
const gaku: KanjiPoint = {
  id: 'n5-学', level: 'N5', char: '学', onyomi: ['ガク'], kunyomi: ['まな.ぶ'], strokeCount: 8, meaningRu: 'учиться',
};
const noReadings: KanjiPoint = {
  id: 'n5-亜', level: 'N5', char: '亜', onyomi: [], kunyomi: [], strokeCount: 7, meaningRu: 'Азия',
};
const fakeDb = {
  getKanji: (id: string) => {
    if (id === gaku.id) return gaku;
    if (id === noReadings.id) return noReadings;
    return null;
  },
} as unknown as import('@/storage/content-db').ContentDb;

function renderAt(path: string) {
  return render(
    <ContentDbContext.Provider value={{ db: fakeDb, levels }}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/kanji/:id" element={<KanjiDetailScreen />} />
        </Routes>
      </MemoryRouter>
    </ContentDbContext.Provider>,
  );
}

describe('KanjiDetailScreen', () => {
  it('renders the character with a level badge', () => {
    const { getByRole } = renderAt('/kanji/n5-学');
    expect(getByRole('heading', { name: /学/ })).toBeInTheDocument();
    expect(getByRole('heading', { name: /N5/ })).toBeInTheDocument();
  });

  it('shows readings, meaning and stroke count', () => {
    const { getByText } = renderAt('/kanji/n5-学');
    expect(getByText('ガク')).toBeInTheDocument();
    expect(getByText('まな.ぶ')).toBeInTheDocument();
    expect(getByText('учиться')).toBeInTheDocument();
    expect(getByText('8')).toBeInTheDocument();
  });

  it('shows a not-found message for an unknown id', () => {
    const { getByText } = renderAt('/kanji/does-not-exist');
    expect(getByText(/не найден/i)).toBeInTheDocument();
  });

  it('links back to the kanji list', () => {
    const { getByRole } = renderAt('/kanji/n5-学');
    expect(getByRole('link', { name: /кандзи/i })).toHaveAttribute('href', '/kanji');
  });

  it('shows em-dash fallback for missing readings', () => {
    const { getAllByText } = renderAt('/kanji/n5-亜');
    expect(getAllByText('—')).toHaveLength(2);
  });
});
