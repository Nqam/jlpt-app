import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseLessonFile, loadAllLessons, validateLessons } from '../../scripts/build-content/lessons';
import type { ParsedLesson } from '../../scripts/build-content/lessons';

const fix = (n: string) => resolve(__dirname, '../fixtures/lessons', n);

function tmpFile(content: string, name = 'l.md'): string {
  const dir = mkdtempSync(join(tmpdir(), 'lesson-test-'));
  const path = join(dir, name);
  writeFileSync(path, content, 'utf8');
  return path;
}

const fm = (over: Record<string, string> = {}): string[] => [
  '---',
  `id: ${over['id'] ?? 't1'}`,
  `stage: ${over['stage'] ?? '3'}`,
  `kind: ${over['kind'] ?? 'text'}`,
  `title: ${over['title'] ?? '"t"'}`,
  '---',
  '',
];

const body = (text: string): string[] => ['## Текст', '', text, ''];
const trans = (text: string): string[] => ['## Перевод', '', text, ''];
const oneQuestion = (): string[] => [
  '## Вопросы', '',
  '### Вопрос 1', 'В?', '- [x] Да', '- [ ] Нет', '- [ ] Может быть', '',
  '### Вопрос 2', 'В2?', '- [x] Да', '- [ ] Нет', '- [ ] Может быть', '',
  '### Вопрос 3', 'В3?', '- [x] Да', '- [ ] Нет', '- [ ] Может быть', '',
];

describe('parseLessonFile', () => {
  it('парсит frontmatter, тело, перевод, вопросы, introduces и маркеры', () => {
    const l = parseLessonFile(fix('lesson-text-valid.md'));
    expect(l.id).toBe('fix-lesson-text');
    expect(l.stage).toBe(3);
    expect(l.kind).toBe('text');
    expect(l.title).toBe('Тестовый урок-текст');
    expect(l.questions).toHaveLength(3);
    // introduces собраны из трёх frontmatter-списков
    expect(l.introduces).toEqual([
      { type: 'grammar', id: 'n5-teiru' },
      { type: 'vocab', id: 'n5-学校-がっこう' },
      { type: 'kanji', id: 'n5-学' },
    ]);
    expect(l.reviews).toEqual(['n5-wa-particle']);
    // тело хранится с развёрнутыми маркерами
    expect(l.bodyRuby).toContain('六時[ろくじ]に 起[お]きています');
    expect(l.bodyRuby).not.toContain('{{');
    // маркеры: тип, id, surface, предложение-контекст
    const g = l.markers.find((m) => m.id === 'n5-teiru')!;
    expect(g.type).toBe('grammar');
    expect(g.surface).toBe('六時[ろくじ]に 起[お]きています');
    expect(g.sentenceRuby).toBe('毎朝[まいあさ] 六時[ろくじ]に 起[お]きています。');
    expect(g.sentenceRu).toBe('Каждое утро встаю в шесть. До школы еду на автобусе.');
    expect(l.markers.map((m) => m.type).sort()).toEqual(['grammar', 'kanji', 'vocab']);
  });

  it('парсит диалог: kind=dialogue, реплики как абзацы', () => {
    const l = parseLessonFile(fix('lesson-dialogue-valid.md'));
    expect(l.kind).toBe('dialogue');
    expect(l.bodyRuby.split('\n\n')).toHaveLength(2);
    expect(l.bodyRuby.split('\n\n')[0]).toBe('A: おはよう。');
  });

  it('бросает при отсутствующей секции', () => {
    expect(() => parseLessonFile(fix('lesson-missing-section.md'))).toThrow(/Вопросы/);
  });

  it('бросает при отсутствии frontmatter-ключа stage', () => {
    const path = tmpFile([
      '---', 'id: t1', 'kind: text', 'title: "t"', '---', '',
      ...body('文[ぶん]。'), ...trans('Т.'), ...oneQuestion(),
    ].join('\n'));
    expect(() => parseLessonFile(path)).toThrow(/stage/);
  });

  it('бросает при неизвестном kind', () => {
    const path = tmpFile([
      ...fm({ kind: 'video' }), ...body('文[ぶん]。'), ...trans('Т.'), ...oneQuestion(),
    ].join('\n'));
    expect(() => parseLessonFile(path)).toThrow(/kind/);
  });

  it('бросает при повторном маркере одного пункта', () => {
    const path = tmpFile([
      ...fm(), ...body('{{g:n5-teiru|A}}。 それから {{g:n5-teiru|B}}。'),
      ...trans('Одно предложение. Второе предложение.'), ...oneQuestion(),
    ].join('\n'));
    expect(() => parseLessonFile(path)).toThrow(/marker .*n5-teiru.* appears more than once/);
  });

  it('бросает при нераспознанном синтаксисе маркера ({{ осталось в теле)', () => {
    const path = tmpFile([
      ...fm(), ...body('文[ぶん] {{x:foo|bar}}。'), ...trans('Т.'), ...oneQuestion(),
    ].join('\n'));
    expect(() => parseLessonFile(path)).toThrow(/unrecognized marker syntax/);
  });

  it('бросает при паритете абзацев тело/перевод', () => {
    const path = tmpFile([
      ...fm(), ...body('一[ひと]つ。\n\n二[ふた]つ。'), ...trans('Только один.'), ...oneQuestion(),
    ].join('\n'));
    expect(() => parseLessonFile(path)).toThrow(/paragraph count/);
  });

  it('бросает при вопросе с числом вариантов вне 3-4', () => {
    const path = tmpFile([
      ...fm(), ...body('文[ぶん]。'), ...trans('Т.'),
      '## Вопросы', '', '### Вопрос 1', 'В?', '- [x] A', '- [ ] B', '',
    ].join('\n'));
    expect(() => parseLessonFile(path)).toThrow(/2 choices \(need 3-4\)/);
  });

  it('бросает при диалоге, где строка без префикса говорящего', () => {
    const path = tmpFile([
      ...fm({ kind: 'dialogue' }),
      '## Текст', '', 'A: こんにちは。', '', 'ただの文[ぶん]。', '',
      '## Перевод', '', 'A: Привет.', '', 'Просто предложение.', '',
      ...oneQuestion(),
    ].join('\n'));
    expect(() => parseLessonFile(path)).toThrow(/speaker prefix/);
  });
});

describe('parseMarkers (via parseLessonFile)', () => {
  const withFrontmatter = (lines: string[]): string[] => [
    '---', 'id: t1', 'stage: 3', 'kind: text', 'title: "t"', '---', '', ...lines,
  ];

  it('1. маркер в начале тела → предложение от начала до первой 。', () => {
    const path = tmpFile(withFrontmatter([
      ...body('{{g:g1|文[ぶん]}}です。次[つぎ]の 話[はなし]。'),
      ...trans('Первое предложение. Второе предложение.'),
      ...oneQuestion(),
    ]).join('\n'));
    const l = parseLessonFile(path);
    const mk = l.markers.find((m) => m.id === 'g1')!;
    expect(mk.sentenceRuby).toBe('文[ぶん]です。');
  });

  it('2. маркер во 2-м абзаце → sentenceRu берётся из 2-го абзаца перевода', () => {
    const path = tmpFile(withFrontmatter([
      ...body('一[ひと]つ目[め]。\n\n{{g:g1|二[ふた]つ目[め]}}です。'),
      ...trans('Первый абзац.\n\nВторой абзац.'),
      ...oneQuestion(),
    ]).join('\n'));
    const l = parseLessonFile(path);
    const mk = l.markers.find((m) => m.id === 'g1')!;
    expect(mk.sentenceRu).toBe('Второй абзац.');
  });

  it('3. dialogue: sentenceRuby без префикса говорящего, sentenceRu — с ним', () => {
    const path = tmpFile([
      ...fm({ kind: 'dialogue' }),
      '## Текст', '', 'A: {{g:g1|おはよう}}ございます。', '',
      '## Перевод', '', 'A: Доброе утро.', '',
      ...oneQuestion(),
    ].join('\n'));
    const l = parseLessonFile(path);
    const mk = l.markers.find((m) => m.id === 'g1')!;
    expect(mk.sentenceRuby).toBe('おはようございます。');
    expect(mk.sentenceRu).toBe('A: Доброе утро.');
  });

  it('4. два чистых маркера в одном предложении → у обоих одинаковый полный контекст без скобок', () => {
    const path = tmpFile(withFrontmatter([
      ...body('{{g:g1|今日[きょう]}}は {{v:v1|寒[さむ]い}}です。'),
      ...trans('Сегодня холодно.'),
      ...oneQuestion(),
    ]).join('\n'));
    const l = parseLessonFile(path);
    const g = l.markers.find((m) => m.id === 'g1')!;
    const v = l.markers.find((m) => m.id === 'v1')!;
    expect(g.sentenceRuby).toBe('今日[きょう]は 寒[さむ]いです。');
    expect(v.sentenceRuby).toBe('今日[きょう]は 寒[さむ]いです。');
    expect(g.sentenceRuby).not.toMatch(/\{\{|\}\}/);
  });

  it('5. FR-2: surface с 。 вплотную перед следующим маркером → бросает "clips an adjacent marker"', () => {
    const path = tmpFile(withFrontmatter([
      ...body('{{g:g1|文[ぶん]。次[つぎ]}}{{v:v1|それ}}です。'),
      ...trans('Одно предложение. Второе.'),
      ...oneQuestion(),
    ]).join('\n'));
    expect(() => parseLessonFile(path)).toThrow(/clips an adjacent marker/);
  });
});

describe('validateLessons — дубли ссылок (FR-1)', () => {
  const withFm = (lines: string[]): string =>
    ['---', 'id: t1', 'stage: 3', 'kind: text', 'title: "t"', ...lines, '---', '',
      ...body('文[ぶん]。'), ...trans('Т.'), ...oneQuestion()].join('\n');

  it('6. FR-1: introduces_grammar с повтором id → ошибка /duplicate introduce/', () => {
    const l = parseLessonFile(tmpFile(withFm(['introduces_grammar:', '  - g1', '  - g1'])));
    expect(validateLessons([l]).some((e) => /duplicate introduce/.test(e))).toBe(true);
  });

  it('7. FR-1: reviews с повтором id → ошибка /duplicate review/', () => {
    const l = parseLessonFile(tmpFile(withFm(['reviews:', '  - g1', '  - g1'])));
    expect(validateLessons([l]).some((e) => /duplicate review/.test(e))).toBe(true);
  });
});

describe('loadAllLessons', () => {
  it('читает все *.md из плоского каталога', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lessons-dir-'));
    writeFileSync(join(dir, 'a.md'), [
      ...fm({ id: 'a', stage: '1' }), ...body('あ。'), ...trans('А.'), ...oneQuestion(),
    ].join('\n'), 'utf8');
    writeFileSync(join(dir, 'b.md'), [
      ...fm({ id: 'b', stage: '2' }), ...body('い。'), ...trans('Б.'), ...oneQuestion(),
    ].join('\n'), 'utf8');
    expect(loadAllLessons(dir).map((l) => l.id).sort()).toEqual(['a', 'b']);
  });

  it('возвращает [] для отсутствующего каталога', () => {
    expect(loadAllLessons('/no/such/dir')).toEqual([]);
  });
});

describe('validateLessons', () => {
  const q = (correct = 0): ParsedLesson['questions'][number] => ({
    prompt: 'В?', choices: ['A', 'B', 'C'], answerIndex: correct,
  });
  const base = (over: Partial<ParsedLesson> = {}): ParsedLesson => ({
    id: 'l1', stage: 1, kind: 'text', title: 't',
    bodyRuby: '文[ぶん]です。', translationRu: 'тест',
    questions: [q(), q(), q()], introduces: [], reviews: [], markers: [],
    ...over,
  });

  it('пропускает чистые данные', () => {
    expect(validateLessons([base()])).toEqual([]);
  });

  it('флагует дубль id', () => {
    expect(validateLessons([base(), base()]).some((e) => e.includes('duplicate lesson id'))).toBe(true);
  });

  it('флагует дубль stage', () => {
    const errs = validateLessons([base({ id: 'a', stage: 5 }), base({ id: 'b', stage: 5 })]);
    expect(errs.some((e) => e.includes('duplicate stage'))).toBe(true);
  });

  it('флагует нецелый/неположительный stage', () => {
    expect(validateLessons([base({ stage: 0 })]).some((e) => e.includes('bad stage'))).toBe(true);
  });

  it('флагует число вопросов вне 3-4', () => {
    expect(validateLessons([base({ questions: [q(), q()] })]).some((e) => e.includes('need 3-4'))).toBe(true);
  });

  it('флагует answerIndex вне диапазона', () => {
    expect(validateLessons([base({ questions: [q(9), q(), q()] })]).some((e) => e.includes('out of range'))).toBe(true);
  });

  it('флагует ruby-базу с каной', () => {
    expect(validateLessons([base({ bodyRuby: 'おちゃ[ちゃ]です。' })]).some((e) => /ruby base .* contains kana/.test(e))).toBe(true);
  });

  it('флагует непарсящуюся ruby', () => {
    expect(validateLessons([base({ bodyRuby: 'これは[' })]).some((e) => /unparseable ruby/.test(e))).toBe(true);
  });
});
