/**
 * Allowlist de usuario único (MVP). Sin dependencias de runtime: se usa tanto en
 * el guard server-side como en el middleware.
 */
export interface AuthorizableUser {
  id: string;
}

/** Verifica si el usuario coincide con STEFFEN_AUTHORIZED_USER_ID. */
export function isUserAuthorized(user: AuthorizableUser, expectedUserId?: string): boolean {
  const authorizedId = expectedUserId || process.env.STEFFEN_AUTHORIZED_USER_ID;
  if (!authorizedId) {
    // Si no está configurada la variable en el entorno, por seguridad se deniega el acceso
    return false;
  }
  return user.id === authorizedId;
}
