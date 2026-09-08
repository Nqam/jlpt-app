import { test, expect, _electron as electron } from '@playwright/test';

test('browse kanji: list -> detail -> back', async () => {
  const app = await electron.launch({ args: ['out/main/main.js'] });
  const win = await app.firstWindow();

  await win.getByRole('link', { name: /Кандзи/ }).click();
  await expect(win.getByRole('heading', { name: 'Кандзи' })).toBeVisible();

  // all 81 seed N5 kanji are listed
  const items = win.locator('.kanji-grid-item');
  await expect(items).toHaveCount(81);

  await win.getByRole('link', { name: /^学/ }).click();
  await expect(win.getByRole('heading', { name: /学/ })).toBeVisible();
  await expect(win.getByText('ガク')).toBeVisible();
  await expect(win.getByText('まな.ぶ')).toBeVisible();
  await expect(win.getByText('учиться')).toBeVisible();

  await win.locator('.back-link').click();
  await expect(win.getByRole('heading', { name: 'Кандзи' })).toBeVisible();

  await app.close();
});

test('kanji search filters by meaning', async () => {
  const app = await electron.launch({ args: ['out/main/main.js'] });
  const win = await app.firstWindow();

  await win.getByRole('link', { name: /Кандзи/ }).click();
  await win.getByRole('searchbox', { name: /поиск/i }).fill('учиться');
  await expect(win.locator('.kanji-grid-item')).toHaveCount(2); // n5-学 and n4-習 both match "учиться"
  await expect(win.getByText('学')).toBeVisible();
  await expect(win.getByText('習')).toBeVisible();

  await app.close();
});
