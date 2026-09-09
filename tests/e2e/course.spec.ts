import { test, expect, _electron as electron } from '@playwright/test';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { writeSeededUserDb } from './helpers/seed-user-db';

// The grammar-driven course (redesign 2026-09-09). A course lesson IS a grammar
// point: 3 steps (Изучение → Закрепление → Итог); finishing creates a rating-3
// FSRS card for the point plus one for every JLPT kanji in its examples.
//
// Content anchor (verified against the built content.db): `listCourseGrammar()`
// orders by (level.ord, layer, title), so the first course point is
// `n5-ka-question` ("か (вопросительная частица)"), followed by `n5-desu`.
// `n5-ka-question` has example kanji (n5-学, n5-生, …), so the walk exercises the
// auto-kanji card path too.

test('grammar course walk: 3 steps → grammar + kanji cards, next point becomes current, survives restart', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'jlpt-e2e-course-'));
  await writeSeededUserDb(userData, { learnedIds: [], dueIds: [] });
  const args = [join(process.cwd(), 'out/main/main.js'), `--user-data-dir=${userData}`];

  let app = await electron.launch({ args });
  let win = await app.firstWindow();
  await win.waitForSelector('[data-testid="user-db-ready"]', { state: 'attached', timeout: 20_000 });

  // Into the course from the "Курс" nav item.
  await win.getByRole('link', { name: /^Курс$/ }).click();
  await expect(win.getByRole('heading', { name: 'Курс' })).toBeVisible();

  // Fresh profile → the primary action reads "Начать курс · <first point>".
  await win.getByRole('link', { name: /^Начать курс · / }).click();
  await expect(win).toHaveURL(/#\/course\/n5-ka-question$/);

  // Walk the 3 steps generically (same approach as kanji-review.spec.ts): keep
  // clicking whatever control the step offers until the "Итог" summary shows.
  for (let guard = 0; guard < 80; guard++) {
    if (await win.getByText('Пункт пройден ✓').count()) break;

    const understood = win.getByRole('button', { name: /^Понятно$/ });
    if (await understood.count()) { await understood.click(); continue; }

    // Step 1 (Закрепление): the "Далее/Завершить" button only appears once the
    // current question is graded; the "Дальше" button is the empty-reinforce skip.
    const advance = win.getByRole('button', { name: /^(Далее|Завершить|Дальше)$/ });
    if (await advance.count()) { await advance.click(); continue; }

    const opt = win.locator('.q-opt').first();
    if (await opt.count()) { await opt.click(); continue; }

    await win.waitForTimeout(100);
  }
  await expect(win.getByText('Пункт пройден ✓')).toBeVisible();

  await app.close();

  // Relaunch on the same profile.
  app = await electron.launch({ args });
  win = await app.firstWindow();
  await win.waitForSelector('[data-testid="user-db-ready"]', { state: 'attached', timeout: 20_000 });

  await win.getByRole('link', { name: /^Курс$/ }).click();
  await expect(win.getByRole('heading', { name: 'Курс' })).toBeVisible();

  // (a) the walked point is now done, (b) the next point is current.
  await expect(
    win.locator('.course-item[data-lesson="n5-ka-question"]'),
  ).toHaveAttribute('data-state', 'done');
  await expect(
    win.locator('.course-item[data-lesson="n5-ka-question"] .course-item-state'),
  ).toHaveText('✓ пройден');
  await expect(
    win.locator('.course-item[data-lesson="n5-desu"]'),
  ).toHaveAttribute('data-state', 'current');
  await expect(
    win.locator('.course-item[data-lesson="n5-desu"] .course-item-state'),
  ).toHaveText('● текущий');

  // (c)+(d) the finale created a grammar card and kanji cards. Byte-sniff the
  // raw sqlite bytes the same cheap way kanji-review.spec.ts does.
  const dbText: string = await win.evaluate(async () => {
    const bytes = await window.jlmpBridge!.readUserDb();
    if (!bytes) return '';
    return new TextDecoder('latin1').decode(new Uint8Array(bytes));
  });
  // A fresh seeded profile has zero grammar and zero kanji cards, so these
  // item_type strings only appear once the finale effect has upserted them.
  expect(dbText).toContain('grammar');       // the grammar point's card
  expect(dbText).toContain('kanji');         // the auto-extracted example-kanji cards

  // "Продолжить курс" on Сегодня lands in the now-current point's lesson.
  await win.getByRole('link', { name: /^Сегодня$/ }).click();
  await win.getByRole('link', { name: /^Продолжить курс · / }).click();
  await expect(win).toHaveURL(/#\/course\/n5-desu$/);

  await app.close();
});
