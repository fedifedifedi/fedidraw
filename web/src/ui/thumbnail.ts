import type { Stroke } from '../preprocess';

/** A small SVG of the user's strokes, framed on the drawing. */
export function thumbnailSvg(strokes: Stroke[], label: string): string {
  const pts = strokes.flat();
  if (pts.length === 0) return `<svg class="thumb" viewBox="0 0 1 1" role="img" aria-label="${label}"></svg>`;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const side = Math.max(maxX - minX, maxY - minY, 0.05);
  const pad = side * 0.12;
  const x0 = (minX + maxX) / 2 - side / 2 - pad, y0 = (minY + maxY) / 2 - side / 2 - pad;
  const lines = strokes
    .filter((s) => s.length > 0)
    .map((s) => {
      const p = s.length === 1 ? [s[0], s[0]] : s;
      return `<polyline points="${p.map(([x, y]) => `${x.toFixed(4)},${y.toFixed(4)}`).join(' ')}" />`;
    })
    .join('');
  const box = side + 2 * pad;
  return `<svg class="thumb" viewBox="${x0.toFixed(4)} ${y0.toFixed(4)} ${box.toFixed(4)} ${box.toFixed(4)}" role="img" aria-label="${label}">${lines}</svg>`;
}
