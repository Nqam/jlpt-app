import { test, expect, _electron as electron } from '@playwright/test';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { writeSeededUserDb } from './helpers/seed-user-db';

// Grades exactly one card, closes the window (X-button equivalent), relaunches
// with the same user-data-dir and asserts the graded card survived. Before the
// `close`-event flush handshake (C1) the debounced write is the only save point,
// so a card graded within ~500 ms of closing was lost — this test is RED then.
test('a card graded just before closing the window persists across restart', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'jlpt-e2e-persist-'));
  // New-card drip is gone: seed two due grammar cards so there is a session to
  // start and a review to grade.
  await writeSeededUserDb(userData, {
    learnedIds: [],
    dueIds: ['n5-desu', 'n5-ka-question'],
  });
  const launch = () =>
    electron.launch({
      args: [join(process.cwd(), 'out/main/main.js'), `--user-data-dir=${userData}`],
    });

  let app = await launch();
  let win = await app.firstWindow();
  await win.waitForSelector('[data-testid="user-db-ready"]', {
    state: 'attached',
    timeout: 20_000,
  });
  await expect(win.getByText(/· стрик 0/)).toBeVisible({ timeout: 20_000 });

  await win.getByRole('link', { name: /начать/i }).click();
  // Answer the question (choice/cloze options, or assemble tokens then its
  // own "Готово"), then advance with "Далее" so the review actually grades
  // and persists — sessions no longer have a learn ("Понятно") step.
  const done = win.getByRole('button', { name: /^готово$/i });
  if (await done.count()) {
    const bank = win.locator('.q-bank .q-tok');
    for (let n = await bank.count(); n > 0; n = await bank.count()) {
      await win.locator('.q-bank .q-tok').first().click();
    }
    await win.getByRole('button', { name: /^готово$/i }).click();
  } else {
    await win.locator('.q-options .q-opt').first().click();
  }
  await win.getByRole('button', { name: /далее/i }).click();

  // Close the BrowserWindow the way the X-button / Alt+F4 does: fire the real
  // `close` event with the renderer still alive. No deliberate wait first, so
  // the 500 ms debounce timer has not run — only the close-event flush
  // handshake can save the grade.
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.close();
  });
  await app.close();

  app = await launch();
  win = await app.firstWindow();
  await win.waitForSelector('[data-testid="user-db-ready"]', {
    state: 'attached',
    timeout: 20_000,
  });
  // The one grade taken just before closing survived the flush handshake:
  // a review happened today, so the streak ticked to 1.
  await expect(win.getByText(/· стрик 1/)).toBeVisible({ timeout: 20_000 });
  await expect(win.getByText(/· стрик 0/)).toHaveCount(0);

  await app.close();
});
