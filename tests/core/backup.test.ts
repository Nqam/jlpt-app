import { describe, it, expect } from 'vitest';
import { backupDue, backupsToPrune, backupFileName } from '@/core/backup';

const D = (s: string) => new Date(s);

describe('backupDue', () => {
  it('is due when there is no prior backup', () => {
    expect(backupDue(null, D('2026-09-08T10:00:00Z'))).toBe(true);
  });

  it('is not due before 7 days have passed', () => {
    expect(backupDue('2026-09-02T10:00:00Z', D('2026-09-08T09:00:00Z'))).toBe(false); // ~6d
  });

  it('is due once 7 days have passed', () => {
    expect(backupDue('2026-09-01T10:00:00Z', D('2026-09-08T10:00:00Z'))).toBe(true); // 7d
    expect(backupDue('2026-08-20T10:00:00Z', D('2026-09-08T10:00:00Z'))).toBe(true);
  });

  it('treats a malformed or future timestamp as due', () => {
    expect(backupDue('not-a-date', D('2026-09-08T10:00:00Z'))).toBe(true);
    expect(backupDue('2027-01-01T00:00:00Z', D('2026-09-08T10:00:00Z'))).toBe(true);
  });
});

describe('backupsToPrune', () => {
  const names = [
    'jlpt-auto-2026-08-10.db',
    'jlpt-auto-2026-08-17.db',
    'jlpt-auto-2026-08-24.db',
    'jlpt-auto-2026-09-01.db',
    'jlpt-auto-2026-09-08.db',
  ];

  it('keeps the newest N, returns the rest oldest-first', () => {
    expect(backupsToPrune(names, 4)).toEqual(['jlpt-auto-2026-08-10.db']);
    expect(backupsToPrune(names, 2)).toEqual([
      'jlpt-auto-2026-08-10.db',
      'jlpt-auto-2026-08-17.db',
      'jlpt-auto-2026-08-24.db',
    ]);
  });

  it('prunes nothing when within the limit', () => {
    expect(backupsToPrune(names, 5)).toEqual([]);
    expect(backupsToPrune(names, 9)).toEqual([]);
  });

  it('ignores files that are not auto-backups', () => {
    const mixed = [...names, 'user.db', 'jlpt-backup-2026-09-08.db', 'notes.txt'];
    expect(backupsToPrune(mixed, 4)).toEqual(['jlpt-auto-2026-08-10.db']);
  });
});

describe('backupFileName', () => {
  it('names by local calendar date', () => {
    expect(backupFileName(new Date(2026, 8, 8, 23, 59))).toBe('jlpt-auto-2026-09-08.db');
    expect(backupFileName(new Date(2026, 0, 3, 0, 0))).toBe('jlpt-auto-2026-01-03.db');
  });
});
