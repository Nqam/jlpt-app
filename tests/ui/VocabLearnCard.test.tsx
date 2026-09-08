import '@testing-library/jest-dom/vitest';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VocabLearnCard } from '@/ui/components/VocabLearnCard';
import type { VocabPoint } from '@/core/types';

const aisatsu: VocabPoint = {
  id: 'n5-挨拶-あいさつ', level: 'N5', headword: '挨拶', reading: 'あいさつ', pos: 'сущ.', meaningRu: 'приветствие',
};
const kanaOnly: VocabPoint = {
  id: 'n5-あんな', level: 'N5', headword: 'あんな', reading: 'あんな', pos: '', meaningRu: 'такой',
};

describe('VocabLearnCard', () => {
  it('shows headword, reading, part of speech and meaning', () => {
    render(<VocabLearnCard point={aisatsu} />);
    expect(screen.getByText('挨拶')).toBeInTheDocument();
    expect(screen.getByText('Чтение')).toBeInTheDocument();
    expect(screen.getByText('あいさつ')).toBeInTheDocument();
    expect(screen.getByText('сущ.')).toBeInTheDocument();
    expect(screen.getByText('приветствие')).toBeInTheDocument();
  });

  it('hides the reading field for a kana-only word and falls back to an em-dash for empty part of speech', () => {
    render(<VocabLearnCard point={kanaOnly} />);
    expect(screen.queryByText('Чтение')).toBeNull();
    expect(screen.getAllByText('あんな')).toHaveLength(1); // headword only, reading line suppressed
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('такой')).toBeInTheDocument();
  });
});
