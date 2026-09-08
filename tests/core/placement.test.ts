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

function runToCompletion(
  content: ContentDb,
  correctFor: (itemId: string) => boolean,
): { final: PlacementState; asked: string[] } {
  let state = initPlacement(content);
  const asked: string[] = [];
  while (!isPlacementDone(state)) {
    const step = nextPlacementQuestion(state, content, 'test');
    if (!step) break;
    asked.push(step.itemId);
    state = applyPlacementAnswer(state, correctFor(step.itemId));
  }
  return { final: state, asked };
}

describe('core/placement', () => {
  const ids = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
  const bound = (n: number) => Math.ceil(Math.log2(n + 1));

  it('converges to the full frontier when every answer is correct', () => {
    const { final } = runToCompletion(fakeContent(ids), () => true);
    expect(placementFrontierIds(final)).toEqual(ids);
    expect(final.askedCount).toBeLessThanOrEqual(bound(ids.length));
  });

  it('converges to an empty frontier when every answer is wrong', () => {
    const { final } = runToCompletion(fakeContent(ids), () => false);
    expect(placementFrontierIds(final)).toEqual([]);
    expect(final.askedCount).toBeLessThanOrEqual(bound(ids.length));
  });

  it('converges to a hand-traced middle boundary with mixed answers', () => {
    // Oracle: the first 3 ids (by canonical order) are "known". Hand trace for
    // ids.length=8, lo=0,hi=8:
    //   idx=4 -> p5 (index 4, not < 3) -> wrong -> hi=4
    //   idx=2 -> p3 (index 2, < 3)     -> correct -> lo=3
    //   idx=3 -> p4 (index 3, not < 3) -> wrong -> hi=3
    //   lo=3, hi=3 -> done. frontier = ids[0..3) = ['p1','p2','p3']. 3 questions.
    const { final, asked } = runToCompletion(fakeContent(ids), (id) => ids.indexOf(id) < 3);
    expect(placementFrontierIds(final)).toEqual(['p1', 'p2', 'p3']);
    expect(final.askedCount).toBe(3);
    expect(asked).toEqual(['p5', 'p3', 'p4']);
  });

  it('never asks about the same grammar point twice', () => {
    const bigIds = Array.from({ length: 93 }, (_, i) => `g${i}`);
    const { asked } = runToCompletion(fakeContent(bigIds), (id) => bigIds.indexOf(id) % 2 === 0);
    expect(new Set(asked).size).toBe(asked.length);
  });

  it('terminates within ceil(log2(N+1)) questions for a larger corpus', () => {
    const bigIds = Array.from({ length: 93 }, (_, i) => `g${i}`);
    const { final } = runToCompletion(fakeContent(bigIds), (id) => bigIds.indexOf(id) % 2 === 0);
    expect(final.askedCount).toBeLessThanOrEqual(bound(bigIds.length));
  });

  it('a wrong answer counts immediately: the failed item is not in the frontier and is not re-asked', () => {
    const content = fakeContent(ids);
    let state = initPlacement(content); // lo=0, hi=8
    const first = nextPlacementQuestion(state, content, 'test')!;
    expect(first.itemId).toBe('p5'); // idx 4
    state = applyPlacementAnswer(state, false); // wrong -> hi = 4, no second try
    expect(state.hi).toBe(4);
    expect(state.lo).toBe(0);
    const second = nextPlacementQuestion(state, content, 'test')!;
    expect(second.itemId).not.toBe(first.itemId);
    expect(placementFrontierIds(state)).not.toContain('p5');
  });

  it('a single correct answer advances the frontier by one (no confirmation step)', () => {
    const content = fakeContent(ids);
    let state = initPlacement(content); // lo=0, hi=8, idx 4
    state = applyPlacementAnswer(state, true);
    expect(state.lo).toBe(5);
    expect(state.hi).toBe(8);
  });

  it('nextPlacementQuestion returns null once the test is done', () => {
    const content = fakeContent(ids);
    const { final } = runToCompletion(content, () => true);
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

  it('is immediately done with an empty frontier when no grammar is available', () => {
    const content = fakeContent([]);
    const state = initPlacement(content);
    expect(isPlacementDone(state)).toBe(true);
    expect(nextPlacementQuestion(state, content, 'test')).toBeNull();
    expect(placementFrontierIds(state)).toEqual([]);
  });
});
