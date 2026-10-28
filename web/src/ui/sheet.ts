/** The paper sheet: tilted decoration (paper, tape, shadow) under a straight drawing canvas. */
export const SHEET_HTML = `
  <div class="sheet">
    <div class="sheet-deco" aria-hidden="true">
      <span class="tape tl"></span><span class="tape tr"></span><span class="tape bl"></span><span class="tape br"></span>
    </div>
    <canvas class="pad" data-i18n-aria-label="canvasLabel"></canvas>
  </div>`;

export const UNDO_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></svg>';
export const CLEAR_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 21-4-4a2 2 0 0 1 0-3l10-10a2 2 0 0 1 3 0l5 5a2 2 0 0 1 0 3l-8 8" /><path d="M22 21H7" /><path d="m5 11 9 9" /></svg>';
