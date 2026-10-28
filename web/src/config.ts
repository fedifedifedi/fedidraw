/** Tunable behaviour of the app, in one place. */

/** How the AI phrases its answer. Probabilities are in 0..1. */
export const ANSWER_RULES = {
  /** Below this top-1 probability the AI says it is still looking. */
  minConfidence: 0.35,
  /** Below this amount of ink (total stroke length / canvas side) it is still looking too. */
  minInkRatio: 0.5,
  /** Top-1 and top-2 closer than this (0.2 = 20 points): the AI is torn between two. */
  hesitationGap: 0.2,
  /** From this top-1 probability the AI drops the "I think" and states it. */
  certainConfidence: 0.85,
} as const;

/** Minimum delay between two predictions while the user is drawing. */
export const PREDICT_INTERVAL_MS = 90;

/** Pen width on screen, relative to the canvas side (the model input does not depend on it). */
export const SCREEN_STROKE_RATIO = 0.012;
