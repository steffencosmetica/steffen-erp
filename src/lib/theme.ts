/** Preferencia visual pública; compartida por servidor y cliente, sin dependencias. */
export type Theme = 'dark' | 'light';

export const THEME_COOKIE_NAME = 'steffen_theme';
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function normalizeTheme(value: unknown): Theme {
  return value === 'light' ? 'light' : 'dark';
}

export function oppositeTheme(theme: Theme): Theme {
  return theme === 'dark' ? 'light' : 'dark';
}

export function serializeThemeCookie(theme: Theme, secure = false): string {
  return `${THEME_COOKIE_NAME}=${normalizeTheme(theme)}; Path=/; SameSite=Lax; Max-Age=${THEME_COOKIE_MAX_AGE}${secure ? '; Secure' : ''}`;
}
