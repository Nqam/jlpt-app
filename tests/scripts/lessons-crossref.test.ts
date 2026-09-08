import { describe, it, expect } from 'vitest';
import { validateLessonRefs } from '../../scripts/build-content/lessons';
import type { ParsedLesson } from '../../scripts/build-content/lessons';

const sets = {
  grammar: new Set(['n5-teiru', 'n5-wa-particle']),
  kanji: new Set(['n5-学']),
  vocab: new Set(['n5-学校-がっこう']),
};

const base = (over: Partial<ParsedLesson> = {}): ParsedLesson => ({
  id: 'l1', stage: 1, kind: 'text', title: 't',
  bodyRuby: '文[ぶん]。', translationRu: 'т',
  questions: [], introduces: [], reviews: [], markers: [],
  ...over,
});

describe('validateLessonRefs', () => {
  it('пропускает урок, где все id резолвятся', () => {
    const l = base({
      introduces: [{ type: 'grammar', id: 'n5-teiru' }, { type: 'kanji', id: 'n5-学' }],
      reviews: ['n5-wa-particle'],
      markers: [{ type: 'grammar', id: 'n5-teiru', surface: 'x', sentenceRuby: 'x', sentenceRu: '' }],
    });
    expect(validateLessonRefs([l], sets)).toEqual([]);
  });

  it('флагует несуществующий introduces id', () => {
    const l = base({ introduces: [{ type: 'grammar', id: 'n5-nope' }] });
    expect(validateLessonRefs([l], sets).some((e) => e.includes('does not exist'))).toBe(true);
  });

  it('флагует review id, который не резолвится ни в одну таблицу', () => {
    const l = base({ reviews: ['n5-ghost'] });
    expect(validateLessonRefs([l], sets).some((e) => e.includes('resolves to 0 item types'))).toBe(true);
  });

  it('флагует маркер на пункт, который урок не вводит и не повторяет', () => {
    const l = base({
      markers: [{ type: 'grammar', id: 'n5-teiru', surface: 'x', sentenceRuby: 'x', sentenceRu: '' }],
    });
    expect(validateLessonRefs([l], sets).some((e) => e.includes('neither introduced nor reviewed'))).toBe(true);
  });

  it('флагует пункт, который одновременно introduced и reviewed', () => {
    const l = base({
      introduces: [{ type: 'grammar', id: 'n5-teiru' }],
      reviews: ['n5-teiru'],
    });
    expect(validateLessonRefs([l], sets).some((e) => e.includes('both introduced and reviewed'))).toBe(true);
  });
});
