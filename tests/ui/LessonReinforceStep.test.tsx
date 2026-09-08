import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ContentDbContext } from '@/ui/ContentDbProvider';
import type { Level, LessonFull } from '@/core/types';

vi.mock('@/ui/useUserDb', () => ({ useUserDb: () => ({ getSetting: (_k: string, fb: unknown) => fb }) }));

import { LessonReinforceStep } from '@/ui/components/LessonReinforceStep';

const levels: Level[] = [{ code: 'N5', ord: 1, status: 'available', titleRu: 'N5' }];
const fakeDb = {
  getGrammar: () => null,
  getVocab: (id: string) =>
    id === 'v-asa' ? { id, headword: '朝', reading: 'あさ', pos: 'сущ.', meaningRu: 'утро', level: 'N5' } : null,
  getKanji: () => null,
  listVocab: () => [
    { id: 'v-asa', headword: '朝', reading: 'あさ', pos: 'сущ.', meaningRu: 'утро', level: 'N5' },
    { id: 'v-b', headword: '夜', reading: 'よる', pos: 'сущ.', meaningRu: 'ночь', level: 'N5' },
    { id: 'v-c', headword: '昼', reading: 'ひる', pos: 'сущ.', meaningRu: 'день', level: 'N5' },
    { id: 'v-d', headword: '晩', reading: 'ばん', pos: 'сущ.', meaningRu: 'вечер', level: 'N5' },
  ],
  listKanji: () => [],
} as unknown as import('@/storage/content-db').ContentDb;

const lesson: LessonFull = {
  id: 'l1', stage: 3, kind: 'text', title: 'T', introducesCount: 1, isFreeReading: false,
  bodyRuby: 'x', translationRu: 'y', questions: [],
  introduces: [{ type: 'vocab', id: 'v-asa', role: 'introduce' }],
  markers: [{ type: 'vocab', id: 'v-asa', surface: '朝[あさ]', sentenceRuby: '朝[あさ]です。', sentenceRu: 'Это утро.' }],
};

function renderStep(onDone = vi.fn()) {
  const utils = render(
    <ContentDbContext.Provider value={{ db: fakeDb, levels }}>
      <LessonReinforceStep lesson={lesson} onDone={onDone} />
    </ContentDbContext.Provider>,
  );
  return { ...utils, onDone };
}

describe('LessonReinforceStep', () => {
  it('shows the marker context sentence above the question', () => {
    renderStep();
    expect(screen.getByText('Это утро.')).toBeInTheDocument();
  });

  it('walks the questions and calls onDone at the end', () => {
    const { onDone } = renderStep();
    // one vocab question -> answer any choice -> "Далее"/"Завершить"
    const opts = screen.getAllByRole('button').filter((b) => b.classList.contains('q-opt'));
    fireEvent.click(opts[0]!);
    fireEvent.click(screen.getByRole('button', { name: /Завершить|Далее/ }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('renders a skip button that calls onDone when no question could be built', () => {
    const onDone = vi.fn();
    const empty: LessonFull = { ...lesson, introduces: [{ type: 'grammar', id: 'missing', role: 'introduce' }], markers: [] };
    render(
      <ContentDbContext.Provider value={{ db: fakeDb, levels }}>
        <LessonReinforceStep lesson={empty} onDone={onDone} />
      </ContentDbContext.Provider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Дальше' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
