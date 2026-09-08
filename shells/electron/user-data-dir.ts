import { join } from 'node:path';

/**
 * The directory Electron's `userData` must be pinned to, or `null` to leave
 * Electron's default in place.
 *
 * WHY THIS EXISTS — do not "simplify" it away:
 * The app was renamed «JLPT» -> «Kotsukotsu» in v1.3.0. Electron derives its
 * default `userData` path from `productName`, so without this pin an update
 * would start reading `%APPDATA%/Kotsukotsu/` while every existing user's
 * `user.db` (SRS progress, settings, streak, placement marks) sits in
 * `%APPDATA%/JLPT/`. That would look exactly like "the update wiped my
 * progress". The literal `'JLPT'` below is load-bearing and must never change
 * to the product name, the appId, or anything else — new installs also land
 * here, so the path is uniform across versions.
 *
 * `--user-data-dir=<path>` (passed by every Playwright e2e spec) opts out: the
 * test harness supplies its own throwaway directory and Electron honours that
 * flag itself, so we must NOT also call `setPath` or the two fight.
 */
export function pinnedUserDataDir(
  argv: readonly string[],
  appDataDir: string,
): string | null {
  if (argv.some((a) => a.startsWith('--user-data-dir'))) return null;
  return join(appDataDir, 'JLPT');
}
