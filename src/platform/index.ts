import type { PlatformAdapter } from './adapter';
import { createDesktopAdapter } from './desktop';

let cached: PlatformAdapter | null = null;

/** Единая точка получения платформенного адаптера. */
export function getPlatformAdapter(): PlatformAdapter {
  if (cached) return cached;
  // Android-ветка (Capacitor) добавляется в плане сборки. Пока только desktop.
  cached = createDesktopAdapter();
  return cached;
}

export type { PlatformAdapter };
