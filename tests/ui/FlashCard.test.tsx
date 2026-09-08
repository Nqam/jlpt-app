import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FlashCard } from '@/ui/components/FlashCard';

describe('FlashCard', () => {
  it('hides the back until "Показать", then offers "Понятно"/"Ещё раз"', () => {
    const onKnown = vi.fn();
    const onAgain = vi.fn();
    render(<FlashCard front={<span>おおきい</span>} back={<span>большой</span>} onKnown={onKnown} onAgain={onAgain} />);
    expect(screen.queryByText('большой')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Показать' }));
    expect(screen.getByText('большой')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Понятно' }));
    expect(onKnown).toHaveBeenCalledTimes(1);
    expect(onAgain).not.toHaveBeenCalled();
  });

  it('"Ещё раз" calls onAgain', () => {
    const onKnown = vi.fn();
    const onAgain = vi.fn();
    render(<FlashCard front={<span>f</span>} back={<span>b</span>} onKnown={onKnown} onAgain={onAgain} />);
    fireEvent.click(screen.getByRole('button', { name: 'Показать' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ещё раз' }));
    expect(onAgain).toHaveBeenCalledTimes(1);
    expect(onKnown).not.toHaveBeenCalled();
  });
});
