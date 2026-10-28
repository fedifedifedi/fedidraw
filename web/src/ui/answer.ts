import type { Answer } from '../answer';
import type { AnswerText } from '../i18n';

/** The AI "thinking out loud": a status chip, a handwritten sentence written on screen, and a tip. */
export class AnswerView {
  private readonly chip: HTMLElement;
  private readonly message: HTMLElement;
  private readonly underline: SVGPathElement;
  private readonly tip: HTMLElement;
  private shown = '';

  constructor(private readonly root: HTMLElement) {
    root.innerHTML = `
      <span class="chip"></span>
      <h1 class="answer-text" aria-live="polite"></h1>
      <svg class="answer-underline" viewBox="0 0 300 16" aria-hidden="true" preserveAspectRatio="none">
        <path pathLength="1" d="M3 10 C 40 3, 70 14, 110 8 S 190 4, 230 10 S 280 6, 297 8" />
      </svg>
      <p class="answer-tip"></p>`;
    this.chip = root.querySelector('.chip')!;
    this.message = root.querySelector('.answer-text')!;
    this.underline = root.querySelector('.answer-underline path')!;
    this.tip = root.querySelector('.answer-tip')!;
  }

  render(text: AnswerText, kind: Answer['kind'] | 'loading' | 'error'): void {
    this.root.dataset.state = kind;
    this.chip.textContent = text.chip;
    this.chip.hidden = text.chip === '';
    this.tip.textContent = text.tip;
    if (text.message === this.shown) return;
    this.shown = text.message;
    this.message.textContent = text.message;
    // Restart the "writing" animation; its length follows the sentence length.
    const ms = Math.min(1100, 220 + text.message.length * 22);
    this.message.style.setProperty('--write-ms', `${ms}ms`);
    for (const el of [this.message, this.underline]) {
      el.classList.remove('writing');
      void el.getBoundingClientRect();
      el.classList.add('writing');
    }
  }
}
