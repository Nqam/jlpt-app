import type { Status } from '@/core/srs';

const LABEL: Record<Exclude<Status, 'new'>, string> = {
  learning: 'изучается',
  learned: 'изучено',
  mastered: 'освоено',
};

/** Small SRS-status dot for a reference-list item. `new` renders nothing. */
export function StatusDot({ status }: { status: Status }) {
  if (status === 'new') return null;
  return <span className={`status-dot status-dot-${status}`} title={LABEL[status]} />;
}
