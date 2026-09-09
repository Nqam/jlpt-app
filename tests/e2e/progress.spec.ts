import { test, expect, _electron as electron } from '@playwright/test';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { writeSeededUserDb } from './helpers/seed-user-db';

test('after a session the Progress screen shows non-zero streak, counts and heatmap', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'jlpt-e2e-progress-'));
  // No more new-card drip: seed the deck directly. 3 grammar cards stay parked
  // as "learned" (never reviewed, so their count is stable to assert on) and 2
  // more are due to drive a real session. 5 learned grammar also unlocks the
  // mini-test, so the session runs review steps + a mini-test + retry round --
  // walk it generically until the summary shows.
  await writeSeededUserDb(userData, {
    learnedIds: ['n5-desu', 'n5-ka-question', 'n5-masu-form'],
    dueIds: ['n5-mo-particle', 'n5-ni-place-time'],
  });
  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/main.js'), `--user-data-dir=${userData}`],
  });
  const win = await app.firstWindow();
  await win.waitForSelector('[data-testid="user-db-ready"]', {
    state: 'attached',
    timeout: 20_000,
  });

  await win.getByRole('link', { name: /^Начать$/ }).click();
  // Take the first available control until the summary shows: answer choices,
  // assemble tokens, advance with "Далее". Sessions no longer have learn
  // ("Понятно") steps.
  for (let guard = 0; guard < 120; guard++) {
    if (await win.getByRole('button', { name: /готово$/i }).count()
        && await win.getByText(/Верно \d+\/\d+/).count()) break;

    const next = win.getByRole('button', { name: /далее/i });
    if (await next.count()) { await next.click(); continue; }

    const assembleDone = win.getByRole('button', { name: /^готово$/i });
    if (await assembleDone.count()) {
      const tok = win.locator('.q-bank .q-tok');
      if (await tok.count()) { await tok.first().click(); continue; }
      await assembleDone.click(); continue;
    }

    const opt = win.locator('.q-options .q-opt').first();
    if (await opt.count()) { await opt.click(); continue; }
    break;
  }
  await expect(win.getByText(/Верно \d+\/\d+/)).toBeVisible({ timeout: 20_000 });
  await win.getByRole('button', { name: /готово/i }).click();

  await win.getByRole('link', { name: /прогресс/i }).click();
  await expect(win.getByRole('heading', { name: /прогресс/i })).toBeVisible({
    timeout: 20_000,
  });
  await expect(win.getByText(/Стрик 1/)).toBeVisible();
  // ProgressScreen renders a block per category (grammar/kanji/vocab). The 3
  // parked "learned" grammar cards are never reviewed, so the grammar
  // "Изучено" count is a stable non-zero assertion; use .first() since the
  // "Изучено" progress-bar label also matches.
  await expect(win.getByText(/Изучено [1-9]/).first()).toBeVisible();

  // Today is the last heat cell; 2 due reviews + a mini-test today -> bucket > 0.
  await expect(win.locator('.heat').last()).not.toHaveClass(/heat-0/);

  await app.close();
});
