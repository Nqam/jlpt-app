import { test, expect, _electron as electron } from '@playwright/test';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { writeSeededUserDb } from './helpers/seed-user-db';

// Each test gets its own fresh --user-data-dir (mirroring persist.spec.ts /
// placement.spec.ts / kanji-review.spec.ts): unlike Chromium, Playwright's
// Electron launcher does NOT auto-generate an isolated profile per
// electron.launch() call, so without this every launch shares the OS-default
// userData directory and its persisted user.db. The first test below asserts
// on exactly that persisted state (texts_read_ids -> the read badge
// surviving a back-navigation), so a shared profile would make it flaky
// (or silently pass for the wrong reason) once any prior run had already
// marked n5-kitsune-to-tsuru as read.

test('browse texts: list -> detail -> reveal translation -> answer questions -> read badge', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'jlpt-e2e-texts-browse-'));
  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/main.js'), `--user-data-dir=${userData}`],
  });
  const win = await app.firstWindow();
  await win.waitForSelector('[data-testid="user-db-ready"]', { state: 'attached', timeout: 20_000 });

  await win.getByRole('link', { name: /Тексты/ }).click();
  await expect(win.getByRole('heading', { name: 'Тексты' })).toBeVisible();

  const items = win.locator('.text-list-item');
  await expect(items).toHaveCount(9); // 9 N5 texts

  await win.getByRole('link', { name: /キツネとツル/ }).click();
  await expect(win.getByRole('heading', { name: 'キツネとツル' })).toBeVisible();

  await win.getByRole('button', { name: 'Показать перевод' }).click();
  await expect(win.getByText(/Давным-давно/)).toBeVisible();

  // Answer all 4 comprehension questions, always picking the first choice,
  // then advancing -- the point is to reach the "read" end state, not to
  // score correctly.
  for (let i = 0; i < 4; i++) {
    await win.locator('.q-opt').first().click();
    await win.getByRole('button', { name: /Далее|Завершить/ }).click();
  }

  await expect(win.getByText(/Текст прочитан/)).toBeVisible();

  await win.locator('.back-link').click();
  await expect(win.getByRole('heading', { name: 'Тексты' })).toBeVisible();
  await expect(win.locator('.text-read-badge')).toHaveCount(1);

  await app.close();
});

test('switching to the N4 tab shows N4 texts', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'jlpt-e2e-texts-n4-'));
  // N4 auto-locks for a fresh user (Plan 4g); force it open so the N4 tab lists.
  await writeSeededUserDb(userData, { learnedIds: [], dueIds: [], unlockedLevels: ['N4'] });
  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/main.js'), `--user-data-dir=${userData}`],
  });
  const win = await app.firstWindow();
  await win.waitForSelector('[data-testid="user-db-ready"]', { state: 'attached', timeout: 20_000 });

  await win.getByRole('link', { name: /Тексты/ }).click();
  await win.getByRole('tab', { name: 'N4' }).click();
  await expect(win.locator('.text-list-item')).toHaveCount(6);

  await app.close();
});
