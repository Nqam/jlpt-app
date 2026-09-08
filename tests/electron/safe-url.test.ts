import { describe, it, expect } from 'vitest';
import { isSafeExternalUrl } from '../../shells/electron/safe-url';

describe('isSafeExternalUrl', () => {
  it('allows https github.com and its subdomains', () => {
    expect(isSafeExternalUrl('https://github.com/Nqam/jlpt-app/releases/latest')).toBe(true);
    expect(isSafeExternalUrl('https://api.github.com/repos/Nqam/jlpt-app')).toBe(true);
    expect(isSafeExternalUrl('https://objects.github.com/x')).toBe(true);
  });

  it('rejects non-https', () => {
    expect(isSafeExternalUrl('http://github.com/Nqam/jlpt-app')).toBe(false);
    expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false);
  });

  it('rejects other hosts, including look-alikes', () => {
    expect(isSafeExternalUrl('https://example.com')).toBe(false);
    expect(isSafeExternalUrl('https://github.com.evil.test/')).toBe(false);
    expect(isSafeExternalUrl('https://notgithub.com/')).toBe(false);
    expect(isSafeExternalUrl('https://evilgithub.com/')).toBe(false);
  });

  it('rejects garbage input', () => {
    expect(isSafeExternalUrl('not a url')).toBe(false);
    expect(isSafeExternalUrl('')).toBe(false);
  });
});
