import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { ThemeToggle } from '@/ui/components/ThemeToggle';

afterEach(() => {
  vi.restoreAllMocks();
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
  document.documentElement.removeAttribute('data-theme');
});

describe('ThemeToggle', () => {
  it('falls back to the default theme when localStorage.getItem throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    const { getByRole } = render(<ThemeToggle />);
    expect(getByRole('button').textContent).toBe('Тема: как в системе');
  });

  it('ignores an invalid stored value and uses the default theme', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('Light');
    const { getByRole } = render(<ThemeToggle />);
    expect(getByRole('button').textContent).toBe('Тема: как в системе');
  });

  it('keeps working for the session when localStorage.setItem throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota / disabled');
    });
    const { getByRole } = render(<ThemeToggle />);
    const btn = getByRole('button');
    expect(() => fireEvent.click(btn)).not.toThrow();
    expect(btn.textContent).toBe('Тема: светлая');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('restores a valid stored theme', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('dark');
    const { getByRole } = render(<ThemeToggle />);
    expect(getByRole('button').textContent).toBe('Тема: тёмная');
  });
});
