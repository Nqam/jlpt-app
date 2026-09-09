import { describe, it, expect } from 'vitest';
import {
  getCourseStep, setCourseStep, markLessonComplete, isLessonComplete,
  courseCompletedIds, migrateCourseKeys,
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

describe('migrateCourseKeys', () => {
  const fakeContent = {
    getGrammar: (id: string) => (id.startsWith('n5-') ? ({ id } as never) : null),
  };

  it('moves non-grammar completed ids to texts_read_ids, once', () => {
    const u = fakeUser({
      course_completed_ids: ['n5-de-particle', 'hanami', 'konbini'],
      course_progress: { 'n5-de-particle': { step: 1 }, hanami: { step: 2 } },
      texts_read_ids: ['kitsune'],
    });
    migrateCourseKeys(u as never, fakeContent as never);
    expect(u.getSetting('course_completed_ids', [])).toEqual(['n5-de-particle']);
    expect(new Set(u.getSetting<string[]>('texts_read_ids', []))).toEqual(
      new Set(['kitsune', 'hanami', 'konbini']),
    );
    expect(u.getSetting('course_progress', {})).toEqual({ 'n5-de-particle': { step: 1 } });
    expect(u.getSetting('course_keys_migrated', false)).toBe(true);
    // idempotent: a second run with grammar ids present does nothing
    u.setSetting('course_completed_ids', ['n5-de-particle', 'stray']);
    migrateCourseKeys(u as never, fakeContent as never);
    expect(u.getSetting('course_completed_ids', [])).toEqual(['n5-de-particle', 'stray']);
  });

  it('prunes stale course_progress keys even when there are no stray completed ids', () => {
    const u = fakeUser({
      course_completed_ids: [],
      course_progress: { hanami: { step: 2 } }, // a text id, never a grammar key
    });
    migrateCourseKeys(u as never, fakeContent as never);
    expect(u.getSetting('course_progress', {})).toEqual({});
    expect(u.getSetting('course_keys_migrated', false)).toBe(true);
  });
});
