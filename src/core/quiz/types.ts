import type { ItemType } from '@/core/types';

export type QuestionKind = 'cloze' | 'choice' | 'assemble' | 'type';

export interface QuestionBase {
  /** Детерминированный id вопроса — совпадает с seed-строкой генерации. */
  id: string;
  itemType: ItemType;
  itemId: string;
  kind: QuestionKind;
  /** Текст задания на русском. */
  prompt: string;
}

export interface ClozeQuestion extends QuestionBase {
  kind: 'cloze';
  /** Японское предложение в записи фуриганы с маркером `___`. */
  sentenceRuby: string;
  /** Перевод предложения — контекст под пропуском (не выдаёт ответ). Может быть пустым. */
  translationRu: string;
  /** Длина 4, ровно один правильный. */
  choices: string[];
  answerIndex: number;
}

export interface ChoiceQuestion extends QuestionBase {
  kind: 'choice';
  /** Длина 4 (краткие описания). */
  choices: string[];
  answerIndex: number;
}

export interface AssembleQuestion extends QuestionBase {
  kind: 'assemble';
  /** Перемешанные фуригана-токены. */
  tokens: string[];
  /** Индексы `tokens` в правильном порядке. */
  answerOrder: number[];
  /** Перевод — для подсказки в разборе. */
  translationRu: string;
}

export interface TypeQuestion extends QuestionBase {
  kind: 'type';
  /** Accepted normalized answers (trimmed) — usually one string, e.g. the kana
   *  reading of a word. Typed recall: no choices, the learner writes it. */
  answerText: string[];
}

export type Question = ClozeQuestion | ChoiceQuestion | AssembleQuestion | TypeQuestion;

export type Answer =
  | { kind: 'index'; value: number }
  | { kind: 'order'; value: number[] }
  | { kind: 'text'; value: string };

export interface GradedAnswer {
  correct: boolean;
  /** 1 = Again, 2 = Hard, 3 = Good, 4 = Easy (ts-fsrs Rating). Wrong is always 1;
   *  right scales by response time (see `grade`). */
  rating: 1 | 2 | 3 | 4;
}
