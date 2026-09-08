/**
 * Собирает build/icon.ico из build/icon.svg.
 *
 * Ручной шаг разработчика (`npm run make-icon`) — иконка коммитится, не
 * пересобирается на каждый билд. Рендер SVG в PNG идёт через Chromium из
 * @playwright/test (он уже ставится для e2e), без сетевых загрузок и без
 * тяжёлых нативных зависимостей. Финальную сборку .ico делает png-to-ico.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import pngToIco from 'png-to-ico';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const SVG = join(root, 'build', 'icon.svg');
const ICO = join(root, 'build', 'icon.ico');
const SIZES = [16, 24, 32, 48, 64, 128, 256];

/** Рендерит SVG-разметку в PNG-буфер заданного размера через headless Chromium. */
async function renderPng(svgMarkup: string, size: number): Promise<Buffer> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    await page.setContent(
      `<!doctype html><meta charset="utf-8">` +
        `<style>*{margin:0;padding:0}svg{display:block}</style>` +
        svgMarkup
          .replace(/width="\d+"/, `width="${size}"`)
          .replace(/height="\d+"/, `height="${size}"`),
      { waitUntil: 'networkidle' },
    );
    return await page.locator('svg').screenshot({ omitBackground: true });
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  const svg = await readFile(SVG, 'utf8');
  const pngs: Buffer[] = [];
  for (const size of SIZES) pngs.push(await renderPng(svg, size));
  const ico = await pngToIco(pngs);
  await mkdir(dirname(ICO), { recursive: true });
  await writeFile(ICO, ico);
  console.log(
    `build/icon.ico written: ${ICO} (${ico.length} bytes, sizes ${SIZES.join('/')})`,
  );
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
