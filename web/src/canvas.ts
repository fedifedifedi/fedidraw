import { SCREEN_STROKE_RATIO } from './config';
import { inkLength, type Point, type Stroke } from './preprocess';

export interface PadChange {
  strokes: Stroke[];
  /** True when a stroke just ended (or was undone / cleared), false while drawing. */
  settled: boolean;
}

/**
 * Drawing surface for mouse, pen and touch. The canvas itself is never rotated
 * (only the paper decoration behind it is), so a point is exactly where the pointer is.
 * Strokes are stored in canvas-relative units (0..1) so resizing keeps the drawing.
 */
export class DrawingPad {
  /** When false, new strokes are ignored (e.g. between game rounds). */
  enabled = true;
  private strokes: Point[][] = [];
  private current: Point[] | null = null;
  private pointerId: number | null = null;
  private readonly ctx: CanvasRenderingContext2D;
  private side = 0;
  private dpr = 1;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onChange: (change: PadChange) => void,
  ) {
    this.ctx = canvas.getContext('2d')!;
    canvas.addEventListener('pointerdown', (e) => this.start(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.end(e));
    canvas.addEventListener('pointercancel', (e) => this.end(e));
    canvas.addEventListener('lostpointercapture', (e) => this.end(e));
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  get isEmpty(): boolean {
    return this.strokes.length === 0 && !this.current;
  }

  /** Strokes in canvas units (0..1), including the one being drawn. */
  getStrokes(): Stroke[] {
    return this.current ? [...this.strokes, this.current] : this.strokes.slice();
  }

  /** Total ink length relative to the canvas side. */
  inkRatio(): number {
    return inkLength(this.getStrokes());
  }

  undo(): void {
    if (this.current) return;
    this.strokes.pop();
    this.redraw();
    this.onChange({ strokes: this.getStrokes(), settled: true });
  }

  clear(): void {
    this.strokes = [];
    this.current = null;
    this.pointerId = null;
    this.redraw();
    this.onChange({ strokes: [], settled: true });
  }

  /** Re-renders every stroke, e.g. after a theme change. */
  redraw(): void {
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.applyPen();
    for (const s of this.getStrokes()) this.drawStroke(s);
  }

  private resize(): void {
    // Layout size, not getBoundingClientRect(): the sheet may be mid page-turn (transformed) when it appears.
    const { clientWidth, clientHeight } = this.canvas;
    this.dpr = window.devicePixelRatio || 1;
    this.side = clientWidth;
    this.canvas.width = Math.round(clientWidth * this.dpr);
    this.canvas.height = Math.round(clientHeight * this.dpr);
    this.redraw();
  }

  private applyPen(): void {
    const { ctx } = this;
    ctx.setTransform(this.dpr * this.side, 0, 0, this.dpr * this.side, 0, 0); // canvas units -> device pixels
    ctx.strokeStyle = getComputedStyle(this.canvas).getPropertyValue('--stroke').trim() || '#2f2c27';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = SCREEN_STROKE_RATIO;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  private drawStroke(s: Stroke): void {
    const { ctx } = this;
    if (s.length === 1) {
      ctx.beginPath();
      ctx.arc(s[0][0], s[0][1], SCREEN_STROKE_RATIO / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(s[0][0], s[0][1]);
    for (let i = 1; i < s.length; i++) ctx.lineTo(s[i][0], s[i][1]);
    ctx.stroke();
  }

  private point(e: PointerEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    return [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height];
  }

  private start(e: PointerEvent): void {
    if (!this.enabled || this.pointerId !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    this.pointerId = e.pointerId;
    this.canvas.setPointerCapture(e.pointerId);
    this.current = [this.point(e)];
    this.drawStroke(this.current);
    this.onChange({ strokes: this.getStrokes(), settled: false });
  }

  private move(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId || !this.current) return;
    const coalesced = e.getCoalescedEvents?.() ?? [];
    const events = coalesced.length ? coalesced : [e];
    const from = this.current[this.current.length - 1];
    for (const ev of events) this.current.push(this.point(ev));
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(from[0], from[1]);
    for (let i = this.current.length - events.length; i < this.current.length; i++) {
      ctx.lineTo(this.current[i][0], this.current[i][1]);
    }
    ctx.stroke();
    this.onChange({ strokes: this.getStrokes(), settled: false });
  }

  private end(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    if (this.current) this.strokes.push(this.current);
    this.current = null;
    this.onChange({ strokes: this.getStrokes(), settled: true });
  }
}
