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
  await writeSeededUserDb(userData, { learnedIds: [], dueIds: [], placementOffered: true });
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
  await expect(win.getByText(/5 новых/)).toBeVisible({ timeout: 20_000 });

  await win.getByRole('link', { name: /начать/i }).click();
  await win.getByRole('button', { name: /понятно/i }).click();
  // Answer the question (choice/cloze options, or assemble tokens then its
  // own "Готово"), then advance with "Далее" so the review actually grades
  // and persists — the pre-Plan-3 "Показать"/"Хорошо" flow this test used no
  // longer exists (ReviewScreen was rewritten to the question-based flow).
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
  // One new card was introduced today -> the daily new budget is now 4, not 5.
  await expect(win.getByText(/4 новых/)).toBeVisible({ timeout: 20_000 });
  await expect(win.getByText(/5 новых/)).toHaveCount(0);

  await app.close();
});
