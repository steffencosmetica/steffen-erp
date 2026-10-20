'use client';

import { Moon, Sun } from 'lucide-react';
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
      className="ui-btn-dark inline-flex h-[30px] shrink-0 items-center justify-center gap-2 rounded-[5px] px-3 text-xs font-semibold cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-steffen-gold"
    >
      {theme === 'dark' ? <Moon aria-hidden className="h-4 w-4" /> : <Sun aria-hidden className="h-4 w-4" />}
      <span>{theme === 'dark' ? 'DARK' : 'LIGHT'}</span>
    </button>
  );
}
