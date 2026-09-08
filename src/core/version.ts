/**
 * Сравнение версий вида `major.minor.patch` (semver-lite).
 *
 * Ведущий `v` срезается; всё после патча (пре-релизные суффиксы, метаданные
 * сборки) игнорируется; недостающие части считаются нулём. Достаточно для
 * сверки установленной версии с последним GitHub-релизом.
 */
function parse(v: string): [number, number, number] {
  const core = v.trim().replace(/^v/i, '').split(/[-+]/, 1)[0]!;
  const parts = core.split('.').map((n) => Number.parseInt(n, 10));
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

/** -1 если a < b, 0 если равны, 1 если a > b. */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i]! < pb[i]!) return -1;
    if (pa[i]! > pb[i]!) return 1;
  }
  return 0;
}

/** `latest` строго новее `current`. */
export function isNewer(latest: string, current: string): boolean {
  return compareVersions(latest, current) === 1;
}
