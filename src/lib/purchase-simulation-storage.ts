/**
 * Persistencia local (solo navegador) de las cantidades de "Simular compra".
 * Guarda únicamente la cantidad como texto por ID estable del ítem de inventario;
 * nunca precios ni importes (se recalculan con el costo vigente al volver).
 * Sin localStorage disponible, la simulación sigue funcionando sin persistir.
 */
export const PURCHASE_SIMULATION_STORAGE_KEY = 'steffen.dashboard.lowStockPurchaseSimulation.v1';

export type PurchaseSimulationMap = Record<string, string>;

/** Subconjunto de Storage usado (permite tests sin navegador). */
export interface SimulationStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readPurchaseSimulation(storage: SimulationStorage | null | undefined): PurchaseSimulationMap {
  if (!storage) return {};
  try {
    const raw = storage.getItem(PURCHASE_SIMULATION_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result: PurchaseSimulationMap = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string') result[id] = value;
    }
    return result;
  } catch {
    return {};
  }
}

export function writePurchaseSimulation(storage: SimulationStorage | null | undefined, map: PurchaseSimulationMap): void {
  if (!storage) return;
  try {
    storage.setItem(PURCHASE_SIMULATION_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Cuota llena / almacenamiento bloqueado: la simulación sigue sin persistir.
  }
}

/** Actualiza una entrada; vacío o cero elimina la entrada del mapa. */
export function withSimulationQuantity(map: PurchaseSimulationMap, itemId: string, raw: string): PurchaseSimulationMap {
  const next = { ...map };
  const normalized = raw.replace(',', '.');
  if (!raw || /^0*\.?0*$/.test(normalized)) {
    delete next[itemId];
  } else {
    next[itemId] = raw;
  }
  return next;
}

/** localStorage del navegador, o null en SSR / si el acceso está bloqueado. */
export function browserSimulationStorage(): SimulationStorage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}
