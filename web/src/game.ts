import { ANSWER_RULES, GAME_RULES } from './config';
import type { ClassInfo } from './labels';
import type { Stroke } from './preprocess';

export interface RoundResult {
  target: number;
  found: boolean;
  /** Seconds taken to be recognised, when found. */
  seconds: number | null;
  /** The model's last top guess, when it was not the target. */
  lastGuess: number | null;
  strokes: Stroke[];
}

/** `count` distinct class indices in random order. */
export function pickWords(count: number, classCount: number, random: () => number = Math.random): number[] {
  const pool = Array.from({ length: classCount }, (_, i) => i);
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(random() * (classCount - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

/**
 * Fixed word list from the URL, e.g. ?words=sun,camel,palm_tree (used by the end-to-end test).
 * Returns null unless every word is a known class.
 */
export function wordsFromQuery(param: string | null, classes: ClassInfo[], count: number): number[] | null {
  if (!param) return null;
  const ids = param.split(',').map((w) => w.trim().replace(/_/g, ' ')).filter(Boolean);
  const indices = ids.map((id) => classes.findIndex((c) => c.id === id));
  if (indices.length === 0 || indices.some((i) => i < 0)) return null;
  return Array.from({ length: count }, (_, i) => indices[i % indices.length]);
}

/** The model recognised the target: it is the top guess, confidently, and something was really drawn. */
export function isRecognized(probs: ArrayLike<number>, target: number, inkRatio: number): boolean {
  let best = 0;
  for (let i = 1; i < probs.length; i++) if (probs[i] > probs[best]) best = i;
  return best === target && probs[target] >= GAME_RULES.successConfidence && inkRatio >= ANSWER_RULES.minInkRatio;
}

export type ScoreTier = 'perfect' | 'great' | 'good' | 'practice';

export function scoreTier(score: number, total: number): ScoreTier {
  if (score === total) return 'perfect';
  if (score >= Math.ceil(total * 0.66)) return 'great';
  if (score >= Math.ceil(total * 0.33)) return 'good';
  return 'practice';
}
