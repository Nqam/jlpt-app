import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { LessonQuestion } from '@/core/types';
import { ComprehensionQuiz } from '@/ui/components/ComprehensionQuiz';

const qs: LessonQuestion[] = [
  { prompt: 'Вопрос 1?', choices: ['A', 'B', 'C'], answerIndex: 1 },
  { prompt: 'Вопрос 2?', choices: ['D', 'E', 'F'], answerIndex: 0 },
];

describe('ComprehensionQuiz', () => {
  it('walks questions one at a time and finishes on the last', () => {
    const onFinish = vi.fn();
    render(<ComprehensionQuiz questions={qs} onFinish={onFinish} />);
    expect(screen.getByText('Вопрос 1?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'A' })); // wrong
    expect(screen.getByRole('status')).toHaveTextContent('Неверно');
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));

    expect(screen.getByText('Вопрос 2?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'D' })); // correct
    expect(screen.getByRole('status')).toHaveTextContent('Верно');
    fireEvent.click(screen.getByRole('button', { name: 'Завершить' }));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('marks the correct and picked-wrong choice after answering', () => {
    const { container } = render(<ComprehensionQuiz questions={qs} onFinish={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    const opts = container.querySelectorAll('.q-opt');
    expect(opts[0]).toHaveClass('opt-wrong');
    expect(opts[1]).toHaveClass('opt-correct');
  });
});
