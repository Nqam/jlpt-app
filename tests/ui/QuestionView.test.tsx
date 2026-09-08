import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuestionView } from '@/ui/components/QuestionView';
import type { ClozeQuestion, AssembleQuestion, ChoiceQuestion } from '@/core/quiz/types';

vi.mock('@/ui/useUserDb', () => ({
  useUserDb: () => ({ getSetting: (_key: string, fallback: unknown) => fallback }),
}));

const cloze: ClozeQuestion = {
  id: 'g:d:cloze', itemType: 'grammar', itemId: 'n5-wa', kind: 'cloze',
  prompt: 'Выбери пропущенное слово', sentenceRuby: '私[わたし]___ 学生[がくせい]です。',
  choices: ['は', 'を', 'に', 'も'], answerIndex: 0,
};
const assemble: AssembleQuestion = {
  id: 'g:d:assemble', itemType: 'grammar', itemId: 'n5-wa', kind: 'assemble',
  prompt: 'Собери предложение',
  tokens: ['です。', 'は', '学生[がくせい]', '私[わたし]'],
  answerOrder: [3, 1, 2, 0], translationRu: 'Я студент.',
};

describe('QuestionView', () => {
  it('cloze: clicking a choice reports its index', () => {
    const onAnswer = vi.fn();
    render(<QuestionView question={cloze} onAnswer={onAnswer} revealed={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'を' }));
    expect(onAnswer).toHaveBeenCalledWith({ kind: 'index', value: 1 });
  });

  it('cloze: revealed marks the correct and the wrong-picked options', () => {
    const { rerender } = render(
      <QuestionView question={cloze} onAnswer={vi.fn()} revealed={null} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'を' })); // wrong pick
    rerender(
      <QuestionView question={cloze} onAnswer={vi.fn()} revealed={{ correct: false, rating: 1 }} />,
    );
    expect(screen.getByRole('button', { name: 'は' })).toHaveClass('opt-correct');
    expect(screen.getByRole('button', { name: 'を' })).toHaveClass('opt-wrong');
    expect(screen.getByText('Неверно')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /подробнее/i }))
      .toHaveAttribute('href', '#/grammar/n5-wa');
  });

  it('the detail link is itemType-aware, not hardcoded to grammar', () => {
    const kanjiChoice: ChoiceQuestion = {
      id: 'k:d:choice', itemType: 'kanji', itemId: 'n5-学', kind: 'choice',
      prompt: 'Что означает «学»?', choices: ['учиться', 'вода', 'один', 'дерево'], answerIndex: 0,
    };
    render(<QuestionView question={kanjiChoice} onAnswer={vi.fn()} revealed={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'учиться' }));
    const { rerender } = render(
      <QuestionView question={kanjiChoice} onAnswer={vi.fn()} revealed={{ correct: true, rating: 3 }} />,
    );
    rerender(
      <QuestionView question={kanjiChoice} onAnswer={vi.fn()} revealed={{ correct: true, rating: 3 }} />,
    );
    expect(screen.getByRole('link', { name: /подробнее/i })).toHaveAttribute('href', '#/kanji/n5-学');
  });

  it('hides the detail link when showExplainLink is false (placement test)', () => {
    render(
      <QuestionView
        question={cloze}
        onAnswer={vi.fn()}
        revealed={{ correct: false, rating: 1 }}
        showExplainLink={false}
      />,
    );
    expect(screen.getByText('Неверно')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /подробнее/i })).toBeNull();
  });

  it('assemble: Готово is disabled until all tokens are placed, then reports the order', () => {
    const onAnswer = vi.fn();
    render(<QuestionView question={assemble} onAnswer={onAnswer} revealed={null} />);
    const done = screen.getByRole('button', { name: /готово/i });
    expect(done).toBeDisabled();
    // place tokens to spell 私 は 学生 です。 -> indices 3,1,2,0
    // <Furigana> renders <ruby>私<rt>わたし</rt></ruby>; the accessible name
    // flattens to "私 わたし" (space between base and reading).
    fireEvent.click(screen.getByRole('button', { name: '私 わたし' }));
    fireEvent.click(screen.getByRole('button', { name: 'は' }));
    fireEvent.click(screen.getByRole('button', { name: '学生 がくせい' }));
    fireEvent.click(screen.getByRole('button', { name: 'です。' }));
    expect(done).toBeEnabled();
    fireEvent.click(done);
    expect(onAnswer).toHaveBeenCalledWith({ kind: 'order', value: [3, 1, 2, 0] });
  });
});
