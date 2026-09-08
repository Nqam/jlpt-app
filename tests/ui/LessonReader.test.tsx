import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ContentDbContext } from '@/ui/ContentDbProvider';
import type { Level, LessonFull } from '@/core/types';

vi.mock('@/ui/useUserDb', () => ({ useUserDb: () => ({ getSetting: (_k: string, fb: unknown) => fb }) }));

import { LessonReader } from '@/ui/components/LessonReader';

const levels: Level[] = [{ code: 'N5', ord: 1, status: 'available', titleRu: 'N5' }];
const fakeDb = {
  getVocab: (id: string) =>
    id === 'v-asa' ? { id, headword: '朝', reading: 'あさ', pos: 'сущ.', meaningRu: 'утро', level: 'N5' } : null,
  getGrammar: () => null,
  getKanji: () => null,
} as unknown as import('@/storage/content-db').ContentDb;

const base = (over: Partial<LessonFull> = {}): LessonFull => ({
  id: 'l1', stage: 3, kind: 'text', title: 'T', introducesCount: 0, isFreeReading: true,
  bodyRuby: '毎朝[まいあさ] 朝[あさ]を 食[た]べます。\n\n二[ふた]つ目[め]。',
  translationRu: 'Каждое утро ем завтрак.\n\nВторой абзац.',
  questions: [], introduces: [], markers: [], ...over,
});

function renderReader(lesson: LessonFull) {
  return render(
    <ContentDbContext.Provider value={{ db: fakeDb, levels }}>
      <LessonReader lesson={lesson} />
    </ContentDbContext.Provider>,
  );
}

describe('LessonReader', () => {
  it('renders body paragraphs with furigana and hides the translation until toggled', () => {
    const { container } = renderReader(base());
    expect(container.querySelectorAll('.lesson-read-paragraph')).toHaveLength(2);
    expect(container.querySelector('ruby')).not.toBeNull();
    expect(screen.queryByText('Каждое утро ем завтрак.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Показать перевод' }));
    expect(screen.getByText('Каждое утро ем завтрак.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Скрыть перевод' }));
    expect(screen.queryByText('Каждое утро ем завтрак.')).toBeNull();
  });

  it('renders dialogue lines as speaker bubbles', () => {
    const { container } = renderReader(base({
      kind: 'dialogue',
      bodyRuby: 'A: おはよう。\n\nB: おはようございます。',
      translationRu: 'A: Доброе утро.\n\nB: Доброе утро (вежл.).',
    }));
    const bubbles = container.querySelectorAll('.dialogue-line');
    expect(bubbles).toHaveLength(2);
    expect(bubbles[0]).toHaveAttribute('data-speaker', 'A');
  });

  it('a marked surface is a button that opens a gloss card', () => {
    renderReader(base({
      markers: [{
        type: 'vocab', id: 'v-asa', surface: '朝[あさ]',
        sentenceRuby: '毎朝[まいあさ] 朝[あさ]を 食[た]べます。', sentenceRu: 'Каждое утро ем завтрак.',
      }],
    }));
    const marker = screen.getByRole('button', { name: /朝/ });
    fireEvent.click(marker);
    expect(screen.getByText(/あさ — утро/)).toBeInTheDocument();
  });

  it('a marker whose surface is absent from the body renders no tap target and does not throw', () => {
    expect(() =>
      renderReader(base({
        markers: [{ type: 'vocab', id: 'v-asa', surface: '存在[そんざい]しない', sentenceRuby: 'x', sentenceRu: 'y' }],
      })),
    ).not.toThrow();
    expect(screen.queryByRole('button', { name: /存在/ })).toBeNull();
  });
});
