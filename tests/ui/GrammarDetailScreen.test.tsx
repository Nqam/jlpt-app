import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/ui/useUserDb', () => ({
  useUserDb: () => ({ getSetting: (_key: string, fallback: unknown) => fallback }),
}));
import { render } from '@testing-library/react';
import { MemoryRouter as BaseMemoryRouter, Routes, Route } from 'react-router-dom';
import type { ComponentProps } from 'react';
import { ContentDbContext } from '@/ui/ContentDbProvider';

const FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true } as const;
const MemoryRouter = (props: ComponentProps<typeof BaseMemoryRouter>) => (
  <BaseMemoryRouter future={FUTURE} {...props} />
);
import { GrammarDetailScreen } from '@/ui/screens/GrammarDetailScreen';
import type { Level } from '@/core/types';
import type { GrammarPointFull } from '@/storage/content-db';

const levels: Level[] = [{ code: 'N5', ord: 1, status: 'available', titleRu: 'N5' }];

const wa: GrammarPointFull = {
  id: 'n5-wa-particle',
  level: 'N5',
  title: 'は (тема предложения)',
  layer: 1,
  tags: [],
  related: ['n5-ka-question'],
  bodyMarkdown: [
    '## Кратко',
    '',
    'Частица は помечает тему предложения.',
    '',
    '## Примеры',
    '',
    '- 私[わたし]は 学生[がくせい]です。 — Я студент.',
    '',
    '## Частые ошибки',
    '',
    '- Произносить は как «ha»: как частица — всегда «wa».',
  ].join('\n'),
  examples: [{ jaRuby: '私[わたし]は 学生[がくせい]です。', ru: 'Я студент.' }],
  relatedTitles: [{ id: 'n5-ka-question', title: 'か (вопросительная частица)' }],
  kanjiIds: [],
};

const fakeDb = {
  listLevels: () => levels,
  getGrammar: (id: string) => (id === wa.id ? wa : null),
} as unknown as import('@/storage/content-db').ContentDb;

function renderAt(path: string) {
  return render(
    <ContentDbContext.Provider value={{ db: fakeDb, levels }}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/grammar/:id" element={<GrammarDetailScreen />} />
        </Routes>
      </MemoryRouter>
    </ContentDbContext.Provider>,
  );
}

describe('GrammarDetailScreen', () => {
  it('renders the title with a level badge', () => {
    const { getByRole } = renderAt('/grammar/n5-wa-particle');
    expect(getByRole('heading', { name: /は \(тема предложения\)/ })).toBeInTheDocument();
  });

  it('drops only the "Примеры" section from the markdown, keeping "Частые ошибки"', () => {
    const { container } = renderAt('/grammar/n5-wa-particle');
    const md = container.querySelector('.grammar-md')!;
    expect(md).toHaveTextContent('помечает тему предложения');
    // the "## Примеры" section itself is excised (rendered separately with furigana)
    expect(md.textContent).not.toContain('Я студент');
    expect([...md.querySelectorAll('h2')].map((h) => h.textContent)).not.toContain('Примеры');
    // ...but the mandatory "## Частые ошибки" section AFTER it survives
    expect(md).toHaveTextContent('Частые ошибки');
    expect(md).toHaveTextContent('как частица — всегда «wa»');
  });

  it('renders examples with furigana ruby', () => {
    const { container } = renderAt('/grammar/n5-wa-particle');
    const exampleRuby = container.querySelector('.examples ruby');
    expect(exampleRuby).not.toBeNull();
    expect(exampleRuby!.querySelector('rt')!.textContent).toBe('わたし');
  });

  it('links to related grammar points', () => {
    const { getByRole } = renderAt('/grammar/n5-wa-particle');
    const link = getByRole('link', { name: /か \(вопросительная частица\)/ });
    expect(link).toHaveAttribute('href', '/grammar/n5-ka-question');
  });

  it('shows a not-found message for an unknown id', () => {
    const { getByText } = renderAt('/grammar/does-not-exist');
    expect(getByText(/не найден/i)).toBeInTheDocument();
  });
});
