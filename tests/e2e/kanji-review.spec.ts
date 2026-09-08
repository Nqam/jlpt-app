import { test, expect, _electron as electron } from '@playwright/test';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { writeSeededUserDb } from './helpers/seed-user-db';

test('a kanji new card is learned and reviewed, and persists as item_type kanji', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'jlpt-e2e-kanji-review-'));
  // Seed new_per_day=6 (empty deck, so nothing is due) instead of relying on
  // the app default (5): with 3 item types sharing the budget, `allocateBudget`
  // in src/core/scheduler.ts water-fills a floor(total/count) share to every
  // type with room, with any remainder going to the first types in
  // `ITEM_TYPES`'s order. 6 divides evenly by 3, so kanji is guaranteed 2 new
  // items regardless of `ITEM_TYPES`'s order or content availability elsewhere
  // -- unlike the previous default-5 split, which could leave kanji with as
  // little as 1 new card depending on `ITEM_TYPES` order, making this spec's
  // "keep clicking until the summary shows" loop fragile to unrelated future
  // changes. This mirrors the same fix already applied in vocab-review.spec.ts.
  await writeSeededUserDb(userData, { learnedIds: [], dueIds: [], newPerDay: 6, placementOffered: true });
  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/main.js'), `--user-data-dir=${userData}`],
  });
  const win = await app.firstWindow();
  await win.waitForSelector('[data-testid="user-db-ready"]', { state: 'attached', timeout: 20_000 });

  await win.getByRole('link', { name: /начать/i }).click();

  // Walk through the whole base session (grammar + whatever kanji share the
  // shared new_per_day budget landed) the same generic way minitest.spec.ts
  // does: keep clicking whatever control is available until the summary shows.
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

  // Re-launch on the SAME userData dir and confirm at least one kanji card
  // was actually persisted (item_type = 'kanji') -- proves the whole
  // learn -> review -> grade -> upsertCard round trip really happened for
  // kanji, not just grammar.
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
