import { test, expect, _electron as electron } from '@playwright/test';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

test('changing settings on the Settings screen persists across app restarts', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'jlpt-e2e-settings-'));
  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/main.js'), `--user-data-dir=${userData}`],
  });
  const win = await app.firstWindow();
  await win.waitForSelector('[data-testid="user-db-ready"]', { state: 'attached', timeout: 20_000 });

  await win.getByRole('link', { name: /настройки/i }).click();
  await win.getByLabel(/новых карточек в день/i).fill('8');
  await win.getByLabel(/показывать фуригану/i).uncheck();

  await app.close();

  const app2 = await electron.launch({
    args: [join(process.cwd(), 'out/main/main.js'), `--user-data-dir=${userData}`],
  });
  const win2 = await app2.firstWindow();
  await win2.waitForSelector('[data-testid="user-db-ready"]', { state: 'attached', timeout: 20_000 });
  await win2.getByRole('link', { name: /настройки/i }).click();
  await expect(win2.getByLabel(/новых карточек в день/i)).toHaveValue('8');
  await expect(win2.getByLabel(/показывать фуригану/i)).not.toBeChecked();
  await app2.close();
});
