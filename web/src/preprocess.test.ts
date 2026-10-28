import { describe, expect, it } from 'vitest';
import fixture from './preprocess.fixture.json';
import { preprocess, rdp, resample, simplify, type Stroke } from './preprocess';

/** Fixture written by training/make_parity_fixture.py: Quick Draw vector drawings + official bitmaps. */
interface FixtureItem {
  class: string;
  strokes: number[][][];
  bitmap: string;
}

const items = fixture as FixtureItem[];

function toStrokes(drawing: number[][][]): Stroke[] {
  return drawing.map(([xs, ys]) => xs.map((x, i) => [x, ys[i]] as const));
}

function decodeBitmap(b64: string): Float32Array {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return Float32Array.from(bytes, (v) => v / 255);
}

/** Mean absolute error in grey levels (0..255). */
function mae(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return (sum / a.length) * 255;
}

describe('parity with the official Quick Draw bitmaps', () => {
  const errors = items.map((item) => mae(preprocess(toStrokes(item.strokes)), decodeBitmap(item.bitmap)));

  it(`reproduces ${items.length} bitmaps within a few grey levels on average`, () => {
    const mean = errors.reduce((s, e) => s + e, 0) / errors.length;
    console.info(`parity MAE: mean ${mean.toFixed(2)}, worst ${Math.max(...errors).toFixed(2)} grey levels (0..255)`);
    expect(mean).toBeLessThan(3);
  });

  it('has no badly reproduced drawing', () => {
    expect(Math.max(...errors)).toBeLessThan(12);
  });

  it('is far closer to the matching bitmap than to another drawing', () => {
    const shifted = items.map((item, i) =>
      mae(preprocess(toStrokes(item.strokes)), decodeBitmap(items[(i + 1) % items.length].bitmap)),
    );
    const mean = errors.reduce((s, e) => s + e, 0) / errors.length;
    const meanShifted = shifted.reduce((s, e) => s + e, 0) / shifted.length;
    expect(meanShifted).toBeGreaterThan(5 * mean);
  });
});

describe('invariance to how the user draws', () => {
  const strokes = toStrokes(items[0].strokes);
  const reference = preprocess(strokes);

  it('ignores the canvas size and position', () => {
    const moved = strokes.map((s) => s.map(([x, y]) => [x * 3.7 + 412.3, y * 3.7 - 58.1] as const));
    expect(mae(preprocess(moved), reference)).toBeLessThan(1.5);
  });

  it('ignores how densely the pointer was sampled', () => {
    const dense = strokes.map((s) => resample(s.map(([x, y]) => [x * 2, y * 2] as const), 0.37));
    expect(mae(preprocess(dense), reference)).toBeLessThan(2);
  });
});

describe('edge cases', () => {
  it('returns a blank image for no strokes', () => {
    const out = preprocess([]);
    expect(out.length).toBe(784);
    expect(out.every((v) => v === 0)).toBe(true);
  });

  it('handles a single dot and a straight line without NaN', () => {
    for (const strokes of [[[[10, 10]]], [[[0, 5], [100, 5]]]] as Stroke[][]) {
      const out = preprocess(strokes);
      expect(out.every((v) => Number.isFinite(v) && v >= 0 && v <= 1)).toBe(true);
      expect(out.some((v) => v > 0)).toBe(true);
    }
  });

  it('keeps drawings centred with the Quick Draw margins', () => {
    const out = preprocess([[[0, 0], [255, 255]]]);
    const ink = (x: number, y: number) => out[y * 28 + x] > 0;
    for (let i = 0; i < 28; i++) {
      expect(ink(i, 0) || ink(0, i) || ink(i, 27) || ink(27, i)).toBe(false); // nothing touches the border
    }
    expect(ink(13, 13) && ink(14, 14)).toBe(true);
  });

  it('simplifies like Quick Draw: integer coordinates in 0..255', () => {
    const s = simplify([[[3, 3], [50.5, 20.25], [400, 300]]]);
    const flat = s.flat();
    expect(flat.every(([x, y]) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x <= 255 && y <= 255)).toBe(true);
    expect(Math.max(...flat.map(([x, y]) => Math.max(x, y)))).toBe(255);
  });

  it('removes collinear points with RDP', () => {
    expect(rdp([[0, 0], [1, 0.1], [2, 0], [3, 0.1], [4, 0]], 2)).toEqual([[0, 0], [4, 0]]);
  });
});
