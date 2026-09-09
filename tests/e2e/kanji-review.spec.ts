import { test, expect, _electron as electron } from '@playwright/test';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { writeSeededUserDb } from './helpers/seed-user-db';

test('a seeded kanji card is reviewed and persists as item_type kanji', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'jlpt-e2e-kanji-review-'));
  // The new-card drip is gone, so there is no longer any automatic source of
  // fresh kanji cards. Seed one real kanji card due now (item_type = 'kanji')
  // so the session has a kanji review step to walk. placementOffered keeps the
  // Today screen from showing the placement offer instead of the "Начать" link
  // (there are no grammar cards to suppress it otherwise).
  await writeSeededUserDb(userData, {
    learnedIds: [],
    dueIds: [],
    dueKanjiIds: ['n5-一'],
    placementOffered: true,
  });
  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/main.js'), `--user-data-dir=${userData}`],
  });
  const win = await app.firstWindow();
  await win.waitForSelector('[data-testid="user-db-ready"]', { state: 'attached', timeout: 20_000 });

  await win.getByRole('link', { name: /начать/i }).click();

  // Walk the session (one seeded kanji review step) the same generic way
  // minitest.spec.ts does: keep clicking whatever control is available until
  // the summary shows.
  for (let guard = 0; guard < 120; guard++) {
    if (await win.getByText(/Верно \d+\/\d+/).count()) break;

    const learn = win.getByRole('button', { name: /понятно/i });
    if (await learn.count()) { await learn.click(); continue; }

    const next = win.getByRole('button', { name: /далее/i });
    if (await next.count()) { await next.click(); continue; }

    const opt = win.locator('.q-options .q-opt').first();
    if (await opt.count()) { await opt.click(); continue; }
    break;
  }
  await expect(win.getByText(/Верно \d+\/\d+/)).toBeVisible({ timeout: 20_000 });

  await app.close();

  // Re-launch on the SAME userData dir and confirm a kanji card is present and
  // the db still opens cleanly after the kanji review -> grade -> upsertCard
  // round trip (the card is seeded, so this is a persistence/no-corruption
  // check rather than proof the card was created from scratch).
  const app2 = await electron.launch({
    args: [join(process.cwd(), 'out/main/main.js'), `--user-data-dir=${userData}`],
  });
  const win2 = await app2.firstWindow();
  await win2.waitForSelector('[data-testid="user-db-ready"]', { state: 'attached', timeout: 20_000 });
  const hasKanjiCard: boolean = await win2.evaluate(async () => {
    const bytes = await window.jlmpBridge!.readUserDb();
    if (!bytes) return false;
    // Cheap sniff: the raw sqlite bytes contain the literal string "kanji"
    // as a stored item_type value once at least one kanji card exists.
    const text = new TextDecoder('latin1').decode(new Uint8Array(bytes));
    return text.includes('kanji');
  });
  expect(hasKanjiCard).toBe(true);
  await app2.close();
});
