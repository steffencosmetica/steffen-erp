/**
 * Geometría del logo de Steffen, compartida por el componente React
 * (SteffenLogo.tsx) y el SVG estático embebido en los PDFs (src/pdf/logo.ts).
 * Sin dependencias de React para poder usarse desde código server-only.
 */
export const STEFFEN_LOGO_VIEWBOX = '0 0 40 44';

/**
 * Relleno del logo en el template PDF v1.0 (rto-default / rtm-default). Se
 * conserva tal cual porque los documentos ya generados con esa versión no se
 * modifican; el rediseño de PDFs llegará con una nueva versión de template
 * (docs/PDFS.md, nota de vigencia).
 */
export const STEFFEN_LOGO_FILL = '#D2AB68';

/** Relleno del logo en la UI: dorado normativo vigente (docs/DESIGN.md §4.1). */
export const STEFFEN_LOGO_UI_FILL = '#C38926';

export const STEFFEN_LOGO_PATHS = [
  'M12.5 40C8.2 38.1 4.5 34.4 2.8 29.5C0.8 23.9 1.4 17.6 4.3 12.5C5.3 10.7 7.0 8.5 7.8 8.8C8.5 9.1 8.2 11.5 7.8 13.5C6.9 18.2 8.1 23.5 11.2 27.2C13.2 29.6 16.0 31.4 18.8 32.5C16.2 35.8 14.1 38.5 12.5 40Z',
  'M20.2 31.8C16.8 29.2 14.5 25.0 14.2 20.3C13.8 14.8 16.2 9.4 19.8 5.2C21.4 3.3 23.8 0.8 24.6 1.2C25.3 1.6 24.5 4.3 23.7 6.6C22.2 11.5 22.8 17.2 25.5 21.4C26.9 23.6 28.9 25.5 31.2 26.8C27.2 29.2 23.5 30.8 20.2 31.8Z',
  'M26.5 23.5C25.0 20.8 24.5 17.5 25.2 14.2C26.0 10.5 28.5 6.8 31.5 4.2C32.8 3.1 34.8 1.5 35.5 2.0C36.1 2.4 35.2 4.6 34.4 6.5C32.8 10.2 33.0 14.8 35.2 18.2C36.0 19.5 37.2 20.8 38.5 21.8C34.5 23.0 30.2 23.5 26.5 23.5Z',
] as const;
