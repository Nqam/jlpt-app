/** Логика авто-бэкапа user.db. Только чистые функции — время параметром `now`. */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Пора ли делать авто-бэкап: отметки ещё нет, либо с прошлого прошло ≥ 7 дней.
 * Некорректная / будущая отметка трактуется как «пора» (безопаснее сделать
 * лишнюю копию, чем пропустить).
 */
export function backupDue(lastIso: string | null, now: Date): boolean {
  if (!lastIso) return true;
  const last = Date.parse(lastIso);
  if (Number.isNaN(last)) return true;
  const elapsed = now.getTime() - last;
  if (elapsed < 0) return true; // отметка из будущего (сбитые часы / ручная правка)
  return elapsed >= WEEK_MS;
}

/**
 * Имена файлов авто-бэкапа, которые нужно удалить, чтобы осталось не более
 * `keep` самых свежих. Имена — `jlpt-auto-YYYY-MM-DD.db`, поэтому
 * лексикографическая сортировка совпадает с хронологической.
 */
export function backupsToPrune(names: string[], keep: number): string[] {
  const sorted = names
    .filter((n) => /^jlpt-auto-\d{4}-\d{2}-\d{2}\.db$/.test(n))
    .sort();
  return keep <= 0 ? sorted : sorted.slice(0, Math.max(0, sorted.length - keep));
}

/** Имя файла авто-бэкапа за календарный день `now` (локальная дата). */
export function backupFileName(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `jlpt-auto-${y}-${m}-${d}.db`;
}
