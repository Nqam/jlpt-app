import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/ui/useUserDb', () => ({ useUserDb: () => ({}) }));
vi.mock('@/ui/useContentDb', () => ({
  useContentDb: () => ({}),
  useLevels: () => [
    { code: 'N5', status: 'available', ord: 1, titleRu: 'N5' },
    { code: 'N4', status: 'coming_soon', ord: 2, titleRu: 'N4' },
  ],
}));
vi.mock('@/core/progress', () => ({
  levelRibbon: () => [
    { code: 'N5', status: 'available', fill: 0.25 },
    { code: 'N4', status: 'coming_soon', fill: 0 },
  ],
  levelBars: () => ({ studied: 0.5, consolidated: 0.25, total: 8 }),
  statusCounts: () => ({ new: 4, learning: 2, learned: 1, mastered: 1 }),
  streak: () => ({ current: 3, best: 7 }),
  heatmap: () => Array.from({ length: 119 }, (_, i) => ({ dayKey: `d${i}`, count: i % 3 })),
}));

import { ProgressScreen } from '@/ui/screens/ProgressScreen';

describe('ProgressScreen', () => {
  it('renders ribbon, bars, counts, streak, heatmap and the unlock rule', () => {
    render(<ProgressScreen />);
    expect(screen.getByText('N5')).toBeTruthy();
    expect(screen.getByText('N4')).toBeTruthy();
    expect(screen.getAllByText(/Изучено/).length).toBeGreaterThan(0); // bar + status label
    expect(screen.getByText(/Закреплено/)).toBeTruthy();
    expect(screen.getByText(/Изучаются 2/)).toBeTruthy(); // Russian status labels
    expect(screen.getByText(/Освоено 1/)).toBeTruthy();
    expect(screen.getByText(/стрик 3/i)).toBeTruthy();
    expect(screen.getByText(/рекорд 7/i)).toBeTruthy();
    expect(screen.getByText(/60 %/)).toBeTruthy(); // N4 unlock rule
    expect(screen.getAllByTestId('heat-cell').length).toBe(119);
  });
});
