import 'server-only';
import { STEFFEN_LOGO_VIEWBOX, STEFFEN_LOGO_FILL, STEFFEN_LOGO_PATHS } from '@/ui/components/steffen-logo-geometry';

/**
 * Logo real de Steffen (misma geometría que src/ui/components/SteffenLogo.tsx)
 * como markup SVG estático, para embeber inline en los templates de PDF sin
 * depender de una URL pública externa (docs/PDFS.md sección 5 y el requisito
 * de "resolver de manera robusta en servidor"). Se arma como string: Next.js
 * prohíbe importar `react-dom/server` desde el grafo de Server Components.
 */
export function renderSteffenLogoSvg(className = 'pdf-logo'): string {
  const paths = STEFFEN_LOGO_PATHS.map((d) => `<path d="${d}" fill="${STEFFEN_LOGO_FILL}"></path>`).join('');
  return `<svg viewBox="${STEFFEN_LOGO_VIEWBOX}" fill="none" xmlns="http://www.w3.org/2000/svg" class="${className}" aria-label="Steffen Logo">${paths}</svg>`;
}
