import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const FIELD_COUNT = 5;

export interface KanjiPoint {
  id: string;
  level: string;
  char: string;
  onyomi: string[];
  kunyomi: string[];
  strokeCount: number;
  meaningRu: string;
}

/**
 * Один уровень — один TSV-файл content/kanji/{level}.tsv. Строка:
 * символ<TAB>он-чтения через запятую<TAB>кун-чтения через запятую<TAB>кол-во черт<TAB>русское значение
 * Пустые строки и строки, начинающиеся с "#", пропускаются.
 */
export function parseKanjiSeedFile(path: string, level: string): KanjiPoint[] {
  const out: KanjiPoint[] = [];
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
    const [char, onyomiRaw, kunyomiRaw, strokeRaw, meaningRu] = fields as [
      string, string, string, string, string,
    ];
    const strokeCount = Number(strokeRaw);
    if (!Number.isInteger(strokeCount) || strokeCount < 1) {
      throw new Error(`${path}:${i + 1}: bad stroke count "${strokeRaw}" for "${char}"`);
    }
    out.push({
      id: `${level.toLowerCase()}-${char}`,
      level,
      char,
      onyomi: onyomiRaw ? onyomiRaw.split(',').map((s) => s.trim()) : [],
      kunyomi: kunyomiRaw ? kunyomiRaw.split(',').map((s) => s.trim()) : [],
      strokeCount,
      meaningRu: meaningRu.trim(),
    });
  });
  return out;
}

export function loadAllKanji(dir: string): KanjiPoint[] {
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.tsv'));
  } catch {
    return [];
  }
  const out: KanjiPoint[] = [];
  for (const file of files) {
    const level = file.replace(/\.tsv$/, '').toUpperCase();
    out.push(...parseKanjiSeedFile(join(dir, file), level));
  }
  return out;
}

export function validateKanji(points: KanjiPoint[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const p of points) {
    if (seen.has(p.id)) errors.push(`duplicate kanji id "${p.id}"`);
    seen.add(p.id);
    if (!p.char) errors.push(`${p.id}: empty char`);
    if (p.char && [...p.char].length !== 1) {
      errors.push(`${p.id}: char must be a single character, got "${p.char}"`);
    }
    if (!p.meaningRu.trim()) errors.push(`${p.id}: empty meaningRu`);
    if (p.onyomi.length === 0 && p.kunyomi.length === 0) {
      errors.push(`${p.id}: no on'yomi or kun'yomi readings`);
    }
  }
  return errors;
}
