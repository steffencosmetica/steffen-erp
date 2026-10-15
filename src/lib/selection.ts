/**
 * Resuelve el id seleccionado inicialmente para una Ficha (Cliente/Proveedor) a partir
 * de un deep-link opcional (p.ej. ?customerId=<UUID> o ?supplierId=<UUID>).
 *
 * Si `requestedId` coincide con algún item de la lista, se selecciona ese. Si no coincide
 * (id inválido/inexistente) o no se proporcionó, hace fallback seguro al primer item de
 * la lista (o string vacío si la lista está vacía).
 */
export function resolveInitialSelectedId(
  items: Array<{ id: string }>,
  requestedId?: string | null
): string {
  if (requestedId) {
    const match = items.find((i) => i.id === requestedId);
    if (match) return match.id;
  }
  return items[0]?.id || '';
}
