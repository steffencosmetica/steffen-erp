'use server';

import { revalidatePath } from 'next/cache';
import { getAuthenticatedUser, isUserAuthorized } from '@/auth/guard';
import { getOrderService, getCustomerService, getProductService } from '@/services/composition';
import { serverSupabase } from '@/database/server';
import { DomainError } from '@/domain/errors';
import { Decimal, toNumericString } from '@/domain/decimal';
import type { CustomerSource } from '@/database/domain-types';
import {
  serializeOrderListItem,
  serializeOrderDetail,
  formatArsPesos,
  type OrderListItemDTO,
  type OrderDetailDTO,
  type OrderFormDataDTO,
} from './order.dto';

export interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface CreateOrderInput {
  customerSource: CustomerSource;
  customerId?: string | null;
  businessDate?: string;
  recipientName?: string | null;
  address?: string | null;
  locality?: string | null;
  province?: string | null;
  phone?: string | null;
  transportName?: string | null;
  transportAddress?: string | null;
  packageCount?: number | null;
  manualDiscountPercent?: number | string | null;
  items: Array<{
    productId: string;
    requestedQuantity: number;
    agQuantity?: number | null;
  }>;
}

export interface UpdateOrderInput {
  businessDate?: string;
  recipientName?: string | null;
  address?: string | null;
  locality?: string | null;
  province?: string | null;
  phone?: string | null;
  transportName?: string | null;
  transportAddress?: string | null;
  packageCount?: number | null;
  manualDiscountPercent?: number | string | null;
  items?: Array<{
    productId: string;
    requestedQuantity: number;
    agQuantity?: number | null;
  }>;
}

export async function createOrderAction(
  input: CreateOrderInput
): Promise<ActionResult<{ id: string; code: string }>> {
  try {
    const user = await getAuthenticatedUser();
    if (!user || !isUserAuthorized(user)) {
      return { success: false, error: 'No autorizado.' };
    }

    const orderService = getOrderService();
    const result = await orderService.createOrder({
      customerSource: input.customerSource,
      customerId: input.customerId,
      businessDate: input.businessDate,
      recipientName: input.recipientName,
      address: input.address,
      locality: input.locality,
      province: input.province,
      phone: input.phone,
      transportName: input.transportName,
      transportAddress: input.transportAddress,
      packageCount: input.packageCount,
      manualDiscountPercent: input.manualDiscountPercent,
      items: input.items,
    });

    revalidatePath('/pedidos');
    revalidatePath('/');

    return {
      success: true,
      data: {
        id: result.id,
        code: result.code,
      },
    };
  } catch (err: any) {
    return {
      success: false,
      error: err instanceof DomainError ? err.message : err.message || 'Error inesperado al crear pedido.',
    };
  }
}

export async function updateOrderAction(
  orderId: string,
  input: UpdateOrderInput
): Promise<ActionResult<{ id: string; code: string }>> {
  try {
    const user = await getAuthenticatedUser();
    if (!user || !isUserAuthorized(user)) {
      return { success: false, error: 'No autorizado.' };
    }

    const orderService = getOrderService();
    const result = await orderService.updateOrder(orderId, {
      businessDate: input.businessDate,
      recipientName: input.recipientName,
      address: input.address,
      locality: input.locality,
      province: input.province,
      phone: input.phone,
      transportName: input.transportName,
      transportAddress: input.transportAddress,
      packageCount: input.packageCount,
      manualDiscountPercent: input.manualDiscountPercent,
      items: input.items,
    });

    revalidatePath('/pedidos');
    revalidatePath('/');

    return {
      success: true,
      data: {
        id: result.id,
        code: result.code,
      },
    };
  } catch (err: any) {
    return {
      success: false,
      error: err instanceof DomainError ? err.message : err.message || 'Error inesperado al actualizar pedido.',
    };
  }
}

export async function cancelOrderAction(
  orderId: string
): Promise<ActionResult<{ id: string; code: string }>> {
  try {
    const user = await getAuthenticatedUser();
    if (!user || !isUserAuthorized(user)) {
      return { success: false, error: 'No autorizado.' };
    }

    const orderService = getOrderService();
    const result = await orderService.cancelOrder(orderId);

    revalidatePath('/pedidos');
    revalidatePath('/');

    return {
      success: true,
      data: {
        id: result.id,
        code: result.code,
      },
    };
  } catch (err: any) {
    return {
      success: false,
      error: err instanceof DomainError ? err.message : err.message || 'Error inesperado al borrar pedido.',
    };
  }
}

export async function getOrderDetailAction(
  orderId: string
): Promise<ActionResult<OrderDetailDTO>> {
  try {
    const user = await getAuthenticatedUser();
    if (!user || !isUserAuthorized(user)) {
      return { success: false, error: 'No autorizado.' };
    }

    const orderService = getOrderService();
    const order = await orderService.getOrder(orderId);
    if (!order) {
      return { success: false, error: 'Pedido no encontrado.' };
    }

    return {
      success: true,
      data: serializeOrderDetail(order),
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Error obteniendo detalle de pedido.',
    };
  }
}

export async function getOrderFormDataAction(): Promise<ActionResult<OrderFormDataDTO>> {
  try {
    const user = await getAuthenticatedUser();
    if (!user || !isUserAuthorized(user)) {
      return { success: false, error: 'No autorizado.' };
    }

    // 1. Clientes activos
    const customerService = getCustomerService();
    const customerRecords = await customerService.listCustomers(false);

    const customers = customerRecords.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      address: c.address,
      locality: c.locality,
      province: c.province,
      phone: c.phone,
      transportName: c.transportName,
      transportAddress: c.transportAddress,
      discount1: toNumericString(c.discount1Pct),
      discount2: toNumericString(c.discount2Pct),
      discount3: toNumericString(c.discount3Pct),
      balanceArs: toNumericString(c.balanceArs),
      formattedBalance: formatArsPesos(c.balanceArs),
    }));

    // 2. Listas de precios del sistema
    const { data: priceLists } = await serverSupabase
      .from('price_lists')
      .select('id, system_role')
      .in('system_role', ['SALON_DEFAULT', 'PUBLIC_DEFAULT', 'ECOMMERCE_DEFAULT'])
      .eq('active', true);

    let salonListId = '';
    let publicListId = '';
    let ecommerceListId = '';

    for (const pl of priceLists || []) {
      if (pl.system_role === 'SALON_DEFAULT') salonListId = pl.id;
      if (pl.system_role === 'PUBLIC_DEFAULT') publicListId = pl.id;
      if (pl.system_role === 'ECOMMERCE_DEFAULT') ecommerceListId = pl.id;
    }

    // 3. Precios vigentes de productos
    const listIds = [salonListId, publicListId, ecommerceListId].filter(Boolean);
    const priceMap = new Map<string, { salon?: string; public?: string; ecommerce?: string }>();

    if (listIds.length > 0) {
      const { data: priceVersions } = await serverSupabase
        .from('product_price_versions')
        .select('product_id, price_list_id, price_ars')
        .in('price_list_id', listIds)
        .is('valid_to', null);

      for (const pv of priceVersions || []) {
        const existing = priceMap.get(pv.product_id) || {};
        if (pv.price_list_id === salonListId) existing.salon = toNumericString(pv.price_ars);
        if (pv.price_list_id === publicListId) existing.public = toNumericString(pv.price_ars);
        if (pv.price_list_id === ecommerceListId) existing.ecommerce = toNumericString(pv.price_ars);
        priceMap.set(pv.product_id, existing);
      }
    }

    // 4. Productos activos
    const productService = getProductService();
    const productRecords = await productService.listProducts(false);

    const products = productRecords.map((p) => {
      const prices = priceMap.get(p.productId) || {};
      return {
        productId: p.productId,
        code: p.code,
        name: p.name,
        weightKg: toNumericString(p.weightKg),
        salonPrice: prices.salon || null,
        publicPrice: prices.public || null,
        ecommercePrice: prices.ecommerce || null,
      };
    });

    return {
      success: true,
      data: {
        customers,
        products,
      },
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Error cargando datos para formulario de pedido.',
    };
  }
}
