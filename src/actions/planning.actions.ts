'use server';

import { revalidatePath } from 'next/cache';
import { getAuthenticatedUser, isUserAuthorized } from '@/auth/guard';
import { getPlanningService } from '@/services/composition';
import { DomainError } from '@/domain/errors';
import { serializePlanningMatrix, type PlanningMatrixDTO } from './planning.dto';

export interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function getPlanningMatrixAction(): Promise<ActionResult<PlanningMatrixDTO>> {
  try {
    const user = await getAuthenticatedUser();
    if (!user || !isUserAuthorized(user)) {
      return { success: false, error: 'Usuario no autorizado.' };
    }

    const planningService = getPlanningService();
    const matrix = await planningService.getPlanningMatrix();
    const serialized = serializePlanningMatrix(matrix);

    return {
      success: true,
      data: serialized,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err instanceof DomainError ? err.message : (err?.message || 'Error cargando matriz de planificación.'),
    };
  }
}

export async function reorderProductPrioritiesAction(productIds: string[]): Promise<ActionResult<void>> {
  try {
    const user = await getAuthenticatedUser();
    if (!user || !isUserAuthorized(user)) {
      return { success: false, error: 'Usuario no autorizado.' };
    }

    const planningService = getPlanningService();
    await planningService.reorderProducts(productIds);

    revalidatePath('/pedidos');

    return {
      success: true,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err instanceof DomainError ? err.message : (err?.message || 'Error al reordenar productos.'),
    };
  }
}

export async function reorderOrderPrioritiesAction(orderIds: string[]): Promise<ActionResult<void>> {
  try {
    const user = await getAuthenticatedUser();
    if (!user || !isUserAuthorized(user)) {
      return { success: false, error: 'Usuario no autorizado.' };
    }

    const planningService = getPlanningService();
    await planningService.reorderOrders(orderIds);

    revalidatePath('/pedidos');

    return {
      success: true,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err instanceof DomainError ? err.message : (err?.message || 'Error al reordenar pedidos.'),
    };
  }
}
