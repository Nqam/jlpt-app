import { useMemo } from 'react';
import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({ html: false, linkify: false, breaks: false });

export function GrammarMarkdown({ source }: { source: string }) {
  // Вырезаем ТОЛЬКО секцию "## Примеры" (примеры рендерятся отдельным блоком
  // с фуриганой в GrammarDetailScreen), но сохраняем всё, что идёт после неё —
  // в первую очередь обязательную секцию "## Частые ошибки".
  const html = useMemo(() => {
    const start = source.indexOf('## Примеры');
    if (start === -1) return md.render(source.trim());
    const rest = source.indexOf('\n## ', start + 1);
    const body =
      rest === -1 ? source.slice(0, start) : source.slice(0, start) + source.slice(rest + 1);
    return md.render(body.trim());
  }, [source]);
  return <div className="grammar-md" dangerouslySetInnerHTML={{ __html: html }} />;
}
