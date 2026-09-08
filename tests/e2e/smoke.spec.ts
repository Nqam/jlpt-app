import { test, expect, _electron as electron } from '@playwright/test';

test('app boots and exposes content-db bridge', async () => {
  const app = await electron.launch({ args: ['out/main/main.js'] });
  const win = await app.firstWindow();
  await expect(win.getByTestId('app-title')).toBeVisible();

  const size = await win.evaluate(async () => {
    const buf = await window.jlmpBridge!.readContentDb();
    return buf.byteLength;
  });
  expect(size).toBeGreaterThan(1000);

  await app.close();
});

test('ContentDb opens over file:// in the packaged renderer', async () => {
  const app = await electron.launch({ args: ['out/main/main.js'] });
  const win = await app.firstWindow();
  await expect(win.getByTestId('app-title')).toBeVisible();

  // ContentDbProvider must not fall into its fatal state — sql.js wasm loaded
  // (db-ready mounts at '/' already, no need to route to #/grammar)
  await expect(win.getByTestId('db-ready')).toBeAttached();
  await expect(win.locator('.fatal')).toHaveCount(0);
  await expect(win.getByText('Не удалось загрузить учебную базу')).toHaveCount(0);

  await app.close();
});

test('a strict CSP is enforced and nothing in the app violates it', async () => {
  const app = await electron.launch({ args: ['out/main/main.js'] });
  const win = await app.firstWindow();

  const violations: string[] = [];
  win.on('console', (m) => {
    if (/content security policy/i.test(m.text())) violations.push(m.text());
  });

  const csp = await win.evaluate(async () => {
    const res = await fetch(location.href);
    return res.headers.get('content-security-policy');
  });
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("'wasm-unsafe-eval'"); // sql.js needs it

  // exercise the sql.js path + a route change, then check for CSP errors
  await expect(win.getByTestId('db-ready')).toBeAttached();
  await win.evaluate(() => { location.hash = '#/grammar'; });
  await win.waitForTimeout(300);
  expect(violations).toEqual([]);

  await app.close();
});
