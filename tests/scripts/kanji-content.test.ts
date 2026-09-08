import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseKanjiSeedFile, loadAllKanji, validateKanji } from '../../scripts/build-content/kanji';

function tmpFile(name: string, content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'kanji-test-'));
  const path = join(dir, name);
  writeFileSync(path, content, 'utf8');
  return path;
}

describe('parseKanjiSeedFile', () => {
  it('parses a well-formed line into a KanjiPoint', () => {
    const path = tmpFile('n5.tsv', '学\tガク\tまな.ぶ\t8\tучиться\n');
    expect(parseKanjiSeedFile(path, 'N5')).toEqual([
      { id: 'n5-学', level: 'N5', char: '学', onyomi: ['ガク'], kunyomi: ['まな.ぶ'], strokeCount: 8, meaningRu: 'учиться' },
    ]);
  });

  it('splits multiple readings on comma', () => {
    const path = tmpFile('n5.tsv', '行\tコウ,ギョウ\tい.く,ゆ.く,おこな.う\t6\tидти\n');
    const rows = parseKanjiSeedFile(path, 'N5');
    expect(rows[0]!.onyomi).toEqual(['コウ', 'ギョウ']);
    expect(rows[0]!.kunyomi).toEqual(['い.く', 'ゆ.く', 'おこな.う']);
  });

  it('allows an empty on-yomi or kun-yomi field', () => {
    const path = tmpFile('n5.tsv', '百\tヒャク\t\t6\tсто\n');
    const rows = parseKanjiSeedFile(path, 'N5');
    expect(rows[0]!.onyomi).toEqual(['ヒャク']);
    expect(rows[0]!.kunyomi).toEqual([]);
  });

  it('skips blank lines and comment lines', () => {
    const path = tmpFile('n5.tsv', '# comment\n\n一\tイチ,イツ\tひと.つ\t1\tодин\n');
    expect(parseKanjiSeedFile(path, 'N5')).toHaveLength(1);
  });

  it('throws a clear error on a bad stroke count', () => {
    const path = tmpFile('n5.tsv', '一\tイチ\tひと.つ\tone\tодин\n');
    expect(() => parseKanjiSeedFile(path, 'N5')).toThrow(/stroke count/);
  });

  it('throws a clear error on the wrong number of fields', () => {
    const path = tmpFile('n5.tsv', '一\tイチ\tひと.つ\t1\n'); // missing meaning
    expect(() => parseKanjiSeedFile(path, 'N5')).toThrow(/5 tab-separated fields/);
  });
});

describe('loadAllKanji', () => {
  it('derives the level from the filename and merges every .tsv in the dir', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kanji-dir-'));
    writeFileSync(join(dir, 'n5.tsv'), '一\tイチ\tひと.つ\t1\tодин\n', 'utf8');
    writeFileSync(join(dir, 'n4.tsv'), '週\tシュウ\t\t11\tнеделя\n', 'utf8');
    const rows = loadAllKanji(dir);
    expect(rows.map((r) => r.id).sort()).toEqual(['n4-週', 'n5-一']);
    expect(rows.find((r) => r.id === 'n4-週')!.level).toBe('N4');
  });

  it('returns an empty array for a missing directory instead of throwing', () => {
    expect(loadAllKanji('/no/such/dir/at/all')).toEqual([]);
  });

  it('ignores non-.tsv files in the directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kanji-dir-'));
    writeFileSync(join(dir, 'n5.tsv'), '一\tイチ\tひと.つ\t1\tодин\n', 'utf8');
    writeFileSync(join(dir, 'README.md'), '# not a kanji file\n', 'utf8');
    expect(loadAllKanji(dir)).toHaveLength(1);
  });
});

describe('validateKanji', () => {
  const base = { level: 'N5', char: '一', onyomi: ['イチ'], kunyomi: ['ひと.つ'], strokeCount: 1, meaningRu: 'один' };

  it('passes clean data', () => {
    expect(validateKanji([{ id: 'n5-一', ...base }])).toEqual([]);
  });

  it('flags a duplicate id', () => {
    const errors = validateKanji([{ id: 'n5-一', ...base }, { id: 'n5-一', ...base }]);
    expect(errors.some((e) => e.includes('duplicate'))).toBe(true);
  });

  it('flags an empty meaning', () => {
    const errors = validateKanji([{ id: 'n5-一', ...base, meaningRu: '' }]);
    expect(errors.some((e) => e.includes('empty meaningRu'))).toBe(true);
  });

  it('flags a kanji with no readings at all', () => {
    const errors = validateKanji([{ id: 'n5-一', ...base, onyomi: [], kunyomi: [] }]);
    expect(errors.some((e) => e.includes("no on'yomi"))).toBe(true);
  });

  it('flags a char that is not a single codepoint', () => {
    const errors = validateKanji([{ id: 'n5-学生', ...base, char: '学生' }]);
    expect(errors.some((e) => e.includes('single character'))).toBe(true);
  });
});
