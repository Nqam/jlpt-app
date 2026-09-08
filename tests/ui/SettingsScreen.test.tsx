import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const settings: Record<string, unknown> = {
  new_per_day: 5,
  review_queue_cap: 100,
  furigana_enabled: true,
};
const setSetting = vi.fn((key: string, value: unknown) => {
  settings[key] = value;
});
const deleteCard = vi.fn();
const exportBytes = new Uint8Array([1, 2, 3]);
const validateImportBytes = vi.fn(async (bytes: Uint8Array) => bytes.length > 0);
vi.mock('@/ui/useUserDb', () => ({
  useUserDb: () => ({
    getSetting: (key: string, fallback: unknown) => settings[key] ?? fallback,
    setSetting,
    deleteCard,
    export: () => exportBytes,
    validateImportBytes,
  }),
}));

const GRAMMAR_POINTS: Record<string, { level: string }> = {
  'n5-a': { level: 'N5' }, 'n5-b': { level: 'N5' }, 'n4-a': { level: 'N4' },
};
vi.mock('@/ui/useContentDb', () => ({
  useContentDb: () => ({
    getGrammar: (id: string) => GRAMMAR_POINTS[id] ?? null,
  }),
}));

const exportUserDb = vi.fn(async () => true);
const importUserDb = vi.fn(async (): Promise<Uint8Array | null> => null);
const writeUserDb = vi.fn(async () => {});
const checkForUpdate = vi.fn(
  async (): Promise<{ latest: string; url: string } | null> => null,
);
const openExternal = vi.fn(async () => {});
vi.mock('@/platform', () => ({
  getPlatformAdapter: () => ({
    exportUserDb,
    importUserDb,
    writeUserDb,
    checkForUpdate,
    openExternal,
  }),
}));

import { SettingsScreen } from '@/ui/screens/SettingsScreen';
const renderScreen = () => render(<MemoryRouter><SettingsScreen /></MemoryRouter>);

describe('SettingsScreen', () => {
  beforeEach(() => {
    settings['new_per_day'] = 5;
    settings['review_queue_cap'] = 100;
    settings['furigana_enabled'] = true;
    settings['placement_marked_ids'] = [];
    setSetting.mockClear();
    deleteCard.mockClear();
    exportUserDb.mockClear();
    importUserDb.mockClear();
    writeUserDb.mockClear();
    validateImportBytes.mockClear();
    checkForUpdate.mockClear();
    checkForUpdate.mockResolvedValue(null);
    openExternal.mockClear();
    vi.stubGlobal('confirm', vi.fn(() => true));
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: vi.fn() },
      writable: true,
    });
  });

  it('renders current setting values', () => {
    renderScreen();
    expect(screen.getByLabelText(/новых карточек в день/i)).toHaveValue(5);
    expect(screen.getByLabelText(/предел повторений/i)).toHaveValue(100);
    expect(screen.getByLabelText(/показывать фуригану/i)).toBeChecked();
  });

  it('changing the daily-limit field calls setSetting with the new value', () => {
    renderScreen();
    fireEvent.change(screen.getByLabelText(/новых карточек в день/i), { target: { value: '8' } });
    expect(setSetting).toHaveBeenCalledWith('new_per_day', 8);
  });

  it('toggling furigana calls setSetting', () => {
    renderScreen();
    fireEvent.click(screen.getByLabelText(/показывать фуригану/i));
    expect(setSetting).toHaveBeenCalledWith('furigana_enabled', false);
  });

  it('export button calls adapter.exportUserDb with the current db bytes', async () => {
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: /экспортировать/i }));
    await waitFor(() => expect(exportUserDb).toHaveBeenCalledWith(exportBytes));
  });

  it('shows an error status when export fails', async () => {
    exportUserDb.mockRejectedValueOnce(new Error('disk full'));
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: /экспортировать/i }));
    await waitFor(() => expect(screen.getByText(/не удалось сохранить/i)).toBeInTheDocument());
  });

  it('import asks for confirmation, and does nothing further if it is declined', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: /импортировать/i }));
    await waitFor(() => expect(importUserDb).not.toHaveBeenCalled());
  });

  it('import writes valid bytes and reloads the page', async () => {
    importUserDb.mockResolvedValueOnce(new Uint8Array([9, 9]));
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: /импортировать/i }));
    await waitFor(() => expect(writeUserDb).toHaveBeenCalledWith(new Uint8Array([9, 9])));
    expect(window.location.reload).toHaveBeenCalled();
  });

  it('shows an error and does not write when imported bytes fail validation', async () => {
    importUserDb.mockResolvedValueOnce(new Uint8Array([])); // length 0 -> fails the fake validator
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: /импортировать/i }));
    await waitFor(() => expect(screen.getByText(/повреждён/i)).toBeInTheDocument());
    expect(writeUserDb).not.toHaveBeenCalled();
    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it('shows "up to date" when the latest release is not newer', async () => {
    checkForUpdate.mockResolvedValueOnce({ latest: '0.0.0', url: 'https://github.com/x/y/releases/latest' });
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: /проверить обновления/i }));
    await waitFor(() => expect(screen.getByText(/установлена последняя версия/i)).toBeInTheDocument());
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('offers a download-page button when a newer release exists', async () => {
    checkForUpdate.mockResolvedValueOnce({
      latest: 'v9.9.9',
      url: 'https://github.com/Nqam/jlpt-app/releases/tag/v9.9.9',
    });
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: /проверить обновления/i }));
    await waitFor(() => expect(screen.getByText(/доступна версия 9\.9\.9/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /открыть страницу загрузки/i }));
    expect(openExternal).toHaveBeenCalledWith('https://github.com/Nqam/jlpt-app/releases/tag/v9.9.9');
  });

  it('shows a soft error when the update check fails', async () => {
    checkForUpdate.mockResolvedValueOnce(null);
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: /проверить обновления/i }));
    await waitFor(() => expect(screen.getByText(/не удалось проверить обновления/i)).toBeInTheDocument());
  });

  it('links to the placement test for a retake', () => {
    renderScreen();
    expect(screen.getByRole('link', { name: /вступительный тест/i })).toHaveAttribute(
      'href', expect.stringContaining('/placement'),
    );
  });

  it('shows no reset buttons when nothing was placement-marked', () => {
    renderScreen();
    expect(screen.queryByRole('button', { name: /сбросить результаты/i })).toBeNull();
  });

  it('shows a reset button per level with placement-marked ids, grouped correctly', () => {
    settings['placement_marked_ids'] = ['n5-a', 'n5-b', 'n4-a'];
    renderScreen();
    expect(screen.getByRole('button', { name: /сбросить результаты N5 \(2\)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /сбросить результаты N4 \(1\)/i })).toBeInTheDocument();
  });

  it('resetting a level deletes only that level\'s marked cards and updates the stored id list', () => {
    settings['placement_marked_ids'] = ['n5-a', 'n5-b', 'n4-a'];
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: /сбросить результаты N5/i }));
    expect(deleteCard).toHaveBeenCalledWith('grammar', 'n5-a');
    expect(deleteCard).toHaveBeenCalledWith('grammar', 'n5-b');
    expect(deleteCard).not.toHaveBeenCalledWith('grammar', 'n4-a');
    expect(setSetting).toHaveBeenCalledWith('placement_marked_ids', ['n4-a']);
    // N5's button disappears once its ids are gone; N4's stays.
    expect(screen.queryByRole('button', { name: /сбросить результаты N5/i })).toBeNull();
    expect(screen.getByRole('button', { name: /сбросить результаты N4/i })).toBeInTheDocument();
  });

  it('resetting a level asks for confirmation first, and does nothing if declined', () => {
    settings['placement_marked_ids'] = ['n5-a'];
    vi.stubGlobal('confirm', vi.fn(() => false));
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: /сбросить результаты N5/i }));
    expect(deleteCard).not.toHaveBeenCalled();
  });
});
