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
}

/**
 * Строит состояние теста: список кандидатов — тот же канонический порядок
 * грамматики (level.ord -> layer -> id), что уже использует ежедневная очередь.
 * Только грамматика — кандзи/слова не участвуют (см. спеку плана 4e).
 */
export function initPlacement(content: ContentDb): PlacementState {
  const ids = availableItemIds(content, 'grammar');
  return { ids, lo: 0, hi: ids.length, askedCount: 0 };
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
 * сессия повторения грамматики, с `reps=0`. Каждый шаг бинарного поиска
 * проверяет НОВЫЙ пункт грамматики (середину сужающегося диапазона), так что
 * вопросы не повторяются.
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
 * Обычный бинарный поиск: один вопрос на индекс. Верный ответ сдвигает нижнюю
 * границу вверх (`lo = idx + 1` — пункт и всё до него считается известным),
 * ошибочный сдвигает верхнюю вниз (`hi = idx` — пункт и всё после него считается
 * неизвестным). Ошибка засчитывается сразу, второй попытки на тот же вопрос нет.
 *
 * `lo`/`hi` -- границы диапазона, где проходит граница "знает/не знает" среди
 * `ids` (`ids[0,lo)` — известно, `ids[hi,length)` — неизвестно). Каждый ответ
 * ровно вдвое сокращает `hi-lo`, так что тест сходится за
 * `ceil(log2(ids.length + 1))` вопросов при любой последовательности ответов
 * (~7 для нынешних ~93 пунктов N5+N4).
 *
 * Случайно угаданный ответ (1 из 4, 25%) сдвигает границу на один пункт вперёд и
 * создаёт одну SRS-карточку со статусом "уже известно". Это исправляется: любой
 * последующий неверный ответ утягивает границу назад, а в Настройках есть кнопка
 * "Сбросить результаты N5/N4", которая удаляет именно помеченные тестом карточки.
 */
export function applyPlacementAnswer(state: PlacementState, correct: boolean): PlacementState {
  const askedCount = state.askedCount + 1;
  const idx = probeIndex(state);
  return correct
    ? { ...state, lo: idx + 1, askedCount }
    : { ...state, hi: idx, askedCount };
}

/** id всех пунктов ниже найденной границы -- то, что тест считает уже известным. */
export function placementFrontierIds(state: PlacementState): string[] {
  return state.ids.slice(0, state.lo);
}
