import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import type { ItemType } from '../../src/core/types';
import { parseRuby } from '../../src/core/ruby';

/** Хирагана + катакана (вкл. полуширинную) — не должны попадать в базу чтения "кандзи[чтение]". */
const KANA = /[぀-ヿｦ-ﾟ]/;
const REQUIRED_SECTIONS = ['## Текст', '## Перевод', '## Вопросы'];
const KINDS = new Set(['text', 'dialogue']);
const SPEAKER_PREFIX = /^[A-Za-zА-Яа-я]{1,8}:\s/;
/** {{TYPE:id|surface}} — TYPE один из v/g/k; id без '|'; surface без '}}'. */
const MARKER_RE = /\{\{([vgk]):([^|{}]+)\|([^}]*)\}\}/g;
const TYPE_MAP: Record<string, ItemType> = { v: 'vocab', g: 'grammar', k: 'kanji' };
const SENTENCE_ENDS = ['。', '！', '？'];

export interface ParsedLesson {
  id: string;
  stage: number;
  kind: 'text' | 'dialogue';
  title: string;
  /** Тело "## Текст" с развёрнутыми маркерами, абзацы через "\n\n". */
  bodyRuby: string;
  translationRu: string;
  questions: { prompt: string; choices: string[]; answerIndex: number }[];
  /** Из introduces_grammar / introduces_vocab / introduces_kanji. */
  introduces: { type: ItemType; id: string }[];
  /** Сырые id из frontmatter reviews — тип резолвится в validateLessonRefs. */
  reviews: string[];
  markers: {
    type: ItemType;
    id: string;
    surface: string;
    sentenceRuby: string;
    sentenceRu: string;
  }[];
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
  const { bodyRuby, markers } = parseMarkers(rawBody, translationRu, path);

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

  const introducesRaw = [
    ...toIdList(data['introduces_grammar']).map((id) => ({ type: 'grammar' as ItemType, id })),
    ...toIdList(data['introduces_vocab']).map((id) => ({ type: 'vocab' as ItemType, id })),
    ...toIdList(data['introduces_kanji']).map((id) => ({ type: 'kanji' as ItemType, id })),
  ];

  return {
    id: String(data['id']),
    stage: Number(data['stage']),
    kind: kind as 'text' | 'dialogue',
    title: String(data['title']),
    bodyRuby,
    translationRu,
    questions: parseQuestions(content, path),
    introduces: introducesRaw,
    reviews: toIdList(data['reviews']),
    markers,
  };
}

function toIdList(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : [];
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

function expandMarkers(s: string): string {
  // Fresh regex per call: MARKER_RE is stateful (global flag) and reused by the
  // exec loop in parseMarkers — sharing it here would reset that loop's lastIndex.
  return s.replace(new RegExp(MARKER_RE.source, 'g'), (_m, _t, _id, surface) => surface);
}

function parseMarkers(
  rawBody: string,
  translationRu: string,
  path: string,
): { bodyRuby: string; markers: ParsedLesson['markers'] } {
  const bodyParagraphs = rawBody.split('\n\n');
  const transParagraphs = translationRu.split('\n\n');
  const parityOk = bodyParagraphs.length === transParagraphs.length;

  const markers: ParsedLesson['markers'] = [];
  const seen = new Set<string>();
  MARKER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MARKER_RE.exec(rawBody)) !== null) {
    const type = TYPE_MAP[m[1]!]!;
    const id = m[2]!.trim();
    const surface = m[3]!;
    const key = `${type}:${id}`;
    if (seen.has(key)) {
      throw new Error(`${path}: marker for "${id}" appears more than once (mark only the first occurrence)`);
    }
    seen.add(key);

    // предложение-контекст в сыром теле (границы: 。！？ или \n\n или края)
    const start = m.index;
    const end = m.index + m[0]!.length;
    const before = rawBody.slice(0, start);
    const after = rawBody.slice(end);
    const seps = [...SENTENCE_ENDS.map((t) => before.lastIndexOf(t)), before.lastIndexOf('\n\n')];
    const cut = Math.max(...seps);
    const from = cut === -1 ? 0 : cut + (before.slice(cut).startsWith('\n\n') ? 2 : 1);
    let toRel = after.length;
    for (const t of SENTENCE_ENDS) {
      const i = after.indexOf(t);
      if (i !== -1) toRel = Math.min(toRel, i + 1);
    }
    const nn = after.indexOf('\n\n');
    if (nn !== -1) toRel = Math.min(toRel, nn);
    let sentenceRuby = expandMarkers(rawBody.slice(from, end + toRel)).trim();
    sentenceRuby = sentenceRuby.replace(SPEAKER_PREFIX, '');
    if (sentenceRuby.includes('{{') || sentenceRuby.includes('}}')) {
      throw new Error(
        `${path}: marker "${id}" — sentence context clips an adjacent marker; put markers in separate sentences`,
      );
    }

    // абзац перевода: индекс абзаца тела, где стоит маркер
    let acc = 0;
    let pIdx = 0;
    for (; pIdx < bodyParagraphs.length; pIdx++) {
      const len = bodyParagraphs[pIdx]!.length + 2;
      if (start < acc + len) break;
      acc += len;
    }
    const sentenceRu = parityOk ? (transParagraphs[pIdx] ?? '').trim() : '';

    markers.push({ type, id, surface, sentenceRuby, sentenceRu });
  }

  const bodyRuby = expandMarkers(rawBody);
  if (bodyRuby.includes('{{') || bodyRuby.includes('}}')) {
    throw new Error(`${path}: unrecognized marker syntax (stray "{{" or "}}" after expansion)`);
  }
  return { bodyRuby, markers };
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

    const seenIntro = new Set<string>();
    for (const it of l.introduces) {
      const k = `${it.type}:${it.id}`;
      if (seenIntro.has(k)) errors.push(`${l.id}: duplicate introduce "${it.type}:${it.id}"`);
      seenIntro.add(k);
    }
    const seenReview = new Set<string>();
    for (const rid of l.reviews) {
      if (seenReview.has(rid)) errors.push(`${l.id}: duplicate review id "${rid}"`);
      seenReview.add(rid);
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

export function validateLessonRefs(
  lessons: ParsedLesson[],
  sets: { grammar: Set<string>; kanji: Set<string>; vocab: Set<string> },
): string[] {
  const setFor = (t: ItemType): Set<string> =>
    t === 'grammar' ? sets.grammar : t === 'kanji' ? sets.kanji : sets.vocab;
  const errors: string[] = [];
  for (const l of lessons) {
    const introduced = new Set(l.introduces.map((it) => `${it.type}:${it.id}`));
    for (const it of l.introduces) {
      if (!setFor(it.type).has(it.id)) {
        errors.push(`${l.id}: introduces ${it.type} id "${it.id}" does not exist`);
      }
    }
    for (const rid of l.reviews) {
      const hits = (['grammar', 'kanji', 'vocab'] as ItemType[]).filter((t) => setFor(t).has(rid));
      if (hits.length !== 1) {
        errors.push(`${l.id}: review id "${rid}" resolves to ${hits.length} item types (need exactly 1)`);
      } else if (introduced.has(`${hits[0]}:${rid}`)) {
        errors.push(`${l.id}: "${rid}" is both introduced and reviewed`);
      }
    }
    for (const m of l.markers) {
      if (!setFor(m.type).has(m.id)) {
        errors.push(`${l.id}: marker ${m.type} id "${m.id}" does not exist`);
      }
      const known = introduced.has(`${m.type}:${m.id}`) || l.reviews.includes(m.id);
      if (!known) {
        errors.push(`${l.id}: marker "${m.id}" is neither introduced nor reviewed by this lesson`);
      }
    }
  }
  return errors;
}
