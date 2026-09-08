import type { LessonMeta } from '@/core/types';
import type { UserDb } from '@/storage/user-db';

export type UserLike = Pick<UserDb, 'getSetting' | 'setSetting'>;

export type CourseLessonState = 'done' | 'current' | 'unlocked-reading' | 'locked';

export interface CourseProgress {
  step: number;
}

type ProgressMap = Record<string, CourseProgress>;

const K_COMPLETED = 'course_completed_ids';
const K_PROGRESS = 'course_progress';

export function courseCompletedIds(user: UserLike): string[] {
  return user.getSetting<string[]>(K_COMPLETED, []);
}

export function isLessonComplete(user: UserLike, lessonId: string): boolean {
  return courseCompletedIds(user).includes(lessonId);
}

export function getCourseStep(user: UserLike, lessonId: string): number {
  const map = user.getSetting<ProgressMap>(K_PROGRESS, {});
  return map[lessonId]?.step ?? 0;
}

export function setCourseStep(user: UserLike, lessonId: string, step: number): void {
  const map = { ...user.getSetting<ProgressMap>(K_PROGRESS, {}) };
  map[lessonId] = { step };
  user.setSetting(K_PROGRESS, map);
}

export function markLessonComplete(user: UserLike, lessonId: string): void {
  const done = new Set(courseCompletedIds(user));
  done.add(lessonId);
  user.setSetting(K_COMPLETED, [...done]);
  const map = { ...user.getSetting<ProgressMap>(K_PROGRESS, {}) };
  delete map[lessonId];
  user.setSetting(K_PROGRESS, map);
}

/** Mandatory lessons (introducesCount > 0) in course order. */
function mandatory(lessons: readonly LessonMeta[]): LessonMeta[] {
  return lessons.filter((l) => !l.isFreeReading);
}

export function currentMandatoryLessonId(
  lessons: readonly LessonMeta[],
  completedIds: ReadonlySet<string>,
): string | null {
  return mandatory(lessons).find((l) => !completedIds.has(l.id))?.id ?? null;
}

export function courseLessonStates(
  lessons: readonly LessonMeta[],
  completedIds: ReadonlySet<string>,
): Map<string, CourseLessonState> {
  const out = new Map<string, CourseLessonState>();
  const currentId = currentMandatoryLessonId(lessons, completedIds);
  const current = currentId ? lessons.find((l) => l.id === currentId) ?? null : null;

  // Ceiling for free-reading unlock: max stage among the current mandatory
  // lesson and everything already completed. Null current => no ceiling.
  const completedStages = lessons
    .filter((l) => completedIds.has(l.id))
    .map((l) => l.stage);
  const ceiling = current
    ? Math.max(current.stage, ...completedStages)
    : null;

  // A mandatory lesson is unlocked iff every earlier mandatory lesson is done.
  let priorMandatoryPending = false;
  for (const l of lessons) {
    if (completedIds.has(l.id)) {
      out.set(l.id, 'done');
      continue;
    }
    if (!l.isFreeReading) {
      out.set(l.id, priorMandatoryPending ? 'locked' : 'current');
      priorMandatoryPending = true;
      continue;
    }
    // free reading
    if (ceiling === null || l.stage <= ceiling) out.set(l.id, 'unlocked-reading');
    else out.set(l.id, 'locked');
  }
  return out;
}

export function nextUnlockedLessonId(
  lessons: readonly LessonMeta[],
  completedIds: ReadonlySet<string>,
  afterId: string,
): string | null {
  const states = courseLessonStates(lessons, completedIds);
  const idx = lessons.findIndex((l) => l.id === afterId);
  if (idx === -1) return null;
  for (let i = idx + 1; i < lessons.length; i++) {
    const st = states.get(lessons[i]!.id);
    if (st === 'current' || st === 'unlocked-reading' || st === 'done') return lessons[i]!.id;
  }
  return null;
}

/**
 * One-shot idempotent migration of the plan-4c-2 `texts_read_ids` key into
 * `course_completed_ids`. Copies only when the target is still empty (a prior
 * migration or real course progress leaves it populated), then always consumes
 * the old key so it never re-fires (plan-4h lesson).
 */
export function migrateTextsRead(user: UserLike): void {
  const old = user.getSetting<string[]>('texts_read_ids', []);
  if (old.length === 0) return;
  if (courseCompletedIds(user).length === 0) {
    user.setSetting(K_COMPLETED, [...new Set(old)]);
  }
  user.setSetting('texts_read_ids', []);
}
