import type { Guess } from '../answer';
import { capitalize, className, percent } from '../i18n';
import type { ClassInfo } from '../labels';
import { prefersReducedMotion } from '../state';

const TILTS = ['-0.6deg', '0.4deg', '-0.3deg', '0.5deg', '-0.4deg'];

/** Top-5 guesses drawn as highlighter strokes. Rows are reused so bars animate between updates. */
export class GuessList {
  private readonly rows: Array<{ li: HTMLLIElement; bar: HTMLElement; label: HTMLElement; pct: HTMLElement }>;

  constructor(root: HTMLOListElement) {
    this.rows = TILTS.map((tilt) => {
      const li = document.createElement('li');
      li.className = 'guess empty';
      li.style.setProperty('--tilt', tilt);
      li.innerHTML = '<span class="bar" aria-hidden="true"></span><span class="label">…</span><span class="pct"></span>';
      root.append(li);
      return { li, bar: li.querySelector('.bar')!, label: li.querySelector('.label')!, pct: li.querySelector('.pct')! };
    });
  }

  render(guesses: Guess[] | null, classes: ClassInfo[]): void {
    this.rows.forEach((row, i) => {
      const g = guesses?.[i];
      row.li.classList.toggle('empty', !g);
      row.li.classList.toggle('top', i === 0 && !!g);
      if (!g) {
        row.label.textContent = '…';
        row.pct.textContent = '';
        row.bar.style.width = '0';
        return;
      }
      const label = capitalize(className(classes[g.index]));
      if (row.label.textContent !== label) {
        row.label.textContent = label;
        if (!prefersReducedMotion()) {
          row.li.animate(
            [{ transform: 'translateX(-4px) rotate(-0.8deg)' }, { transform: 'translateX(2px) rotate(0.4deg)' }, { transform: 'none' }],
            { duration: 320, easing: 'ease-out' },
          );
        }
      }
      row.pct.textContent = percent(g.probability);
      row.bar.style.width = `${Math.max(2, g.probability * 100)}%`;
    });
  }
}
