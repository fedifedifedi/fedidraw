import { GAME_RULES } from '../config';
import { strings, t } from '../i18n';

const ERASER = 34; // eraser + metal band, px
const TIP = 40; // sharpened wood + graphite, px

/**
 * The round timer: a pencil that wears down from the eraser end. Only transforms change
 * each frame (body scaleX, eraser translateX), so it stays smooth.
 */
export class PencilTimer {
  private readonly track: HTMLElement;
  private readonly body: HTMLElement;
  private readonly eraser: HTMLElement;
  private readonly label: HTMLElement;
  private lastSecond = -1;

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div class="pencil" aria-hidden="true">
        <div class="pencil-eraser"><span class="pencil-rubber"></span><span class="pencil-band"></span></div>
        <div class="pencil-body"></div>
        <svg class="pencil-tip" viewBox="0 0 40 28"><path class="wood" d="M0 0 L40 14 L0 28 Z" /><path class="lead" d="M27 9.4 L40 14 L27 18.6 Z" /></svg>
      </div>
      <span class="pencil-seconds" role="timer"></span>`;
    this.track = root.querySelector('.pencil')!;
    this.body = root.querySelector('.pencil-body')!;
    this.eraser = root.querySelector('.pencil-eraser')!;
    this.label = root.querySelector('.pencil-seconds')!;
    this.label.setAttribute('aria-label', t('timerLabel'));
  }

  /** ratio: share of time left (1 → 0). */
  set(ratio: number, secondsLeft: number): void {
    const r = Math.max(0, Math.min(1, ratio));
    const bodyWidth = this.track.clientWidth - ERASER - TIP;
    this.body.style.transform = `scaleX(${r})`;
    this.eraser.style.transform = `translateX(${(1 - r) * bodyWidth}px)`;
    this.track.classList.toggle('hurry', r > 0 && r < GAME_RULES.hurryRatio);
    const s = Math.ceil(secondsLeft);
    if (s !== this.lastSecond) {
      this.lastSecond = s;
      this.label.textContent = strings().secondsLeft(s);
    }
  }

  relabel(): void {
    this.label.setAttribute('aria-label', t('timerLabel'));
    if (this.lastSecond >= 0) this.label.textContent = strings().secondsLeft(this.lastSecond);
  }
}
