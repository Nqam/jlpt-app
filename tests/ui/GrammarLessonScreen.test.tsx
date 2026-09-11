import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter as BaseMemoryRouter, Routes, Route } from 'react-router-dom';
import type { ComponentProps } from 'react';
import { ContentDbContext } from '@/ui/ContentDbProvider';
import type { Level } from '@/core/types';
import type { GrammarPointFull } from '@/storage/content-db';

const FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true } as const;
const MemoryRouter = (p: ComponentProps<typeof BaseMemoryRouter>) => (
  <BaseMemoryRouter future={FUTURE} {...p} />
);

// Keep the reinforce step about flow, not generation.
vi.mock('@/core/quiz/grammar-reinforce', () => ({ buildGrammarReinforce: () => [] }));

const store: { progress: Record<string, { step: number }>; completed: string[] } = {
  progress: {}, completed: [],
};
const setSetting = vi.fn((key: string, value: unknown) => {
  if (key === 'course_progress') store.progress = value as Record<string, { step: number }>;
  if (key === 'course_completed_ids') store.completed = value as string[];
});
const cards = new Map<string, unknown>();
const getCard = vi.fn((t: string, i: string) => cards.get(`${t}:${i}`) ?? null);
const upsertCard = vi.fn((c: { item_type: string; item_id: string }) => {
  cards.set(`${c.item_type}:${c.item_id}`, c);
});
const insertReviewLog = vi.fn();
vi.mock('@/ui/useUserDb', () => ({
  useUserDb: () => ({
    getSetting: (key: string, fb: unknown) => {
      if (key === 'course_progress') return store.progress;
      if (key === 'course_completed_ids') return store.completed;
      return fb;
    },
    setSetting,
    getCard,
    upsertCard,
    insertReviewLog,
  }),
}));

import { GrammarLessonScreen } from '@/ui/screens/GrammarLessonScreen';

const levels: Level[] = [{ code: 'N5', ord: 1, status: 'available', titleRu: 'N5' }];

const point = (kanjiIds: string[], introducesVocab: string[] = []): GrammarPointFull => ({
  id: 'n5-x', level: 'N5', title: 'は (тема)', layer: 1, tags: [], related: [],
  bodyMarkdown: 'Краткое объяснение частицы.',
  examples: [
    { jaRuby: '学[がく]', ru: 'учёба' },
    { jaRuby: '校[こう]', ru: 'школа' },
    { jaRuby: '本[ほん]', ru: 'книга' },
  ],
  kanjiIds,
  introducesVocab,
  relatedTitles: [],
});

const kanjiOk = new Set(['n5-学', 'n5-校']);
const vocabOk = new Set(['n5-学校-がっこう']);
const fakeDb = {
  getGrammar: (id: string) => (id === 'n5-x' ? currentPoint : null),
  getKanji: (id: string) => (kanjiOk.has(id) ? { id, char: id } : null),
  getVocab: (id: string) => (vocabOk.has(id) ? { id, headword: id } : null),
  listGrammar: () => [],
  listCourseGrammar: () => [{ id: 'n5-x' }],
} as unknown as import('@/storage/content-db').ContentDb;

let currentPoint: GrammarPointFull;

function renderAt(path: string) {
  return render(
    <ContentDbContext.Provider value={{ db: fakeDb, levels }}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/course/:grammarId" element={<GrammarLessonScreen />} />
          <Route path="/course" element={<div>COURSE</div>} />
        </Routes>
      </MemoryRouter>
    </ContentDbContext.Provider>,
  );
}

describe('GrammarLessonScreen', () => {
  beforeEach(() => {
    store.progress = {}; store.completed = [];
    setSetting.mockClear();
    getCard.mockClear(); upsertCard.mockClear(); insertReviewLog.mockClear();
    cards.clear();
    currentPoint = point(['n5-学', 'n5-校']);
  });

  it('walks the 3 steps and on finish creates a grammar card + example-kanji cards, no review log', () => {
    renderAt('/course/n5-x');

    // step 0 — Изучение
    expect(screen.getByText(/Краткое объяснение/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Понятно' }));

    // step 1 — Закрепление (buildGrammarReinforce mocked to [])
    fireEvent.click(screen.getByRole('button', { name: 'Дальше' }));

    // step 2 — Итог
    expect(screen.getByText(/Пункт пройден/)).toBeInTheDocument();
    const carded = upsertCard.mock.calls.map((c) => `${c[0].item_type}:${c[0].item_id}`).sort();
    expect(carded).toEqual(['grammar:n5-x', 'kanji:n5-校', 'kanji:n5-学'].sort());
    expect(insertReviewLog).not.toHaveBeenCalled();
    expect(setSetting).toHaveBeenCalledWith('course_completed_ids', ['n5-x']);
  });

  it('does not re-create cards when the point was already complete', () => {
    store.progress = { 'n5-x': { step: 2 } };
    store.completed = ['n5-x'];
    renderAt('/course/n5-x');
    expect(screen.getByText(/Пункт пройден/)).toBeInTheDocument();
    expect(upsertCard).not.toHaveBeenCalled();
    expect(setSetting).not.toHaveBeenCalledWith('course_completed_ids', expect.anything());
  });

  it('skips a kanji id that does not resolve in content', () => {
    currentPoint = point(['n5-学', 'n5-nope']);
    store.progress = { 'n5-x': { step: 1 } };
    renderAt('/course/n5-x');
    fireEvent.click(screen.getByRole('button', { name: 'Дальше' }));
    const carded = upsertCard.mock.calls.map((c) => `${c[0].item_type}:${c[0].item_id}`);
    expect(carded).toContain('kanji:n5-学');
    expect(carded).not.toContain('kanji:n5-nope');
    expect(carded).toContain('grammar:n5-x');
  });

  it('also creates cards for introducesVocab, skipping an id that does not resolve', () => {
    currentPoint = point(['n5-学'], ['n5-学校-がっこう', 'n5-nope']);
    renderAt('/course/n5-x');
    fireEvent.click(screen.getByRole('button', { name: 'Понятно' }));
    fireEvent.click(screen.getByRole('button', { name: 'Дальше' }));
    const carded = upsertCard.mock.calls.map((c) => `${c[0].item_type}:${c[0].item_id}`);
    expect(carded).toContain('vocab:n5-学校-がっこう');
    expect(carded).not.toContain('vocab:n5-nope');
    expect(insertReviewLog).not.toHaveBeenCalled();
  });
});
