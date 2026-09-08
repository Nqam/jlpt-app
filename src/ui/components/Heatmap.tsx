import type { HeatCell } from '@/core/progress';

function bucket(count: number): number {
  if (count === 0) return 0;
  if (count <= 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

export function Heatmap({ cells }: { cells: HeatCell[] }) {
  return (
    <div className="heatmap">
      {cells.map((c) => (
        <span
          key={c.dayKey}
          data-testid="heat-cell"
          className={`heat heat-${bucket(c.count)}`}
          title={`${c.dayKey}: ${c.count}`}
        />
      ))}
    </div>
  );
}
