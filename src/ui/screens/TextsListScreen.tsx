import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useContentDb } from '../useContentDb';
import { useUserDb } from '../useUserDb';

export function TextsListScreen() {
  const db = useContentDb();
  const user = useUserDb();
  const lessons = useMemo(() => db.listLessons(), [db]);
  const readIds = user.getSetting<string[]>('texts_read_ids', []);

  return (
    <section className="screen">
      <h1>Тексты</h1>
      {lessons.length === 0 ? (
        <p className="muted">Текстов пока нет.</p>
      ) : (
        <ul className="text-list">
          {lessons.map((p) => (
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
