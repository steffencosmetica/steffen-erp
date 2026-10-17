'use server';

import { revalidatePath } from 'next/cache';
import { requireAuthenticatedUser } from '@/auth/guard';
import { getExchangeRateService } from '@/services/composition';
import { toNumericString } from '@/domain/decimal';

export interface UpdateUsdRateResult {
  success: boolean;
  data?: { rateToArs: string; previousRateToArs: string | null; effectiveAt: string };
  error?: string;
}

/**
 * Actualiza la cotización GLOBAL USD → ARS (nueva vigente; la anterior queda en el
 * historial). `rateToArs` como string decimal exacto (es-AR ya normalizado).
 */
export async function updateUsdExchangeRateAction(rateToArs: string): Promise<UpdateUsdRateResult> {
  try {
    await requireAuthenticatedUser();
    const res = await getExchangeRateService().setCurrentUsdRate(rateToArs);

    // Costo teórico actual (Stock / Fórmulas / Productos) y sugerencia de Compras
    revalidatePath('/');
    revalidatePath('/administracion');
    revalidatePath('/stock');
    revalidatePath('/formulas');
    revalidatePath('/costo-ganancia');
    revalidatePath('/proveedores');

    return {
      success: true,
      data: {
        rateToArs: toNumericString(res.rateToArs),
        previousRateToArs: res.previousRateToArs ? toNumericString(res.previousRateToArs) : null,
        effectiveAt: res.effectiveAt,
      },
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error && error.message ? error.message : 'Error actualizando la cotización',
    };
  }
}
