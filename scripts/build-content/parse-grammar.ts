import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import type { GrammarPoint, GrammarExample } from '../../src/core/types';
import { parseRuby } from '../../src/core/ruby';

/** Хирагана + катакана (вкл. полуширинную) — не должны попадать в базу чтения "кандзи[чтение]". */
const KANA = /[぀-ヿｦ-ﾟ]/;

const REQUIRED_SECTIONS = ['## Кратко', '## Образование', '## Нюансы', '## Примеры', '## Частые ошибки'];

export function parseGrammarFile(path: string): GrammarPoint {
  const raw = readFileSync(path, 'utf8');
  const { data, content } = matter(raw);

  for (const key of ['id', 'level', 'title', 'layer'] as const) {
    if (data[key] === undefined) throw new Error(`${path}: frontmatter missing "${key}"`);
  }
  for (const section of REQUIRED_SECTIONS) {
    if (!content.includes(section)) {
      throw new Error(`${path}: missing section "${section}"`);
    }
  }

  const examples = parseExamples(content, path);

  return {
    id: String(data['id']),
    level: String(data['level']),
    title: String(data['title']),
    layer: Number(data['layer']),
    tags: Array.isArray(data['tags']) ? data['tags'].map(String) : [],
    related: Array.isArray(data['related']) ? data['related'].map(String) : [],
    bodyMarkdown: content.trim(),
    examples,
    kanjiIds: [],
    introducesVocab: Array.isArray(data['introduces_vocab'])
      ? data['introduces_vocab'].map(String)
      : [],
  };
}

function parseExamples(content: string, path: string): GrammarExample[] {
  const lines = content.split('\n');
  const start = lines.findIndex((l) => l.trim() === '## Примеры');
  if (start === -1) throw new Error(`${path}: no "## Примеры" section`);
  const out: GrammarExample[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line.startsWith('## ')) break;
    if (!line.startsWith('- ')) continue;
    const body = line.slice(2);
    const dash = body.indexOf(' — ');
    if (dash === -1) throw new Error(`${path}: example without " — " separator: ${line}`);
    out.push({ jaRuby: body.slice(0, dash).trim(), ru: body.slice(dash + 3).trim() });
  }
  return out;
}

export function loadAllGrammar(dir: string): GrammarPoint[] {
  const out: GrammarPoint[] = [];
  for (const level of readdirSync(dir)) {
    const levelDir = join(dir, level);
    let files: string[];
    try {
      files = readdirSync(levelDir).filter((f) => f.endsWith('.md'));
    } catch {
      continue;
    }
    for (const f of files) out.push(parseGrammarFile(join(levelDir, f)));
  }
  return out;
}

export function validateGrammar(points: GrammarPoint[]): string[] {
  const errors: string[] = [];
  const ids = new Set(points.map((p) => p.id));
  for (const p of points) {
    if (p.examples.length < 3) errors.push(`${p.id}: only ${p.examples.length} examples (need >= 3)`);
    for (const r of p.related) {
      if (!ids.has(r)) errors.push(`${p.id}: related id "${r}" does not exist`);
    }
    if (!Number.isInteger(p.layer) || p.layer < 1) errors.push(`${p.id}: bad layer ${p.layer}`);
    for (const ex of p.examples) {
      let segs;
      try {
        segs = parseRuby(ex.jaRuby);
      } catch (err) {
        errors.push(`${p.id}: unparseable ruby in example "${ex.jaRuby}": ${(err as Error).message}`);
        continue;
      }
      for (const s of segs) {
        if (s.ruby !== null && KANA.test(s.base)) {
          errors.push(`${p.id}: ruby base "${s.base}" contains kana in example "${ex.jaRuby}"`);
        }
      }
    }
  }
  return errors;
}
