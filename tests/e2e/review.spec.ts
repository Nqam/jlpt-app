import { test, expect, _electron as electron } from '@playwright/test';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { writeSeededUserDb } from './helpers/seed-user-db';

test('first run: a question-based session records progress and returns to Today', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'jlpt-e2e-review-'));
  // The new-card drip is gone, so seed the review queue directly. 3 due grammar
  // cards -> a 3-step session and, since < 5 grammar are learned, no mini-test.
  await writeSeededUserDb(userData, {
    learnedIds: [],
    dueIds: ['n5-desu', 'n5-ka-question', 'n5-masu-form'],
  });
  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/main.js'), `--user-data-dir=${userData}`],
  });
  const win = await app.firstWindow();
  await win.waitForSelector('[data-testid="user-db-ready"]', { state: 'attached', timeout: 20_000 });

  await win.getByRole('link', { name: /^Начать$/ }).click();

  // 3 due grammar review steps. Each: answer the question (first option is not
  // always correct — either way "Далее" advances), 3x. Sessions no longer have
  // learn ("Понятно") steps — new material comes from the course now.
  for (let i = 0; i < 3; i++) {
    // answer: click the first choice / or assemble "Готово" after placing tokens
    const done = win.getByRole('button', { name: /^готово$/i });
    if (await done.count()) {
      // assemble: place every bank token in order, then finish
      const bank = win.locator('.q-bank .q-tok');
      for (let n = await bank.count(); n > 0; n = await bank.count()) {
        await win.locator('.q-bank .q-tok').first().click();
      }
      await win.getByRole('button', { name: /^готово$/i }).click();
    } else {
      await win.locator('.q-options .q-opt').first().click();
    }
    await win.getByRole('button', { name: /далее/i }).click();
  }

  await expect(win.getByText(/Верно \d\/3/)).toBeVisible({ timeout: 20_000 });
  await expect(win.getByText(/мини-тест —/)).toBeVisible(); // < 5 learned -> no mini-test
  await win.getByRole('button', { name: /готово/i }).click();
  await expect(win.getByRole('heading', { name: /сегодня/i })).toBeVisible({ timeout: 20_000 });

  await app.close();
});

test('"Подробнее" on a revealed question opens the grammar detail screen', async () => {
  // Single due card -> exactly one review step, no learn/mini-test noise, so
  // the breakdown link appears after one answer regardless of question kind.
  const userData = mkdtempSync(join(tmpdir(), 'jlpt-e2e-review-more-'));
  await writeSeededUserDb(userData, { learnedIds: [], dueIds: ['n5-desu'] });

  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/main.js'), `--user-data-dir=${userData}`],
  });
  const win = await app.firstWindow();
  await win.waitForSelector('[data-testid="user-db-ready"]', { state: 'attached', timeout: 20_000 });

  await win.getByRole('link', { name: /^Начать$/ }).click();

  const assembleDone = win.getByRole('button', { name: /^готово$/i });
  if (await assembleDone.count()) {
    const bank = win.locator('.q-bank .q-tok');
    for (let n = await bank.count(); n > 0; n = await bank.count()) {
      await win.locator('.q-bank .q-tok').first().click();
    }
    await assembleDone.click();
  } else {
    await win.locator('.q-options .q-opt').first().click();
  }

  // This is the regression check: under createHashRouter, a bare
  // "/grammar/<id>" href resolves outside the app (file:///grammar/<id> in
  // the packaged Electron window) and bricks it — clicking must instead land
  // on the in-app grammar detail screen.
  await win.getByRole('link', { name: /подробнее/i }).click();
  await expect(win.getByRole('heading', { name: /примеры/i })).toBeVisible({ timeout: 20_000 });
  expect(win.url()).toContain('#/grammar/n5-desu');

  await app.close();
});
