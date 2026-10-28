import { describe, expect, it } from 'vitest';
import { isRecognized, pickWords, scoreTier, wordsFromQuery } from './game';
import type { ClassInfo } from './labels';

const classes: ClassInfo[] = ['sun', 'camel', 'palm tree', 'moon'].map((id) => ({ id, en: id, fr: id }));

describe('pickWords', () => {
  it('returns distinct valid indices', () => {
    for (let run = 0; run < 50; run++) {
      const words = pickWords(6, 30);
      expect(new Set(words).size).toBe(6);
      expect(words.every((w) => w >= 0 && w < 30)).toBe(true);
    }
  });
});

describe('wordsFromQuery', () => {
  it('maps ids (underscore for spaces) and repeats them to fill the rounds', () => {
    expect(wordsFromQuery('sun,palm_tree', classes, 4)).toEqual([0, 2, 0, 2]);
  });

  it('ignores unknown or empty lists', () => {
    expect(wordsFromQuery('sun,dragon', classes, 6)).toBeNull();
    expect(wordsFromQuery(null, classes, 6)).toBeNull();
    expect(wordsFromQuery(' , ', classes, 6)).toBeNull();
  });
});

describe('isRecognized', () => {
  it('needs the target on top with enough confidence and enough ink', () => {
    expect(isRecognized([0.1, 0.6, 0.3], 1, 2)).toBe(true);
    expect(isRecognized([0.5, 0.3, 0.2], 1, 2)).toBe(false); // not the top guess
    expect(isRecognized([0.32, 0.36, 0.32], 1, 2)).toBe(false); // top, but not confident
    expect(isRecognized([0.1, 0.8, 0.1], 1, 0.1)).toBe(false); // a tiny scribble
  });
});

describe('scoreTier', () => {
  it('maps scores out of 6', () => {
    expect([6, 5, 4, 3, 2, 1, 0].map((s) => scoreTier(s, 6))).toEqual([
      'perfect', 'great', 'great', 'good', 'good', 'practice', 'practice',
    ]);
  });
});
