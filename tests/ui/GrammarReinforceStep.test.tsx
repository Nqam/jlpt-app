import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Question } from '@/core/quiz/types';
import type { GrammarPointFull } from '@/storage/content-db';

const built = vi.hoisted(() => ({ questions: [] as Question[] }));
vi.mock('@/core/quiz/grammar-reinforce', () => ({
  buildGrammarReinforce: () => built.questions,
}));
vi.mock('@/ui/useContentDb', () => ({
  useContentDb: () => ({ listGrammar: () => [], getGrammar: () => null }),
}));
vi.mock('@/ui/useUserDb', () => ({
  useUserDb: () => ({ getSetting: (_k: string, fb: unknown) => fb }),
}));

import { GrammarReinforceStep } from '@/ui/components/GrammarReinforceStep';

const point = { id: 'n5-x', level: 'N5', examples: [] } as unknown as GrammarPointFull;

const choiceQ = (id: string, prompt = 'Что выражает «X»?'): Question => ({
  id, kind: 'choice', itemType: 'grammar', itemId: 'n5-x',
  prompt, choices: ['A', 'B', 'C', 'D'], answerIndex: 0,
});

describe('GrammarReinforceStep', () => {
  beforeEach(() => {
    built.questions = [];
  });

  it('shows the question, grades an answer, and calls onDone after the last one', () => {
    built.questions = [choiceQ('q1', 'Выберите форму')];
    const onDone = vi.fn();
    render(<GrammarReinforceStep point={point} onDone={onDone} />);
    expect(screen.getByText('Выберите форму')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    expect(screen.getByText('Верно')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Завершить|Далее/ }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('renders a skip affordance and calls onDone when there are no questions', () => {
    built.questions = [];
    const onDone = vi.fn();
    render(<GrammarReinforceStep point={point} onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: 'Дальше' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('dedups questions that share (kind, prompt) — 3 identical choice prompts collapse to 1', () => {
    built.questions = [choiceQ('q1'), choiceQ('q2'), choiceQ('q3')];
    const onDone = vi.fn();
    render(<GrammarReinforceStep point={point} onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    // Deduped to a single question -> the advance button is the terminal one.
    expect(screen.getByRole('button', { name: 'Завершить' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Далее' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Завершить' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('keeps questions that differ in kind or prompt', () => {
    built.questions = [
      choiceQ('q1', 'Что выражает «X»?'),
      choiceQ('q2', 'Выберите верное продолжение'),
    ];
    render(<GrammarReinforceStep point={point} onDone={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    expect(screen.getByRole('button', { name: 'Далее' })).toBeInTheDocument();
  });
});
