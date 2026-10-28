import { t } from '../i18n';
import type { Labels } from '../labels';
import { prefersReducedMotion } from '../state';

/** Paints a single-channel image into a canvas: white on black (model input) or theme ink (activation map). */
export function paintGray(canvas: HTMLCanvasElement, values: ArrayLike<number> | null, side: number, rgb?: string): void {
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, side, side);
  if (!values) return;
  // Activation maps are stretched to their own min..max so the shapes stand out; pixels are already 0..1.
  let min = 0, max = 1;
  if (rgb) {
    min = Infinity;
    max = -Infinity;
    for (let i = 0; i < values.length; i++) {
      if (values[i] < min) min = values[i];
      if (values[i] > max) max = values[i];
    }
  }
  const range = max - min > 1e-6 ? max - min : 1;
  const [r, g, b] = (rgb ?? '255, 255, 255').split(',').map(Number);
  const img = ctx.createImageData(side, side);
  for (let i = 0; i < side * side; i++) {
    img.data[i * 4] = r;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = Math.round(Math.min(1, Math.max(0, (values[i] - min) / range)) * 255);
  }
  ctx.putImageData(img, 0, 0);
}

/** "Inside my head": the 28x28 input and a few live activation maps of the CNN. */
export class BrainView {
  private readonly input: HTMLCanvasElement;
  private readonly maps: HTMLCanvasElement[];
  private readonly captions: HTMLElement[];
  private hadInput = false;

  constructor(root: HTMLElement, labels: Labels) {
    const channels = [
      ...labels.brain.act1_channels.map((c) => ({ layer: 1, c, side: 28 })),
      ...labels.brain.act2_channels.map((c) => ({ layer: 2, c, side: 14 })),
    ];
    root.innerHTML = `
      <h2 class="section-title" data-i18n="brain"></h2>
      <div class="brain-row">
        <figure>
          <canvas class="brain-input" width="28" height="28" role="img" data-i18n-aria-label="seesAlt"></canvas>
          <figcaption data-i18n="sees"></figcaption>
        </figure>
        <figure>
          <div class="maps">${channels.map((ch) => `<div class="map" data-layer="${ch.layer}" data-channel="${ch.c}"><canvas width="${ch.side}" height="${ch.side}" aria-hidden="true"></canvas><span></span></div>`).join('')}</div>
          <figcaption data-i18n="lights"></figcaption>
        </figure>
      </div>`;
    this.input = root.querySelector('.brain-input')!;
    this.maps = [...root.querySelectorAll<HTMLCanvasElement>('.map canvas')];
    this.captions = [...root.querySelectorAll<HTMLElement>('.map span')];
    this.relabel();
  }

  relabel(): void {
    this.captions.forEach((span) => {
      const map = span.parentElement!;
      span.textContent = `${t('layer')} ${map.dataset.layer} · ${t('filter')} ${map.dataset.channel}`;
    });
  }

  render(input: Float32Array | null, maps: Float32Array[] | null): void {
    paintGray(this.input, input, 28);
    const rgb = getComputedStyle(this.input).getPropertyValue('--map-rgb').trim();
    this.maps.forEach((canvas, i) => paintGray(canvas, maps?.[i] ?? null, canvas.width, rgb));
    if (input && !this.hadInput && !prefersReducedMotion()) {
      this.input.classList.remove('pixelate');
      void this.input.getBoundingClientRect();
      this.input.classList.add('pixelate');
    }
    this.hadInput = !!input;
  }
}
