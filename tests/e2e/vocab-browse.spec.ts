import { test, expect, _electron as electron } from '@playwright/test';

test('browse vocab: list -> detail -> back', async () => {
  const app = await electron.launch({ args: ['out/main/main.js'] });
  const win = await app.firstWindow();

  await win.getByRole('link', { name: /Слова/ }).click();
  await expect(win.getByRole('heading', { name: 'Слова' })).toBeVisible();

  const items = win.locator('.vocab-list-item');
  await expect(items).toHaveCount(681);

  await win.getByRole('link', { name: /^学校/ }).click();
  await expect(win.getByRole('heading', { name: /学校/ })).toBeVisible();
  await expect(win.getByText('がっこう')).toBeVisible();
  // Scoped to the field list — плоское getByText('школа') also matches the
  // kanji-breakdown cross-link (校 · школа) that this page now shows.
  await expect(win.locator('.vocab-detail-fields').getByText('школа')).toBeVisible();

  await win.locator('.back-link').click();
  await expect(win.getByRole('heading', { name: 'Слова' })).toBeVisible();

  await app.close();
});

test('vocab search filters by meaning', async () => {
  const app = await electron.launch({ args: ['out/main/main.js'] });
  const win = await app.firstWindow();

  await win.getByRole('link', { name: /Слова/ }).click();
  await win.getByRole('searchbox', { name: /поиск/i }).fill('школа');
  // 5 matches once N4 vocab exists: n5-学校 plus N4's 小学校/中学校/高校/高等学校
  // (all contain "школа" in their Russian gloss) -- proves search is cross-level, not N5-only.
  await expect(win.locator('.vocab-list-item')).toHaveCount(5);
  await expect(win.getByText('学校', { exact: true })).toBeVisible();

  await app.close();
});
