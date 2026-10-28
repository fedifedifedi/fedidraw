import { prefersReducedMotion } from '../state';

function star(cx: number, cy: number, r: number, turn = 0): string {
  const pts = Array.from({ length: 11 }, (_, i) => {
    const a = (i * Math.PI) / 5 - Math.PI / 2 + turn;
    const rr = i % 2 === 0 ? r : r * 0.45;
    return `${(cx + rr * Math.cos(a)).toFixed(1)} ${(cy + rr * Math.sin(a)).toFixed(1)}`;
  });
  return `M${pts.join(' L')}`;
}

/** Hand-drawn doodles (in a 100x100 box around the sheet) drawn one after another. */
function doodles(): Array<{ d: string; tone: 'accent' | 'hi'; width: number }> {
  const jitter = () => (Math.random() - 0.5) * 4;
  return [
    { d: `M50 4 C 82 2, 98 22, 96 50 S 78 97, 48 96 S 3 78, 5 48 S 24 3, ${56 + jitter()} 7`, tone: 'hi', width: 1 },
    { d: star(90 + jitter(), 9 + jitter(), 6, 0.2), tone: 'accent', width: 0.6 },
    { d: star(9 + jitter(), 90 + jitter(), 5, -0.3), tone: 'accent', width: 0.6 },
    { d: star(94, 84, 3.2), tone: 'hi', width: 0.55 },
    { d: 'M5 16 l-4 -2.5 M9 9 l-2 -5 M16 5 l0.5 -4.5', tone: 'accent', width: 0.55 },
    { d: 'M84 96 l2 4 M91 93 l4 2.5 M77 98 l-0.5 2', tone: 'accent', width: 0.55 },
  ];
}

/** Celebration scribbles around the sheet when the AI finds the word. */
export function celebrate(host: HTMLElement): void {
  host.querySelector('.celebration')?.remove();
  const still = prefersReducedMotion();
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'celebration');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  doodles().forEach((doodle, i) => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', doodle.d);
    path.setAttribute('pathLength', '1');
    path.setAttribute('class', `doodle ${doodle.tone}`);
    path.style.strokeWidth = String(doodle.width);
    path.style.animationDelay = still ? '0ms' : `${i * 110}ms`;
    svg.append(path);
  });
  host.append(svg);
}

export function clearCelebration(host: HTMLElement): void {
  host.querySelector('.celebration')?.remove();
}
