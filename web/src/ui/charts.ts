/**
 * Small SVG charts for the "How it works" page. They are drawn at the container's real
 * width (re-rendered on resize) so text stays legible, use theme tokens for every colour,
 * and show a tooltip on hover or tap.
 */

export interface Tooltip {
  show(html: string, clientX: number, clientY: number): void;
  hide(): void;
}

export function attachTooltip(host: HTMLElement): Tooltip {
  host.classList.add('chart-host');
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.hidden = true;
  host.append(tip);
  return {
    show(html, clientX, clientY) {
      tip.innerHTML = html;
      tip.hidden = false;
      const r = host.getBoundingClientRect();
      let x = clientX - r.left + 14;
      const y = clientY - r.top + 14;
      if (x + tip.offsetWidth > r.width) x = clientX - r.left - tip.offsetWidth - 14;
      tip.style.transform = `translate(${Math.max(0, x)}px, ${y}px)`;
    },
    hide() {
      tip.hidden = true;
    },
  };
}

/** Re-renders `draw(width)` whenever the host is resized. */
export function responsive(host: HTMLElement, draw: (width: number) => void): () => void {
  let last = -1;
  const run = () => {
    const w = Math.round(host.clientWidth);
    if (w > 0 && w !== last) {
      last = w;
      draw(w);
    }
  };
  new ResizeObserver(run).observe(host);
  return () => {
    last = -1;
    run();
  };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function legendHtml(items: Array<{ name: string; color: string }>): string {
  return `<ul class="chart-legend">${items
    .map((i) => `<li><span class="swatch" style="background:${i.color}"></span>${esc(i.name)}</li>`)
    .join('')}</ul>`;
}

// ---------------------------------------------------------------- line chart

export interface LineSeries {
  name: string;
  color: string;
  values: number[];
}

export interface LineChartOptions {
  series: LineSeries[];
  xLabels: string[];
  xTitle: string;
  yMin: number;
  yMax: number;
  yTicks: number[];
  format: (v: number) => string;
  ariaLabel: string;
}

export function lineChart(svgBox: HTMLElement, tooltip: Tooltip, o: LineChartOptions, width: number): void {
  const H = 270, m = { l: 44, r: 92, t: 14, b: 42 };
  const n = o.xLabels.length;
  const x = (i: number) => m.l + (i * (width - m.l - m.r)) / Math.max(1, n - 1);
  const y = (v: number) => m.t + (1 - (v - o.yMin) / (o.yMax - o.yMin)) * (H - m.t - m.b);
  const grid = o.yTicks
    .map((t) => `<line class="grid" x1="${m.l}" x2="${width - m.r}" y1="${y(t)}" y2="${y(t)}" /><text class="tick" x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end">${o.format(t)}</text>`)
    .join('');
  const xTicks = o.xLabels.map((l, i) => `<text class="tick" x="${x(i)}" y="${H - m.b + 18}" text-anchor="middle">${esc(l)}</text>`).join('');
  // Direct labels at the line ends, pushed apart so they never overlap.
  const labelY = o.series.map((s) => y(s.values[s.values.length - 1]));
  const byY = labelY.map((_, i) => i).sort((a, b) => labelY[a] - labelY[b]);
  for (let k = 1; k < byY.length; k++) {
    const prev = labelY[byY[k - 1]];
    if (labelY[byY[k]] - prev < 16) labelY[byY[k]] = prev + 16;
  }
  const lines = o.series
    .map((s, si) => {
      const d = s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
      const dots = s.values.map((v, i) => `<circle class="dot" cx="${x(i)}" cy="${y(v)}" r="4" style="fill:${s.color}" />`).join('');
      const last = s.values.length - 1;
      return `<path class="series" d="${d}" style="stroke:${s.color}" />${dots}<text class="direct-label" x="${x(last) + 10}" y="${labelY[si] + 4}">${esc(s.name)}</text>`;
    })
    .join('');
  svgBox.innerHTML = `
    <svg width="${width}" height="${H}" role="img" aria-label="${esc(o.ariaLabel)}">
      ${grid}
      <line class="axis" x1="${m.l}" x2="${width - m.r}" y1="${H - m.b}" y2="${H - m.b}" />
      ${xTicks}
      <text class="axis-title" x="${(m.l + width - m.r) / 2}" y="${H - 4}" text-anchor="middle">${esc(o.xTitle)}</text>
      <line class="crosshair" y1="${m.t}" y2="${H - m.b}" visibility="hidden" />
      ${lines}
      <rect class="hit" x="${m.l - 10}" y="${m.t}" width="${width - m.l - m.r + 20}" height="${H - m.t - m.b}" />
    </svg>`;
  const svg = svgBox.querySelector('svg')!;
  const cross = svg.querySelector<SVGLineElement>('.crosshair')!;
  const hit = svg.querySelector('.hit')!;
  const move = (e: PointerEvent) => {
    const r = svg.getBoundingClientRect();
    const i = Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left - m.l) / (width - m.l - m.r)) * (n - 1))));
    cross.setAttribute('x1', String(x(i)));
    cross.setAttribute('x2', String(x(i)));
    cross.setAttribute('visibility', 'visible');
    tooltip.show(
      `<strong>${esc(o.xTitle)} ${esc(o.xLabels[i])}</strong>${o.series
        .map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)} <b>${o.format(s.values[i])}</b></span>`)
        .join('')}`,
      e.clientX,
      e.clientY,
    );
  };
  hit.addEventListener('pointermove', move as EventListener);
  hit.addEventListener('pointerdown', move as EventListener);
  hit.addEventListener('pointerleave', () => {
    cross.setAttribute('visibility', 'hidden');
    tooltip.hide();
  });
}

// ---------------------------------------------------------------- dot plot

export interface DotRow {
  label: string;
  values: Array<{ series: string; color: string; value: number }>;
}

/** Cleveland dot plot: one row per measure, one dot per series, joined by a hairline. */
export function dotPlot(svgBox: HTMLElement, tooltip: Tooltip, rows: DotRow[], format: (v: number) => string, xTitle: string, ariaLabel: string, width: number): void {
  const labelW = Math.min(170, width * 0.36);
  const rowH = 64, m = { t: 22, b: 40, r: 26 };
  const H = m.t + rows.length * rowH + m.b;
  const all = rows.flatMap((r) => r.values.map((v) => v.value));
  const lo = Math.floor(Math.min(...all) - 1), hi = Math.ceil(Math.max(...all) + 0.5);
  const x = (v: number) => labelW + ((v - lo) / (hi - lo)) * (width - labelW - m.r);
  const ticks = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).filter((t) => (hi - lo > 6 ? t % 2 === 0 : true));
  const body = rows
    .map((row, ri) => {
      const cy = m.t + ri * rowH + rowH / 2;
      const xs = row.values.map((v) => x(v.value));
      const close = Math.max(...xs) - Math.min(...xs) < 56; // labels would collide: put the second one below
      return `<text class="row-label" x="0" y="${cy + 5}">${esc(row.label)}</text>
        <line class="link" x1="${Math.min(...xs)}" x2="${Math.max(...xs)}" y1="${cy}" y2="${cy}" />
        ${row.values
          .map(
            (v, vi) => `<circle class="dot big" data-tip="${esc(`<strong>${row.label}</strong><span><i style="background:${v.color}"></i>${v.series} <b>${format(v.value)}</b></span>`)}" cx="${x(v.value)}" cy="${cy}" r="7" style="fill:${v.color}" />
              <text class="value" x="${x(v.value)}" y="${close && vi === 1 ? cy + 23 : cy - 13}" text-anchor="middle">${format(v.value)}</text>`,
          )
          .join('')}`;
    })
    .join('');
  svgBox.innerHTML = `
    <svg width="${width}" height="${H}" role="img" aria-label="${esc(ariaLabel)}">
      ${ticks.map((t) => `<line class="grid" x1="${x(t)}" x2="${x(t)}" y1="${m.t}" y2="${H - m.b}" /><text class="tick" x="${x(t)}" y="${H - m.b + 18}" text-anchor="middle">${format(t)}</text>`).join('')}
      <text class="axis-title" x="${(labelW + width - m.r) / 2}" y="${H - 4}" text-anchor="middle">${esc(xTitle)}</text>
      ${body}
    </svg>`;
  bindDataTips(svgBox, tooltip);
}

// ---------------------------------------------------------------- per-class dot list

export interface ClassValue {
  label: string;
  value: number;
}

/** One dot per class on a shared accuracy axis, sorted; the weakest classes are labelled. */
export function classDots(svgBox: HTMLElement, tooltip: Tooltip, items: ClassValue[], color: string, format: (v: number) => string, xTitle: string, ariaLabel: string, width: number, labelled = 5): void {
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const labelW = Math.min(150, width * 0.34);
  const rowH = 22, m = { t: 8, b: 42, r: 52 };
  const H = m.t + sorted.length * rowH + m.b;
  const lo = Math.floor(Math.min(...sorted.map((s) => s.value)) / 5) * 5, hi = 100;
  const x = (v: number) => labelW + ((v - lo) / (hi - lo)) * (width - labelW - m.r);
  const ticks = Array.from({ length: (hi - lo) / 5 + 1 }, (_, i) => lo + i * 5);
  const body = sorted
    .map((s, i) => {
      const cy = m.t + i * rowH + rowH / 2;
      const tip = esc(`<strong>${s.label}</strong><span>${format(s.value)}</span>`);
      const showValue = i >= sorted.length - labelled;
      return `<g class="row" data-tip="${tip}">
          <rect class="row-hit" x="0" y="${cy - rowH / 2}" width="${width}" height="${rowH}" />
          <text class="row-label small" x="0" y="${cy + 4}">${esc(s.label)}</text>
          <line class="stem" x1="${labelW}" x2="${x(s.value)}" y1="${cy}" y2="${cy}" />
          <circle class="dot" cx="${x(s.value)}" cy="${cy}" r="4.5" style="fill:${color}" />
          ${showValue ? `<text class="value" x="${x(s.value) + 9}" y="${cy + 4}">${format(s.value)}</text>` : ''}
        </g>`;
    })
    .join('');
  svgBox.innerHTML = `
    <svg width="${width}" height="${H}" role="img" aria-label="${esc(ariaLabel)}">
      ${ticks.map((t) => `<line class="grid" x1="${x(t)}" x2="${x(t)}" y1="${m.t}" y2="${H - m.b}" /><text class="tick" x="${x(t)}" y="${H - m.b + 18}" text-anchor="middle">${format(t)}</text>`).join('')}
      <text class="axis-title" x="${(labelW + width - m.r) / 2}" y="${H - 4}" text-anchor="middle">${esc(xTitle)}</text>
      ${body}
    </svg>`;
  bindDataTips(svgBox, tooltip);
}

// ---------------------------------------------------------------- confusion matrix

export interface MatrixOptions {
  labels: string[];
  counts: number[][];
  cap: number; // % — the colour scale saturates here so small confusions stay visible
  tip: (row: number, col: number, pct: number, count: number, total: number) => string;
  ariaLabel: string;
}

export function confusionMatrix(svgBox: HTMLElement, tooltip: Tooltip, o: MatrixOptions, width: number): void {
  const n = o.labels.length;
  const W = Math.max(width, 560);
  // Room for the longest class name (11 px text ≈ 6.2 px per character), rotated by 60° on top.
  const longest = Math.max(...o.labels.map((l) => l.length)) * 6.2;
  const labelW = Math.ceil(longest + 12), top = Math.ceil(longest * Math.sin(Math.PI / 3) + 14);
  const cell = Math.floor((W - labelW - 8) / n);
  const H = top + cell * n + 6;
  let cells = '';
  for (let r = 0; r < n; r++) {
    const total = o.counts[r].reduce((s, v) => s + v, 0) || 1;
    for (let c = 0; c < n; c++) {
      const pct = (o.counts[r][c] / total) * 100;
      if (pct === 0 && r !== c) continue;
      const style = r === c ? 'fill:var(--ink);fill-opacity:0.82' : `fill:var(--chart-1);fill-opacity:${Math.min(1, pct / o.cap).toFixed(3)}`;
      cells += `<rect class="cell" data-r="${r}" data-c="${c}" x="${labelW + c * cell}" y="${top + r * cell}" width="${cell - 1}" height="${cell - 1}" style="${style}" />`;
    }
  }
  const rowLabels = o.labels.map((l, i) => `<text class="m-label row-${i}" x="${labelW - 6}" y="${top + i * cell + cell * 0.72}" text-anchor="end">${esc(l)}</text>`).join('');
  const colLabels = o.labels
    .map((l, i) => {
      const cx = labelW + i * cell + cell / 2;
      return `<text class="m-label col-${i}" transform="translate(${cx + 3} ${top - 6}) rotate(-60)">${esc(l)}</text>`;
    })
    .join('');
  svgBox.innerHTML = `
    <svg width="${W}" height="${H}" role="img" aria-label="${esc(o.ariaLabel)}">
      <rect class="m-bg" x="${labelW}" y="${top}" width="${cell * n - 1}" height="${cell * n - 1}" />
      ${rowLabels}${colLabels}${cells}
      <rect class="m-focus" width="${cell + 1}" height="${cell + 1}" visibility="hidden" />
    </svg>`;
  const svg = svgBox.querySelector('svg')!;
  const focus = svg.querySelector<SVGRectElement>('.m-focus')!;
  let lit: Element[] = [];
  const at = (e: PointerEvent) => {
    const r = svg.getBoundingClientRect();
    const col = Math.floor((e.clientX - r.left - labelW) / cell);
    const row = Math.floor((e.clientY - r.top - top) / cell);
    return row >= 0 && row < n && col >= 0 && col < n ? { row, col } : null;
  };
  const move = (e: PointerEvent) => {
    const p = at(e);
    lit.forEach((el) => el.classList.remove('lit'));
    if (!p) {
      focus.setAttribute('visibility', 'hidden');
      tooltip.hide();
      return;
    }
    lit = [svg.querySelector(`.row-${p.row}`)!, svg.querySelector(`.col-${p.col}`)!];
    lit.forEach((el) => el.classList.add('lit'));
    focus.setAttribute('x', String(labelW + p.col * cell - 1));
    focus.setAttribute('y', String(top + p.row * cell - 1));
    focus.setAttribute('visibility', 'visible');
    const total = o.counts[p.row].reduce((s, v) => s + v, 0) || 1;
    const count = o.counts[p.row][p.col];
    tooltip.show(o.tip(p.row, p.col, (count / total) * 100, count, total), e.clientX, e.clientY);
  };
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerdown', move);
  svg.addEventListener('pointerleave', () => {
    lit.forEach((el) => el.classList.remove('lit'));
    focus.setAttribute('visibility', 'hidden');
    tooltip.hide();
  });
}

function bindDataTips(box: HTMLElement, tooltip: Tooltip): void {
  const svg = box.querySelector('svg')!;
  const handler = (e: PointerEvent) => {
    const target = (e.target as Element).closest('[data-tip]');
    if (target) tooltip.show(target.getAttribute('data-tip')!, e.clientX, e.clientY);
    else tooltip.hide();
  };
  svg.addEventListener('pointermove', handler);
  svg.addEventListener('pointerdown', handler);
  svg.addEventListener('pointerleave', () => tooltip.hide());
}
