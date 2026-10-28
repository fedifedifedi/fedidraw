import { applyI18n } from '../i18n';
import { onStateChange } from '../state';

/** Temporary page for sections that are not built yet. */
export function createPlaceholderPage(titleKey: 'navPlay' | 'navHow'): HTMLElement {
  const element = document.createElement('section');
  element.className = 'placeholder';
  element.innerHTML = `<h1 class="section-title" data-i18n="${titleKey}"></h1><p data-i18n="comingSoon"></p>`;
  applyI18n(element);
  onStateChange(() => applyI18n(element));
  return element;
}
