/**
 * Одноразовая миграция: content/texts/<level>/*.md -> content/lessons/*.md.
 * Проставляет `stage` (чётные, N5 от 2, N4 от 42 — оставляя нечётные слоты
 * будущим вводным урокам), `kind: text`, роняет `level`. Теги introduces/reviews
 * не пишутся (парсер по умолчанию считает их пустыми = свободное чтение).
 * Запускается вручную один раз:  npx tsx scripts/migrate-texts-to-lessons.ts
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const textsDir = resolve(root, 'content/texts');
const lessonsDir = resolve(root, 'content/lessons');
mkdirSync(lessonsDir, { recursive: true });

const rows: [string, number, string][] = [];
for (const [level, startStage] of [['n5', 2], ['n4', 42]] as const) {
  const dir = resolve(textsDir, level);
  const files = readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
  files.forEach((file, i) => {
    const src = readFileSync(resolve(dir, file), 'utf8');
    const { data, content } = matter(src);
    const stage = startStage + i * 2;
    const fm = {
      id: String(data['id']),
      stage,
      kind: 'text',
      title: String(data['title']),
    };
    writeFileSync(resolve(lessonsDir, file), matter.stringify(content, fm), 'utf8');
    rows.push([fm.id, stage, fm.title]);
  });
}
rows.sort((a, b) => a[1] - b[1]);
console.log('Мигрировано уроков:', rows.length);
for (const [id, stage, title] of rows) console.log(`  stage ${String(stage).padStart(2)}  ${id}  — ${title}`);
