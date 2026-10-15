import { toNumericString, Decimal } from '@/domain/decimal';
import { formatArs } from '@/lib/format';
import type { CustomerSource, OrderStatus } from '@/database/domain-types';
import type { OrderItemRecord, OrderDiscountStepRecord } from '@/repositories/order.repository';
import type { EnrichedOrderRecord, DiscountStepBreakdown } from '@/services/order.service';

export interface OrderListItemDTO {
  id: string;
  code: string;
  businessDate: string;
  formattedDate: string;
  customerSource: CustomerSource;
  customerName: string;
  packageCount: number | null;
  totalOrderArs: string;
  formattedTotalOrder: string;
  totalWeightKg: string;
  status: OrderStatus;
}

export interface OrderItemDTO {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  weightKg: string;
  requestedQuantity: number;
  agQuantity: number | null;
  unitPriceArsSnapshot: string;
  formattedUnitPrice: string;
  totalPriceArs: string;
  formattedTotalPrice: string;
  sortOrder: number;
}

export interface OrderDiscountStepDTO {
  position: number;
  percent: string;
  discountArs: string;
  formattedDiscount: string;
}

export interface OrderDetailDTO {
  id: string;
  code: string;
  businessDate: string;
  formattedDate: string;
  status: OrderStatus;
  customerSource: CustomerSource;
  customerId: string | null;
  customerName: string;
  customerCode: string | null;
  customerAddress: string | null;
  customerTransport: string | null;
  priceListId: string;
  priceListName: string;
  priceSnapshotAt: string;
  recipientName: string | null;
  address: string | null;
  locality: string | null;
  province: string | null;
  phone: string | null;
  transportName: string | null;
  transportAddress: string | null;
  packageCount: number | null;
  planningSortKey: string;
  items: OrderItemDTO[];
  discountSteps: OrderDiscountStepDTO[];
  subtotalArs: string;
  totalDiscountArs: string;
  totalOrderArs: string;
  priorBalanceArs: string;
  totalToCollectArs: string;
  totalWeightKg: string;
  formattedSubtotal: string;
  formattedTotalDiscount: string;
  formattedTotalOrder: string;
  formattedPriorBalance: string;
  formattedTotalToCollect: string;
}

export interface OrderProductOptionDTO {
  productId: string;
  code: string;
  name: string;
  weightKg: string;
  salonPrice: string | null;
  publicPrice: string | null;
  ecommercePrice: string | null;
}

export interface OrderCustomerOptionDTO {
  id: string;
  code: string;
  name: string;
  address: string | null;
  locality: string | null;
  province: string | null;
  phone: string | null;
  transportName: string | null;
  transportAddress: string | null;
  discount1: string;
  discount2: string;
  discount3: string;
  balanceArs: string;
  formattedBalance: string;
}

export interface OrderFormDataDTO {
  customers: OrderCustomerOptionDTO[];
  products: OrderProductOptionDTO[];
}

export function formatArsPesos(val: Decimal | number | string): string {
  return formatArs(val);
}

export function formatDateSlash(isoDate: string): string {
  if (!isoDate) return '';
  const parts = isoDate.split('T')[0].split('-');
  if (parts.length === 3) {
    const yearShort = parts[0].slice(-2);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    return `${day}/${month}/${yearShort}`;
  }
  return isoDate;
}

export function resolveCustomerDisplayName(order: {
  customerSource: CustomerSource;
  customerName?: string;
  recipientName?: string | null;
}): string {
  if (order.customerSource === 'REGISTERED_CUSTOMER') {
    return order.customerName || 'Cliente registrado';
  }
  if (order.customerSource === 'MERCADO_LIBRE') {
    return 'Mercado Libre';
  }
  if (order.customerSource === 'CONSUMER_FINAL') {
    return order.recipientName ? `Consumidor Final (${order.recipientName})` : 'Consumidor Final';
  }
  return 'Consumidor Final';
}

export function serializeOrderListItem(order: EnrichedOrderRecord): OrderListItemDTO {
  return {
    id: order.id,
    code: order.code,
    businessDate: order.businessDate,
    formattedDate: formatDateSlash(order.businessDate),
    customerSource: order.customerSource,
    customerName: resolveCustomerDisplayName(order),
    packageCount: order.packageCount,
    totalOrderArs: toNumericString(order.totals.totalOrderArs),
    formattedTotalOrder: formatArsPesos(order.totals.totalOrderArs),
    totalWeightKg: toNumericString(order.totals.totalWeightKg),
    status: order.status,
  };
}

export function serializeOrderDetail(order: EnrichedOrderRecord): OrderDetailDTO {
  const items: OrderItemDTO[] = (order.items || []).map((it) => {
    const lineTotal = it.unitPriceArsSnapshot.times(it.requestedQuantity);
    return {
      id: it.id,
      productId: it.productId,
      productCode: it.productCode || '',
      productName: it.productName || '',
      weightKg: it.weightKg ? toNumericString(it.weightKg) : '0',
      requestedQuantity: it.requestedQuantity,
      agQuantity: it.agQuantity,
      unitPriceArsSnapshot: toNumericString(it.unitPriceArsSnapshot),
      formattedUnitPrice: formatArsPesos(it.unitPriceArsSnapshot),
      totalPriceArs: toNumericString(lineTotal),
      formattedTotalPrice: formatArsPesos(lineTotal),
      sortOrder: it.sortOrder,
    };
  });

  const discountSteps: OrderDiscountStepDTO[] = (order.totals.discountSteps || []).map((ds) => ({
    position: ds.position,
    percent: toNumericString(ds.percent),
    discountArs: toNumericString(ds.discountArs),
    formattedDiscount: formatArsPesos(ds.discountArs),
  }));

  return {
    id: order.id,
    code: order.code,
    businessDate: order.businessDate,
    formattedDate: formatDateSlash(order.businessDate),
    status: order.status,
    customerSource: order.customerSource,
    customerId: order.customerId,
    customerName: resolveCustomerDisplayName(order),
    customerCode: order.customerCode || null,
    customerAddress: order.customerAddress || null,
    customerTransport: order.customerTransport || null,
    priceListId: order.priceListId,
    priceListName: order.priceListName || '',
    priceSnapshotAt: order.priceSnapshotAt,
    recipientName: order.recipientName,
    address: order.address,
    locality: order.locality,
    province: order.province,
    phone: order.phone,
    transportName: order.transportName,
    transportAddress: order.transportAddress,
    packageCount: order.packageCount,
    planningSortKey: toNumericString(order.planningSortKey),
    items,
    discountSteps,
    subtotalArs: toNumericString(order.totals.subtotalArs),
    totalDiscountArs: toNumericString(order.totals.totalDiscountArs),
    totalOrderArs: toNumericString(order.totals.totalOrderArs),
    priorBalanceArs: toNumericString(order.totals.priorBalanceArs),
    totalToCollectArs: toNumericString(order.totals.totalToCollectArs),
    totalWeightKg: toNumericString(order.totals.totalWeightKg),
    formattedSubtotal: formatArsPesos(order.totals.subtotalArs),
    formattedTotalDiscount: formatArsPesos(order.totals.totalDiscountArs),
    formattedTotalOrder: formatArsPesos(order.totals.totalOrderArs),
    formattedPriorBalance: formatArsPesos(order.totals.priorBalanceArs),
    formattedTotalToCollect: formatArsPesos(order.totals.totalToCollectArs),
  };
}
