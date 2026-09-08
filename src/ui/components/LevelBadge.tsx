import type { LevelCode } from '@/core/types';

export function LevelBadge({ level }: { level: LevelCode }) {
  return (
    <span className="level-badge" data-level={level}>
      {level}
    </span>
  );
}
