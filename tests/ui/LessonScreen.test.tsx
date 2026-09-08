import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter as BaseMemoryRouter, Routes, Route } from 'react-router-dom';
import type { ComponentProps } from 'react';
import { ContentDbContext } from '@/ui/ContentDbProvider';

const FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true } as const;
const MemoryRouter = (p: ComponentProps<typeof BaseMemoryRouter>) => (
  <BaseMemoryRouter future={FUTURE} {...p} />
);

const store: { progress: Record<string, { step: number }>; completed: string[] } = {
  progress: {}, completed: [],
};
const setSetting = vi.fn((key: string, value: unknown) => {
  if (key === 'course_progress') store.progress = value as Record<string, { step: number }>;
  if (key === 'course_completed_ids') store.completed = value as string[];
});
vi.mock('@/ui/useUserDb', () => ({
  useUserDb: () => ({
    getSetting: (key: string, fb: unknown) => {
      if (key === 'course_progress') return store.progress;
      if (key === 'course_completed_ids') return store.completed;
      return fb;
    },
    setSetting,
  }),
}));

import { LessonScreen } from '@/ui/screens/LessonScreen';
import type { Level, LessonFull, LessonMeta } from '@/core/types';

const levels: Level[] = [{ code: 'N5', ord: 1, status: 'available', titleRu: 'N5' }];

const freeLesson: LessonFull = {
  id: 'n5-hanami', stage: 2, kind: 'text', title: 'お花見',
  introducesCount: 0, isFreeReading: true,
  bodyRuby: '桜[さくら]が 咲[さ]きます。\n\n春[はる]です。',
  translationRu: 'Сакура цветёт.\n\nВесна.',
  questions: [
    { prompt: 'Что цветёт?', choices: ['Сакура', 'Слива', 'Роза'], answerIndex: 0 },
  ],
  introduces: [], markers: [],
};
const metas: LessonMeta[] = [
  { id: 'n5-hanami', stage: 2, kind: 'text', title: 'お花見', introducesCount: 0, isFreeReading: true },
  { id: 'n5-konbini', stage: 4, kind: 'text', title: 'コンビニ', introducesCount: 0, isFreeReading: true },
];
const fakeDb = {
  getLesson: (id: string) => (id === 'n5-hanami' ? freeLesson : null),
  listLessons: () => metas,
  getGrammar: () => null, getVocab: () => null, getKanji: () => null,
  listVocab: () => [], listKanji: () => [],
} as unknown as import('@/storage/content-db').ContentDb;

function renderAt(path: string) {
  return render(
    <ContentDbContext.Provider value={{ db: fakeDb, levels }}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/lesson/:id" element={<LessonScreen />} />
          <Route path="/course" element={<div>COURSE</div>} />
        </Routes>
      </MemoryRouter>
    </ContentDbContext.Provider>,
  );
}

describe('LessonScreen', () => {
  beforeEach(() => {
    store.progress = {}; store.completed = [];
    setSetting.mockClear();
  });

  it('a free-reading lesson skips step 0 (New) and step 3 (Reinforce): goes Read -> Comprehension -> Summary', () => {
    renderAt('/lesson/n5-hanami');
    // step 1 Read
    expect(screen.getByRole('button', { name: 'Показать перевод' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Дальше|Далее/ }));
    // step 2 Comprehension
    expect(screen.getByText('Что цветёт?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Сакура' }));
    fireEvent.click(screen.getByRole('button', { name: 'Завершить' }));
    // step 4 Summary
    expect(screen.getByText(/Урок пройден/)).toBeInTheDocument();
    expect(setSetting).toHaveBeenCalledWith('course_completed_ids', ['n5-hanami']);
  });

  it('persists the step after each transition via course_progress', () => {
    renderAt('/lesson/n5-hanami');
    fireEvent.click(screen.getByRole('button', { name: /Дальше|Далее/ })); // Read -> Comprehension
    expect(setSetting).toHaveBeenCalledWith('course_progress', expect.objectContaining({
      'n5-hanami': { step: 2 },
    }));
  });

  it('resumes at the persisted step', () => {
    store.progress = { 'n5-hanami': { step: 2 } };
    renderAt('/lesson/n5-hanami');
    expect(screen.getByText('Что цветёт?')).toBeInTheDocument(); // straight to Comprehension
  });

  it('Summary offers the next lesson and a link back to the course', () => {
    store.progress = { 'n5-hanami': { step: 4 } };
    renderAt('/lesson/n5-hanami');
    expect(screen.getByText(/Урок пройден/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /К курсу/ })).toHaveAttribute('href', '/course');
    expect(screen.getByRole('link', { name: /Следующий/ })).toHaveAttribute('href', '/lesson/n5-konbini');
  });

  it('shows a not-found message for an unknown id', () => {
    renderAt('/lesson/does-not-exist');
    expect(screen.getByText(/Урок не найден/)).toBeInTheDocument();
  });

  it('does not re-append to course_completed_ids if the lesson is already complete', () => {
    store.completed = ['n5-hanami'];
    store.progress = { 'n5-hanami': { step: 4 } };
    renderAt('/lesson/n5-hanami');
    expect(setSetting).not.toHaveBeenCalledWith('course_completed_ids', expect.anything());
  });
});
