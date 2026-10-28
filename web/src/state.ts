export type Lang = 'en' | 'fr';
export type Theme = 'light' | 'dark';

type Listener = () => void;
const listeners = new Set<Listener>();

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: the preference simply is not remembered.
  }
}

/** Language and theme, initialised by the inline script in index.html. */
export const state = {
  lang: (document.documentElement.lang === 'fr' ? 'fr' : 'en') as Lang,
  theme: (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light') as Theme,
  debug: new URLSearchParams(location.search).has('debug') || stored('fedidraw.debug') === '1',
};

export function onStateChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(): void {
  for (const l of listeners) l();
}

export function setLang(lang: Lang): void {
  state.lang = lang;
  document.documentElement.lang = lang;
  store('fedidraw.lang', lang);
  emit();
}

export function setTheme(theme: Theme): void {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  store('fedidraw.theme', theme);
  emit();
}

export function setDebug(debug: boolean): void {
  state.debug = debug;
  store('fedidraw.debug', debug ? '1' : '0');
  emit();
}

export function prefersReducedMotion(): boolean {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}
