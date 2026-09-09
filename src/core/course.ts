import type { UserDb } from '@/storage/user-db';

export type UserLike = Pick<UserDb, 'getSetting' | 'setSetting'>;

type ProgressMap = Record<string, { step: number }>;

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

type GrammarLookup = { getGrammar(id: string): unknown | null };

/**
 * One-shot: the course used to store text-lesson ids in `course_completed_ids`
 * (plan 5-2's text-read migration). The course is grammar points now, so any id
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
