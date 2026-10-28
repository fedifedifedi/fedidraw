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
  return page.$eval('.pad', (c) => {
    const r = c.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
}

/** Alpha of the canvas pixel under a viewport point. */
async function inkAt(page, x, y) {
  return page.$eval('.pad', (c, [x, y]) => {
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
  for (const r of results) console.log(`      ${r.name.padEnd(6)} -> ${r.top}  Â«${r.answer}Â»`);
  check(results.filter((r) => r.top.toLowerCase().startsWith(r.name)).length >= 3, 'mouse: real Quick Draw drawings are recognised');

  await page.click('.pad', { position: { x: 300, y: 300 } });
  await page.waitForTimeout(400);
  check(['searching', 'idle'].includes(await page.getAttribute('.answer', 'data-state')), 'a single dot gives "still looking"');
  check(errors.length === 0, `no console errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  await page.close();

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
    check(tops.every((t) => Math.abs(t - before.top) < 0.5), `${theme} phone: the sheet never moves (top ${before.top.toFixed(1)} â†’ ${tops.map((t) => t.toFixed(1)).join(', ')})`);
    await ctx.close();
  }
} finally {
  await browser.close();
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
