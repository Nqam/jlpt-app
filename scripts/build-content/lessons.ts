import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import { parseRuby } from '../../src/core/ruby';

/** Хирагана + катакана (вкл. полуширинную) — не должны попадать в базу чтения "кандзи[чтение]". */
const KANA = /[぀-ヿｦ-ﾟ]/;
const REQUIRED_SECTIONS = ['## Текст', '## Перевод', '## Вопросы'];
const KINDS = new Set(['text', 'dialogue']);
const SPEAKER_PREFIX = /^[A-Za-zА-Яа-я]{1,8}:\s/;

export interface ParsedLesson {
  id: string;
  stage: number;
  kind: 'text' | 'dialogue';
  title: string;
  /** Тело "## Текст", абзацы через "\n\n". */
  bodyRuby: string;
  translationRu: string;
  questions: { prompt: string; choices: string[]; answerIndex: number }[];
}

export function parseLessonFile(path: string): ParsedLesson {
  const raw = readFileSync(path, 'utf8');
  const { data, content } = matter(raw);

  for (const key of ['id', 'stage', 'kind', 'title'] as const) {
    if (data[key] === undefined) throw new Error(`${path}: frontmatter missing "${key}"`);
  }
  const kind = String(data['kind']);
  if (!KINDS.has(kind)) throw new Error(`${path}: bad kind "${kind}" (need text|dialogue)`);
  for (const section of REQUIRED_SECTIONS) {
    if (!content.includes(section)) throw new Error(`${path}: missing section "${section}"`);
  }

  const rawBody = extractSection(content, '## Текст', ['## Перевод'], path);
  const translationRu = extractSection(content, '## Перевод', ['## Вопросы'], path);
  const bodyRuby = rawBody.trim();

  if (bodyRuby.split('\n\n').length !== translationRu.split('\n\n').length) {
    throw new Error(
      `${path}: paragraph count differs between "## Текст" (${bodyRuby.split('\n\n').length}) and "## Перевод" (${translationRu.split('\n\n').length})`,
    );
  }
  if (kind === 'dialogue') {
    for (const line of bodyRuby.split('\n\n')) {
      if (!SPEAKER_PREFIX.test(line)) {
        throw new Error(`${path}: dialogue line without speaker prefix: ${JSON.stringify(line)}`);
      }
    }
  }

  return {
    id: String(data['id']),
    stage: Number(data['stage']),
    kind: kind as 'text' | 'dialogue',
    title: String(data['title']),
    bodyRuby,
    translationRu,
    questions: parseQuestions(content, path),
  };
}

function extractSection(content: string, heading: string, stops: string[], path: string): string {
  const lines = content.split('\n');
  const start = lines.findIndex((l) => l.trim() === heading);
  if (start === -1) throw new Error(`${path}: no "${heading}" section`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (stops.includes(lines[i]!.trim())) { end = i; break; }
  }
  const body = lines.slice(start + 1, end).join('\n').trim();
  if (!body) throw new Error(`${path}: empty "${heading}" section`);
  return body;
}

function parseQuestions(content: string, path: string): ParsedLesson['questions'] {
  const lines = content.split('\n');
  const qStart = lines.findIndex((l) => l.trim() === '## Вопросы');
  if (qStart === -1) throw new Error(`${path}: no "## Вопросы" section`);
  const section = lines.slice(qStart + 1);

  const headingIdxs: number[] = [];
  section.forEach((l, i) => { if (l.trim().startsWith('### ')) headingIdxs.push(i); });
  if (headingIdxs.length === 0) {
    throw new Error(`${path}: "## Вопросы" section has no "### Вопрос N" headings`);
  }

  const out: ParsedLesson['questions'] = [];
  for (let h = 0; h < headingIdxs.length; h++) {
    const blockStart = headingIdxs[h]! + 1;
    const blockEnd = h + 1 < headingIdxs.length ? headingIdxs[h + 1]! : section.length;
    const block = section.slice(blockStart, blockEnd).map((l) => l.trim()).filter((l) => l !== '');

    const promptLine = block.find((l) => !l.startsWith('- ['));
    if (!promptLine) throw new Error(`${path}: question ${h + 1} has no prompt text`);

    const choiceLines = block.filter((l) => l.startsWith('- ['));
    if (choiceLines.length < 3 || choiceLines.length > 4) {
      throw new Error(`${path}: question ${h + 1} has ${choiceLines.length} choices (need 3-4)`);
    }
    const checkedIdxs: number[] = [];
    choiceLines.forEach((l, i) => { if (l.startsWith('- [x]')) checkedIdxs.push(i); });
    if (checkedIdxs.length !== 1) {
      throw new Error(`${path}: question ${h + 1} has ${checkedIdxs.length} correct answers marked (need exactly 1)`);
    }
    out.push({
      prompt: promptLine,
      choices: choiceLines.map((l) => l.replace(/^- \[[x ]\]\s*/, '')),
      answerIndex: checkedIdxs[0]!,
    });
  }
  return out;
}

export function loadAllLessons(dir: string): ParsedLesson[] {
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  } catch {
    return [];
  }
  return files.map((f) => parseLessonFile(join(dir, f)));
}

export function validateLessons(lessons: ParsedLesson[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const stages = new Set<number>();
  for (const l of lessons) {
    if (ids.has(l.id)) errors.push(`duplicate lesson id "${l.id}"`);
    ids.add(l.id);
    if (stages.has(l.stage)) errors.push(`${l.id}: duplicate stage ${l.stage}`);
    stages.add(l.stage);
    if (!Number.isInteger(l.stage) || l.stage < 1) errors.push(`${l.id}: bad stage ${l.stage}`);

    if (l.questions.length < 3 || l.questions.length > 4) {
      errors.push(`${l.id}: ${l.questions.length} questions (need 3-4)`);
    }
    for (const q of l.questions) {
      if (q.answerIndex < 0 || q.answerIndex >= q.choices.length) {
        errors.push(`${l.id}: answerIndex ${q.answerIndex} out of range for question "${q.prompt}"`);
      }
    }

    let segs;
    try {
      segs = parseRuby(l.bodyRuby);
    } catch (err) {
      errors.push(`${l.id}: unparseable ruby in body: ${(err as Error).message}`);
      continue;
    }
    for (const s of segs) {
      if (s.ruby !== null && KANA.test(s.base)) {
        errors.push(`${l.id}: ruby base "${s.base}" contains kana in body`);
      }
    }
  }
  return errors;
}
