import { test, expect, _electron as electron } from '@playwright/test';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { writeSeededUserDb } from './helpers/seed-user-db';

test('first run shows new cards on Today and persists across restart', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'jlpt-e2e-'));
  await writeSeededUserDb(userData, { learnedIds: [], dueIds: [], placementOffered: true });
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
  await expect(win.getByText(/5 новых/)).toBeVisible({ timeout: 20_000 });
  await app.close();

  // reopen: user.db now exists on disk, still 5 new (nothing reviewed), no crash
  app = await launch();
  win = await app.firstWindow();
  await win.waitForSelector('[data-testid="user-db-ready"]', {
    state: 'attached',
    timeout: 20_000,
  });
  await expect(win.getByText(/5 новых/)).toBeVisible({ timeout: 20_000 });
  await app.close();
});
