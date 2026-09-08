import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import type { TextPoint, TextQuestion } from '../../src/core/types';
import { parseRuby } from '../../src/core/ruby';

/** Хирагана + катакана (вкл. полуширинную) — не должны попадать в базу чтения "кандзи[чтение]". */
const KANA = /[぀-ヿｦ-ﾟ]/;

const REQUIRED_SECTIONS = ['## Текст', '## Перевод', '## Вопросы'];

export function parseTextFile(path: string): TextPoint {
  const raw = readFileSync(path, 'utf8');
  const { data, content } = matter(raw);

  for (const key of ['id', 'level', 'title'] as const) {
    if (data[key] === undefined) throw new Error(`${path}: frontmatter missing "${key}"`);
  }
  for (const section of REQUIRED_SECTIONS) {
    if (!content.includes(section)) {
      throw new Error(`${path}: missing section "${section}"`);
    }
  }

  return {
    id: String(data['id']),
    level: String(data['level']),
    title: String(data['title']),
    bodyRuby: extractSection(content, '## Текст', ['## Перевод'], path),
    translationRu: extractSection(content, '## Перевод', ['## Вопросы'], path),
    questions: parseQuestions(content, path),
  };
}

function extractSection(content: string, heading: string, stopHeadings: string[], path: string): string {
  const lines = content.split('\n');
  const start = lines.findIndex((l) => l.trim() === heading);
  if (start === -1) throw new Error(`${path}: no "${heading}" section`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (stopHeadings.includes(lines[i]!.trim())) {
      end = i;
      break;
    }
  }
  const body = lines.slice(start + 1, end).join('\n').trim();
  if (!body) throw new Error(`${path}: empty "${heading}" section`);
  return body;
}

function parseQuestions(content: string, path: string): TextQuestion[] {
  const lines = content.split('\n');
  const qStart = lines.findIndex((l) => l.trim() === '## Вопросы');
  if (qStart === -1) throw new Error(`${path}: no "## Вопросы" section`);
  const section = lines.slice(qStart + 1);

  const headingIdxs: number[] = [];
  section.forEach((l, i) => {
    if (l.trim().startsWith('### ')) headingIdxs.push(i);
  });
  if (headingIdxs.length === 0) {
    throw new Error(`${path}: "## Вопросы" section has no "### Вопрос N" headings`);
  }

  const out: TextQuestion[] = [];
  for (let h = 0; h < headingIdxs.length; h++) {
    const blockStart = headingIdxs[h]! + 1;
    const blockEnd = h + 1 < headingIdxs.length ? headingIdxs[h + 1]! : section.length;
    const block = section
      .slice(blockStart, blockEnd)
      .map((l) => l.trim())
      .filter((l) => l !== '');

    const promptLine = block.find((l) => !l.startsWith('- ['));
    if (!promptLine) throw new Error(`${path}: question ${h + 1} has no prompt text`);

    const choiceLines = block.filter((l) => l.startsWith('- ['));
    if (choiceLines.length < 3 || choiceLines.length > 4) {
      throw new Error(`${path}: question ${h + 1} has ${choiceLines.length} choices (need 3-4)`);
    }

    const checkedIdxs: number[] = [];
    choiceLines.forEach((l, i) => {
      if (l.startsWith('- [x]')) checkedIdxs.push(i);
    });
    if (checkedIdxs.length !== 1) {
      throw new Error(
        `${path}: question ${h + 1} has ${checkedIdxs.length} correct answers marked (need exactly 1)`,
      );
    }

    out.push({
      prompt: promptLine,
      choices: choiceLines.map((l) => l.replace(/^- \[[x ]\]\s*/, '')),
      answerIndex: checkedIdxs[0]!,
    });
  }
  return out;
}

export function loadAllTexts(dir: string): TextPoint[] {
  let levelDirs: string[];
  try {
    levelDirs = readdirSync(dir);
  } catch {
    return [];
  }
  const out: TextPoint[] = [];
  for (const level of levelDirs) {
    const levelDir = join(dir, level);
    let files: string[];
    try {
      files = readdirSync(levelDir).filter((f) => f.endsWith('.md'));
    } catch {
      continue;
    }
    for (const f of files) out.push(parseTextFile(join(levelDir, f)));
  }
  return out;
}

export function validateTexts(points: TextPoint[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const p of points) {
    if (ids.has(p.id)) errors.push(`duplicate text id "${p.id}"`);
    ids.add(p.id);

    if (p.questions.length < 3 || p.questions.length > 4) {
      errors.push(`${p.id}: ${p.questions.length} questions (need 3-4)`);
    }
    for (const q of p.questions) {
      if (q.answerIndex < 0 || q.answerIndex >= q.choices.length) {
        errors.push(`${p.id}: answerIndex ${q.answerIndex} out of range for question "${q.prompt}"`);
      }
    }

    let segs;
    try {
      segs = parseRuby(p.bodyRuby);
    } catch (err) {
      errors.push(`${p.id}: unparseable ruby in text body: ${(err as Error).message}`);
      continue;
    }
    for (const s of segs) {
      if (s.ruby !== null && KANA.test(s.base)) {
        errors.push(`${p.id}: ruby base "${s.base}" contains kana in text body`);
      }
    }
  }
  return errors;
}
