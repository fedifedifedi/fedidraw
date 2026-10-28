import { capitalize, className, strings, t } from '../i18n';
import { loadSamples, type ClassInfo } from '../labels';
import type { Prediction } from '../recognizer';
import { paintGray } from './brain';

/** Debug panel: the exact 28x28 image sent to the model, next to a real Quick Draw drawing. */
export class DebugPanel {
  private readonly input: HTMLCanvasElement;
  private readonly sample: HTMLCanvasElement;
  private readonly sampleCaption: HTMLElement;
  private readonly stats: HTMLElement;
  private sampleClass = '';

  constructor(private readonly root: HTMLElement) {
    root.innerHTML = `
      <h3 data-i18n="debugTitle"></h3>
      <div class="debug-row">
        <figure>
          <div class="pixel-grid"><canvas width="28" height="28"></canvas></div>
          <figcaption data-i18n="debugInput"></figcaption>
        </figure>
        <figure>
          <div class="pixel-grid"><canvas width="28" height="28"></canvas></div>
          <figcaption class="sample-caption"></figcaption>
        </figure>
      </div>
      <p class="debug-stats"></p>
      <p class="debug-hint" data-i18n="debugHint"></p>`;
    [this.input, this.sample] = root.querySelectorAll('canvas');
    this.sampleCaption = root.querySelector('.sample-caption')!;
    this.stats = root.querySelector('.debug-stats')!;
  }

  render(prediction: Prediction | null, top: ClassInfo | null): void {
    if (this.root.hidden) return;
    paintGray(this.input, prediction?.input ?? null, 28);
    if (!prediction || !top) {
      this.stats.textContent = '';
      this.sampleCaption.textContent = t('debugSample');
      paintGray(this.sample, null, 28);
      this.sampleClass = '';
      return;
    }
    let ink = 0, mass = 0;
    for (const v of prediction.input) {
      if (v > 0) ink++;
      mass += v;
    }
    this.stats.textContent = strings().debugStats(ink, mass.toFixed(1), prediction.ms.toFixed(1));
    this.sampleCaption.textContent = `${t('debugSample')} · ${capitalize(className(top))}`;
    if (top.id !== this.sampleClass) {
      this.sampleClass = top.id;
      loadSamples().then((samples) => {
        if (this.sampleClass !== top.id) return;
        const bytes = samples[top.id]?.[0];
        paintGray(this.sample, bytes ? Float32Array.from(bytes, (b) => b / 255) : null, 28);
      });
    }
  }
}
