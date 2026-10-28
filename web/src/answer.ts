import { ANSWER_RULES } from './config';

export interface Guess {
  index: number;
  probability: number;
}

export type Answer =
  | { kind: 'idle' }
  | { kind: 'searching' }
  | { kind: 'hesitant'; first: Guess; second: Guess }
  | { kind: 'sure'; first: Guess; certain: boolean };

export function topK(probs: ArrayLike<number>, k: number): Guess[] {
  return Array.from(probs, (probability, index) => ({ index, probability }))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, k);
}

/** Picks one of the three answer states from the model output and the amount of ink drawn. */
export function decideAnswer(
  probs: ArrayLike<number> | null,
  inkRatio: number,
  rules: typeof ANSWER_RULES = ANSWER_RULES,
): Answer {
  if (!probs || inkRatio === 0) return { kind: 'idle' };
  const [first, second] = topK(probs, 2);
  if (first.probability < rules.minConfidence || inkRatio < rules.minInkRatio) return { kind: 'searching' };
  if (first.probability - second.probability < rules.hesitationGap) return { kind: 'hesitant', first, second };
  return { kind: 'sure', first, certain: first.probability >= rules.certainConfidence };
}
