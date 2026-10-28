import '@fontsource/gochi-hand/400.css';
import '@fontsource-variable/bricolage-grotesque/index.css';
import './styles.css';

import { applyI18n, t } from './i18n';
import { loadLabels } from './labels';
import { createDrawPage, type DrawPage } from './pages/draw';
import { createPlaceholderPage } from './pages/placeholder';
import { Recognizer } from './recognizer';
import { onStateChange, setLang, setTheme, state } from './state';

const ICON_MOON = 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z';
const ICON_SUN =
  'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8z M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4';

const SHELL = `
  <header class="topbar">
    <a class="logo" href="#/" aria-label="FediDraw">
      <span>FediDraw</span>
      <svg width="34" height="18" viewBox="0 0 34 18" aria-hidden="true"><path d="M2 12c5-9 8 5 13-1s8 6 17-4" /></svg>
    </a>
    <nav class="nav" data-i18n-aria-label="navLabel">
      <a href="#/" data-route="draw">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
        <span data-i18n="navDraw"></span>
      </a>
      <a href="#/play" data-route="play">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="14" r="8" /><path d="M12 10v4l2 2M10 2h4" /></svg>
        <span data-i18n="navPlay"></span>
      </a>
      <a href="#/how" data-route="how">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H2z" /><path d="M22 4h-7a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h8z" /></svg>
        <span class="long" data-i18n="navHow"></span><span class="short" data-i18n="navHowShort"></span>
      </a>
    </nav>
    <div class="prefs">
      <div class="lang" role="group" data-i18n-aria-label="langLabel">
        <button type="button" data-lang="en">EN</button>
        <button type="button" data-lang="fr">FR</button>
      </div>
      <button type="button" class="icon-btn theme-toggle">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path /></svg>
      </button>
    </div>
  </header>
  <main id="outlet" class="page"></main>
  <footer class="footer"><p data-i18n="privacy"></p></footer>`;

type Route = 'draw' | 'play' | 'how';

async function start(): Promise<void> {
  const app = document.getElementById('app')!;
  app.innerHTML = SHELL;
  const outlet = document.getElementById('outlet')!;
  const themeButton = app.querySelector<HTMLButtonElement>('.theme-toggle')!;

  function syncShell(): void {
    applyI18n(app.querySelector('.topbar')!);
    applyI18n(app.querySelector('.footer')!);
    app.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.lang === state.lang));
    });
    themeButton.setAttribute('aria-label', t(state.theme === 'dark' ? 'themeToLight' : 'themeToDark'));
    themeButton.querySelector('path')!.setAttribute('d', state.theme === 'dark' ? ICON_SUN : ICON_MOON);
  }
  app.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach((b) => {
    b.addEventListener('click', () => setLang(b.dataset.lang === 'fr' ? 'fr' : 'en'));
  });
  themeButton.addEventListener('click', () => setTheme(state.theme === 'dark' ? 'light' : 'dark'));
  onStateChange(syncShell);
  syncShell();

  const labels = await loadLabels();
  const recognizer = new Recognizer(labels);
  const draw: DrawPage = createDrawPage(labels, recognizer);
  const pages: Record<Route, HTMLElement> = {
    draw: draw.element,
    play: createPlaceholderPage('navPlay'),
    how: createPlaceholderPage('navHow'),
  };
  outlet.append(...Object.values(pages));

  function route(): void {
    const name = location.hash.replace(/^#\/?/, '') as Route;
    const current: Route = name in pages ? name : 'draw';
    for (const [key, el] of Object.entries(pages)) el.hidden = key !== current;
    draw.setActive(current === 'draw');
    app.querySelectorAll<HTMLAnchorElement>('[data-route]').forEach((a) => {
      if (a.dataset.route === current) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }
  window.addEventListener('hashchange', route);
  route();
}

start().catch((error: unknown) => {
  console.error(error);
  document.getElementById('app')!.textContent = String(error);
});
