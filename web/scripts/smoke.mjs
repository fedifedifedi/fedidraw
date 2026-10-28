// End-to-end smoke test in a real browser (Microsoft Edge or Chrome via playwright-core).
//
//   npm run build && npm run preview      (in another terminal)
//   npm run smoke                         (screenshots go to ./smoke-output)
//
// Checks: the model loads, ink lands exactly under the mouse and the finger, real Quick Draw
// drawings are recognised, and on phones the sheet never moves while the answer changes.
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const URL = process.env.FEDIDRAW_URL ?? 'http://localhost:4173/';
const OUT = new globalThis.URL('../smoke-output/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const out = (name) => fileURLToPath(new globalThis.URL(name, OUT));
/** The drawing canvas of the page currently shown (each page has its own). */
const PAD = 'main > :not([hidden]) .pad';
const fixture = JSON.parse(readFileSync(new globalThis.URL('../src/preprocess.fixture.json', import.meta.url), 'utf8'));

let failures = 0;
function check(ok, message) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${message}`);
  if (!ok) failures++;
}

async function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try {
      return await chromium.launch({ channel });
    } catch {
      // try the next installed browser
    }
  }
  throw new Error('Neither Microsoft Edge nor Google Chrome was found.');
}

/** Waits until the model is loaded (the answer leaves the "loading" state). */
async function ready(page) {
  await page.waitForFunction(() => {
    const s = document.querySelector('.answer')?.getAttribute('data-state');
    return s && s !== 'loading';
  }, null, { timeout: 30000 });
  return page.getAttribute('.answer', 'data-state');
}

async function canvasRect(page) {
  return page.$eval(PAD, (c) => {
    const r = c.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
}

/** Alpha of the canvas pixel under a viewport point. */
async function inkAt(page, x, y) {
  return page.$eval(PAD, (c, [x, y]) => {
    const r = c.getBoundingClientRect();
    const px = Math.floor(((x - r.left) / r.width) * c.width);
    const py = Math.floor(((y - r.top) / r.height) * c.height);
    return c.getContext('2d').getImageData(px, py, 1, 1).data[3];
  }, [x, y]);
}

/** Viewport point for Quick Draw coordinates (0..255) inside the canvas. */
function toViewport(rect, [x, y]) {
  return [rect.left + rect.width * (0.12 + (x / 255) * 0.76), rect.top + rect.height * (0.12 + (y / 255) * 0.76)];
}

async function drawWithMouse(page, strokes) {
  const rect = await canvasRect(page);
  for (const [xs, ys] of strokes) {
    const pts = xs.map((x, i) => toViewport(rect, [x, ys[i]]));
    await page.mouse.move(...pts[0]);
    await page.mouse.down();
    for (const p of pts.slice(1)) await page.mouse.move(...p, { steps: 3 });
    await page.mouse.up();
  }
}

async function drawWithFinger(page, cdp, strokes) {
  const rect = await canvasRect(page);
  for (const [xs, ys] of strokes) {
    const pts = xs.map((x, i) => toViewport(rect, [x, ys[i]]));
    const touch = ([x, y]) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touch(pts[0]) });
    for (const p of pts.slice(1)) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touch(p) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
}

async function topGuess(page) {
  await page.waitForTimeout(400);
  return page.$$eval('.guess', (rows) => rows.map((r) => `${r.querySelector('.label').textContent} ${r.querySelector('.pct').textContent}`));
}

const browser = await launch();
try {
  // ---------------------------------------------------------------- desktop, mouse
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${URL}?debug`);
  check((await ready(page)) === 'idle', 'model loads and the app starts idle');

  const transforms = await page.$eval('.pad', (c) => {
    const list = [];
    for (let el = c; el; el = el.parentElement) list.push(getComputedStyle(el).transform);
    return list;
  });
  check(transforms.every((t) => t === 'none'), 'canvas and its ancestors are not rotated (only the paper decoration is)');

  const rect = await canvasRect(page);
  const y = rect.top + rect.height * 0.3;
  await page.mouse.move(rect.left + 60, y);
  await page.mouse.down();
  await page.mouse.move(rect.left + rect.width - 60, y, { steps: 20 });
  await page.mouse.up();
  const probes = [0.15, 0.4, 0.65, 0.85].map((f) => rect.left + 60 + (rect.width - 120) * f);
  const onLine = await Promise.all(probes.map((x) => inkAt(page, x, y)));
  const offLine = await Promise.all(probes.map((x) => inkAt(page, x, y + 8)));
  check(onLine.every((a) => a > 200), `mouse: ink exactly under the pointer (alpha ${onLine.join(', ')})`);
  check(offLine.every((a) => a === 0), 'mouse: no ink 8 px away from the pointer path');
  await page.click('[data-action="clear"]');

  const results = [];
  for (const name of ['sun', 'camel', 'house', 'cat']) {
    const item = fixture.find((f) => f.class === name);
    await drawWithMouse(page, item.strokes);
    const guesses = await topGuess(page);
    const answer = await page.textContent('.answer-text');
    results.push({ name, top: guesses[0], answer });
    if (name === 'camel') await page.screenshot({ path: out('desktop-light.png') });
    if (name === 'house') {
      await page.click('.theme-toggle');
      await page.click('[data-lang="fr"]');
      await page.waitForTimeout(700);
      await page.screenshot({ path: out('desktop-dark-fr.png') });
      await page.click('.theme-toggle');
      await page.click('[data-lang="en"]');
    }
    await page.click('[data-action="clear"]');
  }
  for (const r of results) console.log(`      ${r.name.padEnd(6)} -> ${r.top}  "${r.answer}"`);
  check(results.filter((r) => r.top.toLowerCase().startsWith(r.name)).length >= 3, 'mouse: real Quick Draw drawings are recognised');

  await page.click('.pad', { position: { x: 300, y: 300 } });
  await page.waitForTimeout(400);
  check(['searching', 'idle'].includes(await page.getAttribute('.answer', 'data-state')), 'a single dot gives "still looking"');
  check(errors.length === 0, `no console errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  await page.close();

  // ---------------------------------------------------------------- game mode
  const game = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const gameErrors = [];
  game.on('pageerror', (e) => gameErrors.push(String(e)));
  const words = ['sun', 'camel', 'house', 'cat', 'moon', 'key'];
  await game.goto(`${URL}?words=${words.join(',')}#/play`);
  await game.click('[data-action="start"]');
  const drawing = () => game.waitForFunction(() => !document.querySelector('[data-action="skip"]').disabled, null, { timeout: 5000 });
  await drawing();
  const gameTransforms = await game.$eval('.play .pad', (c) => {
    const list = [];
    for (let el = c; el; el = el.parentElement) list.push(getComputedStyle(el).transform);
    return list;
  });
  check(gameTransforms.every((t) => t === 'none'), 'game: the sheet is straight once the page has turned');
  const s0 = Number((await game.textContent('.pencil-seconds')).replace(/\D/g, ''));
  await game.waitForTimeout(1600);
  const s1 = Number((await game.textContent('.pencil-seconds')).replace(/\D/g, ''));
  check(s0 === 20 && s1 < s0, `game: the pencil timer runs (${s0} s -> ${s1} s)`);

  let found = 0;
  for (const [i, name] of words.entries()) {
    if (i > 0) await drawing();
    check((await game.textContent('.round-count')).includes(`${i + 1}/6`), `game: round ${i + 1}/6 shows "${await game.textContent('.round-word .word')}"`);
    await drawWithMouse(game, fixture.find((f) => f.class === name).strokes);
    const won = await game
      .waitForFunction(() => document.querySelector('.ai-line').textContent.startsWith('Got it'), null, { timeout: 3000 })
      .then(() => true, () => false);
    if (won) {
      found++;
      if (found === 1) {
        await game.waitForTimeout(450);
        await game.screenshot({ path: out('game-win.png') });
      }
    } else {
      await game.click('[data-action="skip"]');
    }
  }
  await game.waitForSelector('.play-results:not([hidden])', { timeout: 8000 });
  const score = await game.textContent('.results-score');
  const cards = await game.$$eval('.result-card', (els) => els.length);
  check(found >= 4 && score.trim() === `${found} / 6`, `game: real drawings recognised in ${found}/6 rounds, results say "${score.trim()}"`);
  check(cards === 6, 'game: results show the 6 drawings');
  await game.waitForTimeout(500);
  await game.screenshot({ path: out('game-results.png'), fullPage: true });
  check(gameErrors.length === 0, `game: no page errors${gameErrors.length ? `: ${gameErrors.join(' | ')}` : ''}`);
  await game.close();

  // ---------------------------------------------------------------- how it works
  const metrics = JSON.parse(readFileSync(new globalThis.URL('../public/model/metrics.json', import.meta.url), 'utf8'));
  const how = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const howErrors = [];
  how.on('pageerror', (e) => howErrors.push(String(e)));
  await how.goto(`${URL}#/how`);
  await how.waitForSelector('.tile-value');
  const tiles = await how.$$eval('.tile-value', (els) => els.map((e) => e.textContent));
  const top1 = `${(metrics.test.top1 * 100).toFixed(1)}%`;
  check(tiles[0] === top1, `how: top-1 tile matches metrics.json (${tiles[0]})`);
  await how.waitForFunction(() => /ms/.test(document.querySelector('.facts').textContent), null, { timeout: 15000 });
  const facts = await how.$$eval('.facts dt', (els) => els.map((e) => e.textContent));
  check(facts.some((f) => /\d ms/.test(f)) && facts.some((f) => /MB/.test(f)), `how: model facts measured (${facts.join(' | ')})`);
  check((await how.$$('.chart.curves svg, .chart.aug svg, .chart.per-class svg, .chart.matrix svg')).length === 4, 'how: the four charts are drawn');
  const banana = await how.$eval('.chart.matrix svg', (svg) => {
    const labels = [...svg.querySelectorAll('.m-label[class*="row-"]')].map((t) => t.textContent);
    return { row: labels.indexOf('Banana'), col: labels.indexOf('Moon') };
  });
  const cell = await how.$(`.chart.matrix rect.cell[data-r="${banana.row}"][data-c="${banana.col}"]`);
  await cell.hover();
  const tip = await how.textContent('.matrix-card .chart-tip');
  check(/Banana → Moon/.test(tip) && /6\.0%/.test(tip) && /1,000/.test(tip),`how: hovering banana→moon shows its tooltip ("${tip.trim()}")`);
  await how.mouse.move(5, 5);
  await how.screenshot({ path: out('how-light.png'), fullPage: true });
  await how.click('.theme-toggle');
  await how.click('[data-lang="fr"]');
  await how.waitForTimeout(400);
  await how.screenshot({ path: out('how-dark-fr.png'), fullPage: true });
  await how.click('.theme-toggle');
  await how.click('[data-lang="en"]');
  check(howErrors.length === 0, `how: no page errors${howErrors.length ? `: ${howErrors.join(' | ')}` : ''}`);
  await how.close();

  const howPhone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const hp = await howPhone.newPage();
  await hp.goto(`${URL}#/how`);
  await hp.waitForSelector('.chart.matrix svg');
  const overflow = await hp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 0, `how phone: no horizontal page scroll (overflow ${overflow}px; the matrix scrolls inside its card)`);
  await hp.screenshot({ path: out('how-phone.png'), fullPage: true });
  await howPhone.close();

  // ---------------------------------------------------------------- reduced motion
  const calm = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const cp = await calm.newPage();
  await cp.goto(URL);
  await ready(cp);
  await drawWithMouse(cp, fixture.find((f) => f.class === 'sun').strokes);
  await cp.waitForTimeout(300);
  const motion = await cp.evaluate(() => ({
    write: getComputedStyle(document.querySelector('.answer-text')).animationDuration,
    bars: getComputedStyle(document.querySelector('.guess .bar')).transitionDuration,
  }));
  check(parseFloat(motion.write) <= 0.001 && parseFloat(motion.bars) <= 0.001, `reduced motion: animations are switched off (writing ${motion.write}, bars ${motion.bars})`);
  await calm.close();

  // ---------------------------------------------------------------- 320 px wide screens
  // isMobile is off on purpose: mobile emulation widens the viewport to fit overflowing content.
  const small = await browser.newContext({ viewport: { width: 320, height: 640 }, deviceScaleFactor: 2, hasTouch: true });
  await small.addInitScript(() => localStorage.setItem('fedidraw.lang', 'fr'));
  const sp = await small.newPage();
  const spCdp = await small.newCDPSession(sp);
  for (const hash of ['', '#/play', '#/how']) {
    await sp.goto(`${URL}${hash}`);
    await sp.waitForTimeout(800);
    const width = await sp.evaluate(() => document.documentElement.scrollWidth);
    check(width <= 320, `320 px ${hash || '#/'}: page fits the screen (scroll width ${width}px)`);
  }
  await sp.goto(URL);
  await ready(sp);
  const sr = await canvasRect(sp);
  await drawWithFinger(sp, spCdp, [[[20, 236], [128, 128]]]);
  const smallInk = await inkAt(sp, ...toViewport(sr, [128, 128]));
  const toolsFit = await sp.$$eval('.draw .tools button', (bs) => bs.every((b) => b.getBoundingClientRect().right <= 320));
  check(smallInk > 200 && toolsFit, `320 px: drawing works and every tool button is reachable`);
  await sp.screenshot({ path: out('w320-draw.png') });
  await sp.goto(`${URL}?words=sun#/play`);
  await sp.tap('[data-action="start"]');
  await sp.waitForFunction(() => !document.querySelector('[data-action="skip"]').disabled, null, { timeout: 5000 });
  const roundFits = await sp.evaluate(() => document.documentElement.scrollWidth <= 320
    && [...document.querySelectorAll('.play .tools button')].every((b) => {
      const r = b.getBoundingClientRect();
      return r.right <= 320 && r.bottom <= window.innerHeight;
    }));
  check(roundFits, '320 x 640: a whole game round fits on screen, three buttons visible without scrolling');
  await sp.screenshot({ path: out('w320-round.png') });
  await small.close();

  const phoneGame = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const pg = await phoneGame.newPage();
  const pcdp = await phoneGame.newCDPSession(pg);
  await pg.goto(`${URL}?words=moon#/play`);
  await pg.tap('[data-action="start"]');
  await pg.waitForFunction(() => !document.querySelector('[data-action="skip"]').disabled, null, { timeout: 5000 });
  const sheetTop = (await canvasRect(pg)).top;
  await drawWithFinger(pg, pcdp, [fixture.find((f) => f.class === 'banana').strokes[0]]);
  await pg.waitForTimeout(500);
  await pg.screenshot({ path: out('game-phone.png') });
  check(Math.abs((await canvasRect(pg)).top - sheetTop) < 0.5, 'game phone: the sheet does not move while the AI comments');
  await phoneGame.close();

  // ---------------------------------------------------------------- phone, touch
  for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    await ctx.addInitScript((t) => localStorage.setItem('fedidraw.theme', t), theme);
    const phone = await ctx.newPage();
    const cdp = await ctx.newCDPSession(phone);
    await phone.goto(URL);
    await ready(phone);
    const before = await canvasRect(phone);
    const r = before;
    await drawWithFinger(phone, cdp, [[[30, 230], [128, 128]]]);
    const fingerInk = await Promise.all([0.25, 0.5, 0.75].map((f) => inkAt(phone, ...toViewport(r, [30 + 200 * f, 128]))));
    check(fingerInk.every((a) => a > 200), `${theme} phone: ink exactly under the finger (alpha ${fingerInk.join(', ')})`);
    await phone.tap('[data-action="clear"]');

    const tops = [];
    for (const name of ['moon', 'key', 'mushroom']) {
      await drawWithFinger(phone, cdp, fixture.find((f) => f.class === name).strokes);
      await phone.waitForTimeout(450);
      tops.push((await canvasRect(phone)).top);
      if (name === 'mushroom') await phone.screenshot({ path: out(`phone-${theme}.png`), fullPage: true });
      else await phone.tap('[data-action="clear"]');
    }
    check(tops.every((t) => Math.abs(t - before.top) < 0.5), `${theme} phone: the sheet never moves (top ${before.top.toFixed(1)} -> ${tops.map((t) => t.toFixed(1)).join(', ')})`);
    await ctx.close();
  }
} finally {
  await browser.close();
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
