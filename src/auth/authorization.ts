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

/** UUID autorizados según el entorno (lista vacía = nadie autorizado). */
export function getAuthorizedUserIds(env: NodeJS.ProcessEnv = process.env): string[] {
  const list = env.STEFFEN_AUTHORIZED_USER_IDS;
  if (list !== undefined) {
    return parseIdList(list);
  }
  return parseIdList(env.STEFFEN_AUTHORIZED_USER_ID ?? '');
}

/** Verifica si el usuario está en la allowlist (o coincide con `expectedUserId` explícito). */
export function isUserAuthorized(user: AuthorizableUser, expectedUserId?: string): boolean {
  if (!user?.id) return false;
  const authorizedIds = expectedUserId ? [expectedUserId] : getAuthorizedUserIds();
  // Sin allowlist configurada, por seguridad se deniega el acceso
  return authorizedIds.includes(user.id);
}
