/**
 * Turns the user's strokes into the 28x28 image the model expects.
 *
 * Quick Draw bitmaps are rendered from vector strokes, not cropped from photos
 * (see training/reports/format_report.md), so we replay Google's pipeline on the
 * strokes captured by the canvas:
 *   1. shift so the minimum x and y are 0, scale uniformly so the longest side is 255
 *   2. resample every stroke at 1-unit spacing, simplify with Ramer-Douglas-Peucker (eps 2)
 *   3. centre the drawing in a 256-unit box and draw it with a 16-unit round pen,
 *      16 units of padding, down to 28x28 with anti-aliasing
 * The stroke width therefore stays ~6 % of the drawing whatever the brush or canvas size.
 */

export type Point = readonly [number, number];
export type Stroke = Point[];

export interface PreprocessParams {
  coordinate_range: number;
  resample_spacing: number;
  rdp_epsilon: number;
  original_side: number;
  line_width: number;
  padding: number;
  output_side: number;
  background: number;
  stroke: number;
}

/** Same values as `preprocessing` in public/model/labels.json, written by training/export_onnx.py. */
export const QUICKDRAW_PARAMS: PreprocessParams = {
  coordinate_range: 255,
  resample_spacing: 1,
  rdp_epsilon: 2,
  original_side: 256,
  line_width: 16,
  padding: 16,
  output_side: 28,
  background: 0,
  stroke: 1,
};

/** Sub-pixel samples per axis used to compute anti-aliased coverage. */
const SUPERSAMPLE = 6;

/** Step 1: top-left align and scale uniformly so the longest side equals `range`. */
export function normalize(strokes: Stroke[], range: number): Stroke[] {
  const kept = strokes.filter((s) => s.length > 0);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of kept) {
    for (const [x, y] of s) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  const extent = Math.max(maxX - minX, maxY - minY);
  const k = extent > 0 ? range / extent : 0;
  return kept.map((s) => s.map(([x, y]): Point => [(x - minX) * k, (y - minY) * k]));
}

/** Points every `spacing` units along the polyline, keeping both ends. */
export function resample(stroke: Stroke, spacing: number): Stroke {
  if (stroke.length < 2) return stroke.slice();
  const out: Point[] = [stroke[0]];
  let carry = 0; // distance travelled since the last emitted point
  for (let i = 1; i < stroke.length; i++) {
    let [ax, ay] = stroke[i - 1];
    const [bx, by] = stroke[i];
    let seg = Math.hypot(bx - ax, by - ay);
    while (carry + seg >= spacing) {
      const t = (spacing - carry) / seg;
      ax += (bx - ax) * t;
      ay += (by - ay) * t;
      out.push([ax, ay]);
      seg = Math.hypot(bx - ax, by - ay);
      carry = 0;
    }
    carry += seg;
  }
  const last = stroke[stroke.length - 1];
  const tail = out[out.length - 1];
  if (tail[0] !== last[0] || tail[1] !== last[1]) out.push(last);
  return out;
}

function lineDistance([px, py]: Point, [ax, ay]: Point, [bx, by]: Point): number {
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(px - ax, py - ay);
  return Math.abs(dy * px - dx * py + bx * ay - by * ax) / len;
}

/** Ramer-Douglas-Peucker simplification. */
export function rdp(stroke: Stroke, epsilon: number): Stroke {
  const n = stroke.length;
  if (n < 3) return stroke.slice();
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: Array<[number, number]> = [[0, n - 1]];
  while (stack.length > 0) {
    const [a, b] = stack.pop()!;
    let maxD = 0, index = -1;
    for (let i = a + 1; i < b; i++) {
      const d = lineDistance(stroke[i], stroke[a], stroke[b]);
      if (d > maxD) {
        maxD = d;
        index = i;
      }
    }
    if (maxD > epsilon) {
      keep[index] = 1;
      stack.push([a, index], [index, b]);
    }
  }
  return stroke.filter((_, i) => keep[i] === 1);
}

/** Steps 1-2: the strokes as Quick Draw's "simplified" dataset would store them (integers in 0..255). */
export function simplify(strokes: Stroke[], p: PreprocessParams = QUICKDRAW_PARAMS): Stroke[] {
  return normalize(strokes, p.coordinate_range).map((s) =>
    rdp(resample(s, p.resample_spacing), p.rdp_epsilon).map(([x, y]): Point => [Math.round(x), Math.round(y)]),
  );
}

function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/** Step 3: render simplified strokes (0..255) to an anti-aliased `output_side`² image. */
export function rasterize(strokes: Stroke[], p: PreprocessParams = QUICKDRAW_PARAMS): Float32Array {
  const n = p.output_side;
  const N = n * SUPERSAMPLE;
  const hits = new Uint8Array(N * N);

  let maxX = 0, maxY = 0;
  for (const s of strokes) {
    for (const [x, y] of s) {
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  // Pixel units -> sample units; the drawing is centred in its original_side box.
  const scale = (n / (p.original_side + 2 * p.padding + p.line_width)) * SUPERSAMPLE;
  const offX = (p.original_side - maxX) / 2 + p.padding + p.line_width / 2;
  const offY = (p.original_side - maxY) / 2 + p.padding + p.line_width / 2;
  const radius = (p.line_width / 2) * scale;

  for (const s of strokes) {
    const pts = s.map(([x, y]) => [(x + offX) * scale, (y + offY) * scale] as const);
    if (pts.length === 1) pts.push(pts[0]);
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax, ay] = pts[k];
      const [bx, by] = pts[k + 1];
      const i0 = Math.max(0, Math.floor(Math.min(ax, bx) - radius - 0.5));
      const i1 = Math.min(N - 1, Math.ceil(Math.max(ax, bx) + radius - 0.5));
      const j0 = Math.max(0, Math.floor(Math.min(ay, by) - radius - 0.5));
      const j1 = Math.min(N - 1, Math.ceil(Math.max(ay, by) + radius - 0.5));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const idx = j * N + i;
          if (hits[idx] === 0 && segmentDistance(i + 0.5, j + 0.5, ax, ay, bx, by) <= radius) hits[idx] = 1;
        }
      }
    }
  }

  const out = new Float32Array(n * n);
  const area = SUPERSAMPLE * SUPERSAMPLE;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let sum = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        const row = (y * SUPERSAMPLE + sy) * N + x * SUPERSAMPLE;
        for (let sx = 0; sx < SUPERSAMPLE; sx++) sum += hits[row + sx];
      }
      out[y * n + x] = p.background + (p.stroke - p.background) * (sum / area);
    }
  }
  return out;
}

/** Full pipeline: raw strokes in any coordinate system -> model input (row-major 28x28, values in 0..1). */
export function preprocess(strokes: Stroke[], p: PreprocessParams = QUICKDRAW_PARAMS): Float32Array {
  return rasterize(simplify(strokes, p), p);
}

/** Total length of the strokes, in their own units. */
export function inkLength(strokes: Stroke[]): number {
  let total = 0;
  for (const s of strokes) {
    for (let i = 1; i < s.length; i++) total += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
  }
  return total;
}
