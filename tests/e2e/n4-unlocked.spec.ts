import { test, expect, _electron as electron } from '@playwright/test';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { writeSeededUserDb } from './helpers/seed-user-db';

// N4 grammar (this plan) was the last of N4's three categories to land --
// kanji (Plan 4a-2) and vocab (Plan 4a-4) already existed but stayed hidden
// behind levels.yml's coming_soon status. This test proves the single
// per-level status flag genuinely gates all three screens together, not
// just grammar.
//
// Since Plan 4g N4 also auto-locks for a fresh user (0% N5 completion), so
// each test seeds its own profile with `unlocked_levels: ['N4']` to force
// N4 available -- mirroring texts-browse.spec.ts's per-test --user-data-dir.

test('N4 tab shows a real grammar list, not "coming soon"', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'jlpt-e2e-n4-grammar-'));
  await writeSeededUserDb(userData, { learnedIds: [], dueIds: [], unlockedLevels: ['N4'] });
  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/main.js'), `--user-data-dir=${userData}`],
  });
  const win = await app.firstWindow();
  await win.waitForSelector('[data-testid="user-db-ready"]', { state: 'attached', timeout: 20_000 });

  await win.getByRole('link', { name: /Грамматика/ }).click();
  await win.getByRole('tab', { name: /^N4$/ }).click();
  await expect(win.getByText(/появится скоро/i)).toHaveCount(0);
  await expect(win.locator('.grammar-list-item')).toHaveCount(50);

  await win.locator('.grammar-list-item').first().click();
  await expect(win.locator('.grammar-md')).toBeVisible();

  await app.close();
});

test('N4 tab shows a real kanji grid, not "coming soon"', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'jlpt-e2e-n4-kanji-'));
  await writeSeededUserDb(userData, { learnedIds: [], dueIds: [], unlockedLevels: ['N4'] });
  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/main.js'), `--user-data-dir=${userData}`],
  });
  const win = await app.firstWindow();
  await win.waitForSelector('[data-testid="user-db-ready"]', { state: 'attached', timeout: 20_000 });

  await win.getByRole('link', { name: /Кандзи/ }).click();
  await win.getByRole('tab', { name: /^N4$/ }).click();
  await expect(win.getByText(/появится скоро/i)).toHaveCount(0);
  await expect(win.locator('.kanji-grid-item')).toHaveCount(177);

  await app.close();
});

test('N4 tab shows a real vocab list, not "coming soon"', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'jlpt-e2e-n4-vocab-'));
  await writeSeededUserDb(userData, { learnedIds: [], dueIds: [], unlockedLevels: ['N4'] });
  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/main.js'), `--user-data-dir=${userData}`],
  });
  const win = await app.firstWindow();
  await win.waitForSelector('[data-testid="user-db-ready"]', { state: 'attached', timeout: 20_000 });

  await win.getByRole('link', { name: /Слова/ }).click();
  await win.getByRole('tab', { name: /^N4$/ }).click();
  await expect(win.getByText(/появится скоро/i)).toHaveCount(0);
  await expect(win.locator('.vocab-list-item')).toHaveCount(625);

  await app.close();
});
