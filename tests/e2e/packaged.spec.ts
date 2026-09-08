import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, _electron as electron } from '@playwright/test';

/**
 * Проверяет РАСПАКОВАННУЮ сборку из dist/win-unpacked — то есть prod-путь
 * process.resourcesPath к content.db и sql-wasm.wasm (в dev он не задействован).
 * Пропускается, если сборка не собрана (`npm run build:desktop`), чтобы CI
 * без упаковки оставался зелёным.
 */
const exePath = join(process.cwd(), 'dist', 'win-unpacked', 'Kotsukotsu.exe');
const built = existsSync(exePath);

test.describe('packaged app (dist/win-unpacked)', () => {
  test.skip(!built, 'unpacked build missing — run `npm run build:desktop` first');

  test('loads grammar content from process.resourcesPath', async () => {
    const app = await electron.launch({ executablePath: exePath });
    const win = await app.firstWindow();
    await expect(win.getByTestId('app-title')).toBeVisible();

    await win.getByRole('link', { name: /Грамматика/ }).click();
    await expect(win.getByRole('heading', { name: 'Грамматика' })).toBeVisible();

    // ContentDb.open() отработал против process.resourcesPath -> 8 пунктов N5
    await expect(win.getByTestId('db-ready')).toBeAttached();
    await expect(win.locator('.grammar-list-item')).toHaveCount(43);
    await expect(win.getByText('Не удалось загрузить учебную базу')).toHaveCount(0);

    await app.close();
  });
});
