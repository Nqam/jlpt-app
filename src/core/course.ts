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

type GrammarLookup = { getGrammar(id: string): unknown | null };

/**
 * One-shot: the course used to store text-lesson ids in `course_completed_ids`
 * (plan 5-2's `migrateTextsRead`). The course is grammar points now, so any id
 * that is not a grammar point is an old text id — move it to `texts_read_ids`
 * and drop it from the course keys. Runs once (marker `course_keys_migrated`).
 */
export function migrateCourseKeys(user: UserLike, content: GrammarLookup): void {
  if (user.getSetting<boolean>('course_keys_migrated', false)) return;

  const completed = courseCompletedIds(user);
  const stray = completed.filter((id) => content.getGrammar(id) == null);
  if (stray.length > 0) {
    const read = new Set(user.getSetting<string[]>('texts_read_ids', []));
    for (const id of stray) read.add(id);
    user.setSetting('texts_read_ids', [...read]);
    user.setSetting(K_COMPLETED, completed.filter((id) => content.getGrammar(id) != null));

    const progress = { ...user.getSetting<ProgressMap>(K_PROGRESS, {}) };
    for (const id of Object.keys(progress)) {
      if (content.getGrammar(id) == null) delete progress[id];
    }
    user.setSetting(K_PROGRESS, progress);
  }
  user.setSetting('course_keys_migrated', true);
}

/** First course point the user has neither finished nor already has a card for. */
export function currentCourseLessonId(
  points: readonly { id: string }[],
  completedIds: ReadonlySet<string>,
  hasCard: (id: string) => boolean,
): string | null {
  return points.find((p) => !completedIds.has(p.id) && !hasCard(p.id))?.id ?? null;
}

export type CourseState = 'done' | 'current' | 'ahead';

export function courseLessonState(
  point: { id: string },
  currentId: string | null,
  completedIds: ReadonlySet<string>,
  hasCard: (id: string) => boolean,
): CourseState {
  if (completedIds.has(point.id) || hasCard(point.id)) return 'done';
  if (point.id === currentId) return 'current';
  return 'ahead';
}

/** The next point after `afterId` in list order, or null. */
export function nextCourseLessonId(
  points: readonly { id: string }[],
  afterId: string,
): string | null {
  const i = points.findIndex((p) => p.id === afterId);
  if (i === -1 || i + 1 >= points.length) return null;
  return points[i + 1]!.id;
}
