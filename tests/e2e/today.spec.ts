import { test, expect, _electron as electron } from '@playwright/test';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { writeSeededUserDb } from './helpers/seed-user-db';

test('seeded due cards show on Today and persist across restart', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'jlpt-e2e-'));
  // The new-card drip is gone: a fresh launch shows zero review items. Seed one
  // real due grammar card so Today has something to count.
  await writeSeededUserDb(userData, { learnedIds: [], dueIds: ['n5-desu'] });
  const launch = () =>
    electron.launch({
      args: [
        join(process.cwd(), 'out/main/main.js'),
        `--user-data-dir=${userData}`,
      ],
    });

  let app = await launch();
  let win = await app.firstWindow();
  await win.waitForSelector('[data-testid="user-db-ready"]', {
    state: 'attached',
    timeout: 20_000,
  });
  await expect(win.getByText(/1 повторить · мини-тест/)).toBeVisible({ timeout: 20_000 });
  await app.close();

  // reopen: user.db now exists on disk, the card is still due (nothing was
  // reviewed), no crash.
  app = await launch();
  win = await app.firstWindow();
  await win.waitForSelector('[data-testid="user-db-ready"]', {
    state: 'attached',
    timeout: 20_000,
  });
  await expect(win.getByText(/1 повторить · мини-тест/)).toBeVisible({ timeout: 20_000 });
  await app.close();
});
