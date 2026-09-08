/**
 * Разрешён ли внешний URL к открытию в браузере / переходу.
 *
 * Только `https:` и только на `github.com` (или его поддоменах) — приложение
 * ведёт наружу лишь на страницу релизов и репозиторий. Всё остальное (в том
 * числе `http:`, `file:`, произвольные хосты) отклоняется — защита от подмены
 * ссылки через контент или скомпрометированный рендерер.
 */
export function isSafeExternalUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  return u.hostname === 'github.com' || u.hostname.endsWith('.github.com');
}
