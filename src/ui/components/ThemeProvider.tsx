'use client';

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { normalizeTheme, oppositeTheme, serializeThemeCookie, type Theme } from '@/lib/theme';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ initialTheme, children }: { initialTheme: Theme; children: React.ReactNode }) {
  // El primer render usa exactamente la preferencia que ya renderizó el servidor.
  const [theme, updateTheme] = useState(initialTheme);
  const currentTheme = useRef(initialTheme);

  const setTheme = useCallback((nextTheme: Theme) => {
    const next = normalizeTheme(nextTheme);
    document.documentElement.dataset.theme = next;
    currentTheme.current = next;
    updateTheme(next);
    // La preferencia no es sensible. Si el navegador bloquea cookies, el cambio
    // visual sigue funcionando durante esta sesión sin desmontar la aplicación.
    try {
      document.cookie = serializeThemeCookie(next, window.location.protocol === 'https:');
    } catch {
      // Sin persistencia disponible; mantener el tema elegido en memoria.
    }
  }, []);

  const toggleTheme = useCallback(() => setTheme(oppositeTheme(currentTheme.current)), [setTheme]);
  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme requiere ThemeProvider.');
  return context;
}
