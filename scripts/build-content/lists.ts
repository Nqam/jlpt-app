import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import type { Level } from '../../src/core/types';

export function loadLevels(ymlPath: string): Level[] {
  const rows = parse(readFileSync(ymlPath, 'utf8')) as unknown;
  if (!Array.isArray(rows)) throw new Error(`${ymlPath}: expected a YAML list`);
  return rows.map((r, i) => {
    const row = r as Record<string, unknown>;
    for (const k of ['code', 'ord', 'status', 'titleRu']) {
      if (row[k] === undefined) throw new Error(`${ymlPath}[${i}]: missing "${k}"`);
    }
    const status = String(row['status']);
    if (status !== 'available' && status !== 'coming_soon') {
      throw new Error(`${ymlPath}[${i}]: bad status "${status}"`);
    }
    return {
      code: String(row['code']),
      ord: Number(row['ord']),
      status,
      titleRu: String(row['titleRu']),
    };
  });
}
