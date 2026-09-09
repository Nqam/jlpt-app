import { test, expect, _electron as electron } from '@playwright/test';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { writeSeededUserDb } from './helpers/seed-user-db';

test('the Тексты section: read a text, its ✓ shows on the list, and /lesson/:id redirects to /texts/:id', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'jlpt-e2e-texts-'));
  await writeSeededUserDb(userData, { learnedIds: [], dueIds: [] });
  const args = [join(process.cwd(), 'out/main/main.js'), `--user-data-dir=${userData}`];

  let app = await electron.launch({ args });
  let win = await app.firstWindow();
  await win.waitForSelector('[data-testid="user-db-ready"]', { state: 'attached', timeout: 20_000 });

  // The "Тексты" nav item opens the restored free-reading list (separate from "Курс").
  await win.getByRole('link', { name: /^Тексты$/ }).click();
  await expect(win.getByRole('heading', { name: 'Тексты' })).toBeVisible();
  await expect(win.locator('.text-read-badge')).toHaveCount(0);

  // Open the first text (n5-hanami / お花見, stage 2) and answer its questions.
  await win.locator('.text-list-item').first().click();
  await expect(win.getByRole('heading', { name: 'お花見' })).toBeVisible();

  for (;;) {
    await win.locator('.q-opt').first().click();
    await win.getByRole('button', { name: /^(Далее|Завершить)$/ }).click();
    if (await win.getByText(/прочитан/i).isVisible().catch(() => false)) break;
  }
  await expect(win.getByText(/прочитан/i)).toBeVisible();

  // Back on the list the read mark shows against that text.
  await win.getByRole('link', { name: /^←\s*Тексты$/ }).click();
  await expect(
    win.locator('.text-list-item').first().locator('[aria-label="прочитано"]'),
  ).toBeVisible();

  // NOTE: cross-restart persistence of the ✓ is deferred — the current tree's
  // `migrateTextsRead` (course.ts, out of this task's scope) drains
  // `texts_read_ids` into `course_completed_ids` on the next launch. Task 8's
  // `migrateCourseKeys` reverses that; Task 10's course walk re-asserts persistence.
  await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]?.close(); });
  await app.close();

  app = await electron.launch({ args });
  win = await app.firstWindow();
  await win.waitForSelector('[data-testid="user-db-ready"]', { state: 'attached', timeout: 20_000 });

  // Old lesson-player URLs now resolve to the text reader.
  await win.evaluate(() => { window.location.hash = '#/lesson/n5-hanami'; });
  await expect(win.getByRole('heading', { name: 'お花見' })).toBeVisible();
  await expect(win).toHaveURL(/#\/texts\/n5-hanami$/);

  await app.close();
});
