import { useUserDb } from '@/ui/useUserDb';
import { parseRuby } from '@/core/ruby';

export function Furigana({
  text,
  showFurigana,
}: {
  text: string;
  showFurigana?: boolean;
}) {
  const user = useUserDb();
  const enabled = showFurigana ?? user.getSetting('furigana_enabled', true);
  const segs = parseRuby(text);
  return (
    <span className="furigana">
      {segs.map((s, i) => {
        if (s.ruby && enabled) {
          return (
            <ruby key={i}>
              {s.base}
              <rt>{s.ruby}</rt>
            </ruby>
          );
        }
        return <span key={i}>{s.base}</span>;
      })}
    </span>
  );
}
