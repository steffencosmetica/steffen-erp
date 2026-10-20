import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTheme, oppositeTheme, serializeThemeCookie, THEME_COOKIE_MAX_AGE, THEME_COOKIE_NAME } from '../src/lib/theme';

test('Theme — valores válidos y fallback Dark sin preferencia o con valor inválido', () => {
  assert.equal(normalizeTheme('dark'), 'dark');
  assert.equal(normalizeTheme('light'), 'light');
  for (const value of [undefined, null, '', 'LIGHT', 'system', ' light ', 'light; Path=/admin', 1, {}]) {
    assert.equal(normalizeTheme(value), 'dark');
  }
});

test('Theme — alternar dos veces conserva la preferencia inicial', () => {
  assert.equal(oppositeTheme('dark'), 'light');
  assert.equal(oppositeTheme('light'), 'dark');
  for (const theme of ['dark', 'light'] as const) assert.equal(oppositeTheme(oppositeTheme(theme)), theme);
});

test('Theme — cookie pública persistente para toda la aplicación', () => {
  assert.equal(THEME_COOKIE_NAME, 'steffen_theme');
  assert.equal(THEME_COOKIE_MAX_AGE, 31_536_000);
  assert.equal(serializeThemeCookie('light'), 'steffen_theme=light; Path=/; SameSite=Lax; Max-Age=31536000');
  assert.equal(serializeThemeCookie('dark', true), 'steffen_theme=dark; Path=/; SameSite=Lax; Max-Age=31536000; Secure');
  assert.ok(!serializeThemeCookie('light').includes('HttpOnly'));
});
