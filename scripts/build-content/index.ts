import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initWriter, buildContentDb } from './write-db';

async function main(): Promise<void> {
  await initWriter();
  const __dirname = resolve(fileURLToPath(import.meta.url), '..');
  const root = resolve(__dirname, '../..');
  const bytes = buildContentDb({
    grammarDir: resolve(root, 'content/grammar'),
    levelsYml: resolve(root, 'content/levels.yml'),
    schemaPath: resolve(root, 'scripts/build-content/schema.sql'),
    kanjiDir: resolve(root, 'content/kanji'),
    vocabDir: resolve(root, 'content/vocab'),
    lessonsDir: resolve(root, 'content/lessons'),
    contentVersion: process.env['CONTENT_VERSION'] ?? '0.1.0',
  });
  const outDir = resolve(root, 'resources');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, 'content.db');
  writeFileSync(outPath, bytes);
  console.log(`content.db written: ${outPath} (${bytes.byteLength} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
