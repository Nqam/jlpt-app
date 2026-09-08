import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { toUtcIso, localDayKey, startOfLocalDay, endOfLocalDay, daysBetweenLocal } from '@/core/time';

describe('core/time', () => {
  const savedTZ = process.env.TZ;
  beforeAll(() => { process.env.TZ = 'Europe/Moscow'; }); // UTC+3, no DST since 2014
  afterAll(() => {
    if (savedTZ === undefined) delete process.env.TZ;
    else process.env.TZ = savedTZ;
  });

  it('toUtcIso is a round-trippable ISO string', () => {
    const d = new Date('2026-01-15T09:30:00.000Z');
    expect(toUtcIso(d)).toBe('2026-01-15T09:30:00.000Z');
  });

  it('localDayKey uses local calendar date', () => {
    // 2026-01-15 22:30 UTC === 2026-01-16 01:30 Moscow
    expect(localDayKey(new Date('2026-01-15T22:30:00.000Z'))).toBe('2026-01-16');
    expect(localDayKey(new Date('2026-01-15T20:59:00.000Z'))).toBe('2026-01-15');
  });

  it('startOfLocalDay / endOfLocalDay bracket the local day', () => {
    const d = new Date('2026-01-15T22:30:00.000Z'); // local 2026-01-16
    const s = startOfLocalDay(d);
    const e = endOfLocalDay(d);
    expect(localDayKey(s)).toBe('2026-01-16');
    expect(localDayKey(e)).toBe('2026-01-16');
    expect(s.getTime()).toBeLessThan(d.getTime());
    expect(e.getTime()).toBeGreaterThan(d.getTime());
    expect(e.getTime() - s.getTime()).toBe(24 * 3600 * 1000 - 1);
  });

  it('daysBetweenLocal counts calendar days regardless of clock time', () => {
    const a = new Date('2026-01-15T23:00:00.000Z'); // local 2026-01-16 02:00
    const b = new Date('2026-01-16T05:00:00.000Z'); // local 2026-01-16 08:00
    expect(daysBetweenLocal(a, b)).toBe(0);
    const c = new Date('2026-01-16T22:00:00.000Z'); // local 2026-01-17 01:00
    expect(daysBetweenLocal(a, c)).toBe(1);
    expect(daysBetweenLocal(c, a)).toBe(-1);
  });
});
