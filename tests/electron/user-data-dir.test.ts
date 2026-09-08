import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { pinnedUserDataDir } from '../../shells/electron/user-data-dir';

const APPDATA = '/home/user/AppData/Roaming';

describe('pinnedUserDataDir', () => {
  it('pins userData to <appData>/JLPT for a normal launch', () => {
    expect(pinnedUserDataDir(['electron', 'main.js'], APPDATA)).toBe(join(APPDATA, 'JLPT'));
  });

  it('pins to the literal "JLPT", never the current product name', () => {
    // Regression guard: the app is «Kotsukotsu» since v1.3.0, but every
    // existing user's user.db lives in %APPDATA%/JLPT. If this ever resolves
    // to "Kotsukotsu", updates silently lose all SRS progress.
    const pinned = pinnedUserDataDir([], APPDATA);
    expect(pinned).toBe(join(APPDATA, 'JLPT'));
    expect(pinned).not.toContain('Kotsukotsu');
  });

  it('opts out when --user-data-dir is passed (e2e harness supplies its own)', () => {
    expect(
      pinnedUserDataDir(['electron', 'main.js', '--user-data-dir=/tmp/e2e-xyz'], APPDATA),
    ).toBeNull();
  });

  it('opts out for the bare --user-data-dir flag form', () => {
    expect(pinnedUserDataDir(['--user-data-dir', '/tmp/e2e-xyz'], APPDATA)).toBeNull();
  });
});
