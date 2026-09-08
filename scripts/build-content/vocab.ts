import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const FIELD_COUNT = 4;

export interface VocabPoint {
  id: string;
  level: string;
  headword: string;
  reading: string;
  pos: string;
  meaningRu: string;
}

/**
 * Один уровень — один TSV-файл content/vocab/{level}.tsv. Строка:
 * headword<TAB>reading<TAB>pos<TAB>русское значение
 * Пустые строки и строки, начинающиеся с "#", пропускаются. `id` не хранится в
 * файле — вычисляется здесь из headword+reading, с дедупликацией `-2`/`-3` для
 * редких слов без кандзи, у которых два разных значения делят headword и reading
 * (см. Global Constraints плана 4a-3: かける, キロ, もう, よく).
 */
export function parseVocabSeedFile(path: string, level: string): VocabPoint[] {
  const out: VocabPoint[] = [];
  const seenIds = new Map<string, number>();
  const lines = readFileSync(path, 'utf8').split('\n');
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const fields = line.split('\t');
    if (fields.length !== FIELD_COUNT) {
      throw new Error(
        `${path}:${i + 1}: expected ${FIELD_COUNT} tab-separated fields, got ${fields.length}`,
      );
    }
    const [headword, reading, pos, meaningRu] = fields as [string, string, string, string];
    const baseId =
      headword === reading ? `${level.toLowerCase()}-${reading}` : `${level.toLowerCase()}-${headword}-${reading}`;
    const n = (seenIds.get(baseId) ?? 0) + 1;
    seenIds.set(baseId, n);
    const id = n === 1 ? baseId : `${baseId}-${n}`;
    out.push({ id, level, headword, reading, pos, meaningRu: meaningRu.trim() });
  });
  return out;
}

export function loadAllVocab(dir: string): VocabPoint[] {
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.tsv'));
  } catch {
    return [];
  }
  const out: VocabPoint[] = [];
  for (const file of files) {
    const level = file.replace(/\.tsv$/, '').toUpperCase();
    out.push(...parseVocabSeedFile(join(dir, file), level));
  }
  return out;
}

export function validateVocab(points: VocabPoint[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const p of points) {
    if (seen.has(p.id)) errors.push(`duplicate vocab id "${p.id}"`);
    seen.add(p.id);
    if (!p.headword) errors.push(`${p.id}: empty headword`);
    if (!p.reading) errors.push(`${p.id}: empty reading`);
    if (!p.meaningRu.trim()) errors.push(`${p.id}: empty meaningRu`);
  }
  return errors;
}
