import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useContentDb } from '../useContentDb';
import { useUserDb } from '../useUserDb';

/** Texts carry a through-course `stage`, not a JLPT level. The migrated corpus
 *  put N5 texts at stage 2..18 and N4 texts at stage 42..52, so a single cut
 *  at 40 maps a text to its level for the tab filter. */
const STAGE_LEVEL_SPLIT = 40;
const levelOfStage = (stage: number): string => (stage < STAGE_LEVEL_SPLIT ? 'N5' : 'N4');

export function TextsListScreen() {
  const db = useContentDb();
  const user = useUserDb();
  const lessons = useMemo(() => db.listLessons(), [db]);
  const readIds = user.getSetting<string[]>('texts_read_ids', []);

  const levels = useMemo(() => {
    const seen = new Set<string>();
    return lessons
      .map((l) => levelOfStage(l.stage))
      .filter((c) => (seen.has(c) ? false : seen.add(c)));
  }, [lessons]);
  const [activeLevel, setActiveLevel] = useState(() => levels[0] ?? 'N5');
  const rows = useMemo(
    () => lessons.filter((l) => levelOfStage(l.stage) === activeLevel),
    [lessons, activeLevel],
  );

  return (
    <section className="screen">
      <h1>Тексты</h1>

      <div role="tablist" className="level-tabs">
        {levels.map((code) => (
          <button
            key={code}
            role="tab"
            type="button"
            aria-selected={code === activeLevel}
            className="level-tab"
            onClick={() => setActiveLevel(code)}
          >
            {code}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="muted">Текстов пока нет.</p>
      ) : (
        <ul className="text-list">
          {rows.map((p) => (
            <li key={p.id}>
              <Link to={`/texts/${p.id}`} className="text-list-item">
                <span className="text-list-title">{p.title}</span>
                {readIds.includes(p.id) && <span className="text-read-badge" aria-label="прочитано">✓</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
