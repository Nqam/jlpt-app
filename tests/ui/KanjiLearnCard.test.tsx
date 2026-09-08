import '@testing-library/jest-dom/vitest';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KanjiLearnCard } from '@/ui/components/KanjiLearnCard';
import type { KanjiPoint } from '@/core/types';

const gaku: KanjiPoint = {
  id: 'n5-学', level: 'N5', char: '学', onyomi: ['ガク'], kunyomi: ['まな.ぶ'], strokeCount: 8, meaningRu: 'учиться',
};
const noReadings: KanjiPoint = {
  id: 'n5-亜', level: 'N5', char: '亜', onyomi: [], kunyomi: [], strokeCount: 7, meaningRu: 'Азия',
};

describe('KanjiLearnCard', () => {
  it('shows the character, both readings, stroke count and meaning', () => {
    render(<KanjiLearnCard point={gaku} />);
    expect(screen.getByText('学')).toBeInTheDocument();
    expect(screen.getByText('ガク')).toBeInTheDocument();
    expect(screen.getByText('まな.ぶ')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('учиться')).toBeInTheDocument();
  });

  it('shows an em-dash fallback for a missing reading kind', () => {
    render(<KanjiLearnCard point={noReadings} />);
    expect(screen.getAllByText('—')).toHaveLength(2);
  });
});
