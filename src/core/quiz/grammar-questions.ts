import type { GrammarPointFull } from '@/storage/content-db';
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

export function coreCandidates(title: string): string[] {
  const head = title.split('(')[0] ?? title;
  return head
    .split(/[／/]/)
    .map((s) => s.replace(/[〜~\s]/g, '').trim())
    .filter(Boolean);
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


export const genCloze: GrammarGenerator = (point, levelPoints, seed) => {
  const cands = coreCandidates(point.title);
  if (!point.examples.length || !cands.length) return null;

  // DEVIATION FROM BRIEF: the brief's cloze step 2 says to iterate examples in
  // `seededShuffle(point.examples, seed)` order, but the brief test
  // ("blanks the construction core…") asserts the blank is produced from the
  // FIRST declared example (its fixture has the core `は` in every example, so
  // only iteration order decides). Iterating in declared order is the smallest
  // change that satisfies the test; the function stays a pure, deterministic
  // function of (point, levelPoints, seed). Reported to the controller.
  for (const ex of point.examples) {
    const segs = parseRuby(ex.jaRuby);
    for (const core of cands) {
      const si = segs.findIndex(
        (s) => s.ruby === null && s.base.trim() !== '' && s.base.includes(core),
      );
      if (si === -1) continue;
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
        choices: list, answerIndex,
      };
      return q;
    }
  }
  return null;
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
