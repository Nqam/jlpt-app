import { test, expect, _electron as electron } from '@playwright/test';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

test('the Kanji reference header opens the kanji section test', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'jlpt-e2e-placement-kanji-'));
  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/main.js'), `--user-data-dir=${userData}`],
  });
  const win = await app.firstWindow();
  await win.waitForSelector('[data-testid="user-db-ready"]', { state: 'attached', timeout: 20_000 });

  // Dismiss the first-run offer so the nav is usable.
  if (await win.getByRole('button', { name: /пропустить/i }).count()) {
    await win.getByRole('button', { name: /пропустить/i }).click();
  }

  await win.getByRole('link', { name: /^кандзи$/i }).first().click();
  await win.getByRole('link', { name: /пройти тест по разделу/i }).click();

  await expect(win.getByRole('heading', { name: /тест: кандзи/i })).toBeVisible();
  await expect(win.getByRole('button', { name: /10\s*%/ })).toBeVisible();
  await expect(win.getByRole('button', { name: /100\s*%/ })).toBeVisible();

  await app.close();
});
