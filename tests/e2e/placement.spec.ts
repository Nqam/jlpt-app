import { test, expect, _electron as electron } from '@playwright/test';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

test('first-run grammar placement: pick 10%, answer the sample, never offered again', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'jlpt-e2e-placement-'));
  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/main.js'), `--user-data-dir=${userData}`],
  });
  const win = await app.firstWindow();
  await win.waitForSelector('[data-testid="user-db-ready"]', { state: 'attached', timeout: 20_000 });

  await expect(win.getByText(/вступительный тест/i)).toBeVisible();
  await win.getByRole('link', { name: /пройти/i }).click();

  // Volume-choice screen: pick the smallest sample.
  await expect(win.getByRole('heading', { name: /тест: грамматика/i })).toBeVisible();
  await win.getByRole('button', { name: /10\s*%/ }).click();

  // Fixed-length sample. Answer each question with the first option (correctness
  // does not matter — the run converges to the summary either way). Handles
  // choice/cloze (click first .q-opt) and assemble (place every bank token).
  for (let guard = 0; guard < 60; guard++) {
    if (await win.getByText(/Отмечено как уже известные/).count()) break;

    const opt = win.locator('.q-options .q-opt').first();
    if (await opt.count()) await opt.click();

    const assembleDone = win.getByRole('button', { name: /^готово$/i });
    if (await assembleDone.count()) {
      for (let n = await win.locator('.q-bank .q-tok').count(); n > 0;
           n = await win.locator('.q-bank .q-tok').count()) {
        await win.locator('.q-bank .q-tok').first().click();
      }
      await assembleDone.click();
    }

    const next = win.getByRole('button', { name: /далее/i });
    if (await next.count()) { await next.click(); continue; }
    break;
  }
  await expect(win.getByText(/Отмечено как уже известные/)).toBeVisible({ timeout: 20_000 });

  const summaryText = await win.getByText(/Отмечено как уже известные: \d+/).textContent();
  const markedCount = Number(summaryText?.match(/\d+/)?.[0] ?? 0);

  await win.getByRole('button', { name: /на сегодня/i }).click();
  await expect(win.getByRole('heading', { name: /Сегодня/ })).toBeVisible();
  await expect(win.getByText(/вступительный тест/i)).toHaveCount(0);

  await app.close();

  const app2 = await electron.launch({
    args: [join(process.cwd(), 'out/main/main.js'), `--user-data-dir=${userData}`],
  });
  const win2 = await app2.firstWindow();
  await win2.waitForSelector('[data-testid="user-db-ready"]', { state: 'attached', timeout: 20_000 });
  await expect(win2.getByText(/вступительный тест/i)).toHaveCount(0);

  if (markedCount > 0) {
    const hasGrammarCard: boolean = await win2.evaluate(async () => {
      const bytes = await window.jlmpBridge!.readUserDb();
      if (!bytes) return false;
      return new TextDecoder('latin1').decode(new Uint8Array(bytes)).includes('grammar');
    });
    expect(hasGrammarCard).toBe(true);
  }

  await app2.close();
});
