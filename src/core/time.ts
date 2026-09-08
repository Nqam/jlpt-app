/** Всё время в ядре — параметром `now: Date`. Здесь только чистая арифметика дат. */

export function toUtcIso(d: Date): string {
  return d.toISOString();
}

/** Локальная календарная дата `YYYY-MM-DD` (часовой пояс хоста). */
export function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function startOfLocalDay(d: Date): Date {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  return s;
}

export function endOfLocalDay(d: Date): Date {
  const e = new Date(d);
  e.setHours(23, 59, 59, 999);
  return e;
}

/** Знаковая разница в целых локальных днях: день(b) − день(a). */
export function daysBetweenLocal(a: Date, b: Date): number {
  const sa = startOfLocalDay(a).getTime();
  const sb = startOfLocalDay(b).getTime();
  return Math.round((sb - sa) / (24 * 3600 * 1000));
}
