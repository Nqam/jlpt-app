import { test, expect, _electron as electron } from '@playwright/test';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { writeSeededUserDb } from './helpers/seed-user-db';

// Real N5 grammar ids from content/grammar/n5/*.md front matter.
const N5_IDS = [
  'n5-desu', 'n5-ka-question', 'n5-masu-form', 'n5-mo-particle',
  'n5-ni-place-time',
];

test('seeded learned deck: session ends with a mini-test and a retry round', async () => {
  // DEVIATION FROM BRIEF: the global 30s test timeout (playwright.config.ts) is
  // tight for this flow — 5 due reviews + 5 mini-test questions + a (near-
  // certain, see loop comment below) retry round, each step driven through the
  // real Electron IPC round trip. Raised per-test rather than touching the
  // global config, as flagged in the task instructions.
  test.setTimeout(90_000);

  const userData = mkdtempSync(join(tmpdir(), 'jlpt-e2e-minitest-'));
  // 5 learned + due so they also form review steps. With the new-card drip
  // gone, the session is exactly "5 reviews + mini-test".
  await writeSeededUserDb(userData, { learnedIds: N5_IDS, dueIds: N5_IDS });

  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/main.js'), `--user-data-dir=${userData}`],
  });
  const win = await app.firstWindow();
  await win.waitForSelector('[data-testid="user-db-ready"]', { state: 'attached', timeout: 20_000 });

  await expect(win.getByText(/мини-тест —/)).toBeVisible({ timeout: 20_000 });
  await win.getByRole('link', { name: /^Начать$/ }).click();

  // Answer every question by taking the first available control until the
  // summary shows. Deliberately wrong-ish (first option, or the assemble
  // tokens in their shown — always-shuffled, so always-wrong — order) to
  // provoke a retry round; the loop keeps going through it.
  //
  // DEVIATION FROM BRIEF: guard raised from 40 to 120. Worked out the actual
  // step count for this seed: 5 review + 5 mini-test base steps, each either
  // 2 iterations (cloze/choice: pick + Далее) or up to ~8 for an assemble
  // question (one click per bank token + Готово + Далее — content/grammar/n5
  // examples top out at 4 tokens for these 5 ids, but the margin covers a
  // content edit), plus up to 5 retry-round choice steps (2 iterations each).
  // 40 was cutting it close to the computed worst case; 120 leaves headroom
  // without materially slowing a passing run (each extra guard tick that's
  // never spent is just an unused loop iteration, not a wait).
  for (let guard = 0; guard < 120; guard++) {
    if (await win.getByRole('button', { name: /готово$/i }).count()
        && await win.getByText(/Верно \d+\/\d+/).count()) break;

    const learn = win.getByRole('button', { name: /понятно/i });
    if (await learn.count()) { await learn.click(); continue; }

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

  await expect(win.getByText(/мини-тест \d+\/\d+/)).toBeVisible({ timeout: 20_000 });
  await win.getByRole('button', { name: /готово/i }).click();
  await expect(win.getByRole('heading', { name: /сегодня/i })).toBeVisible({ timeout: 20_000 });

  await app.close();
});
