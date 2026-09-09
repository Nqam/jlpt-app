import type { GrammarPointFull } from '@/storage/content-db';
import { Furigana } from './Furigana';
import { GrammarMarkdown } from './GrammarMarkdown';

export function GrammarPointBody({ point }: { point: GrammarPointFull }) {
  return (
    <>
      <GrammarMarkdown source={point.bodyMarkdown} />
      <h2>Примеры</h2>
      <ul className="examples">
        {point.examples.map((ex, i) => (
          <li key={i} className="example">
            <div className="example-ja"><Furigana text={ex.jaRuby} /></div>
            <div className="example-ru">{ex.ru}</div>
          </li>
        ))}
      </ul>
    </>
  );
}
