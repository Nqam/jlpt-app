import { describe, it, expect } from 'vitest';
import type { LessonMeta } from '@/core/types';
import {
  getCourseStep, setCourseStep, markLessonComplete, isLessonComplete,
  courseCompletedIds, courseLessonStates, currentMandatoryLessonId,
  nextUnlockedLessonId, migrateTextsRead,
  currentCourseLessonId, courseLessonState, nextCourseLessonId,
} from '@/core/course';

/** Minimal in-memory UserDb stand-in: settings only. */
function fakeUser(initial: Record<string, unknown> = {}) {
  const store = new Map<string, unknown>(Object.entries(initial));
  return {
    getSetting<T>(key: string, fallback: T): T {
      return store.has(key) ? (store.get(key) as T) : fallback;
    },
    setSetting(key: string, value: unknown): void {
      store.set(key, value);
    },
    _dump: () => Object.fromEntries(store),
  };
}

const meta = (id: string, stage: number, mandatory: boolean): LessonMeta => ({
  id, stage, kind: 'text', title: id,
  introducesCount: mandatory ? 2 : 0,
  isFreeReading: !mandatory,
});

describe('course progress', () => {
  it('getCourseStep defaults to 0 and round-trips through setCourseStep', () => {
    const u = fakeUser();
    expect(getCourseStep(u, 'l1')).toBe(0);
    setCourseStep(u, 'l1', 3);
    expect(getCourseStep(u, 'l1')).toBe(3);
    setCourseStep(u, 'l2', 1);
    expect(getCourseStep(u, 'l1')).toBe(3); // l2 write does not clobber l1
    expect(getCourseStep(u, 'l2')).toBe(1);
  });

  it('markLessonComplete adds to completed ids (deduped) and drops the progress entry', () => {
    const u = fakeUser();
    setCourseStep(u, 'l1', 4);
    markLessonComplete(u, 'l1');
    markLessonComplete(u, 'l1');
    expect(courseCompletedIds(u)).toEqual(['l1']);
    expect(isLessonComplete(u, 'l1')).toBe(true);
    expect(getCourseStep(u, 'l1')).toBe(0); // progress entry removed
    expect((u._dump()['course_progress'] as Record<string, unknown>)['l1']).toBeUndefined();
  });
});

describe('courseLessonStates gating', () => {
  // spine: m1(stage2) m2(stage6) mandatory; r-a(stage3) r-b(stage8) free reading
  const lessons: LessonMeta[] = [
    meta('m1', 2, true), meta('r-a', 3, false),
    meta('m2', 6, true), meta('r-b', 8, false),
  ];

  it('first mandatory is current, later mandatory locked, reading gated by current stage', () => {
    const s = courseLessonStates(lessons, new Set());
    expect(s.get('m1')).toBe('current');
    expect(s.get('m2')).toBe('locked');
    expect(s.get('r-a')).toBe('locked'); // stage 3 > ceiling 2
    expect(s.get('r-b')).toBe('locked');           // stage 8 > 2
  });

  it('completing m1 makes m2 current and unlocks readings up to m2 stage', () => {
    const s = courseLessonStates(lessons, new Set(['m1']));
    expect(s.get('m1')).toBe('done');
    expect(s.get('m2')).toBe('current');
    expect(s.get('r-a')).toBe('unlocked-reading'); // stage 3 <= 6
    expect(s.get('r-b')).toBe('locked');           // stage 8 > 6
  });

  it('all mandatory done: every reading unlocked, no current', () => {
    const s = courseLessonStates(lessons, new Set(['m1', 'm2']));
    expect(s.get('m1')).toBe('done');
    expect(s.get('m2')).toBe('done');
    expect(s.get('r-a')).toBe('unlocked-reading');
    expect(s.get('r-b')).toBe('unlocked-reading');
    expect(currentMandatoryLessonId(lessons, new Set(['m1', 'm2']))).toBeNull();
  });

  it('no mandatory lessons at all: everything is unlocked reading (today\'s 15-lesson state)', () => {
    const free = [meta('a', 2, false), meta('b', 40, false), meta('c', 52, false)];
    const s = courseLessonStates(free, new Set());
    expect([...s.values()]).toEqual(['unlocked-reading', 'unlocked-reading', 'unlocked-reading']);
    expect(currentMandatoryLessonId(free, new Set())).toBeNull();
  });

  it('does not gate by JLPT level — a high-stage free-reading lesson is unlocked when there is no mandatory spine', () => {
    // courseLessonStates takes no level / unlock-set input: the plan-4g 90% N4
    // rule governs the SRS reference sections, never graded-reading lessons.
    // Stages here span what would be N5..N4..beyond; all must be readable.
    const free = [meta('a', 2, false), meta('b', 42, false), meta('c', 52, false)];
    const s = courseLessonStates(free, new Set());
    expect([...s.values()]).toEqual([
      'unlocked-reading', 'unlocked-reading', 'unlocked-reading',
    ]);
  });

  it('currentMandatoryLessonId is the first uncompleted mandatory in (stage,id) order', () => {
    expect(currentMandatoryLessonId(lessons, new Set())).toBe('m1');
    expect(currentMandatoryLessonId(lessons, new Set(['m1']))).toBe('m2');
  });
});

describe('nextUnlockedLessonId', () => {
  const lessons: LessonMeta[] = [
    meta('m1', 2, true), meta('r-a', 3, false), meta('m2', 6, true),
  ];
  it('returns the next lesson in course order that is not locked', () => {
    // after finishing r-a, from a state where m1 done: m2 is current (unlocked)
    expect(nextUnlockedLessonId(lessons, new Set(['m1']), 'r-a')).toBe('m2');
  });
  it('returns null when nothing after afterId is unlocked', () => {
    // m1 not done -> m2 locked; nothing unlocked after r-a
    expect(nextUnlockedLessonId(lessons, new Set(), 'r-a')).toBeNull();
  });
});

const pts = [{ id: 'g1' }, { id: 'g2' }, { id: 'g3' }, { id: 'g4' }];

describe('grammar course', () => {
  it('currentCourseLessonId skips completed and already-carded points', () => {
    const completed = new Set(['g1']);
    const carded = new Set(['g2']); // known from placement
    const cur = currentCourseLessonId(pts, completed, (id) => carded.has(id));
    expect(cur).toBe('g3');
  });

  it('currentCourseLessonId is null when every point is done or carded', () => {
    const done = new Set(['g1', 'g2', 'g3', 'g4']);
    expect(currentCourseLessonId(pts, done, () => false)).toBeNull();
  });

  it('courseLessonState labels done / current / ahead', () => {
    const completed = new Set(['g1']);
    const hasCard = (id: string) => id === 'g2';
    const cur = currentCourseLessonId(pts, completed, hasCard); // 'g3'
    expect(courseLessonState({ id: 'g1' }, cur, completed, hasCard)).toBe('done');
    expect(courseLessonState({ id: 'g2' }, cur, completed, hasCard)).toBe('done'); // carded
    expect(courseLessonState({ id: 'g3' }, cur, completed, hasCard)).toBe('current');
    expect(courseLessonState({ id: 'g4' }, cur, completed, hasCard)).toBe('ahead');
  });

  it('nextCourseLessonId returns the next list entry or null at the end', () => {
    expect(nextCourseLessonId(pts, 'g2')).toBe('g3');
    expect(nextCourseLessonId(pts, 'g4')).toBeNull();
    expect(nextCourseLessonId(pts, 'nope')).toBeNull();
  });
});

describe('migrateTextsRead', () => {
  it('copies texts_read_ids into course_completed_ids and consumes the old key', () => {
    const u = fakeUser({ texts_read_ids: ['n5-hanami', 'n4-onsen'] });
    migrateTextsRead(u);
    expect(courseCompletedIds(u)).toEqual(['n5-hanami', 'n4-onsen']);
    expect(u.getSetting('texts_read_ids', [])).toEqual([]);
  });

  it('is a no-op when texts_read_ids is empty', () => {
    const u = fakeUser({ course_completed_ids: ['x'] });
    migrateTextsRead(u);
    expect(courseCompletedIds(u)).toEqual(['x']);
  });

  it('does not overwrite a non-empty course_completed_ids (already migrated / real progress)', () => {
    const u = fakeUser({ texts_read_ids: ['a'], course_completed_ids: ['b'] });
    migrateTextsRead(u);
    expect(courseCompletedIds(u)).toEqual(['b']);
    expect(u.getSetting('texts_read_ids', [])).toEqual([]); // still consumed
  });
});
