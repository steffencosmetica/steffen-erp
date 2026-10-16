/**
 * Allowlist de operadores autorizados. Sin dependencias de runtime: se usa tanto
 * en el guard server-side como en el middleware.
 *
 * - `STEFFEN_AUTHORIZED_USER_IDS`: lista de UUID separados por coma (`uuid-1, uuid-2`).
 *   Si está definida es la única fuente, aunque quede vacía (se deniega a todos).
 * - `STEFFEN_AUTHORIZED_USER_ID`: compatibilidad temporal (un único UUID), solo si la
 *   lista no está definida.
 * - Sin ninguna configurada: se deniega a todos.
 */
export interface AuthorizableUser {
  id: string;
}

function parseIdList(value: string): string[] {
  return value
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

/** Resolución pura de la allowlist a partir de los valores crudos de ambas variables. */
export function resolveAuthorizedIds(plural: string | undefined, singular: string | undefined): string[] {
  if (plural !== undefined) {
    return parseIdList(plural);
  }
  return parseIdList(singular ?? '');
}

/**
 * UUID autorizados según el entorno (lista vacía = nadie autorizado).
 *
 * Las variables se leen como `process.env.NOMBRE` literal y directo (sin alias ni
 * parámetro por defecto): Next.js solo reconoce ese patrón estático al compilar el
 * middleware (Edge Runtime); un acceso indirecto queda como lectura en runtime de un
 * `process.env` que en Edge no trae estas variables.
 */
export function getAuthorizedUserIds(): string[] {
  return resolveAuthorizedIds(process.env.STEFFEN_AUTHORIZED_USER_IDS, process.env.STEFFEN_AUTHORIZED_USER_ID);
}

/** Verifica si el usuario está en la allowlist (o coincide con `expectedUserId` explícito). */
export function isUserAuthorized(user: AuthorizableUser, expectedUserId?: string): boolean {
  if (!user?.id) return false;
  const authorizedIds = expectedUserId ? [expectedUserId] : getAuthorizedUserIds();
  // Sin allowlist configurada, por seguridad se deniega el acceso
  return authorizedIds.includes(user.id);
}
