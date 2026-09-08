import { test, expect, _electron as electron } from '@playwright/test';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { writeSeededUserDb } from './helpers/seed-user-db';

test('after a session the Progress screen shows non-zero streak, counts and heatmap', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'jlpt-e2e-progress-'));
  await writeSeededUserDb(userData, { learnedIds: [], dueIds: [], placementOffered: true });
  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/main.js'), `--user-data-dir=${userData}`],
  });
  const win = await app.firstWindow();
  await win.waitForSelector('[data-testid="user-db-ready"]', {
    state: 'attached',
    timeout: 20_000,
  });

  await win.getByRole('link', { name: /начать/i }).click();
  // Question-based flow (ReviewScreen rewrite): learn ("Понятно"), answer the
  // question (choice/cloze option, or assemble tokens then its own
  // "Готово"), then "Далее" advances. The pre-Plan-3 "Показать"/"Хорошо" flow
  // this test used no longer exists.
  for (let i = 0; i < 5; i++) {
    await win.getByRole('button', { name: /понятно/i }).click();
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
  }
  await expect(win.getByText(/Верно \d\/5/)).toBeVisible({ timeout: 20_000 });
  await win.getByRole('button', { name: /готово/i }).click();

  await win.getByRole('link', { name: /прогресс/i }).click();
  await expect(win.getByRole('heading', { name: /прогресс/i })).toBeVisible({
    timeout: 20_000,
  });
  await expect(win.getByText(/Стрик 1/)).toBeVisible();
  // ProgressScreen now renders a block per category (grammar/kanji/vocab),
  // so several "Изучаются N" counts are on screen -- assert on the first.
  await expect(win.getByText(/Изучаются [1-9]/).first()).toBeVisible();

  // Today is the last heat cell; 5 reviews today -> bucket > 0.
  await expect(win.locator('.heat').last()).not.toHaveClass(/heat-0/);

  await app.close();
});
