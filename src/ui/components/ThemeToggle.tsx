'use client';

import { Sun, ToggleRight } from 'lucide-react';
import { useTheme } from './ThemeProvider';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const label = `Tema ${theme === 'dark' ? 'oscuro' : 'claro'} activo. Cambiar a tema ${theme === 'dark' ? 'claro' : 'oscuro'}.`;
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      aria-pressed={theme === 'light'}
      className="ui-theme-toggle inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[5px] text-xs font-semibold cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-steffen-gold"
    >
      {theme === 'dark' ? <ToggleRight aria-hidden className="h-5 w-7" /> : <Sun aria-hidden className="h-5 w-5" />}
      <span className="sr-only">{theme === 'dark' ? 'DARK' : 'LIGHT'}</span>
    </button>
  );
}
