import { describe, expect, it } from 'vitest';
import { decideAnswer } from './answer';

function probs(...top: number[]): number[] {
  const rest = (1 - top.reduce((s, p) => s + p, 0)) / (30 - top.length);
  return [...top, ...Array(30 - top.length).fill(rest)];
}

describe('decideAnswer', () => {
  it('is idle without ink', () => {
    expect(decideAnswer(null, 0).kind).toBe('idle');
  });

  it('is still looking when the best guess is weak', () => {
    expect(decideAnswer(probs(0.3, 0.1), 2).kind).toBe('searching');
  });

  it('is still looking when there is very little ink, even if confident', () => {
    expect(decideAnswer(probs(0.9), 0.2).kind).toBe('searching');
  });

  it('is torn when the two best guesses are within 20 points', () => {
    const a = decideAnswer(probs(0.46, 0.39), 2);
    expect(a.kind).toBe('hesitant');
    if (a.kind === 'hesitant') expect([a.first.index, a.second.index]).toEqual([0, 1]);
  });

  it('is sure otherwise, and certain above 85 %', () => {
    expect(decideAnswer(probs(0.6, 0.2), 2)).toMatchObject({ kind: 'sure', certain: false });
    expect(decideAnswer(probs(0.91, 0.03), 2)).toMatchObject({ kind: 'sure', certain: true });
  });
});
