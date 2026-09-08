import { test, expect, _electron as electron } from '@playwright/test';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { writeSeededUserDb } from './helpers/seed-user-db';

// Plan 4g: a fresh user (0% N5 completion) sees N4 locked across the reference
// screens. The Progress screen carries an "Открыть N4 сейчас" escape hatch that
// writes settings.unlocked_levels; this must take effect immediately and
// survive an app restart.
test('N4 is locked for a fresh user and opens from the Progress screen, surviving restart', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'jlpt-e2e-unlock-'));
  await writeSeededUserDb(userData, { learnedIds: [], dueIds: [], placementOffered: true });

  const launch = () =>
    electron.launch({
      args: [join(process.cwd(), 'out/main/main.js'), `--user-data-dir=${userData}`],
    });

  const app = await launch();
  const win = await app.firstWindow();
  await win.waitForSelector('[data-testid="user-db-ready"]', { state: 'attached', timeout: 20_000 });

  // N4 grammar tab is locked: hint copy shown, no list rendered.
  await win.getByRole('link', { name: /Грамматика/ }).click();
  await win.getByRole('tab', { name: /^N4$/ }).click();
  await expect(win.getByText(/откроется после 90%/i)).toBeVisible();
  await expect(win.locator('.grammar-list-item')).toHaveCount(0);

  // Unlock from the Progress screen.
  await win.getByRole('link', { name: /Прогресс/ }).click();
  await win.getByRole('button', { name: /Открыть N4 сейчас/i }).click();

  // N4 grammar list is now populated.
  await win.getByRole('link', { name: /Грамматика/ }).click();
  await win.getByRole('tab', { name: /^N4$/ }).click();
  await expect(win.getByText(/откроется после 90%/i)).toHaveCount(0);
  await expect(win.locator('.grammar-list-item').first()).toBeVisible();

  // Close the window the way the X-button does, so the close-event flush lands
  // the settings write (the 500 ms debounce timer has not fired yet).
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.close();
  });
  await app.close();

  // The unlock persists across a restart.
  const app2 = await launch();
  const win2 = await app2.firstWindow();
  await win2.waitForSelector('[data-testid="user-db-ready"]', { state: 'attached', timeout: 20_000 });
  await win2.getByRole('link', { name: /Грамматика/ }).click();
  await win2.getByRole('tab', { name: /^N4$/ }).click();
  await expect(win2.getByText(/откроется после 90%/i)).toHaveCount(0);
  await expect(win2.locator('.grammar-list-item').first()).toBeVisible();
  await app2.close();
});
