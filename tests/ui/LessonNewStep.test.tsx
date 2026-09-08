import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ContentDbContext } from '@/ui/ContentDbProvider';
import type { Level, LessonIntroduce } from '@/core/types';

vi.mock('@/ui/useUserDb', () => ({ useUserDb: () => ({ getSetting: (_k: string, fb: unknown) => fb }) }));

import { LessonNewStep } from '@/ui/components/LessonNewStep';

const levels: Level[] = [{ code: 'N5', ord: 1, status: 'available', titleRu: 'N5' }];
const fakeDb = {
  getGrammar: (id: string) =>
    id === 'g1' ? { id, title: 'は (тема)', bodyMarkdown: '## Кратко\nМаркер темы предложения.\n\n## Примеры\n- x' } : null,
  getVocab: (id: string) =>
    id === 'v1' ? { id, headword: '朝', reading: 'あさ', pos: 'сущ.', meaningRu: 'утро', level: 'N5' } : null,
  getKanji: (id: string) =>
    id === 'k1' ? { id, char: '朝', onyomi: ['チョウ'], kunyomi: ['あさ'], meaningRu: 'утро', strokeCount: 12, level: 'N5' } : null,
} as unknown as import('@/storage/content-db').ContentDb;

function renderStep(introduces: LessonIntroduce[], onDone = vi.fn()) {
  const utils = render(
    <ContentDbContext.Provider value={{ db: fakeDb, levels }}>
      <LessonNewStep introduces={introduces} onDone={onDone} />
    </ContentDbContext.Provider>,
  );
  return { ...utils, onDone };
}

describe('LessonNewStep', () => {
  it('shows the grammar "Кратко" text read-only (no reveal button for it)', () => {
    renderStep([{ type: 'grammar', id: 'g1', role: 'introduce' }]);
    expect(screen.getByText(/Маркер темы предложения/)).toBeInTheDocument();
  });

  it('calls onDone only after every vocab/kanji flash card is marked "Понятно"', () => {
    const { onDone } = renderStep([
      { type: 'vocab', id: 'v1', role: 'introduce' },
      { type: 'kanji', id: 'k1', role: 'introduce' },
    ]);
    // card 1
    fireEvent.click(screen.getByRole('button', { name: 'Показать' }));
    fireEvent.click(screen.getByRole('button', { name: 'Понятно' }));
    expect(onDone).not.toHaveBeenCalled();
    // card 2
    fireEvent.click(screen.getByRole('button', { name: 'Показать' }));
    fireEvent.click(screen.getByRole('button', { name: 'Понятно' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('"Ещё раз" requeues the card so onDone waits for it', () => {
    const { onDone } = renderStep([{ type: 'vocab', id: 'v1', role: 'introduce' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Показать' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ещё раз' }));
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Показать' }));
    fireEvent.click(screen.getByRole('button', { name: 'Понятно' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('calls onDone immediately when there are only grammar introduces (no flash cards)', () => {
    const { onDone } = renderStep([{ type: 'grammar', id: 'g1', role: 'introduce' }]);
    fireEvent.click(screen.getByRole('button', { name: /Дальше|Продолжить/ }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
