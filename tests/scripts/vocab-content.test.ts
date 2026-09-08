import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseVocabSeedFile, loadAllVocab, validateVocab } from '../../scripts/build-content/vocab';

function tmpFile(name: string, content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'vocab-test-'));
  const path = join(dir, name);
  writeFileSync(path, content, 'utf8');
  return path;
}

describe('parseVocabSeedFile', () => {
  it('parses a well-formed line into a VocabPoint', () => {
    const path = tmpFile('n5.tsv', '学校\tがっこう\tсущ.\tшкола\n');
    expect(parseVocabSeedFile(path, 'N5')).toEqual([
      { id: 'n5-学校-がっこう', level: 'N5', headword: '学校', reading: 'がっこう', pos: 'сущ.', meaningRu: 'школа' },
    ]);
  });

  it('derives a kana-only id when headword equals reading', () => {
    const path = tmpFile('n5.tsv', 'ここ\tここ\tместоим.\tздесь\n');
    expect(parseVocabSeedFile(path, 'N5')[0]!.id).toBe('n5-ここ');
  });

  it('allows an empty pos field', () => {
    const path = tmpFile('n5.tsv', 'これ\tこれ\t\tэто\n');
    expect(parseVocabSeedFile(path, 'N5')[0]!.pos).toBe('');
  });

  it('skips blank lines and comment lines', () => {
    const path = tmpFile('n5.tsv', '# comment\n\n一\tいち\tсущ.\tодин\n');
    expect(parseVocabSeedFile(path, 'N5')).toHaveLength(1);
  });

  it('throws a clear error on the wrong number of fields', () => {
    const path = tmpFile('n5.tsv', '一\tいち\tсущ.\n'); // missing meaning
    expect(() => parseVocabSeedFile(path, 'N5')).toThrow(/4 tab-separated fields/);
  });

  it('appends -2, -3 suffixes to disambiguate same-file id collisions in order', () => {
    const path = tmpFile('n5.tsv', 'もう\tもう\t\tуже\nもう\tもう\t\tещё\nもう\tもう\t\tопять\n');
    const rows = parseVocabSeedFile(path, 'N5');
    expect(rows.map((r) => r.id)).toEqual(['n5-もう', 'n5-もう-2', 'n5-もう-3']);
  });
});

describe('loadAllVocab', () => {
  it('derives the level from the filename and merges every .tsv in the dir', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vocab-dir-'));
    writeFileSync(join(dir, 'n5.tsv'), '一\tいち\tсущ.\tодин\n', 'utf8');
    writeFileSync(join(dir, 'n4.tsv'), '週\tしゅう\tсущ.\tнеделя\n', 'utf8');
    const rows = loadAllVocab(dir);
    expect(rows.map((r) => r.id).sort()).toEqual(['n4-週-しゅう', 'n5-一-いち']);
    expect(rows.find((r) => r.id === 'n4-週-しゅう')!.level).toBe('N4');
  });

  it('returns an empty array for a missing directory instead of throwing', () => {
    expect(loadAllVocab('/no/such/dir/at/all')).toEqual([]);
  });
});

describe('validateVocab', () => {
  const base = { level: 'N5', headword: '学校', reading: 'がっこう', pos: 'сущ.', meaningRu: 'школа' };

  it('passes clean data', () => {
    expect(validateVocab([{ id: 'n5-学校-がっこう', ...base }])).toEqual([]);
  });

  it('flags a duplicate id', () => {
    const errors = validateVocab([{ id: 'n5-x', ...base }, { id: 'n5-x', ...base }]);
    expect(errors.some((e) => e.includes('duplicate'))).toBe(true);
  });

  it('flags an empty headword', () => {
    const errors = validateVocab([{ id: 'n5-x', ...base, headword: '' }]);
    expect(errors.some((e) => e.includes('empty headword'))).toBe(true);
  });

  it('flags an empty reading', () => {
    const errors = validateVocab([{ id: 'n5-x', ...base, reading: '' }]);
    expect(errors.some((e) => e.includes('empty reading'))).toBe(true);
  });

  it('flags an empty meaning', () => {
    const errors = validateVocab([{ id: 'n5-x', ...base, meaningRu: '' }]);
    expect(errors.some((e) => e.includes('empty meaningRu'))).toBe(true);
  });

  it('does not flag an empty pos (many N5 words genuinely have none)', () => {
    expect(validateVocab([{ id: 'n5-x', ...base, pos: '' }])).toEqual([]);
  });
});
