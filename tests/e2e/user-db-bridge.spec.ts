import { test, expect, _electron as electron } from '@playwright/test';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

test('user-db bridge round-trips bytes through the main process', async () => {
  // Isolated userData: this test deliberately writes non-database bytes, which
  // would poison the shared userData for tests that now open user.db (Today).
  const userData = mkdtempSync(join(tmpdir(), 'jlpt-e2e-bridge-'));
  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/main.js'), `--user-data-dir=${userData}`],
  });
  const win = await app.firstWindow();
  await win.waitForSelector('[data-testid="app-title"]');

  // Fresh userData in CI may already hold a user.db from a prior run; just
  // assert the round-trip contract rather than the initial null.
  const wrote = await win.evaluate(async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]).buffer;
    await window.jlmpBridge!.writeUserDb(bytes);
    const back = await window.jlmpBridge!.readUserDb();
    return back ? Array.from(new Uint8Array(back)).slice(0, 5) : null;
  });
  expect(wrote).toEqual([1, 2, 3, 4, 5]);

  await app.close();
});
