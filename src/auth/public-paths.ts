/**
 * Rutas exceptuadas de autenticación en el middleware.
 *
 * Solo se excluyen recursos que realmente deben quedar fuera de la sesión:
 * - /login y /api/health;
 * - internos de Next.js bajo /_next/ (static, image, HMR): las carpetas con "_"
 *   son privadas en App Router, por lo que ninguna ruta de la app vive ahí;
 * - favicon y archivos estáticos públicos con extensión de imagen/ícono/fuente.
 *
 * Una ruta de la aplicación que contenga "." pero no sea un recurso estático
 * (p. ej. "/ventas.backup" o "/clientes.json") NO se exceptúa.
 */
const STATIC_ASSET_RE = /\.(?:svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf)$/i;

export function isPublicPath(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname === '/api/health' ||
    pathname.startsWith('/api/health/') ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico' ||
    STATIC_ASSET_RE.test(pathname)
  );
}
