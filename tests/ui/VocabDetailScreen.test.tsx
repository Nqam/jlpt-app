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
import { VocabDetailScreen } from '@/ui/screens/VocabDetailScreen';
import type { VocabPoint, KanjiPoint, Level } from '@/core/types';

const levels: Level[] = [{ code: 'N5', ord: 1, status: 'available', titleRu: 'N5' }];
const gakkou: VocabPoint = {
  id: 'n5-学校-がっこう', level: 'N5', headword: '学校', reading: 'がっこう', pos: 'сущ.', meaningRu: 'школа',
};
const noPos: VocabPoint = {
  id: 'n5-もう', level: 'N5', headword: 'もう', reading: 'もう', pos: '', meaningRu: 'уже',
};
const gaku: KanjiPoint = {
  id: 'n5-学', level: 'N5', char: '学', onyomi: ['ガク'], kunyomi: ['まな.ぶ'], strokeCount: 8, meaningRu: 'учиться',
};
const fakeDb = {
  getVocab: (id: string) => {
    if (id === gakkou.id) return gakkou;
    if (id === noPos.id) return noPos;
    return null;
  },
  getKanji: (id: string) => (id === gaku.id ? gaku : null),
} as unknown as import('@/storage/content-db').ContentDb;

function renderAt(path: string) {
  return render(
    <ContentDbContext.Provider value={{ db: fakeDb, levels }}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/vocab/:id" element={<VocabDetailScreen />} />
        </Routes>
      </MemoryRouter>
    </ContentDbContext.Provider>,
  );
}

describe('VocabDetailScreen', () => {
  it('renders the headword with a level badge', () => {
    const { getByRole } = renderAt('/vocab/n5-学校-がっこう');
    expect(getByRole('heading', { name: /学校/ })).toBeInTheDocument();
    expect(getByRole('heading', { name: /N5/ })).toBeInTheDocument();
  });

  it('shows reading, pos and meaning', () => {
    const { getByText } = renderAt('/vocab/n5-学校-がっこう');
    expect(getByText('がっこう')).toBeInTheDocument();
    expect(getByText('сущ.')).toBeInTheDocument();
    expect(getByText('школа')).toBeInTheDocument();
  });

  it('shows a not-found message for an unknown id', () => {
    const { getByText } = renderAt('/vocab/does-not-exist');
    expect(getByText(/не найдено/i)).toBeInTheDocument();
  });

  it('links back to the vocab list', () => {
    const { getByRole } = renderAt('/vocab/n5-学校-がっこう');
    expect(getByRole('link', { name: /слова/i })).toHaveAttribute('href', '/vocab');
  });

  it('shows em-dash fallback for a missing part of speech', () => {
    const { getAllByText } = renderAt('/vocab/n5-もう');
    expect(getAllByText('—')).toHaveLength(1);
  });

  it('breaks the headword down into its resolvable kanji, skipping unresolved ones', () => {
    const { getByRole, queryByRole } = renderAt('/vocab/n5-学校-がっこう');
    expect(getByRole('link', { name: /学 · учиться/ })).toHaveAttribute('href', '/kanji/n5-学');
    // 校 doesn't resolve in this fake db -- silently skipped, not a broken link
    expect(queryByRole('link', { name: /^校/ })).toBeNull();
  });

  it('shows no kanji-breakdown section for a kana-only word', () => {
    const { queryByText } = renderAt('/vocab/n5-もう');
    expect(queryByText(/кандзи в этом слове/i)).toBeNull();
  });
});
