import type { ContentDb } from '@/storage/content-db';
import type { Question } from '@/core/quiz/types';
import { availableItemIds } from '@/core/scheduler';
import { generateForCard } from '@/core/quiz/registry';
import { levelPointsFor } from '@/core/session';

export interface PlacementState {
  ids: string[];
  lo: number;
  hi: number;
  askedCount: number;
  /** 'first' — probing the current index for the first time; 'second' — asking a
   * confirming second question about the SAME index before trusting the result. */
  phase: 'first' | 'second';
  /** Result of the first question, only meaningful while `phase === 'second'`. */
  firstCorrect: boolean;
}

/**
 * Строит состояние теста: список кандидатов — тот же канонический порядок
 * грамматики (level.ord -> layer -> id), что уже использует ежедневная очередь.
 * Только грамматика — кандзи/слова не участвуют (см. спеку плана 4e).
 */
export function initPlacement(content: ContentDb): PlacementState {
  const ids = availableItemIds(content, 'grammar');
  return { ids, lo: 0, hi: ids.length, askedCount: 0, phase: 'first', firstCorrect: false };
}

export function isPlacementDone(state: PlacementState): boolean {
  return state.lo >= state.hi;
}

function probeIndex(state: PlacementState): number {
  return Math.floor((state.lo + state.hi) / 2);
}

/**
 * Следующий вопрос теста (`null`, если тест завершён или контент недоступен).
 * Переиспользует `generateForCard` -- тот же генератор, что использует обычная
 * сессия повторения грамматики, с `reps=0`. Seed включает `askedCount`, так что
 * первый и подтверждающий (второй) вопрос про один и тот же пункт -- два РАЗНЫХ
 * вопроса, не повтор одного и того же.
 */
export function nextPlacementQuestion(
  state: PlacementState,
  content: ContentDb,
  seed: string,
): { itemId: string; question: Question } | null {
  if (isPlacementDone(state)) return null;
  const idx = probeIndex(state);
  const itemId = state.ids[idx]!;
  const point = content.getGrammar(itemId);
  if (!point) return null;
  const question = generateForCard(
    point,
    levelPointsFor(content, point.level),
    0,
    `${seed}:${itemId}:${state.askedCount}`,
  );
  return { itemId, question };
}

/**
 * Бинарный поиск с двойным подтверждением: каждый индекс проверяется ДВУМЯ
 * разными вопросами, и граница сдвигается только если ОБА верны. Один
 * ошибочный (в любую сторону) ответ из пары -> индекс трактуется как "не знает"
 * -- это осознанно консервативный перекос: ложно пропустить пункт стоит
 * пользователю немного лишней практики, а ложно засчитать его как известный
 * (при простом угадывании 1 из 4 вариантов, 25% шанс на одном вопросе) сразу
 * создаёт SRS-карточку, которую потом нельзя тихо исправить. Два вопроса подряд
 * снижают шанс случайно пройти один индекс с 25% до 6.25% (0.25*0.25).
 *
 * `lo`/`hi` -- границы диапазона, где проходит граница "знает/не знает" среди
 * `ids` (`ids[0,lo)` подтверждено известно, `ids[hi,length)` подтверждено
 * неизвестно). Каждая ЗАВЕРШЁННАЯ пара вопросов ровно вдвое сокращает `hi-lo`,
 * так что тест сходится за `2 * ceil(log2(ids.length+1))` вопросов при любой
 * последовательности ответов.
 */
export function applyPlacementAnswer(state: PlacementState, correct: boolean): PlacementState {
  const askedCount = state.askedCount + 1;
  if (state.phase === 'first') {
    return { ...state, phase: 'second', firstCorrect: correct, askedCount };
  }
  const idx = probeIndex(state);
  const bothCorrect = state.firstCorrect && correct;
  return bothCorrect
    ? { ...state, lo: idx + 1, phase: 'first', firstCorrect: false, askedCount }
    : { ...state, hi: idx, phase: 'first', firstCorrect: false, askedCount };
}

/** id всех пунктов ниже найденной границы -- то, что тест считает уже известным. */
export function placementFrontierIds(state: PlacementState): string[] {
  return state.ids.slice(0, state.lo);
}
