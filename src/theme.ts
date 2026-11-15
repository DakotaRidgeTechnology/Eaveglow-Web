// Light/dark per phone (browser storage, not shared): "auto" follows the
// phone's own setting. Applied before the first render so nothing flashes.
export type Theme = 'auto' | 'light' | 'dark';
const KEY = 'eaveglow.theme';

export function getTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'light' || t === 'dark' ? t : 'auto';
  } catch {
    return 'auto';
  }
}

export function applyTheme(theme = getTheme()) {
  if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
}

export function setTheme(theme: Theme) {
  try {
    if (theme === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // storage blocked: the choice lasts until the page is closed
  }
  applyTheme(theme);
}

export const nextTheme: Record<Theme, Theme> = { auto: 'dark', dark: 'light', light: 'auto' };
export const themeIcon: Record<Theme, string> = { auto: '🌓', dark: '🌙', light: '☀️' };
export const themeLabel: Record<Theme, string> = { auto: 'Theme: same as this phone', dark: 'Theme: dark', light: 'Theme: light' };
