import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter as BaseMemoryRouter, Routes, Route } from 'react-router-dom';
import type { ComponentProps } from 'react';
import { ContentDbContext } from '@/ui/ContentDbProvider';

const FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true } as const;
const MemoryRouter = (props: ComponentProps<typeof BaseMemoryRouter>) => (
  <BaseMemoryRouter future={FUTURE} {...props} />
);

const furiganaSetting: { value: boolean } = { value: true };
const readIds: { value: string[] } = { value: [] };
const setSetting = vi.fn((key: string, value: unknown) => {
  if (key === 'texts_read_ids') readIds.value = value as string[];
});
const cards = new Map<string, unknown>();
const getCard = vi.fn((t: string, i: string) => cards.get(`${t}:${i}`) ?? null);
const upsertCard = vi.fn((c: { item_type: string; item_id: string }) => {
  cards.set(`${c.item_type}:${c.item_id}`, c);
});
vi.mock('@/ui/useUserDb', () => ({
  useUserDb: () => ({
    getSetting: (key: string, fallback: unknown) => {
      if (key === 'furigana_enabled') return furiganaSetting.value;
      if (key === 'texts_read_ids') return readIds.value;
      return fallback;
    },
    setSetting,
    getCard,
    upsertCard,
  }),
}));

import { TextDetailScreen } from '@/ui/screens/TextDetailScreen';
import type { Level, LessonFull, VocabPoint } from '@/core/types';

const levels: Level[] = [{ code: 'N5', ord: 1, status: 'available', titleRu: 'N5' }];
const sample: LessonFull = {
  id: 'n5-sample',
  stage: 3,
  kind: 'text',
  title: 'サンプル',
  bodyRuby: 'これは 文[ぶん]です。\n\n二[ふた]つ目[め]の 段落[だんらく]です。',
  translationRu: 'Это предложение.\n\nВторой абзац.',
  questions: [
    { prompt: 'Вопрос 1?', choices: ['A', 'B', 'C'], answerIndex: 1 },
    { prompt: 'Вопрос 2?', choices: ['D', 'E', 'F'], answerIndex: 0 },
  ],
};
const bunVocab: VocabPoint = {
  id: 'n5-文-ぶん', level: 'N5', headword: '文', reading: 'ぶん', pos: 'сущ.', meaningRu: 'предложение',
};
const vocabPool: { value: VocabPoint[] } = { value: [] };
const fakeDb = {
  getLesson: (id: string) => (id === sample.id ? sample : null),
  listVocab: () => vocabPool.value,
} as unknown as import('@/storage/content-db').ContentDb;

function renderAt(path: string) {
  return render(
    <ContentDbContext.Provider value={{ db: fakeDb, levels }}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/texts/:id" element={<TextDetailScreen />} />
        </Routes>
      </MemoryRouter>
    </ContentDbContext.Provider>,
  );
}

describe('TextDetailScreen', () => {
  beforeEach(() => {
    furiganaSetting.value = true;
    readIds.value = [];
    setSetting.mockClear();
    cards.clear();
    getCard.mockClear();
    upsertCard.mockClear();
    vocabPool.value = [];
  });

  it('renders the title and both paragraphs with furigana', () => {
    const { container } = renderAt('/texts/n5-sample');
    expect(screen.getByRole('heading', { name: 'サンプル' })).toBeInTheDocument();
    expect(container.querySelectorAll('.text-paragraph')).toHaveLength(2);
    expect(container.querySelector('ruby')).not.toBeNull();
  });

  it('shows a not-found message for an unknown id', () => {
    renderAt('/texts/does-not-exist');
    expect(screen.getByText(/не найден/i)).toBeInTheDocument();
  });

  it('reveals the translation only after clicking the button', () => {
    renderAt('/texts/n5-sample');
    expect(screen.queryByText('Это предложение.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Показать перевод' }));
    expect(screen.getByText('Это предложение.')).toBeInTheDocument();
    expect(screen.getByText('Второй абзац.')).toBeInTheDocument();
  });

  it('walks through questions one at a time and marks the text as read on completion', () => {
    renderAt('/texts/n5-sample');
    expect(screen.getByText('Вопрос 1?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'B' }));
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));

    expect(screen.getByText('Вопрос 2?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'D' }));
    fireEvent.click(screen.getByRole('button', { name: 'Завершить' }));

    expect(screen.getByText(/Текст прочитан/)).toBeInTheDocument();
    expect(setSetting).toHaveBeenCalledWith('texts_read_ids', ['n5-sample']);
  });

  it('does not add a duplicate entry when the text id is already in texts_read_ids', () => {
    readIds.value = ['n5-sample'];
    renderAt('/texts/n5-sample');
    fireEvent.click(screen.getByRole('button', { name: 'B' }));
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));
    fireEvent.click(screen.getByRole('button', { name: 'D' }));
    fireEvent.click(screen.getByRole('button', { name: 'Завершить' }));
    expect(setSetting).not.toHaveBeenCalledWith('texts_read_ids', expect.anything());
  });

  it('highlights the correct and wrong choice after answering', () => {
    const { container } = renderAt('/texts/n5-sample');
    fireEvent.click(screen.getByRole('button', { name: 'A' })); // wrong, correct is B
    const opts = container.querySelectorAll('.q-opt');
    expect(opts[0]).toHaveClass('opt-wrong');
    expect(opts[1]).toHaveClass('opt-correct');
  });

  it('shows a text verdict, not colour alone, after answering', () => {
    renderAt('/texts/n5-sample');
    fireEvent.click(screen.getByRole('button', { name: 'A' })); // wrong, correct is B
    expect(screen.getByRole('status')).toHaveTextContent('Неверно');

    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));
    fireEvent.click(screen.getByRole('button', { name: 'D' })); // correct, answerIndex 0
    expect(screen.getByRole('status')).toHaveTextContent('Верно');
  });

  it('links back to the texts list', () => {
    renderAt('/texts/n5-sample');
    expect(screen.getByRole('link', { name: /тексты/i })).toHaveAttribute('href', '/texts');
  });

  it('lists a word spotted in the text and creates a rating-3 card (no review log) on add', () => {
    vocabPool.value = [bunVocab];
    renderAt('/texts/n5-sample'); // body contains 文[ぶん]
    expect(screen.getByRole('heading', { name: /слова в этом тексте/i })).toBeInTheDocument();
    const addBtn = screen.getByRole('button', { name: '+ добавить' });
    fireEvent.click(addBtn);
    expect(upsertCard).toHaveBeenCalledTimes(1);
    const cardArg = upsertCard.mock.calls[0]![0] as { item_type: string; item_id: string; reps: number };
    expect(cardArg.item_type).toBe('vocab');
    expect(cardArg.item_id).toBe('n5-文-ぶん');
    expect(cardArg.reps).toBe(1); // one rating-3 review happened
    expect(screen.getByRole('button', { name: '✓ добавлено' })).toBeDisabled();
  });

  it('does not list a word that already has a card', () => {
    cards.set('vocab:n5-文-ぶん', { item_type: 'vocab', item_id: 'n5-文-ぶん' });
    vocabPool.value = [bunVocab];
    renderAt('/texts/n5-sample');
    expect(screen.queryByRole('heading', { name: /слова в этом тексте/i })).toBeNull();
  });

  it('shows no words-in-text section when nothing in the pool matches', () => {
    vocabPool.value = [];
    renderAt('/texts/n5-sample');
    expect(screen.queryByRole('heading', { name: /слова в этом тексте/i })).toBeNull();
  });
});
