import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter as BaseMemoryRouter } from 'react-router-dom';
import type { ComponentProps } from 'react';
import { Nav } from '@/ui/components/Nav';

const FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true } as const;
const MemoryRouter = (props: ComponentProps<typeof BaseMemoryRouter>) => (
  <BaseMemoryRouter future={FUTURE} {...props} />
);

function setWidth(w: number) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: w });
  window.dispatchEvent(new Event('resize'));
}

describe('Nav', () => {
  beforeEach(() => setWidth(1200));

  it('is a sidebar on wide viewports', () => {
    const { container } = render(
      <MemoryRouter><Nav /></MemoryRouter>,
    );
    expect(container.querySelector('nav')!.getAttribute('data-variant')).toBe('sidebar');
  });

  it('is a bottom bar on narrow viewports', () => {
    setWidth(400);
    const { container } = render(
      <MemoryRouter><Nav /></MemoryRouter>,
    );
    expect(container.querySelector('nav')!.getAttribute('data-variant')).toBe('bottom');
  });

  it('lists the seven primary destinations', () => {
    const { getByRole } = render(<MemoryRouter><Nav /></MemoryRouter>);
    for (const label of ['Сегодня', 'Грамматика', 'Кандзи', 'Слова', 'Курс', 'Тексты', 'Прогресс']) {
      expect(getByRole('link', { name: new RegExp(label) })).toBeTruthy();
    }
  });
});
