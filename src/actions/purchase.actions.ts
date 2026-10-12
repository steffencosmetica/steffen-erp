'use server';

import { revalidatePath } from 'next/cache';
import { getAuthenticatedUser, isUserAuthorized } from '@/auth/guard';
import { getPurchaseService } from '@/services/composition';
import { Decimal } from '@/domain/decimal';
import {
  serializePurchaseOperationResult,
  serializePurchaseDetail,
  serializePurchaseSummary,
  type RegisterPurchaseInputDTO,
  type EditPurchaseInputDTO,
  type PurchaseOperationResultDTO,
  type PurchaseDetailDTO,
  type PurchaseSummaryDTO,
  type SupplierPurchaseCatalogDTO,
} from './purchase.dto';

export interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Registra una compra a proveedor mediante la RPC atómica create_purchase_atomic.
 */
export async function registerPurchaseAction(
  input: RegisterPurchaseInputDTO
): Promise<ActionResult<PurchaseOperationResultDTO>> {
  try {
    const user = await getAuthenticatedUser();
    if (!user || !isUserAuthorized(user)) {
      return { success: false, error: 'Usuario no autenticado o no autorizado.' };
    }

    if (!input.supplierId) {
      return { success: false, error: 'Debe seleccionar un proveedor.' };
    }

    if (!input.items || input.items.length === 0) {
      return { success: false, error: 'La compra debe contener al menos un ítem.' };
    }

    const domainItems = input.items.map((it) => ({
      stockItemId: it.stockItemId,
      quantity: new Decimal(it.quantity),
      unitPriceNetSource: new Decimal(it.unitPriceNetSource),
      vatRatePct: it.vatRatePct ? new Decimal(it.vatRatePct) : new Decimal(21),
    }));

    const purchaseService = getPurchaseService();
    const result = await purchaseService.registerPurchase({
      supplierId: input.supplierId,
      businessDate: input.businessDate,
      paymentMode: input.paymentMode,
      exchangeRateUsed: input.exchangeRateUsed ? new Decimal(input.exchangeRateUsed) : null,
      observations: input.observations,
      items: domainItems,
    });

    revalidatePath('/');
    revalidatePath('/administracion');
    revalidatePath('/proveedores');
    revalidatePath('/stock');

    return {
      success: true,
      data: serializePurchaseOperationResult(result),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado al registrar la compra.';
    return { success: false, error: msg };
  }
}

/**
 * Edita una compra existente recalculando atómicamente diferencias de stock y efectos financieros.
 */
export async function editPurchaseAction(
  input: EditPurchaseInputDTO
): Promise<ActionResult<PurchaseOperationResultDTO>> {
  try {
    const user = await getAuthenticatedUser();
    if (!user || !isUserAuthorized(user)) {
      return { success: false, error: 'Usuario no autenticado o no autorizado.' };
    }

    if (!input.purchaseId) {
      return { success: false, error: 'Identificador de compra no especificado.' };
    }

    if (!input.items || input.items.length === 0) {
      return { success: false, error: 'La compra debe contener al menos un ítem.' };
    }

    const domainItems = input.items.map((it) => ({
      stockItemId: it.stockItemId,
      quantity: new Decimal(it.quantity),
      unitPriceNetSource: new Decimal(it.unitPriceNetSource),
      vatRatePct: it.vatRatePct ? new Decimal(it.vatRatePct) : new Decimal(21),
    }));

    const purchaseService = getPurchaseService();
    const result = await purchaseService.editPurchase({
      purchaseId: input.purchaseId,
      businessDate: input.businessDate,
      paymentMode: input.paymentMode,
      exchangeRateUsed: input.exchangeRateUsed ? new Decimal(input.exchangeRateUsed) : null,
      observations: input.observations,
      items: domainItems,
    });

    revalidatePath('/');
    revalidatePath('/administracion');
    revalidatePath('/proveedores');
    revalidatePath('/stock');

    return {
      success: true,
      data: serializePurchaseOperationResult(result),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado al editar la compra.';
    return { success: false, error: msg };
  }
}

/**
 * Obtiene el detalle completo de una compra por su identificador UUID.
 */
export async function getPurchaseAction(
  id: string
): Promise<ActionResult<PurchaseDetailDTO>> {
  try {
    const user = await getAuthenticatedUser();
    if (!user || !isUserAuthorized(user)) {
      return { success: false, error: 'Usuario no autenticado o no autorizado.' };
    }

    const purchaseService = getPurchaseService();
    const purchase = await purchaseService.getPurchaseById(id);

    if (!purchase) {
      return { success: false, error: 'Compra no encontrada.' };
    }

    return {
      success: true,
      data: serializePurchaseDetail(purchase),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al consultar compra.';
    return { success: false, error: msg };
  }
}

/**
 * Obtiene compras para listado con filtros y paginación.
 */
export async function listPurchasesAction(options?: {
  supplierId?: string;
  limit?: number;
  offset?: number;
}): Promise<ActionResult<PurchaseSummaryDTO[]>> {
  try {
    const user = await getAuthenticatedUser();
    if (!user || !isUserAuthorized(user)) {
      return { success: false, error: 'Usuario no autenticado o no autorizado.' };
    }

    const purchaseService = getPurchaseService();
    const purchases = await purchaseService.listPurchases(options);

    return {
      success: true,
      data: purchases.map(serializePurchaseSummary),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al listar compras.';
    return { success: false, error: msg };
  }
}

/**
 * Obtiene el catálogo de insumos disponibles (asociados y no asociados) para un proveedor,
 * junto con la cotización global USD si el proveedor opera en moneda extranjera.
 */
export async function getSupplierPurchaseCatalogAction(
  supplierId: string
): Promise<ActionResult<SupplierPurchaseCatalogDTO>> {
  try {
    const user = await getAuthenticatedUser();
    if (!user || !isUserAuthorized(user)) {
      return { success: false, error: 'Usuario no autenticado o no autorizado.' };
    }

    if (!supplierId) {
      return { success: false, error: 'Identificador de proveedor no proporcionado.' };
    }

    const purchaseService = getPurchaseService();
    const catalog = await purchaseService.getAvailableItemsForSupplier(supplierId);

    return {
      success: true,
      data: {
        items: catalog.items,
        supplierCurrency: catalog.supplierCurrency,
        currentUsdRate: catalog.currentUsdRate,
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al obtener catálogo del proveedor.';
    return { success: false, error: msg };
  }
}
