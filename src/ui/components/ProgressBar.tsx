export function ProgressBar({
  label,
  value,
  total,
}: {
  label: string;
  value: number;
  total: number;
}) {
  const pct = Math.round(value * 100);
  const count = Math.round(value * total);
  return (
    <div className="pbar">
      <div className="pbar-head">
        <span>{label}</span>
        <span>
          {count} / {total}
        </span>
      </div>
      <div className="pbar-track">
        <div className="pbar-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
