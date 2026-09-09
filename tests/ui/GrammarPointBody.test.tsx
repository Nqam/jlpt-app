import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/ui/useUserDb', () => ({
  useUserDb: () => ({ getSetting: (_key: string, fallback: unknown) => fallback }),
}));
import { render, screen } from '@testing-library/react';
import { GrammarPointBody } from '@/ui/components/GrammarPointBody';
import type { GrammarPointFull } from '@/storage/content-db';

const point = {
  id: 'n5-x', level: 'N5', title: 'X', layer: 1, tags: [], related: [], relatedTitles: [],
  kanjiIds: [],
  bodyMarkdown: '## Кратко\n\nКраткое объяснение.\n\n## Частые ошибки\n\nОшибка.',
  examples: [{ jaRuby: '学校[がっこう]。', ru: 'Школа.' }],
} as GrammarPointFull;

describe('GrammarPointBody', () => {
  it('renders the markdown body and the examples list', () => {
    render(<GrammarPointBody point={point} />);
    expect(screen.getByText(/Краткое объяснение/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Примеры' })).toBeInTheDocument();
    expect(screen.getByText('Школа.')).toBeInTheDocument();
  });
});
