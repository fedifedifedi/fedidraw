import { decideAnswer, topK, type Guess } from '../answer';
import { DrawingPad } from '../canvas';
import { GAME_RULES, PREDICT_INTERVAL_MS } from '../config';
import { isRecognized, pickWords, scoreTier, wordsFromQuery, type RoundResult } from '../game';
import { applyI18n, capitalize, className, strings, t, withArticle } from '../i18n';
import type { Labels } from '../labels';
import { preprocess } from '../preprocess';
import type { Recognizer } from '../recognizer';
import { onStateChange, prefersReducedMotion, state, store, stored } from '../state';
import { celebrate, clearCelebration } from '../ui/celebrate';
import { GuessList } from '../ui/guesses';
import { PencilTimer } from '../ui/pencil-timer';
import { CLEAR_ICON, SHEET_HTML, UNDO_ICON } from '../ui/sheet';
import { thumbnailSvg } from '../ui/thumbnail';

const BEST_KEY = 'fedidraw.best';

const TEMPLATE = `
  <section class="play-intro">
    <h1 class="play-title" data-i18n="playTitle"></h1>
    <p class="play-lead" data-i18n="playLead"></p>
    <ol class="play-rules">
      <li data-i18n="playRule1"></li>
      <li data-i18n="playRule2"></li>
      <li data-i18n="playRule3"></li>
    </ol>
    <button type="button" class="btn btn-big" data-action="start" data-i18n="playStart"></button>
    <p class="play-best"></p>
  </section>

  <section class="play-round" hidden>
    <div class="leaf">
      <div class="round-head">
        <span class="chip round-count"></span>
        <span class="round-score"></span>
      </div>
      <h1 class="round-word" aria-live="polite"><span class="round-verb" data-i18n="drawThis"></span> <span class="word"></span></h1>
      <div class="pencil-timer"></div>
      <div class="round-body">
        <div class="sheet-area">
          ${SHEET_HTML}
          <div class="tools">
            <button type="button" class="btn" data-action="undo">${UNDO_ICON}<span data-i18n="undo"></span></button>
            <button type="button" class="btn" data-action="clear">${CLEAR_ICON}<span data-i18n="clear"></span></button>
            <button type="button" class="btn btn-ghost" data-action="skip" disabled><span data-i18n="skip"></span>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
            </button>
          </div>
        </div>
        <aside class="round-ai">
          <p class="ai-line" aria-live="polite"></p>
          <ol class="guess-list mini"></ol>
        </aside>
      </div>
    </div>
  </section>

  <section class="play-results" hidden>
    <span class="chip" data-i18n="resultsChip"></span>
    <h1 class="results-score"></h1>
    <p class="results-message"></p>
    <p class="results-best"></p>
    <ol class="results-grid"></ol>
    <div class="results-actions">
      <button type="button" class="btn btn-big" data-action="again" data-i18n="playAgain"></button>
      <a class="btn" href="#/" data-i18n="freeDraw"></a>
    </div>
  </section>`;

type Phase = 'intro' | 'turning' | 'drawing' | 'won' | 'lost' | 'results';

export function createPlayPage(labels: Labels, recognizer: Recognizer) {
  const element = document.createElement('div');
  element.className = 'play';
  element.innerHTML = TEMPLATE;
  const $ = <T extends Element>(selector: string) => element.querySelector<T>(selector)!;
  const views = { intro: $<HTMLElement>('.play-intro'), round: $<HTMLElement>('.play-round'), results: $<HTMLElement>('.play-results') };
  const leaf = $<HTMLElement>('.leaf');
  const sheet = $<HTMLElement>('.sheet');
  const aiLine = $<HTMLElement>('.ai-line');
  const timer = new PencilTimer($('.pencil-timer'));
  const guesses = new GuessList($('.guess-list.mini'), 3);
  const undoButton = $<HTMLButtonElement>('[data-action="undo"]');
  const clearButton = $<HTMLButtonElement>('[data-action="clear"]');
  const skipButton = $<HTMLButtonElement>('[data-action="skip"]');
  applyI18n(element);

  const total = GAME_RULES.rounds;
  let phase: Phase = 'intro';
  let words: number[] = [];
  let round = 0;
  let results: RoundResult[] = [];
  let roundStart = 0;
  let frame = 0;
  let pending = 0;
  let predictTimer = 0;
  let lastRun = 0;
  let lastTop: number | null = null;
  let lastGuesses: Guess[] | null = null;
  let token = 0; // invalidates late callbacks from an earlier round or game
  let active = false;
  let modelReady = false;
  recognizer.ready.then(() => (modelReady = true), () => undefined);

  const pad = new DrawingPad($('.pad'), ({ strokes, settled }) => {
    undoButton.disabled = clearButton.disabled = pad.isEmpty || phase !== 'drawing';
    if (phase !== 'drawing') return;
    clearTimeout(predictTimer);
    if (strokes.length === 0) {
      lastTop = null;
      lastGuesses = null;
      guesses.render(null, labels.classes);
      say();
      return;
    }
    const wait = settled ? 0 : Math.max(0, PREDICT_INTERVAL_MS - (performance.now() - lastRun));
    predictTimer = window.setTimeout(predict, wait);
  });
  pad.enabled = false;

  function show(view: keyof typeof views): void {
    for (const [name, el] of Object.entries(views)) el.hidden = name !== view;
    // Focus mode: on phones the bottom navigation is hidden during a round to make room.
    document.body.classList.toggle('in-round', view === 'round' && active);
  }

  function best(): number {
    return Number(stored(BEST_KEY) ?? 0) || 0;
  }

  function target(): number {
    return words[round];
  }

  /** The AI's comment next to the sheet. */
  function say(text?: string): void {
    aiLine.textContent = text ?? t('aiWatching');
  }

  function renderIntro(): void {
    const b = best();
    $<HTMLElement>('.play-best').textContent = b > 0 ? strings().playBest(b, total) : '';
  }

  function renderRoundHead(): void {
    $<HTMLElement>('.round-count').textContent = strings().roundOf(round + 1, total);
    $<HTMLElement>('.round-score').textContent = strings().score(results.filter((r) => r.found).length);
    $<HTMLElement>('.word').textContent = withArticle(labels.classes[target()]);
  }

  function startGame(): void {
    const param = new URLSearchParams(location.search).get('words');
    words = wordsFromQuery(param, labels.classes, total) ?? pickWords(total, labels.classes.length);
    round = 0;
    results = [];
    show('round');
    startRound(false);
  }

  async function startRound(turnPage: boolean): Promise<void> {
    const my = ++token;
    phase = 'turning';
    pad.enabled = false;
    skipButton.disabled = true;
    if (turnPage) await turn('out');
    if (my !== token) return;
    clearCelebration(sheet);
    pad.clear();
    lastTop = null;
    lastGuesses = null;
    guesses.render(null, labels.classes);
    say();
    renderRoundHead();
    timer.set(1, GAME_RULES.roundSeconds);
    await turn('in');
    if (my !== token) return;
    phase = 'drawing';
    pad.enabled = true;
    skipButton.disabled = false;
    roundStart = performance.now();
    frame = requestAnimationFrame(tick);
  }

  /** Page turn between rounds: the page flips away to the left, the next one lands. */
  function turn(direction: 'in' | 'out'): Promise<void> {
    if (prefersReducedMotion()) {
      const fade = direction === 'in' ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }];
      return leaf.animate(fade, { duration: 160 }).finished.then(() => undefined);
    }
    const frames =
      direction === 'out'
        ? [
            { transform: 'perspective(1800px) rotateY(0deg)', boxShadow: '0 0 0 rgba(0,0,0,0)', opacity: 1 },
            { transform: 'perspective(1800px) rotateY(-92deg)', boxShadow: '-30px 0 60px rgba(0,0,0,0.25)', opacity: 0.6 },
          ]
        : [
            { transform: 'perspective(1800px) rotateY(70deg)', opacity: 0.4, offset: 0 },
            { transform: 'perspective(1800px) rotateY(-6deg)', opacity: 1, offset: 0.75 },
            { transform: 'none', opacity: 1, offset: 1 },
          ];
    return leaf
      .animate(frames, { duration: direction === 'out' ? 380 : 560, easing: direction === 'out' ? 'cubic-bezier(.5,0,.75,0)' : 'cubic-bezier(.22,1,.36,1)' })
      .finished.then(() => undefined);
  }

  function tick(): void {
    if (phase !== 'drawing') return;
    const left = Math.max(0, GAME_RULES.roundSeconds - (performance.now() - roundStart) / 1000);
    timer.set(left / GAME_RULES.roundSeconds, left);
    if (left <= 0) endRound(false);
    else frame = requestAnimationFrame(tick);
  }

  async function predict(): Promise<void> {
    if (phase !== 'drawing' || !modelReady) return;
    const my = token;
    lastRun = performance.now();
    const strokes = pad.getStrokes();
    if (strokes.length === 0) return;
    const ink = pad.inkRatio();
    const prediction = await recognizer.predict(preprocess(strokes, labels.preprocessing));
    if (!prediction || my !== token || phase !== 'drawing' || pad.isEmpty) return;
    const top = topK(prediction.probs, 3);
    lastTop = top[0].index;
    lastGuesses = top;
    guesses.render(top, labels.classes);
    if (isRecognized(prediction.probs, target(), ink)) {
      endRound(true);
      return;
    }
    const decision = decideAnswer(prediction.probs, ink);
    say(decision.kind === 'searching' ? t('aiThinking') : strings().aiGuess(withArticle(labels.classes[top[0].index])));
  }

  function endRound(found: boolean): void {
    if (phase !== 'drawing') return;
    phase = found ? 'won' : 'lost';
    cancelAnimationFrame(frame);
    clearTimeout(predictTimer);
    pad.enabled = false;
    skipButton.disabled = true;
    undoButton.disabled = clearButton.disabled = true;
    const goal = labels.classes[target()];
    results.push({
      target: target(),
      found,
      seconds: found ? (performance.now() - roundStart) / 1000 : null,
      lastGuess: !found && lastTop !== null && lastTop !== target() ? lastTop : null,
      strokes: pad.getStrokes(),
    });
    renderRoundHead();
    if (found) {
      say(strings().aiWon(withArticle(goal)));
      celebrate(sheet);
    } else {
      say(strings().aiLost(withArticle(goal)));
    }
    const my = token;
    pending = window.setTimeout(() => {
      if (my !== token) return;
      round++;
      if (round < total) startRound(true);
      else showResults();
    }, found ? GAME_RULES.winPauseMs : GAME_RULES.losePauseMs);
  }

  function showResults(): void {
    phase = 'results';
    const score = results.filter((r) => r.found).length;
    const previous = best();
    if (score > previous) store(BEST_KEY, String(score));
    renderResults(score > previous && score > 0);
    show('results');
    if (!prefersReducedMotion()) {
      views.results.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)' });
    }
  }

  let lastWasRecord = false;
  function renderResults(record = lastWasRecord): void {
    lastWasRecord = record;
    const s = strings();
    const score = results.filter((r) => r.found).length;
    const tier = scoreTier(score, total);
    $<HTMLElement>('.results-score').textContent = s.resultsScore(score, total);
    $<HTMLElement>('.results-message').textContent = {
      perfect: s.resultsPerfect, great: s.resultsGreat, good: s.resultsGood, practice: s.resultsPractice,
    }[tier];
    $<HTMLElement>('.results-best').textContent = record ? s.newBest : s.playBest(best(), total);
    $<HTMLElement>('.results-grid').innerHTML = results
      .map((r) => {
        const info = labels.classes[r.target];
        const name = capitalize(className(info));
        const detail = r.found
          ? s.foundIn(r.seconds!.toFixed(1).replace('.', state.lang === 'fr' ? ',' : '.'))
          : r.lastGuess !== null
            ? `${s.notFound} · ${s.thoughtItWas(withArticle(labels.classes[r.lastGuess]))}`
            : s.notFound;
        return `<li class="result-card ${r.found ? 'found' : 'missed'}">
          ${thumbnailSvg(r.strokes, name)}
          <span class="result-word">${name}</span>
          <span class="result-detail">${r.found ? '✓' : '✗'} ${detail}</span>
        </li>`;
      })
      .join('');
  }

  function abort(): void {
    token++;
    cancelAnimationFrame(frame);
    clearTimeout(pending);
    clearTimeout(predictTimer);
    pad.enabled = false;
    phase = 'intro';
    renderIntro();
    show('intro');
  }

  $('[data-action="start"]').addEventListener('click', startGame);
  $('[data-action="again"]').addEventListener('click', startGame);
  skipButton.addEventListener('click', () => endRound(false));
  undoButton.addEventListener('click', () => pad.undo());
  clearButton.addEventListener('click', () => pad.clear());
  document.addEventListener('keydown', (e) => {
    if (active && phase === 'drawing' && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      pad.undo();
    }
  });

  let theme = state.theme;
  onStateChange(() => {
    applyI18n(element);
    timer.relabel();
    if (state.theme !== theme) {
      theme = state.theme;
      pad.redraw();
    }
    if (phase === 'intro') renderIntro();
    if (phase === 'results') renderResults();
    if (phase !== 'intro' && phase !== 'results' && words.length) {
      renderRoundHead();
      const goal = withArticle(labels.classes[target()]);
      if (phase === 'won') say(strings().aiWon(goal));
      else if (phase === 'lost') say(strings().aiLost(goal));
      else if (lastTop === null) say();
      else say(strings().aiGuess(withArticle(labels.classes[lastTop])));
      guesses.render(lastGuesses, labels.classes);
    }
  });

  renderIntro();
  return {
    element,
    setActive(value: boolean) {
      if (active && !value && phase !== 'results') abort();
      active = value;
      if (!value) document.body.classList.remove('in-round');
    },
  };
}
