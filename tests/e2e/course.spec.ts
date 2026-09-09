import { test, expect, _electron as electron } from '@playwright/test';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

async function launch() {
  const userData = mkdtempSync(join(tmpdir(), 'jlpt-e2e-course-'));
  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/main.js'), `--user-data-dir=${userData}`],
  });
  const win = await app.firstWindow();
  await win.waitForSelector('[data-testid="user-db-ready"]', { state: 'attached', timeout: 20_000 });
  return { app, win };
}

test('the "Тексты" nav item opens /course and lists the migrated lessons as free reading', async () => {
  const { app, win } = await launch();
  await win.setViewportSize({ width: 380, height: 800 });
  await win.getByRole('link', { name: /Тексты/ }).click();
  await expect(win.getByRole('heading', { name: 'Тексты' })).toBeVisible();
  // the course list screen fits a narrow window with no horizontal overflow
  const listOverflow = await win.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(listOverflow).toBeLessThanOrEqual(1);
  // 15 migrated lessons, all free reading, all unlocked
  await expect(win.locator('.course-item')).toHaveCount(15);
  await expect(win.locator('.course-item[data-state="unlocked-reading"]')).toHaveCount(15);
  // no "Продолжить" — no mandatory lessons exist yet
  await expect(win.getByRole('link', { name: /Продолжить/ })).toHaveCount(0);
  await app.close();
});

test('walking a free-reading lesson: Read -> Comprehension -> Summary, and it survives a restart', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'jlpt-e2e-course-walk-'));
  const args = [join(process.cwd(), 'out/main/main.js'), `--user-data-dir=${userData}`];

  let app = await electron.launch({ args });
  let win = await app.firstWindow();
  await win.waitForSelector('[data-testid="user-db-ready"]', { state: 'attached', timeout: 20_000 });

  await win.getByRole('link', { name: /Тексты/ }).click();
  await win.locator('.course-item[data-lesson="n5-hanami"] a').click();
  await expect(win.getByRole('heading', { name: 'お花見' })).toBeVisible();

  // step 1 Read
  await win.getByRole('button', { name: 'Показать перевод' }).click();
  await expect(win.getByText(/сакура/i)).toBeVisible();
  await win.getByRole('button', { name: 'Дальше' }).click();

  // step 2 Comprehension — 4 questions, pick the first choice each time
  for (let i = 0; i < 4; i++) {
    await win.locator('.q-opt').first().click();
    await win.getByRole('button', { name: /Далее|Завершить/ }).click();
  }

  // step 4 Summary
  await expect(win.getByText(/Урок пройден/)).toBeVisible();
  await app.close();

  // restart — the lesson is now marked done on the course screen
  app = await electron.launch({ args });
  win = await app.firstWindow();
  await win.waitForSelector('[data-testid="user-db-ready"]', { state: 'attached', timeout: 20_000 });
  await win.getByRole('link', { name: /Тексты/ }).click();
  await expect(win.locator('.course-item[data-lesson="n5-hanami"]')).toHaveAttribute('data-state', 'done');
  await app.close();
});

test('/texts and /texts/:id redirect into the course', async () => {
  const { app, win } = await launch();
  await win.evaluate(() => { window.location.hash = '#/texts'; });
  await expect(win.getByRole('heading', { name: 'Тексты' })).toBeVisible();
  await win.evaluate(() => { window.location.hash = '#/texts/n5-hanami'; });
  await expect(win.getByRole('heading', { name: 'お花見' })).toBeVisible();
  await app.close();
});

test('the reinforce step / option buttons stay inside a 380px-wide window', async () => {
  const { app, win } = await launch();
  await win.setViewportSize({ width: 380, height: 800 });
  await win.getByRole('link', { name: /Тексты/ }).click();
  await win.locator('.course-item[data-lesson="n5-hanami"] a').click();
  await win.getByRole('button', { name: 'Дальше' }).click(); // to Comprehension

  const overflow = await win.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  const clipped = await win.evaluate(() =>
    [...document.querySelectorAll('.q-opt')].some(
      (el) => el.getBoundingClientRect().right > window.innerWidth + 1,
    ),
  );
  expect(clipped).toBe(false);
  await app.close();
});
