import type { OrderDetailDTO } from '@/actions/order.dto';
import type { RtoPreviewDTO } from '@/actions/remittance.dto';
import type { OrderSaveResult } from './orderEditorState';

/** Todas las validaciones locales consumen el detalle releído; preview valida en servidor. */
export async function preparePersistedRto(deps: {
  read: () => Promise<OrderSaveResult>;
  current: () => boolean;
  preview: (orderId: string) => Promise<{ success: boolean; data?: RtoPreviewDTO; error?: string }>;
}): Promise<
  | { success: true; detail: OrderDetailDTO; preview: RtoPreviewDTO }
  | { success: false; error?: string }
> {
  const loaded = await deps.read();
  if (!deps.current()) return { success: false };
  if (!loaded.success) return { success: false, error: loaded.error };
  const detail = loaded.detail;
  if (detail.items.some((line) => line.agQuantity === null || !Number.isInteger(line.agQuantity) || line.agQuantity < 0)) {
    return { success: false, error: 'Todos los productos deben tener cantidad AG asignada (número entero ≥ 0).' };
  }
  if (!detail.items.some((line) => (line.agQuantity ?? 0) > 0)) {
    return { success: false, error: 'Al menos un producto debe tener cantidad AG mayor a 0 para generar el remito.' };
  }
  const preview = await deps.preview(detail.id);
  if (!deps.current()) return { success: false };
  if (!preview.success || !preview.data) return { success: false, error: preview.error || 'Error al calcular previsualización del remito.' };
  return { success: true, detail, preview: preview.data };
}
