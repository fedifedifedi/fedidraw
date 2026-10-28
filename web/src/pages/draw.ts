import { decideAnswer, topK } from '../answer';
import { DrawingPad } from '../canvas';
import { PREDICT_INTERVAL_MS } from '../config';
import { answerText, applyI18n, t } from '../i18n';
import type { Labels } from '../labels';
import { preprocess } from '../preprocess';
import type { Prediction, Recognizer } from '../recognizer';
import { onStateChange, setDebug, state } from '../state';
import { AnswerView } from '../ui/answer';
import { BrainView } from '../ui/brain';
import { DebugPanel } from '../ui/debug';
import { GuessList } from '../ui/guesses';

const TEMPLATE = `
  <section class="sheet-area">
    <p class="prompt" data-i18n="prompt"></p>
    <div class="sheet">
      <div class="sheet-deco" aria-hidden="true">
        <span class="tape tl"></span><span class="tape tr"></span><span class="tape bl"></span><span class="tape br"></span>
      </div>
      <canvas class="pad" data-i18n-aria-label="canvasLabel"></canvas>
    </div>
    <div class="tools">
      <button type="button" class="btn" data-action="undo">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></svg>
        <span data-i18n="undo"></span>
      </button>
      <button type="button" class="btn" data-action="clear">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 21-4-4a2 2 0 0 1 0-3l10-10a2 2 0 0 1 3 0l5 5a2 2 0 0 1 0 3l-8 8" /><path d="M22 21H7" /><path d="m5 11 9 9" /></svg>
        <span data-i18n="clear"></span>
      </button>
      <button type="button" class="switch" data-action="debug">
        <span class="track" aria-hidden="true"><span class="knob"></span></span>
        <span data-i18n="debug"></span>
      </button>
    </div>
    <div class="debug" hidden></div>
  </section>
  <section class="answer"></section>
  <section class="guesses">
    <h2 class="section-title" data-i18n="top5"></h2>
    <ol class="guess-list"></ol>
  </section>
  <section class="brain"></section>`;

export interface DrawPage {
  element: HTMLElement;
  setActive(active: boolean): void;
}

export function createDrawPage(labels: Labels, recognizer: Recognizer): DrawPage {
  const element = document.createElement('div');
  element.className = 'draw';
  element.innerHTML = TEMPLATE;

  const $ = <T extends Element>(selector: string) => element.querySelector<T>(selector)!;
  const answer = new AnswerView($('.answer'));
  const guesses = new GuessList($('.guess-list'));
  const brain = new BrainView($('.brain'), labels);
  const debugRoot = $<HTMLElement>('.debug');
  const debug = new DebugPanel(debugRoot);
  const undoButton = $<HTMLButtonElement>('[data-action="undo"]');
  const clearButton = $<HTMLButtonElement>('[data-action="clear"]');
  const debugButton = $<HTMLButtonElement>('[data-action="debug"]');
  applyI18n(element);

  let status: 'loading' | 'ready' | 'error' = 'loading';
  let latest: Prediction | null = null;
  let latestInk = 0;
  let lastRun = 0;
  let timer = 0;
  let active = true;

  const pad = new DrawingPad($('.pad'), ({ strokes, settled }) => {
    undoButton.disabled = clearButton.disabled = pad.isEmpty;
    if (strokes.length === 0) {
      clearTimeout(timer);
      latest = null;
      render();
      return;
    }
    // Throttled while drawing; immediate when a stroke ends.
    const wait = settled ? 0 : Math.max(0, PREDICT_INTERVAL_MS - (performance.now() - lastRun));
    clearTimeout(timer);
    timer = window.setTimeout(predict, wait);
  });
  undoButton.disabled = clearButton.disabled = true;

  async function predict(): Promise<void> {
    if (status !== 'ready') return;
    lastRun = performance.now();
    const strokes = pad.getStrokes();
    if (strokes.length === 0) return;
    const ink = pad.inkRatio();
    const prediction = await recognizer.predict(preprocess(strokes, labels.preprocessing));
    if (!prediction || pad.isEmpty) return;
    latest = prediction;
    latestInk = ink;
    render();
  }

  function render(): void {
    if (status !== 'ready') {
      const error = status === 'error';
      answer.render({ chip: '', message: t(error ? 'loadError' : 'loading'), tip: '' }, status);
      return;
    }
    const decision = decideAnswer(latest?.probs ?? null, latest ? latestInk : 0);
    answer.render(answerText(decision, labels.classes), decision.kind);
    const top = latest ? topK(latest.probs, 5) : null;
    guesses.render(top, labels.classes);
    brain.render(latest?.input ?? null, latest?.maps ?? null);
    debug.render(latest, top ? labels.classes[top[0].index] : null);
  }

  function syncDebug(): void {
    debugRoot.hidden = !state.debug;
    debugButton.setAttribute('aria-pressed', String(state.debug));
  }

  undoButton.addEventListener('click', () => pad.undo());
  clearButton.addEventListener('click', () => pad.clear());
  debugButton.addEventListener('click', () => setDebug(!state.debug));
  document.addEventListener('keydown', (e) => {
    if (active && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      pad.undo();
    }
  });

  let theme = state.theme;
  onStateChange(() => {
    applyI18n(element);
    brain.relabel();
    syncDebug();
    if (state.theme !== theme) {
      theme = state.theme;
      pad.redraw();
    }
    render();
  });

  syncDebug();
  render();
  recognizer.ready.then(
    () => {
      status = 'ready';
      render();
      if (!pad.isEmpty) predict();
    },
    (error: unknown) => {
      console.error(error);
      status = 'error';
      render();
    },
  );

  return {
    element,
    setActive(value: boolean) {
      active = value;
    },
  };
}
