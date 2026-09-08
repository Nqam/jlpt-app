import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseTextFile, loadAllTexts, validateTexts } from '../../scripts/build-content/parse-texts';
import type { TextPoint } from '../../src/core/types';

const fix = (n: string) => resolve(__dirname, '../fixtures', n);

function tmpFile(name: string, content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'text-test-'));
  const path = join(dir, name);
  writeFileSync(path, content, 'utf8');
  return path;
}

describe('parseTextFile', () => {
  it('parses frontmatter, body, translation and questions', () => {
    const p = parseTextFile(fix('text-valid.md'));
    expect(p.id).toBe('fix-text-valid');
    expect(p.level).toBe('N5');
    expect(p.title).toBe('тестовый валидный текст');
    expect(p.bodyRuby).toContain('テスト');
    expect(p.translationRu).toContain('тестовое предложение');
    expect(p.questions).toHaveLength(3);
    expect(p.questions[0]!.prompt).toBe('Это тестовый вопрос?');
    expect(p.questions[0]!.choices).toEqual(['Нет', 'Да', 'Может быть']);
    expect(p.questions[0]!.answerIndex).toBe(1);
    expect(p.questions[1]!.answerIndex).toBe(0);
  });

  it('throws when a required section is missing', () => {
    expect(() => parseTextFile(fix('text-missing-section.md'))).toThrow(/Вопросы/);
  });

  it('throws when the "## Текст" section is empty', () => {
    const path = tmpFile('bad.md', [
      '---', 'id: t1', 'level: N5', 'title: "t"', '---', '',
      '## Текст', '',
      '## Перевод', '', 'Тест.', '',
      '## Вопросы', '',
      '### Вопрос 1', 'В?', '- [x] Да', '- [ ] Нет', '- [ ] Может быть', '',
    ].join('\n'));
    expect(() => parseTextFile(path)).toThrow(/empty "## Текст" section/);
  });

  it('throws when a question has fewer than 3 choices', () => {
    const path = tmpFile('bad.md', [
      '---', 'id: t1', 'level: N5', 'title: "t"', '---', '',
      '## Текст', '', 'テスト。', '',
      '## Перевод', '', 'Тест.', '',
      '## Вопросы', '',
      '### Вопрос 1', 'Вопрос?', '- [x] A', '- [ ] B', '',
    ].join('\n'));
    expect(() => parseTextFile(path)).toThrow(/2 choices \(need 3-4\)/);
  });

  it('throws when a question has more than 4 choices', () => {
    const path = tmpFile('bad.md', [
      '---', 'id: t1', 'level: N5', 'title: "t"', '---', '',
      '## Текст', '', 'テスト。', '',
      '## Перевод', '', 'Тест.', '',
      '## Вопросы', '',
      '### Вопрос 1', 'Вопрос?',
      '- [x] A', '- [ ] B', '- [ ] C', '- [ ] D', '- [ ] E', '',
    ].join('\n'));
    expect(() => parseTextFile(path)).toThrow(/5 choices \(need 3-4\)/);
  });

  it('throws when no choice is marked correct', () => {
    const path = tmpFile('bad.md', [
      '---', 'id: t1', 'level: N5', 'title: "t"', '---', '',
      '## Текст', '', 'テスト。', '',
      '## Перевод', '', 'Тест.', '',
      '## Вопросы', '',
      '### Вопрос 1', 'Вопрос?', '- [ ] A', '- [ ] B', '- [ ] C', '',
    ].join('\n'));
    expect(() => parseTextFile(path)).toThrow(/0 correct answers marked \(need exactly 1\)/);
  });

  it('throws when more than one choice is marked correct', () => {
    const path = tmpFile('bad.md', [
      '---', 'id: t1', 'level: N5', 'title: "t"', '---', '',
      '## Текст', '', 'テスト。', '',
      '## Перевод', '', 'Тест.', '',
      '## Вопросы', '',
      '### Вопрос 1', 'Вопрос?', '- [x] A', '- [x] B', '- [ ] C', '',
    ].join('\n'));
    expect(() => parseTextFile(path)).toThrow(/2 correct answers marked \(need exactly 1\)/);
  });

  it('throws when a question heading has no prompt text', () => {
    const path = tmpFile('bad.md', [
      '---', 'id: t1', 'level: N5', 'title: "t"', '---', '',
      '## Текст', '', 'テスト。', '',
      '## Перевод', '', 'Тест.', '',
      '## Вопросы', '',
      '### Вопрос 1', '- [x] A', '- [ ] B', '- [ ] C', '',
    ].join('\n'));
    expect(() => parseTextFile(path)).toThrow(/no prompt text/);
  });
});

describe('loadAllTexts', () => {
  it('derives the level from the directory name and merges every .md file in it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'texts-dir-'));
    const n5Dir = join(dir, 'n5');
    const n4Dir = join(dir, 'n4');
    mkdirSync(n5Dir);
    mkdirSync(n4Dir);
    writeFileSync(join(n5Dir, 'a.md'), [
      '---', 'id: n5-a', 'level: N5', 'title: "a"', '---', '',
      '## Текст', '', 'あ。', '',
      '## Перевод', '', 'А.', '',
      '## Вопросы', '',
      '### Вопрос 1', 'В?', '- [x] Да', '- [ ] Нет', '- [ ] Может быть', '',
    ].join('\n'), 'utf8');
    writeFileSync(join(n4Dir, 'b.md'), [
      '---', 'id: n4-b', 'level: N4', 'title: "b"', '---', '',
      '## Текст', '', 'い。', '',
      '## Перевод', '', 'Б.', '',
      '## Вопросы', '',
      '### Вопрос 1', 'В?', '- [x] Да', '- [ ] Нет', '- [ ] Может быть', '',
    ].join('\n'), 'utf8');
    const points = loadAllTexts(dir);
    expect(points.map((p) => p.id).sort()).toEqual(['n4-b', 'n5-a']);
    expect(points.find((p) => p.id === 'n5-a')!.level).toBe('N5');
  });

  it('returns an empty array for a missing directory instead of throwing', () => {
    expect(loadAllTexts('/no/such/dir/at/all')).toEqual([]);
  });
});

describe('validateTexts', () => {
  const q = (correct = 0): TextPoint['questions'][number] => ({
    prompt: 'В?', choices: ['A', 'B', 'C'], answerIndex: correct,
  });
  const base = (over: Partial<TextPoint> = {}): TextPoint => ({
    id: 't1', level: 'N5', title: 't', bodyRuby: '私[わたし]です。',
    translationRu: 'тест', questions: [q(), q(), q()],
    ...over,
  });

  it('passes clean data', () => {
    expect(validateTexts([base()])).toEqual([]);
  });

  it('flags a duplicate id', () => {
    expect(validateTexts([base(), base()]).some((e) => e.includes('duplicate'))).toBe(true);
  });

  it('flags too few questions', () => {
    const errors = validateTexts([base({ questions: [q(), q()] })]);
    expect(errors.some((e) => e.includes('need 3-4'))).toBe(true);
  });

  it('flags too many questions', () => {
    const errors = validateTexts([base({ questions: [q(), q(), q(), q(), q()] })]);
    expect(errors.some((e) => e.includes('need 3-4'))).toBe(true);
  });

  it('flags an out-of-range answerIndex', () => {
    const errors = validateTexts([base({ questions: [q(9), q(), q()] })]);
    expect(errors.some((e) => e.includes('out of range'))).toBe(true);
  });

  it('flags a ruby base that contains kana', () => {
    const errors = validateTexts([base({ bodyRuby: 'おちゃ[ちゃ]です。' })]);
    expect(errors.some((e) => /ruby base .* contains kana/.test(e))).toBe(true);
  });

  it('flags unparseable ruby', () => {
    const errors = validateTexts([base({ bodyRuby: 'これは[test' })]);
    expect(errors.some((e) => /unparseable ruby/.test(e))).toBe(true);
  });
});
