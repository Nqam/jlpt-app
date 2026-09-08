import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/ui/useUserDb', () => ({ useUserDb: () => ({}) }));

vi.mock('@/ui/useContentDb', () => ({
  useContentDb: () => ({}),
  useLevels: () => [],
  useEffectiveLevels: () => [
    { code: 'N5', ord: 1, titleRu: 'N5', status: 'available', rawStatus: 'available' },
    { code: 'N4', ord: 2, titleRu: 'N4', status: 'locked', rawStatus: 'available' },
  ],
}));

vi.mock('@/core/progress', () => ({
  levelRibbon: () => [
    { code: 'N5', status: 'available', fill: 0.4 },
    // real `levelRibbon` only ever emits the raw content flags (never 'locked');
    // the effective status from `useEffectiveLevels` says N4 is 'locked', and a
    // grandfathered user's non-zero N4 fill must be forced to 0 under that label.
    { code: 'N4', status: 'coming_soon', fill: 0.3 },
  ],
  levelBars: (_u: unknown, _c: unknown, _lvl: string, itemType: string) =>
    itemType === 'grammar'
      ? { studied: 0.5, consolidated: 0.25, total: 8 }
      : itemType === 'kanji'
        ? { studied: 0.3, consolidated: 0.1, total: 20 }
        : { studied: 0.2, consolidated: 0.05, total: 100 },
  statusCounts: () => ({ new: 4, learning: 2, learned: 1, mastered: 1 }),
  levelCompletion: () => 0.42,
  streak: () => ({ current: 3, best: 5 }),
  heatmap: () => [],
}));

const { unlockLevel } = vi.hoisted(() => ({ unlockLevel: vi.fn() }));
vi.mock('@/core/levels', () => ({ unlockLevel, UNLOCK_THRESHOLD: 0.9 }));

import { ProgressScreen } from '@/ui/screens/ProgressScreen';

function renderScreen() {
  return render(<ProgressScreen />);
}

describe('ProgressScreen', () => {
  beforeEach(() => {
    unlockLevel.mockClear();
  });

  it('renders the ribbon and both level codes', () => {
    renderScreen();
    expect(screen.getByText('N5')).toBeTruthy();
    expect(screen.getByText('N4')).toBeTruthy();
  });

  it('renders the ribbon with the EFFECTIVE level status (locked N4), forcing its fill to 0', () => {
    const { container } = renderScreen();
    const locked = container.querySelector('.ribbon-seg.locked');
    expect(locked).toBeTruthy();
    expect(locked!.textContent).toContain('N4');
    // raw levelRibbon fill for N4 was 0.3; the locked label must show an empty bar.
    const style = locked!.querySelector('.ribbon-fill')!.getAttribute('style') ?? '';
    expect(style).toContain('width: 0%');
    // and it must NOT carry the raw 'coming_soon' class
    expect(container.querySelector('.ribbon-seg.coming_soon')).toBeNull();
  });

  it('renders a progress block for each of the three categories', () => {
    renderScreen();
    expect(screen.getByRole('heading', { name: /Грамматика N5/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Кандзи N5/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Слова N5/ })).toBeTruthy();
  });

  it('renders bars and status counts inside each category block', () => {
    renderScreen();
    expect(screen.getAllByText(/Изучено/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Закреплено/).length).toBe(3);
    expect(screen.getAllByText(/Изучаются 2/).length).toBe(3);
    expect(screen.getAllByText(/Освоено 1/).length).toBe(3);
  });

  it('renders the activity streak', () => {
    renderScreen();
    expect(screen.getByText(/стрик 3/i)).toBeTruthy();
    expect(screen.getByText(/рекорд 5/i)).toBeTruthy();
  });

  it('shows the unlock control with the current percent when the next level is locked', () => {
    renderScreen();
    const rule = screen.getByText(/N4 откроется при/i);
    expect(rule.textContent).toContain('42%');
    expect(rule.textContent).toContain('90%');
    fireEvent.click(screen.getByRole('button', { name: /Открыть N4 сейчас/i }));
    expect(unlockLevel).toHaveBeenCalledWith(expect.anything(), 'N4');
  });
});
