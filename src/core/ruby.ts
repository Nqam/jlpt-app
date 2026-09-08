import type { RubySegment } from './types';

/** CJK-идеограф (кандзи + знаки повтора 々〻) — только такие символы несут чтение. */
const IDEOGRAPH = /[㐀-鿿々〻]/;

/**
 * Разбирает строку с записью фуриганы вида "私[わたし]は 学生[がくせい]です。"
 * в последовательность сегментов. Группа "X[Y]" -> { base: 'X', ruby: 'Y' }.
 * Остальные подстроки -> { base, ruby: null }. Пробел сохраняется отдельным
 * сегментом " " для читаемой вёрстки.
 *
 * База чтения — только замыкающая цепочка кандзи непосредственно перед "[".
 * Кана (или иные не-иероглифы) между предыдущим пробелом и этой цепочкой
 * выводится отдельным обычным сегментом: "お茶[ちゃ]" -> "お" + 茶→ちゃ,
 * а не "お茶"→"ちゃ".
 */
export function parseRuby(input: string): RubySegment[] {
  const segments: RubySegment[] = [];
  let plain = '';

  const flushPlain = () => {
    if (plain !== '') {
      segments.push({ base: plain, ruby: null });
      plain = '';
    }
  };

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (ch === ' ') {
      flushPlain();
      segments.push({ base: ' ', ruby: null });
      continue;
    }
    if (ch === '[') {
      throw new Error(`parseRuby: '[' without a preceding base at index ${i} in ${JSON.stringify(input)}`);
    }
    // заглянуть вперёд: это база с последующей скобкой?
    const next = input.indexOf('[', i);
    if (next !== -1 && !input.slice(i, next).includes(' ') && next > i) {
      const close = input.indexOf(']', next);
      if (close === -1) {
        throw new Error(`parseRuby: unclosed '[' in ${JSON.stringify(input)}`);
      }
      // Идём назад от '[' по цепочке кандзи — это и есть база чтения.
      let baseStart = next;
      while (baseStart > i && IDEOGRAPH.test(input[baseStart - 1]!)) baseStart--;
      const ruby = input.slice(next + 1, close);
      if (baseStart > i) {
        // перед кандзи-цепочкой есть кана/прочее — либо цепочки кандзи нет вовсе
        // (baseStart === next): битая запись, отдаём всю базу как есть.
        if (baseStart === next) {
          flushPlain();
          segments.push({ base: input.slice(i, next), ruby });
          i = close;
          continue;
        }
        plain += input.slice(i, baseStart);
      }
      flushPlain();
      segments.push({ base: input.slice(baseStart, next), ruby });
      i = close;
      continue;
    }
    plain += ch;
  }
  flushPlain();
  return segments;
}

/** Обратна `parseRuby`: сегменты → строка вида "私[わたし]は 学生[がくせい]です。". */
export function stringifyRuby(segments: RubySegment[]): string {
  return segments
    .map((s) => (s.ruby !== null ? `${s.base}[${s.ruby}]` : s.base))
    .join('');
}
