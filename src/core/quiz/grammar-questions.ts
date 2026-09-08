import type { GrammarPointFull } from '@/storage/content-db';
import type { RubySegment } from '@/core/types';
import type {
  Question, ClozeQuestion, ChoiceQuestion, AssembleQuestion,
} from '@/core/quiz/types';
import { parseRuby, stringifyRuby } from '@/core/ruby';
import { seededShuffle } from '@/core/quiz/rng';
import { pickDistractors, distractorPool, shuffleWithAnswer } from '@/core/quiz/distractors';

export type GrammarGenerator = (
  point: GrammarPointFull,
  levelPoints: readonly GrammarPointFull[],
  seed: string,
) => Question | null;

/** Непрерывный кусок японского текста (кана + кандзи + 々ー). */
const JP_RUN = /[぀-ヿ一-鿿々ー]+/g;

/**
 * Спрягаемые варианты ядра конструкции: в примерах оно часто стоит не в
 * словарной форме из заголовка (〜ている), а в вежливой/озвонченной
 * (〜ています, 〜でいます). Без этого cloze не находит куда ставить пропуск и
 * вопрос сваливается на слабый fallback «Что выражает…».
 */
function conjugationVariants(core: string): string[] {
  const v: string[] = [];
  if (core.endsWith('ている')) {
    const s = core.slice(0, -3);
    v.push(`${s}ています`, `${s}でいます`, `${s}でいる`, `${s}てる`, `${s}でる`);
  }
  if (core.endsWith('ていない') || core.endsWith('ていません')) {
    const s = core.replace(/てい(ない|ません)$/, '');
    v.push(`${s}ていません`, `${s}でいません`, `${s}ていない`, `${s}でいない`);
  }
  if (core.endsWith('いる') && !core.endsWith('ている')) v.push(`${core.slice(0, -2)}います`);
  if (core.endsWith('だ')) v.push(`${core.slice(0, -1)}です`);
  return v;
}

export function coreCandidates(title: string): string[] {
  const head = title.split('(')[0] ?? title;
  const out = new Set<string>();
  for (const part of head.split(/[／/〜~+]/)) {
    for (const run of part.match(JP_RUN) ?? []) {
      out.add(run);
      for (const variant of conjugationVariants(run)) out.add(variant);
    }
  }
  // Длинные (более специфичные) кандидаты — первыми.
  return [...out].sort((a, b) => b.length - a.length);
}

function stripTitleParen(title: string): string {
  return (title.split('(')[0] ?? title).trim();
}

export function sectionBody(markdown: string, heading: string): string | null {
  const re = new RegExp(`##\\s+${heading}\\s*\\n([\\s\\S]*?)(?:\\n##\\s|$)`);
  const m = markdown.match(re);
  if (!m || !m[1]) return null;
  const body = m[1].trim().replace(/\s+/g, ' ');
  return body || null;
}

export function firstSentence(text: string, max = 80): string {
  const clean = text.trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return `${sp > 20 ? cut.slice(0, sp) : cut}…`;
}


const JP_CHAR = /[぀-ヿ一-鿿々ー]/g;
const jpLen = (s: string) => (s.match(JP_CHAR) ?? []).length;

/** Минимум японского текста ВОКРУГ пропуска, чтобы вопрос был не наугад. */
const MIN_CLOZE_CTX_CHARS = 6;
const MIN_CLOZE_CTX_RUNS = 2;

/** Сколько японского контекста остаётся в предложении, если вырезать `core` из сегмента `si`. */
function clozeContext(segs: readonly RubySegment[], si: number, core: string) {
  let chars = 0;
  let runs = 0;
  segs.forEach((s, i) => {
    const n = jpLen(s.base) + jpLen(s.ruby ?? '') - (i === si ? core.length : 0);
    if (n <= 0) return;
    chars += n;
    if (i !== si) runs += 1;
  });
  return { chars, runs };
}

export const genCloze: GrammarGenerator = (point, levelPoints, seed) => {
  const cands = coreCandidates(point.title);
  if (!point.examples.length || !cands.length) return null;

  // Among ALL examples, find every one where a construction core lands in a
  // furigana-free segment AND enough sentence survives around the blank to
  // make the choice non-arbitrary (a 2-mora stub like `食べ___。` is rejected).
  // Pick the example with the most surrounding context; ties break toward a
  // non-empty translation, then declared order — deterministic, and the
  // longstanding "first declared example" behaviour still holds when examples
  // are equal length.
  type Hit = { idx: number; core: string; segs: RubySegment[]; si: number; ctx: number };
  const hits: Hit[] = [];
  point.examples.forEach((ex, idx) => {
    if (!ex.ru.trim()) return; // cloze always shows a translation for context
    const segs = parseRuby(ex.jaRuby);
    for (const core of cands) {
      const si = segs.findIndex(
        (s) => s.ruby === null && s.base.trim() !== '' && s.base.includes(core),
      );
      if (si === -1) continue;
      const ctx = clozeContext(segs, si, core);
      if (ctx.chars >= MIN_CLOZE_CTX_CHARS && ctx.runs >= MIN_CLOZE_CTX_RUNS) {
        hits.push({ idx, core, segs, si, ctx: ctx.chars });
      }
      break; // first (longest) matched core decides this example
    }
  });
  if (!hits.length) return null;

  hits.sort((a, b) => b.ctx - a.ctx || a.idx - b.idx);
  const { idx, core, segs, si } = hits[0]!;
  const seg = segs[si]!;
  const at = seg.base.indexOf(core);
  const blanked = `${seg.base.slice(0, at)}___${seg.base.slice(at + core.length)}`;
  const newSegs = segs.slice();
  newSegs[si] = { base: blanked, ruby: null };
  const pool = distractorPool(levelPoints, point.id, (p) => coreCandidates(p.title));
  const distractors = pickDistractors(pool, core, 3, `${seed}:d`);
  const { list, answerIndex } = shuffleWithAnswer([core, ...distractors], `${seed}:c`);
  const q: ClozeQuestion = {
    id: seed, itemType: 'grammar', itemId: point.id, kind: 'cloze',
    prompt: 'Выбери пропущенное слово',
    sentenceRuby: stringifyRuby(newSegs),
    translationRu: point.examples[idx]!.ru,
    choices: list, answerIndex,
  };
  return q;
};

export const genChoice: GrammarGenerator = (point, levelPoints, seed) => {
  const raw = sectionBody(point.bodyMarkdown, 'Кратко');
  if (!raw) return null;
  const correct = firstSentence(raw);
  const pool = distractorPool(levelPoints, point.id, (p) => {
    const s = sectionBody(p.bodyMarkdown, 'Кратко');
    return s ? [firstSentence(s)] : [];
  });
  const distractors = pickDistractors(pool, correct, 3, `${seed}:d`);
  const { list, answerIndex } = shuffleWithAnswer([correct, ...distractors], `${seed}:c`);
  const q: ChoiceQuestion = {
    id: seed, itemType: 'grammar', itemId: point.id, kind: 'choice',
    prompt: `Что выражает «${stripTitleParen(point.title)}»?`,
    choices: list, answerIndex,
  };
  return q;
};

export const genAssemble: GrammarGenerator = (point, _levelPoints, seed) => {
  for (const ex of seededShuffle(point.examples, seed)) {
    if (!ex.ru.trim()) continue; // assemble always shows the target meaning
    const toks = ex.jaRuby.trim().split(/\s+/);
    if (toks.length < 4) continue;
    let perm = seededShuffle([...toks.keys()], `${seed}:t`);
    if (perm.every((v, i) => v === i)) perm = [...perm.slice(1), perm[0]!];
    const tokens = perm.map((i) => toks[i]!);
    const answerOrder = [...perm.keys()].sort((a, b) => perm[a]! - perm[b]!);
    const q: AssembleQuestion = {
      id: seed, itemType: 'grammar', itemId: point.id, kind: 'assemble',
      prompt: 'Собери предложение',
      tokens, answerOrder, translationRu: ex.ru,
    };
    return q;
  }
  return null;
};
