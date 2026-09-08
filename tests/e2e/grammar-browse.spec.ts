import { test, expect, _electron as electron } from '@playwright/test';

test('browse grammar: list -> detail -> related', async () => {
  const app = await electron.launch({ args: ['out/main/main.js'] });
  const win = await app.firstWindow();

  await win.getByRole('link', { name: /Грамматика/ }).click();
  await expect(win.getByRole('heading', { name: 'Грамматика' })).toBeVisible();

  // all 43 N5 grammar points are listed
  const items = win.locator('.grammar-list-item');
  await expect(items).toHaveCount(43);

  await win.getByRole('link', { name: /は \(тема предложения\)/ }).click();
  await expect(win.getByRole('heading', { name: /は \(тема предложения\)/ })).toBeVisible();
  await expect(win.locator('.grammar-md')).toContainText('тему');
  await expect(win.locator('.examples ruby').first()).toBeVisible();
  await expect(win.getByRole('heading', { name: 'Примеры' })).toBeVisible();
  // the mandatory "Частые ошибки" section is rendered (not truncated with "Примеры")
  await expect(win.getByRole('heading', { name: 'Частые ошибки' })).toBeVisible();

  await win.getByRole('link', { name: /か \(вопросительная частица\)/ }).click();
  await expect(win.getByRole('heading', { name: /か \(вопросительная частица\)/ })).toBeVisible();

  await app.close();
});

test('mobile width shows bottom nav', async () => {
  const app = await electron.launch({ args: ['out/main/main.js'] });
  const win = await app.firstWindow();
  await win.setViewportSize({ width: 400, height: 800 });
  await expect(win.locator('nav[data-variant="bottom"]')).toBeVisible();
  await app.close();
});
