import type { LessonFull, LessonMarker } from '@/core/types';
import type { GrammarPointFull, ContentDb } from '@/storage/content-db';
import type { Question } from '@/core/quiz/types';
import { generateOfKind } from '@/core/quiz/registry';
import { genVocabMeaning, genVocabReading } from '@/core/quiz/vocab-questions';
import { genKanjiMeaning, genKanjiReading } from '@/core/quiz/kanji-questions';
import { levelPointsFor } from '@/core/quiz/level-points';

export type ReinforceContent = Pick<
  ContentDb,
  'getGrammar' | 'getVocab' | 'getKanji' | 'listGrammar' | 'listVocab' | 'listKanji'
>;

export interface ReinforceItem {
  question: Question;
  /** Marker context sentence (RU) to show above the question. "" when none. */
  contextRu: string;
}

const MAX_QUESTIONS = 3;

function markerFor(lesson: LessonFull, type: string, id: string): LessonMarker | null {
  return lesson.markers.find((m) => m.type === type && m.id === id) ?? null;
}

/** A GrammarPointFull whose only example is the lesson's marker sentence. */
function syntheticGrammarPoint(real: GrammarPointFull, mk: LessonMarker | null): GrammarPointFull {
  return {
    ...real,
    examples:
      mk && mk.sentenceRuby.trim() && mk.sentenceRu.trim()
        ? [{ jaRuby: mk.sentenceRuby, ru: mk.sentenceRu }]
        : [],
  };
}

/** Deterministic coin-flip from a seed string (meaning vs reading). */
function hashParity(s: string): boolean {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h & 1) === 1;
}

export function buildReinforceQuestions(
  lesson: LessonFull,
  content: ReinforceContent,
  seed: string,
): ReinforceItem[] {
  const out: ReinforceItem[] = [];
  const levelPtsCache = new Map<string, GrammarPointFull[]>();
  for (const it of lesson.introduces) {
    if (out.length >= MAX_QUESTIONS) break;
    if (it.role !== 'introduce') continue;
    const qSeed = `${seed}:${it.type}:${it.id}`;
    const mk = markerFor(lesson, it.type, it.id);

    if (it.type === 'grammar') {
      const real = content.getGrammar(it.id);
      if (!real) continue;
      let levelPts = levelPtsCache.get(real.level);
      if (!levelPts) {
        levelPts = levelPointsFor(content, real.level);
        levelPtsCache.set(real.level, levelPts);
      }
      try {
        const q = generateOfKind('cloze', syntheticGrammarPoint(real, mk), levelPts, qSeed);
        out.push({ question: q, contextRu: mk?.sentenceRu ?? '' });
      } catch {
        // no generator produced a question for this point — skip it
      }
      continue;
    }

    if (it.type === 'vocab') {
      const v = content.getVocab(it.id);
      if (!v) continue;
      const pool = content.listVocab(v.level);
      const wantReading = v.headword !== v.reading && hashParity(qSeed);
      const q = wantReading
        ? genVocabReading(v, pool, qSeed)
        : genVocabMeaning(v, pool, qSeed);
      out.push({ question: q, contextRu: mk?.sentenceRu ?? '' });
      continue;
    }

    // kanji
    const k = content.getKanji(it.id);
    if (!k) continue;
    const pool = content.listKanji(k.level);
    const q = hashParity(qSeed)
      ? genKanjiReading(k, pool, qSeed)
      : genKanjiMeaning(k, pool, qSeed);
    out.push({ question: q, contextRu: mk?.sentenceRu ?? '' });
  }
  return out;
}
