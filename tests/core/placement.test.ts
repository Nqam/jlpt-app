import { describe, it, expect } from 'vitest';
import {
  initPlacement,
  nextPlacementQuestion,
  applyPlacementAnswer,
  isPlacementDone,
  placementFrontierIds,
  type PlacementState,
} from '@/core/placement';
import type { ContentDb, GrammarPointFull } from '@/storage/content-db';

/**
 * `layer: i + 1` makes `availableItemIds`'s (level.ord, layer, id) sort return the
 * ids in exactly the given array order — the same fixture shape session.test.ts
 * already uses for exercising `generateForCard`.
 */
function fakeContent(ids: string[]): ContentDb {
  const points: GrammarPointFull[] = ids.map((id, i) => ({
    id, level: 'N5', title: id, layer: i + 1, tags: [], related: [], relatedTitles: [],
    bodyMarkdown: `## Кратко\nОписание пункта ${id} — что он выражает и когда употребляется.`,
    examples: [
      { jaRuby: `${id}は 毎日[まいにち] 日本語[にほんご]を 勉強[べんきょう]します。`, ru: `перевод ${id}` },
    ],
  }));
  const byId = new Map(points.map((p) => [p.id, p]));
  return {
    listLevels: () => [{ code: 'N5', status: 'available', ord: 1, titleRu: 'N5' }],
    listGrammar: () => points.map((p) => ({ id: p.id, level: p.level, title: p.title, layer: p.layer })),
    getGrammar: (id: string) => byId.get(id) ?? null,
  } as unknown as ContentDb;
}

/** `correctFor` is a pure function of the item id -- both the first and the
 * confirming second question about the same item get the same oracle answer,
 * modeling "either you really know this or you don't". */
function runToCompletion(
  content: ContentDb,
  correctFor: (itemId: string) => boolean,
): PlacementState {
  let state = initPlacement(content);
  while (!isPlacementDone(state)) {
    const step = nextPlacementQuestion(state, content, 'test');
    if (!step) break;
    state = applyPlacementAnswer(state, correctFor(step.itemId));
  }
  return state;
}

describe('core/placement', () => {
  const ids = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];

  it('converges to the full frontier when every answer is correct', () => {
    const content = fakeContent(ids);
    const final = runToCompletion(content, () => true);
    expect(placementFrontierIds(final)).toEqual(ids);
    expect(final.askedCount).toBeLessThanOrEqual(2 * Math.ceil(Math.log2(ids.length + 1)));
  });

  it('converges to an empty frontier when every answer is wrong', () => {
    const content = fakeContent(ids);
    const final = runToCompletion(content, () => false);
    expect(placementFrontierIds(final)).toEqual([]);
    expect(final.askedCount).toBeLessThanOrEqual(2 * Math.ceil(Math.log2(ids.length + 1)));
  });

  it('converges to a hand-traced middle boundary with mixed answers, at 2x the single-question cost', () => {
    // Oracle: the first 3 ids (by canonical order) are "known" -- same answer for
    // both questions about a given item. Hand trace for ids.length=8, lo=0,hi=8:
    //   idx=4 -> p5 (index 4, not < 3) -> wrong both times -> hi=4 (2 questions)
    //   idx=2 -> p3 (index 2, < 3) -> correct both times -> lo=3 (2 questions)
    //   idx=3 -> p4 (index 3, not < 3) -> wrong both times -> hi=3 (2 questions)
    //   lo=3, hi=3 -> done. frontier = ids[0..3) = ['p1','p2','p3']. 6 questions
    //   (double the 3 a single-question binary search would have taken).
    const content = fakeContent(ids);
    const final = runToCompletion(content, (itemId) => ids.indexOf(itemId) < 3);
    expect(placementFrontierIds(final)).toEqual(['p1', 'p2', 'p3']);
    expect(final.askedCount).toBe(6);
  });

  it('terminates within the theoretical 2x bound for a larger corpus', () => {
    const bigIds = Array.from({ length: 93 }, (_, i) => `g${i}`);
    const content = fakeContent(bigIds);
    // Parity of the item's position -- a pure function of the id, not of call
    // order, so both questions about the same item agree, same as any real answer.
    const final = runToCompletion(content, (itemId) => bigIds.indexOf(itemId) % 2 === 0);
    expect(final.askedCount).toBeLessThanOrEqual(2 * Math.ceil(Math.log2(bigIds.length + 1)));
  });

  it('nextPlacementQuestion returns null once the test is done', () => {
    const content = fakeContent(ids);
    const final = runToCompletion(content, () => true);
    expect(isPlacementDone(final)).toBe(true);
    expect(nextPlacementQuestion(final, content, 'test')).toBeNull();
  });

  it('generates a real grammar question via generateForCard', () => {
    const content = fakeContent(ids);
    const state = initPlacement(content);
    const step = nextPlacementQuestion(state, content, 'test');
    expect(step).not.toBeNull();
    expect(step!.question.itemType).toBe('grammar');
    expect(['cloze', 'choice', 'assemble']).toContain(step!.question.kind);
    expect(step!.itemId).toBe(ids[Math.floor(ids.length / 2)]);
  });

  it('the first and confirming second question about the same item are different questions', () => {
    const content = fakeContent(ids);
    let state = initPlacement(content);
    const first = nextPlacementQuestion(state, content, 'test')!;
    state = applyPlacementAnswer(state, true); // -> phase 'second', same idx
    const second = nextPlacementQuestion(state, content, 'test')!;
    expect(second.itemId).toBe(first.itemId); // still probing the same item
    expect(second.question.id).not.toBe(first.question.id); // but a different question
  });

  it('does not advance the frontier on a single lucky correct answer without a matching second confirmation', () => {
    const content = fakeContent(ids);
    let state = initPlacement(content); // lo=0, hi=8
    state = applyPlacementAnswer(state, true); // first question: correct (could be a lucky guess)
    expect(state.phase).toBe('second');
    expect(state.lo).toBe(0); // not trusted yet -- lo/hi unchanged mid-pair
    expect(state.hi).toBe(8);
    state = applyPlacementAnswer(state, false); // confirming question: wrong
    expect(state.lo).toBe(0);
    expect(state.hi).toBe(4); // the probed index (4) is rejected, not accepted
  });

  it('is immediately done with an empty frontier when no grammar is available', () => {
    const content = fakeContent([]);
    const state = initPlacement(content);
    expect(isPlacementDone(state)).toBe(true);
    expect(nextPlacementQuestion(state, content, 'test')).toBeNull();
    expect(placementFrontierIds(state)).toEqual([]);
  });
});
