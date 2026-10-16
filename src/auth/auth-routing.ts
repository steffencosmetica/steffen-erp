import { isPublicPath } from './public-paths';

/** Query de /login que muestra "Usuario no autorizado". */
export const UNAUTHORIZED_LOGIN_ERROR = 'unauthorized';

export interface AuthRoutingInput {
  pathname: string;
  /** Hay una sesión Supabase válida (auth.getUser()). */
  isAuthenticated: boolean;
  /** El usuario de esa sesión es STEFFEN_AUTHORIZED_USER_ID. */
  isAuthorized: boolean;
}

export type AuthRoutingDecision =
  /** Continuar. `clearSession`: cerrar la sesión no autorizada en la misma respuesta. */
  | { kind: 'next'; clearSession: boolean }
  | { kind: 'redirect'; pathname: '/' | '/login'; error?: typeof UNAUTHORIZED_LOGIN_ERROR; clearSession: boolean }
  | { kind: 'json'; status: 401 | 403; error: string; clearSession: boolean };

/**
 * Decisión única de acceso del middleware.
 *
 * Invariante anti-loop: /login nunca redirige salvo a un usuario AUTORIZADO
 * (a /), y ese usuario nunca es redirigido desde una ruta del ERP a /login. Un
 * usuario autenticado pero NO autorizado: se cierra su sesión y queda en /login
 * (estado estable, sin redirect de vuelta a /).
 */
export function decideAuthRouting({ pathname, isAuthenticated, isAuthorized }: AuthRoutingInput): AuthRoutingDecision {
  const authorized = isAuthenticated && isAuthorized;
  const unauthorizedSession = isAuthenticated && !isAuthorized;

  if (pathname === '/login') {
    if (authorized) return { kind: 'redirect', pathname: '/', clearSession: false };
    return { kind: 'next', clearSession: unauthorizedSession };
  }

  if (isPublicPath(pathname)) {
    return { kind: 'next', clearSession: false };
  }

  if (authorized) {
    return { kind: 'next', clearSession: false };
  }

  if (pathname.startsWith('/api/')) {
    return unauthorizedSession
      ? { kind: 'json', status: 403, error: 'Forbidden: usuario no autorizado.', clearSession: true }
      : { kind: 'json', status: 401, error: 'Unauthorized: Se requiere una sesión autenticada activa.', clearSession: false };
  }

  return unauthorizedSession
    ? { kind: 'redirect', pathname: '/login', error: UNAUTHORIZED_LOGIN_ERROR, clearSession: true }
    : { kind: 'redirect', pathname: '/login', clearSession: false };
}

/** Cookies de sesión de Supabase SSR (`sb-<ref>-auth-token`, también en chunks `.0`, `.1`, ...). */
export function isSupabaseAuthCookie(name: string): boolean {
  return /^sb-.+-auth-token(\.\d+)?$/.test(name);
}
