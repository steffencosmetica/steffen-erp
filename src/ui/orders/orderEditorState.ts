import type { UpdateOrderInput } from '@/actions/order.actions';
import type { OrderDetailDTO } from '@/actions/order.dto';

export interface OrderEditorDraft {
  customerSource: OrderDetailDTO['customerSource'];
  packageCount: string;
  recipientName: string;
  address: string;
  locality: string;
  province: string;
  phone: string;
  transportName: string;
  items: readonly { productId: string; requestedQuantity: number; agQuantity: number | null }[];
}

/** Un valor inválido conserva su texto y nunca se confunde con null o cero. */
function semanticPackages(text: string): number | null | string {
  if (!text.trim()) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) && value >= 0 ? value : `invalid:${text}`;
}

export function captureOrderSnapshot(draft: OrderEditorDraft) {
  const consumer = draft.customerSource === 'CONSUMER_FINAL';
  return Object.freeze({
    packageCount: semanticPackages(draft.packageCount),
    recipientName: consumer ? draft.recipientName.trim() : null,
    address: consumer ? draft.address.trim() : null,
    locality: consumer ? draft.locality.trim() : null,
    province: consumer ? draft.province.trim() : null,
    phone: consumer ? draft.phone.trim() : null,
    transportName: consumer ? draft.transportName.trim() : null,
    items: Object.freeze(draft.items.map((item) => Object.freeze({
      productId: item.productId,
      requestedQuantity: item.requestedQuantity,
      agQuantity: item.agQuantity,
    }))),
  });
}

export type OrderEditorSnapshot = ReturnType<typeof captureOrderSnapshot>;

export function draftFromOrder(detail: OrderDetailDTO): OrderEditorDraft {
  return {
    customerSource: detail.customerSource,
    packageCount: detail.packageCount === null ? '' : String(detail.packageCount),
    recipientName: detail.recipientName ?? '',
    address: detail.address ?? '',
    locality: detail.locality ?? '',
    province: detail.province ?? '',
    phone: detail.phone ?? '',
    transportName: detail.transportName ?? '',
    items: detail.items.map((item) => ({ productId: item.productId, requestedQuantity: item.requestedQuantity, agQuantity: item.agQuantity })),
  };
}

export function isOrderDirty(draft: OrderEditorDraft, confirmed: OrderEditorSnapshot | null): boolean {
  return confirmed !== null && JSON.stringify(captureOrderSnapshot(draft)) !== JSON.stringify(confirmed);
}

export function isAddProductDirty(productId: string, quantity: string, ag: string): boolean {
  const canonical = (text: string) => text.trim() && Number.isFinite(Number(text)) ? String(Number(text)) : text.trim();
  return productId !== '' || canonical(quantity) !== '1' || canonical(ag) !== '';
}

function savePayload(draft: OrderEditorDraft): UpdateOrderInput {
  const snapshot = captureOrderSnapshot(draft);
  if (typeof snapshot.packageCount === 'string') throw new Error('La cantidad de bultos debe ser un entero no negativo.');
  return {
    packageCount: snapshot.packageCount,
    recipientName: snapshot.recipientName ?? undefined,
    address: snapshot.address ?? undefined,
    locality: snapshot.locality ?? undefined,
    province: snapshot.province ?? undefined,
    phone: snapshot.phone ?? undefined,
    transportName: snapshot.transportName ?? undefined,
    items: snapshot.items.map((item) => ({ ...item })),
  };
}

export type OrderSaveResult =
  | { success: true; orderId: string; detail: OrderDetailDTO }
  | { success: false; orderId: string | null; reason: 'not-loaded' | 'busy' | 'save' | 'reload' | 'stale'; error: string };

interface SaveDependencies {
  persist: (orderId: string, input: UpdateOrderInput) => Promise<{ success: boolean; error?: string }>;
  reload: (orderId: string) => Promise<{ success: boolean; data?: OrderDetailDTO; error?: string }>;
}

interface ManualSaveState {
  orderId: string | null;
  confirmed: OrderEditorSnapshot | null;
  saving: boolean;
  result: OrderSaveResult | null;
}

/** Instancia local al editor. No escribe por editar, cargar ni cerrar. Sin cola. */
export class OrderManualSaveController {
  private session = 0;
  private pending = new Set<string>();
  private uncertain = new Set<string>();
  private listeners = new Set<() => void>();
  private state: ManualSaveState = { orderId: null, confirmed: null, saving: false, result: null };

  constructor(private readonly dependencies: SaveDependencies) {}

  getSnapshot = (): ManualSaveState => this.state;
  requiresReconciliation = () => !!this.state.orderId && this.uncertain.has(this.state.orderId);
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private publish(state: ManualSaveState) {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }

  load(detail: OrderDetailDTO) {
    this.session++;
    this.uncertain.delete(detail.id);
    this.publish({ orderId: detail.id, confirmed: captureOrderSnapshot(draftFromOrder(detail)), saving: this.pending.has(detail.id), result: null });
  }

  clear() {
    this.session++;
    this.publish({ orderId: null, confirmed: null, saving: false, result: null });
  }

  async save(draft: OrderEditorDraft, readOnly = false): Promise<OrderSaveResult> {
    const { orderId } = this.state;
    if (!orderId || !this.state.confirmed) return { success: false, orderId, reason: 'not-loaded', error: 'El pedido todavía no está cargado.' };
    if (this.pending.has(orderId)) return { success: false, orderId, reason: 'busy', error: 'El pedido ya se está guardando.' };
    const session = this.session;
    const current = () => this.session === session && this.state.orderId === orderId;
    const stale = (): OrderSaveResult => ({ success: false, orderId, reason: 'stale', error: 'La respuesta pertenece a otra sesión del editor.' });
    let phase: 'save' | 'reload' = 'save';
    let result: OrderSaveResult;
    this.pending.add(orderId);
    this.publish({ ...this.state, saving: true, result: null });
    try {
      // Copia independiente capturada al pulsar Guardar; nunca leer borradores futuros.
      if (!readOnly && !this.uncertain.has(orderId)) {
        const payload = savePayload(draft);
        this.uncertain.add(orderId);
        const response = await this.dependencies.persist(orderId, payload);
        if (!current()) return stale();
        if (!response.success) {
          this.uncertain.delete(orderId);
          throw new Error(response.error || 'Error al guardar pedido.');
        }
      }
      phase = 'reload';
      const loaded = await this.dependencies.reload(orderId);
      if (!current()) return stale();
      if (!loaded.success || !loaded.data || loaded.data.id !== orderId) {
        throw new Error(loaded.error || 'No se pudo actualizar el detalle.');
      }
      // El servidor confirma precios históricos/normalizaciones, no el borrador actual.
      const detail = loaded.data;
      this.uncertain.delete(orderId);
      result = { success: true, orderId, detail };
      this.publish({ ...this.state, confirmed: captureOrderSnapshot(draftFromOrder(detail)), result });
    } catch (error: unknown) {
      if (!current()) return stale();
      const message = error instanceof Error ? error.message : 'Error inesperado al guardar pedido.';
      const errorText = phase === 'reload'
        ? `No se pudo confirmar el detalle del servidor (si se guardó, la escritura no se repetirá): ${message}. Reintente para reconciliar mediante lectura.`
        : this.uncertain.has(orderId)
          ? `${message}. El resultado de la escritura es incierto. Reintente para reconciliar mediante lectura, sin repetir la escritura.`
          : message;
      result = { success: false, orderId, reason: phase, error: errorText };
      this.publish({ ...this.state, result });
    } finally {
      this.pending.delete(orderId);
      // Una respuesta de A no cambia el resultado ni la referencia de B.
      if (this.state.orderId === orderId) this.publish({ ...this.state, saving: false });
    }
    return result;
  }
}
