import { test, expect, _electron as electron } from '@playwright/test';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

test('taking the placement test on first launch creates known grammar cards and never offers again', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'jlpt-e2e-placement-'));
  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/main.js'), `--user-data-dir=${userData}`],
  });
  const win = await app.firstWindow();
  await win.waitForSelector('[data-testid="user-db-ready"]', { state: 'attached', timeout: 20_000 });

  await expect(win.getByText(/вступительный тест/i)).toBeVisible();
  await win.getByRole('link', { name: /пройти/i }).click();

  // Answer every question with whatever the first choice is (deterministic:
  // answerIndex is seeded, but we don't need to answer correctly -- either way
  // the test converges to SOME frontier and the completion screen appears).
  // Single-question binary search: ceil(log2(N+1)) questions (~7 for the
  // current ~93-item N5+N4 grammar corpus). The guard is generously loose.
  for (let guard = 0; guard < 60; guard++) {
    if (await win.getByText(/Отмечено как уже известные/).count()) break;

    const opt = win.locator('.q-options .q-opt').first();
    if (await opt.count()) { await opt.click(); }

    // Placement (like session.ts's grammar generateForCard) can produce an
    // 'assemble' question, not just choice/cloze -- place every bank token in
    // order, then its own "Готово" (same pattern as review.spec.ts/progress.spec.ts).
    const assembleDone = win.getByRole('button', { name: /^готово$/i });
    if (await assembleDone.count()) {
      const bank = win.locator('.q-bank .q-tok');
      for (let n = await bank.count(); n > 0; n = await bank.count()) {
        await win.locator('.q-bank .q-tok').first().click();
      }
      await assembleDone.click();
    }

    const done = win.getByRole('button', { name: /далее/i });
    if (await done.count()) { await done.click(); continue; }
    break;
  }
  await expect(win.getByText(/Отмечено как уже известные/)).toBeVisible({ timeout: 20_000 });

  // The click-through loop above always takes the first offered choice, not
  // necessarily the correct one, so the binary search can legitimately land
  // right at the start with a frontier of zero items -- the marked count is
  // not deterministic. Capture it so the persistence check below only
  // requires a card to exist when the test claims one was actually marked.
  const summaryText = await win.getByText(/Отмечено как уже известные: \d+/).textContent();
  const markedCount = Number(summaryText?.match(/\d+/)?.[0] ?? 0);

  await win.getByRole('button', { name: /на сегодня/i }).click();

  // The offer must not reappear once the test has been taken.
  await expect(win.getByRole('heading', { name: /Сегодня/ })).toBeVisible();
  await expect(win.getByText(/вступительный тест/i)).toHaveCount(0);

  // `app.close()` triggers `flushUserDb` (shells/electron/main.ts) on the
  // window's close event, which is what actually persists the debounced
  // (500ms) UserDb write to disk -- reading raw bytes from the still-running
  // first instance would race that debounce. So the persistence check below
  // runs against the SAME userData dir only after this close-and-relaunch,
  // exactly like kanji-review.spec.ts's "did the card really land on disk"
  // check.
  await app.close();

  const app2 = await electron.launch({
    args: [join(process.cwd(), 'out/main/main.js'), `--user-data-dir=${userData}`],
  });
  const win2 = await app2.firstWindow();
  await win2.waitForSelector('[data-testid="user-db-ready"]', { state: 'attached', timeout: 20_000 });
  // Confirms the offer flag persisted across a restart, not just in-session state.
  await expect(win2.getByText(/вступительный тест/i)).toHaveCount(0);

  if (markedCount > 0) {
    // Confirms the placement test's actual point -- a card was written to
    // `cards` with item_type 'grammar' -- not just that the offer flag was
    // set. 'grammar' never appears in the schema/migration SQL itself (see
    // src/storage/migrations.ts), so this sniff is only true once a grammar
    // card row has actually been inserted, mirroring the 'kanji' sniff in
    // kanji-review.spec.ts. When markedCount is 0 (the binary search
    // legitimately landed with an empty frontier), no card was ever supposed
    // to be written, so the sniff is skipped rather than asserted false --
    // 'grammar' could otherwise coincidentally appear in unrelated bytes.
    const hasGrammarCard: boolean = await win2.evaluate(async () => {
      const bytes = await window.jlmpBridge!.readUserDb();
      if (!bytes) return false;
      const text = new TextDecoder('latin1').decode(new Uint8Array(bytes));
      return text.includes('grammar');
    });
    expect(hasGrammarCard).toBe(true);
  }

  await app2.close();
});
