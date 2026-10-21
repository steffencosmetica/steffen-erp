'use client';

import React, { useState, useEffect, useTransition, useRef, useSyncExternalStore, useImperativeHandle, useLayoutEffect } from 'react';
import { X, Plus, Trash2, Edit2, AlertCircle } from 'lucide-react';
import {
  getOrderDetailAction,
  updateOrderAction,
  cancelOrderAction,
  getOrderFormDataAction,
} from '@/actions/order.actions';
import type { OrderDetailDTO, OrderProductOptionDTO } from '@/actions/order.dto';
import {
  confirmOrderToRemittanceAction,
  previewRtoAction,
} from '@/actions/remittance.actions';
import type { RtoPreviewDTO } from '@/actions/remittance.dto';
import { Decimal, toWholePesos, toKgPrecision } from '@/domain/decimal';
import { formatArs, formatKg } from '@/lib/format';
import { Button, tableStyles } from '@/ui/components/UIComponents';
import { OrderManualSaveController, draftFromOrder, isOrderDirty, isAddProductDirty, type OrderEditorDraft, type OrderSaveResult } from '@/ui/orders/orderEditorState';
import { OrderContinuation } from '@/ui/orders/orderContinuation';
import { UnsavedOrderDialog } from '@/ui/orders/UnsavedOrderDialog';
import { preparePersistedRto } from '@/ui/orders/orderRtoPreview';
import { useNavigationProtection } from '@/ui/navigation/NavigationProtectionProvider';

/** Protección del editor compartida por sus acciones locales y la navegación global. */
export interface OrderEditorHandle {
  requestAction: (run: () => void, variant?: 'abandon' | 'continue') => void;
  orderId: string | null;
  dirty: boolean;
  addProductDirty: boolean;
  saving: boolean;
  result: OrderSaveResult | null;
  save: () => Promise<OrderSaveResult>;
}

interface VerPedidoModalProps {
  orderId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onOrderUpdated?: () => void;
  onOrderDeleted?: () => void;
  hasPendingRtm?: boolean;
  pendingRtmCode?: string | null;
  /** 'inline': panel dentro de la pantalla Pedidos (Figma); 'modal': ventana (default). */
  variant?: 'modal' | 'inline';
  editorRef?: React.Ref<OrderEditorHandle>;
}

interface EditableLine {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  weightKg: Decimal;
  requestedQuantity: number;
  agQuantity: number | null;
  unitPriceArs: Decimal;
}

export const VerPedidoModal: React.FC<VerPedidoModalProps> = ({
  orderId,
  isOpen,
  onClose,
  onOrderUpdated,
  onOrderDeleted,
  hasPendingRtm,
  pendingRtmCode,
  variant = 'modal',
  editorRef,
}) => {
  const isInline = variant === 'inline';
  const navigationProtection = useNavigationProtection();
  const departing = useRef(false);
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [order, setOrder] = useState<OrderDetailDTO | null>(null);
  const confirmedDetail = useRef<OrderDetailDTO | null>(null);
  const [manualSave] = useState(() => new OrderManualSaveController({ persist: updateOrderAction, reload: getOrderDetailAction }));
  const saveState = useSyncExternalStore(manualSave.subscribe, manualSave.getSnapshot, manualSave.getSnapshot);
  const visibleOrder = useRef<string | null>(null);
  visibleOrder.current = isOpen ? orderId : null;

  // Editable fields
  const [packageCount, setPackageCount] = useState<string>('');
  const [lines, setLines] = useState<EditableLine[]>([]);
  const [recipientName, setRecipientName] = useState('');
  const [address, setAddress] = useState('');
  const [locality, setLocality] = useState('');
  const [province, setProvince] = useState('');
  const [phone, setPhone] = useState('');
  const [transportName, setTransportName] = useState('');

  // Add line builder state
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [availableProducts, setAvailableProducts] = useState<OrderProductOptionDTO[]>([]);
  const [selectedNewProdId, setSelectedNewProdId] = useState('');
  const [newProdQty, setNewProdQty] = useState('1');
  const [newProdAg, setNewProdAg] = useState('');

  // Delete confirm state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // RTO Confirmation state
  const [showRtoConfirm, setShowRtoConfirm] = useState(false);
  const [rtoPreview, setRtoPreview] = useState<RtoPreviewDTO | null>(null);
  const [rtoErrorMsg, setRtoErrorMsg] = useState('');
  const [isConfirmingRto, setIsConfirmingRto] = useState(false);

  // Load order data
  useEffect(() => {
    let cancelled = false;
    manualSave.clear();
    if (isOpen && orderId) {
      departing.current = false;
      setOrder(null);
      setErrorMsg('');
      setLoading(true);
      setShowDeleteConfirm(false);
      setShowAddProduct(false);
      setSelectedNewProdId('');
      setNewProdQty('1');
      setNewProdAg('');
      setShowRtoConfirm(false);
      setRtoPreview(null);
      setRtoErrorMsg('');
      setIsConfirmingRto(false);

      Promise.all([
        getOrderDetailAction(orderId),
        getOrderFormDataAction(),
      ]).then(([orderRes, formRes]) => {
        if (cancelled) return;
        setLoading(false);
        if (orderRes.success && orderRes.data) {
          const ord = orderRes.data;
          if (ord.id !== orderId) {
            setErrorMsg('El detalle recibido no corresponde al pedido seleccionado.');
            return;
          }
          manualSave.load(ord);
          confirmedDetail.current = ord;
          setOrder(ord);
          setPackageCount(ord.packageCount !== null ? String(ord.packageCount) : '');
          setRecipientName(ord.recipientName || '');
          setAddress(ord.address || '');
          setLocality(ord.locality || '');
          setProvince(ord.province || '');
          setPhone(ord.phone || '');
          setTransportName(ord.transportName || '');

          setLines(
            ord.items.map((it) => ({
              id: it.id,
              productId: it.productId,
              productCode: it.productCode,
              productName: it.productName,
              weightKg: new Decimal(it.weightKg || 0),
              requestedQuantity: it.requestedQuantity,
              agQuantity: it.agQuantity,
              unitPriceArs: new Decimal(it.unitPriceArsSnapshot),
            }))
          );
        } else {
          setErrorMsg(orderRes.error || 'Error cargando pedido.');
        }

        if (formRes.success && formRes.data) {
          setAvailableProducts(formRes.data.products);
        }
      }).catch((error: unknown) => {
        if (cancelled) return;
        setLoading(false);
        setErrorMsg(error instanceof Error ? error.message : 'Error cargando pedido.');
      });
    }
    return () => {
      cancelled = true;
      manualSave.clear();
    };
  }, [isOpen, orderId, manualSave]);

  const draft: OrderEditorDraft = {
    customerSource: order?.customerSource ?? 'CONSUMER_FINAL',
    packageCount, recipientName, address, locality, province, phone, transportName,
    items: lines,
  };
  const dirty = isOpen && order?.id === orderId && saveState.orderId === orderId && isOrderDirty(draft, saveState.confirmed);
  const addProductDirty = isOpen && order?.id === orderId && isAddProductDirty(selectedNewProdId, newProdQty, newProdAg);
  const saving = saveState.orderId === orderId && saveState.saving;
  const latest = useRef({ draft, addProductDirty });
  latest.current = { draft, addProductDirty };
  const [, renderDecision] = useState(0);
  const operations = useRef<{ save: () => Promise<boolean>; discard: (auxiliary: boolean, refresh: boolean) => Promise<boolean>; blocked: () => boolean }>({ save: async () => false, discard: async () => false, blocked: () => false });
  const [continuation] = useState(() => new OrderContinuation({
    dirty: () => manualSave.requiresReconciliation() || isOrderDirty(latest.current.draft, manualSave.getSnapshot().confirmed),
    auxiliaryDirty: () => latest.current.addProductDirty,
    blocked: () => operations.current.blocked(),
    save: () => operations.current.save(),
    discard: (auxiliary, refresh) => operations.current.discard(auxiliary, refresh),
    changed: () => renderDecision((value) => value + 1),
    error: setErrorMsg,
  }));
  useEffect(() => () => continuation.cancel(), [continuation, orderId, isOpen]);
  const globalProtection = useRef<{ hasPending: () => boolean; intercepts: () => boolean }>({ hasPending: () => false, intercepts: () => false });
  globalProtection.current = {
    hasPending: () => !departing.current && isOpen && order?.id === orderId &&
      (latest.current.addProductDirty || manualSave.requiresReconciliation() || isOrderDirty(latest.current.draft, manualSave.getSnapshot().confirmed)),
    intercepts: () => !departing.current && (globalProtection.current.hasPending() || manualSave.getSnapshot().saving || continuation.resolving || !!continuation.decision || operations.current.blocked()),
  };
  useLayoutEffect(() => {
    if (!navigationProtection || !isOpen || !orderId) return;
    return navigationProtection.register({
      hasPending: () => globalProtection.current.hasPending(),
      intercepts: () => globalProtection.current.intercepts(),
      request: (run, purpose) => continuation.request(run, 'continue', false, false, purpose),
      cancel: continuation.cancel,
    });
  }, [navigationProtection, continuation, isOpen, orderId]);
  useLayoutEffect(() => { navigationProtection?.notify(); }, [navigationProtection, dirty, addProductDirty, saving, saveState.result, reconciling, loading]);
  const resetAuxiliary = () => {
    setSelectedNewProdId(''); setNewProdQty('1'); setNewProdAg(''); setShowAddProduct(false);
    latest.current = { ...latest.current, addProductDirty: false };
  };
  const restorePersisted = (detail: OrderDetailDTO) => {
    latest.current = { ...latest.current, draft: draftFromOrder(detail) };
    setOrder(detail);
    setPackageCount(detail.packageCount === null ? '' : String(detail.packageCount));
    setRecipientName(detail.recipientName ?? ''); setAddress(detail.address ?? '');
    setLocality(detail.locality ?? ''); setProvince(detail.province ?? '');
    setPhone(detail.phone ?? ''); setTransportName(detail.transportName ?? '');
    setLines(detail.items.map((item) => ({ ...item, weightKg: new Decimal(item.weightKg || 0), unitPriceArs: new Decimal(item.unitPriceArsSnapshot) })));
  };
  const requestClose = () => continuation.request(onClose, 'abandon');

  // Recalculate live totals
  let subtotal = new Decimal(0);
  let totalWeight = new Decimal(0);
  for (const l of lines) {
    subtotal = subtotal.plus(l.unitPriceArs.times(l.requestedQuantity));
    totalWeight = totalWeight.plus(l.weightKg.times(l.requestedQuantity));
  }

  // Recalculate successive discounts using the order's frozen discount steps
  let running = subtotal;
  const liveDiscountSteps: Array<{ position: number; percent: Decimal; amount: Decimal }> = [];

  for (const ds of order?.discountSteps || []) {
    const pct = new Decimal(ds.percent);
    if (pct.gt(0)) {
      const stepAmt = running.times(pct.div(100));
      liveDiscountSteps.push({
        position: ds.position,
        percent: pct,
        amount: stepAmt,
      });
      running = running.minus(stepAmt);
    }
  }

  const totalPedido = toWholePesos(running);
  const priorBalance = order ? new Decimal(order.priorBalanceArs || 0) : new Decimal(0);
  const totalToCollect = totalPedido.plus(priorBalance);

  // Line editing
  const handleUpdateLineQuantity = (lineId: string, newQtyStr: string) => {
    const qty = parseInt(newQtyStr, 10);
    if (isNaN(qty) || qty <= 0) return;
    setLines(lines.map((l) => (l.id === lineId ? { ...l, requestedQuantity: qty } : l)));
  };

  const handleUpdateLineAg = (lineId: string, agStr: string) => {
    const val = agStr.trim() === '' ? null : parseInt(agStr, 10);
    setLines(lines.map((l) => (l.id === lineId ? { ...l, agQuantity: isNaN(val as any) ? null : val } : l)));
  };

  const handleRemoveLine = (lineId: string) => {
    if (lines.length <= 1) {
      setErrorMsg('El pedido debe tener al menos un producto.');
      return;
    }
    setErrorMsg('');
    setLines(lines.filter((l) => l.id !== lineId));
  };

  const handleAddProductToOrder = () => {
    setErrorMsg('');
    if (!selectedNewProdId) {
      setErrorMsg('Seleccione un producto.');
      return;
    }
    const prod = availableProducts.find((p) => p.productId === selectedNewProdId);
    if (!prod) {
      setErrorMsg('Producto no encontrado.');
      return;
    }

    // Determine unit price according to order's customerSource
    let priceStr: string | null = null;
    if (order?.customerSource === 'REGISTERED_CUSTOMER') priceStr = prod.salonPrice;
    else if (order?.customerSource === 'MERCADO_LIBRE') priceStr = prod.ecommercePrice;
    else if (order?.customerSource === 'CONSUMER_FINAL') priceStr = prod.publicPrice;

    if (!priceStr || parseFloat(priceStr) <= 0) {
      setErrorMsg(`El producto ${prod.name} no posee precio vigente en la lista del pedido.`);
      return;
    }

    const qty = parseInt(newProdQty, 10);
    if (isNaN(qty) || qty <= 0) {
      setErrorMsg('La cantidad debe ser mayor a 0.');
      return;
    }

    const ag = newProdAg.trim() !== '' ? parseInt(newProdAg, 10) : null;
    if (ag !== null && ag < 0) {
      setErrorMsg('La cantidad AG no puede ser negativa.');
      return;
    }

    const existingIndex = lines.findIndex((l) => l.productId === prod.productId);
    if (existingIndex >= 0) {
      setLines(lines.map((line, index) => index === existingIndex ? {
        ...line,
        requestedQuantity: line.requestedQuantity + qty,
        agQuantity: ag !== null ? ag : line.agQuantity,
      } : line));
    } else {
      setLines([
        ...lines,
        {
          id: `new_${Date.now()}_${Math.random()}`,
          productId: prod.productId,
          productCode: prod.code,
          productName: prod.name,
          weightKg: new Decimal(prod.weightKg || 0),
          requestedQuantity: qty,
          agQuantity: ag,
          unitPriceArs: new Decimal(priceStr),
        },
      ]);
    }

    // Reset
    setSelectedNewProdId('');
    setNewProdQty('1');
    setNewProdAg('');
    setShowAddProduct(false);
  };

  // Persistencia única compartida por Guardar y las continuaciones explícitas.
  const saveOrder = async (): Promise<OrderSaveResult> => {
    if (!isOpen || !order || order.id !== orderId || loading || saveState.orderId !== orderId) {
      return { success: false, orderId, reason: 'not-loaded', error: 'El pedido todavía no está cargado.' };
    }
    if (manualSave.getSnapshot().saving) {
      return { success: false, orderId, reason: 'busy', error: 'El pedido ya se está guardando.' };
    }
    setErrorMsg('');
    const result = await manualSave.save(draft);
    if (visibleOrder.current !== order.id || (!result.success && result.reason === 'stale')) return result;
    if (result.success) {
      confirmedDetail.current = result.detail;
      setOrder(result.detail);
      const persisted = new Map(result.detail.items.map((item) => [item.productId, item]));
      // Reconciliar solo metadatos/precios históricos; preservar cantidades, AG,
      // productos, orden e IDs locales del borrador más reciente (también el foco).
      setLines((current) => current.map((line) => {
        const item = persisted.get(line.productId);
        return item ? {
          ...line,
          productCode: item.productCode,
          productName: item.productName,
          weightKg: new Decimal(item.weightKg || 0),
          unitPriceArs: new Decimal(item.unitPriceArsSnapshot),
        } : line;
      }));
      onOrderUpdated?.();
    } else {
      setErrorMsg(result.error);
    }
    return result;
  };

  const handleSave = () => {
    startTransition(async () => { await saveOrder(); });
  };

  operations.current = {
    blocked: () => manualSave.getSnapshot().saving || reconciling || loading || isPending || isConfirmingRto || showRtoConfirm || showDeleteConfirm,
    save: async () => (await saveOrder()).success,
    discard: async (auxiliary, refresh) => {
      if (auxiliary) { resetAuxiliary(); return true; }
      if (!refresh && !manualSave.requiresReconciliation() && confirmedDetail.current?.id === orderId) {
        restorePersisted(confirmedDetail.current); resetAuxiliary(); return true;
      }
      setReconciling(true);
      try {
        const result = await manualSave.save(latest.current.draft, true);
        if (!result.success) { setErrorMsg(result.error); return false; }
        if (visibleOrder.current !== result.orderId) return false;
        confirmedDetail.current = result.detail;
        restorePersisted(result.detail);
        resetAuxiliary();
        return true;
      } finally { setReconciling(false); }
    },
  };

  useImperativeHandle(editorRef, () => ({
    requestAction: (run, variant = 'continue') => continuation.request(run, variant),
    orderId: isOpen ? orderId : null,
    dirty,
    addProductDirty,
    saving,
    result: saveState.result,
    save: saveOrder,
  }));

  // Delete Order
  const handleDeleteOrder = () => {
    if (!order) return;
    startTransition(async () => {
      const res = await cancelOrderAction(order.id);
      if (res.success) {
        departing.current = true;
        navigationProtection?.notify();
        if (onOrderDeleted) onOrderDeleted();
        onClose();
      } else {
        setErrorMsg(res.error || 'Error al borrar pedido.');
      }
    });
  };

  // Open RTO preview / confirm
  const openPersistedRtoPreview = async () => {
    if (!order) return;
    const intention = continuation.generation;
    setErrorMsg('');
    setRtoErrorMsg('');

    if (hasPendingRtm) {
      setErrorMsg(
        `Bloqueo de remito activo: Existe un remito pendiente de transporte (${pendingRtmCode || ''}). Debe procesarse en Fase 13 antes de generar otro remito.`
      );
      return;
    }

    setLoading(true);
    try {
      const prepared = await preparePersistedRto({
        read: () => manualSave.save(latest.current.draft, true),
        current: () => visibleOrder.current === order.id && continuation.generation === intention,
        preview: previewRtoAction,
      });
      if (!prepared.success) { if (prepared.error) setErrorMsg(prepared.error); return; }
      confirmedDetail.current = prepared.detail;
      setRtoPreview(prepared.preview);
      restorePersisted(prepared.detail);
      setShowRtoConfirm(true);
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Error al previsualizar el remito.');
    } finally { if (visibleOrder.current === order.id) setLoading(false); }
  };
  const handleOpenRtoPreview = () => continuation.request(openPersistedRtoPreview, 'continue', false, true);

  // Confirm RTO
  const handleConfirmRto = async () => {
    if (!order) return;
    setRtoErrorMsg('');
    setIsConfirmingRto(true);

    try {
      const res = await confirmOrderToRemittanceAction(order.id);
      if (!res.success) {
        setRtoErrorMsg(res.error || 'Error al confirmar remito.');
        setIsConfirmingRto(false);
        return;
      }

      setIsConfirmingRto(false);
      setShowRtoConfirm(false);
      departing.current = true;
      navigationProtection?.notify();
      if (onOrderUpdated) onOrderUpdated();
      onClose();
    } catch (err: any) {
      setRtoErrorMsg(err.message || 'Error inesperado al confirmar remito.');
      setIsConfirmingRto(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className={
        isInline ? '' : 'fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 overflow-y-auto'
      }
    >
      <div
        className={
          isInline
            ? 'bg-black rounded-[10px] border border-steffen-gray w-full p-5 relative flex flex-col'
            : 'bg-black rounded-[10px] border border-steffen-border/40 w-full max-w-4xl p-6 relative my-8 max-h-[92vh] flex flex-col'
        }
      >
        {/* Header: PEDIDO xxxx (Figma Pedido) */}
        <div className="flex justify-between items-center pb-2">
          <h2 className="text-2xl font-bold tracking-tight text-steffen-surface">
            PEDIDO {order ? order.code : ''}
          </h2>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Cerrar pedido"
            className="p-1 rounded-[5px] text-steffen-surface/70 hover:text-steffen-surface hover:bg-steffen-gray transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="mt-3 p-3 bg-red-50 border border-steffen-red text-steffen-red text-xs font-semibold rounded-[5px] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-gray-500 text-sm">Cargando pedido...</div>
        ) : order ? (
          <div inert={reconciling || showRtoConfirm || showDeleteConfirm || !!continuation.decision} className={`${isInline ? '' : 'overflow-y-auto flex-1 pr-1'} space-y-4 mt-2`}>
            {/* Cabecera en grilla de pares label/valor (Figma Pedido) */}
            <div className="text-sm space-y-3 text-steffen-surface">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <span className="font-bold text-gray-700">Codigo:</span>{' '}
                  <span className="font-semibold text-black">{order.code}</span>
                </div>
                <div>
                  <span className="font-bold text-gray-700">Fecha:</span>{' '}
                  <span className="font-semibold text-black">{order.formattedDate}</span>
                </div>
                <div>
                  <span className="font-bold text-gray-700">Cliente:</span>{' '}
                  <span className="font-semibold text-black">{order.customerName}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <span className="font-bold text-gray-700">Domicilio:</span>{' '}
                  <span className="text-black">{order.address || order.customerAddress || '-'}</span>
                </div>
                <div>
                  <span className="font-bold text-gray-700">Transporte:</span>{' '}
                  <span className="text-black">{order.transportName || order.customerTransport || '-'}</span>
                </div>
                <div>
                  <span className="font-bold text-gray-700">Direccion:</span>{' '}
                  <span className="text-black">
                    {[order.locality, order.province].filter(Boolean).join(', ') || '-'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-700">Cant. bultos:</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={packageCount}
                    onChange={(e) => setPackageCount(e.target.value)}
                    placeholder="-"
                    className="w-20 h-8 p-1 border border-steffen-border rounded-[5px] text-center font-semibold focus:outline-none focus:border-steffen-gold"
                  />
                </div>
                <div>
                  <span className="font-bold text-gray-700">Peso (kg):</span>{' '}
                  <span className="font-bold text-black">{formatKg(toKgPrecision(totalWeight))} kg</span>
                </div>
                <div>
                  <span className="font-bold text-gray-700">Lista congelada:</span>{' '}
                  <span className="text-gray-600 font-medium">{order.priceListName}</span>
                </div>
              </div>
            </div>

            {/* Productos del pedido: scroll interno y precios completos en una línea. */}
            <div
              className="min-w-0 max-w-full overflow-x-auto overscroll-x-contain focus-visible:outline focus-visible:outline-1 focus-visible:outline-steffen-gold"
              role="region"
              aria-label="Productos del pedido"
              tabIndex={0}
            >
              <table className={`${tableStyles.table} min-w-[720px] text-left`}>
                <thead>
                  <tr className={tableStyles.headRow}>
                    <th scope="col" className="py-1 px-2 w-14 text-center"><span className="sr-only">Acción</span></th>
                    <th scope="col" className="py-1 px-2 w-20 text-center">Cant.</th>
                    <th scope="col" className="py-1 px-3 min-w-[200px] text-center">Producto</th>
                    <th scope="col" className="py-1 px-3 min-w-[112px] text-right">PU</th>
                    <th scope="col" className="py-1 px-3 min-w-[112px] text-right">PT</th>
                    <th scope="col" className="py-1 px-2 w-24 text-center">AG</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-steffen-border-section">
                  {lines.map((l) => {
                    const linePt = l.unitPriceArs.times(l.requestedQuantity);
                    return (
                      <tr key={l.id} className={tableStyles.row}>
                        <td className="py-1 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(l.id)}
                            className="w-5 h-5 inline-flex items-center justify-center bg-steffen-red hover:bg-steffen-red-hover text-steffen-surface rounded-full transition-colors cursor-pointer"
                            title="Eliminar producto"
                            aria-label="Eliminar producto"
                          >
                            <X className="w-3 h-3 stroke-[3]" />
                          </button>
                        </td>
                        <td className="py-1 px-2 text-center">
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={l.requestedQuantity}
                            onChange={(e) => handleUpdateLineQuantity(l.id, e.target.value)}
                            className="w-16 p-1 border border-steffen-border rounded-[5px] text-center font-bold focus:outline-none focus:border-steffen-gold"
                          />
                        </td>
                        <td className="py-1.5 px-3 font-semibold text-steffen-surface [overflow-wrap:anywhere]">
                          {l.productCode} - {l.productName}
                        </td>
                        <td className="py-1.5 px-3 whitespace-nowrap text-right tabular-nums font-medium text-steffen-surface">{formatArs(l.unitPriceArs)}</td>
                        <td className="py-1.5 px-3 whitespace-nowrap text-right tabular-nums font-bold text-steffen-surface">{formatArs(linePt)}</td>
                        <td className="py-1 px-2 text-center">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={l.agQuantity !== null ? l.agQuantity : ''}
                            onChange={(e) => handleUpdateLineAg(l.id, e.target.value)}
                            placeholder={String(l.requestedQuantity)}
                            className="w-20 p-1 border border-steffen-border rounded-[5px] text-center text-xs font-semibold focus:outline-none focus:border-steffen-gold"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Botón Agregar Producto / Constructor */}
            {!showAddProduct ? (
              <button
                type="button"
                onClick={() => setShowAddProduct(true)}
                className="h-[30px] px-5 bg-black border border-steffen-border hover:bg-steffen-gray text-steffen-surface rounded-[5px] flex items-center gap-1.5 transition-colors cursor-pointer text-base"
              >
                <Plus className="w-4 h-4" />
                <span>Agregar producto</span>
              </button>
            ) : (
              <div className="border border-steffen-gray p-3 rounded-[10px] space-y-2 text-xs">
                <span className="font-bold text-black block uppercase tracking-wider">
                  Agregar nuevo producto al pedido
                </span>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="w-20">
                    <label className="block text-gray-600 font-medium mb-1">Cant.</label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={newProdQty}
                      onChange={(e) => setNewProdQty(e.target.value)}
                      className="w-full p-1.5 border border-steffen-border rounded-[5px] bg-white text-center font-bold"
                    />
                  </div>
                  <div className="flex-1 min-w-[150px]">
                    <label className="block text-gray-600 font-medium mb-1">Producto</label>
                    <select
                      value={selectedNewProdId}
                      onChange={(e) => setSelectedNewProdId(e.target.value)}
                      className="w-full p-1.5 border border-steffen-border rounded-[5px] bg-white"
                    >
                      <option value="">Seleccionar...</option>
                      {availableProducts.map((p) => (
                        <option key={p.productId} value={p.productId}>
                          {p.code} - {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="w-20">
                    <label className="block text-gray-600 font-medium mb-1">AG (opc)</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={newProdAg}
                      onChange={(e) => setNewProdAg(e.target.value)}
                      placeholder="AG"
                      className="w-full p-1.5 border border-steffen-border rounded-[5px] bg-white text-center"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddProductToOrder}
                    className="h-[24px] px-3 bg-black hover:bg-gray-800 text-steffen-gold font-bold rounded-[5px] transition-colors"
                  >
                    Añadir
                  </button>
                  <button
                    type="button"
                    onClick={() => continuation.request(resetAuxiliary, 'abandon', true)}
                    className="h-[24px] px-3 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded-[5px] transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* Totales alineados a la derecha Exactos a Figma PEDIDO.png */}
            <div className="flex flex-col items-end pt-2 space-y-1.5 text-sm">
              <div className="flex justify-between w-64">
                <span className="font-bold text-gray-700 uppercase">SUBTOTAL</span>
                <span className="font-bold text-black">{formatArs(subtotal)}</span>
              </div>

              {liveDiscountSteps.map((ds) => (
                <div key={ds.position} className="flex justify-between w-64">
                  <span className="font-bold uppercase">DESCUENTO {ds.percent.toString()}%</span>
                  <span>- {formatArs(ds.amount)}</span>
                </div>
              ))}

              <div className="flex justify-between w-64 pt-1">
                <span className="font-extrabold text-black uppercase">TOTAL PEDIDO</span>
                <span className="font-extrabold text-black text-sm">{formatArs(totalPedido)}</span>
              </div>

              {order.customerSource === 'REGISTERED_CUSTOMER' && (
                <div className="flex justify-between w-64">
                  <span className="font-bold text-gray-600 uppercase">SALDO</span>
                  <span className={priorBalance.gt(0) ? 'font-bold text-steffen-blue' : 'text-gray-600'}>
                    {formatArs(priorBalance)}
                  </span>
                </div>
              )}

              <div className="flex justify-between w-64 pt-1">
                <span className="font-extrabold text-black uppercase">TOTAL A COBRAR</span>
                <span className="font-extrabold text-steffen-surface text-sm">{formatArs(totalToCollect)}</span>
              </div>
            </div>

            {/* Confirmación de Borrado */}
            {showDeleteConfirm && (
              <div className="p-3 bg-red-50 border border-red-300 rounded-[5px] text-xs space-y-2 mt-2">
                <div className="font-bold text-red-700">
                  ¿Confirmar borrado del pedido {order.code}?
                </div>
                <div className="text-gray-600">
                  El pedido abierto será cancelado y no afectará stock ni movimientos patrimoniales.
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(false)}
                    className="px-3 py-1 bg-gray-200 hover:bg-gray-300 text-black font-semibold rounded-[5px]"
                  >
                    No, mantener
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteOrder}
                    disabled={isPending}
                    className="px-3 py-1 bg-steffen-red hover:bg-red-700 text-white font-bold rounded-[5px]"
                  >
                    {isPending ? 'Borrando...' : 'Sí, borrar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* Footer Buttons Exactos a Figma PEDIDO.png */}
        {/* Footer: Borrar (Danger) · Cancelar / Guardar (Secondary) · Generar Remito (Success) — Figma Pedido */}
        <div className="flex flex-wrap items-center gap-3 pt-4 mt-4">
          <Button variant="rojo" onClick={() => { continuation.cancel(); setShowDeleteConfirm(true); }} disabled={isPending || saving || continuation.resolving || !order}>
            Borrar pedido
          </Button>
          <Button variant="secundario" onClick={requestClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button variant="secundario" onClick={handleSave} disabled={isPending || saving || continuation.resolving || loading || !order}>
            {isPending || saving ? 'Guardando...' : 'Guardar'}
          </Button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleOpenRtoPreview}
              disabled={isPending || saving || loading || hasPendingRtm || !order}
              title={
                hasPendingRtm
                  ? `Bloqueado: Existe un remito pendiente de transporte (${pendingRtmCode || ''}). Debe procesarse en Fase 13.`
                  : 'Confirmar venta y generar remito (RTO)'
              }
              className={`h-[30px] px-5 font-bold text-xs uppercase rounded-[5px] border transition-colors cursor-pointer ${
                hasPendingRtm
                  ? 'bg-steffen-gray border-steffen-gray text-steffen-surface/50 cursor-not-allowed'
                  : 'bg-steffen-green border-steffen-green hover:bg-steffen-green-hover text-steffen-surface'
              }`}
            >
              {loading ? 'Calculando...' : 'Generar Remito'}
            </button>
          </div>
        </div>

        {/* ============================================================== */}
        {/* DIÁLOGO MODAL: CONFIRMACIÓN DE REMITO (RTO)                    */}
        {/* ============================================================== */}
        {showRtoConfirm && rtoPreview && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/75 p-4">
            <div className="bg-black rounded-[10px] border border-steffen-border/40 w-full max-w-2xl p-6 max-h-[90vh] flex flex-col space-y-4">
              {/* Header */}
              <div className="flex justify-between items-center pb-3 border-b border-steffen-border">
                <div>
                  <h3 className="text-lg font-bold text-black uppercase tracking-tight">
                    Confirmar Generación de Remito (RTO)
                  </h3>
                  <p className="text-xs text-gray-500">
                    Conversión definitiva de pedido a venta real • Descuenta stock
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowRtoConfirm(false)}
                  disabled={isConfirmingRto}
                  className="text-gray-400 hover:text-black transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {rtoErrorMsg && (
                <div className="p-3 bg-red-50 border border-steffen-red text-steffen-red text-xs font-semibold rounded-[5px] flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{rtoErrorMsg}</span>
                </div>
              )}

              <div className="overflow-y-auto space-y-4 flex-1 pr-1 text-xs">
                {/* Meta datos */}
                <div className="grid grid-cols-2 gap-2 bg-gray-50 p-3 rounded-[5px] border border-steffen-border">
                  <div>
                    <span className="text-gray-500 font-semibold block text-[11px]">PEDIDO:</span>
                    <span className="font-bold text-steffen-blue text-sm">{rtoPreview.orderCode}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 font-semibold block text-[11px]">DESTINATARIO:</span>
                    <span className="font-bold text-black">{rtoPreview.customerDisplayName}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-500 font-semibold block text-[11px]">CANAL / DESTINO:</span>
                    <span className="font-medium text-gray-800">
                      {rtoPreview.customerSource === 'REGISTERED_CUSTOMER'
                        ? 'Cliente Registrado'
                        : rtoPreview.customerSource === 'MERCADO_LIBRE'
                        ? 'Mercado Libre'
                        : 'Consumidor Final'}
                      {[order?.locality, order?.province].filter(Boolean).length > 0 && ` • ${[order?.locality, order?.province].filter(Boolean).join(', ')}`}
                    </span>
                  </div>
                </div>

                {/* Tabla de items */}
                <div>
                  <div className="font-bold text-gray-700 uppercase mb-1.5 text-[11px]">
                    Detalle de productos a remitir
                  </div>
                  <table className="w-full text-left border-collapse border border-steffen-border">
                    <thead className="bg-steffen-gray text-black font-bold uppercase text-[10px]">
                      <tr>
                        <th className="py-2 px-2.5">CÓDIGO</th>
                        <th className="py-2 px-2.5">PRODUCTO</th>
                        <th className="py-2 px-2.5 text-center">PED</th>
                        <th className="py-2 px-2.5 text-center bg-steffen-gold/20">AG (REMITO)</th>
                        <th className="py-2 px-2.5 text-right">PRECIO</th>
                        <th className="py-2 px-2.5 text-right">TOTAL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-steffen-border">
                      {rtoPreview.lines.map((it) => {
                        const isZero = it.agQuantity === 0;
                        return (
                          <tr
                            key={it.productId}
                            className={
                              isZero
                                ? 'bg-gray-50 text-gray-400 italic'
                                : 'hover:bg-gray-50 text-black'
                            }
                          >
                            <td className="py-2 px-2.5 font-bold">{it.productCode}</td>
                            <td className="py-2 px-2.5">{it.productName}</td>
                            <td className="py-2 px-2.5 text-center text-gray-500">
                              {it.requestedQuantity}
                            </td>
                            <td
                              className={`py-2 px-2.5 text-center font-extrabold ${
                                isZero
                                  ? 'text-gray-400'
                                  : 'text-steffen-blue bg-steffen-gold/10'
                              }`}
                            >
                              {isZero ? '0 (omitido)' : it.agQuantity}
                            </td>
                            <td className="py-2 px-2.5 text-right">{formatArs(it.unitPriceArs)}</td>
                            <td className="py-2 px-2.5 text-right font-bold">
                              {isZero ? '-' : formatArs(it.lineTotalArs)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Desglose de Totales */}
                <div className="flex flex-col items-end space-y-1 pt-2 border-t border-steffen-border">
                  <div className="flex justify-between w-64">
                    <span className="font-bold text-gray-700 uppercase">SUBTOTAL RTO</span>
                    <span className="font-bold text-black">{formatArs(rtoPreview.subtotalArs)}</span>
                  </div>

                  {rtoPreview.discountSteps.map((ds) => (
                    <div key={ds.position} className="flex justify-between w-64 text-red-600">
                      <span className="font-bold uppercase">DESCUENTO {ds.percent}%</span>
                      <span>- {formatArs(ds.amountArs)}</span>
                    </div>
                  ))}

                  <div className="flex justify-between w-64 pt-1 border-t border-gray-200">
                    <span className="font-extrabold text-black uppercase">TOTAL REMITO</span>
                    <span className="font-extrabold text-black text-sm">
                      {formatArs(rtoPreview.totalOrderArs)}
                    </span>
                  </div>

                  {rtoPreview.customerSource === 'REGISTERED_CUSTOMER' && (
                    <div className="flex justify-between w-64">
                      <span className="font-bold text-gray-600 uppercase">SALDO ANTERIOR</span>
                      <span className="font-bold text-steffen-blue">
                        {formatArs(rtoPreview.priorBalanceArs)}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between w-64 pt-1 border-t border-gray-300">
                    <span className="font-extrabold text-black uppercase">TOTAL A COBRAR</span>
                    <span className="font-extrabold text-steffen-blue text-sm">
                      {formatArs(rtoPreview.totalToCollectArs)}
                    </span>
                  </div>

                  <div className="flex justify-between w-64 text-gray-600 text-[11px] pt-1">
                    <span>
                      Peso Real: <strong>{formatKg(rtoPreview.totalWeightKg)} kg</strong>
                    </span>
                    <span>
                      Bultos:{' '}
                      <strong>
                        {rtoPreview.packageCount !== null ? rtoPreview.packageCount : '-'}
                      </strong>
                    </span>
                  </div>
                </div>

                {/* Advertencia Crítica */}
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-[5px] text-[11px] text-amber-900 space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-amber-950">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>ADVERTENCIA NORMATIVA IRREVERSIBLE:</span>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-amber-900 pl-1">
                    <li>Descuenta stock físico real de productos terminados (MST VENTA).</li>
                    <li>Genera el movimiento patrimonial de venta (MOV VENTA).</li>
                    <li>Actualiza cuenta corriente del cliente o caja correspondiente.</li>
                    <li>El pedido pasa a estado CONVERTIDO y no podrá volver a editarse.</li>
                    <li>El remito entra en RTM_PENDING, bloqueando nuevos remitos hasta cerrar transporte.</li>
                  </ul>
                </div>
              </div>

              {/* Botones */}
              <div className="flex justify-end items-center gap-3 pt-3 border-t border-steffen-border">
                <button
                  type="button"
                  onClick={() => setShowRtoConfirm(false)}
                  disabled={isConfirmingRto}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-black font-semibold text-xs rounded-[5px] transition-colors cursor-pointer"
                >
                  Cancelar / Volver
                </button>
                <button
                  type="button"
                  onClick={handleConfirmRto}
                  disabled={isConfirmingRto}
                  className="px-5 py-2 bg-steffen-green hover:bg-steffen-green-hover text-white font-bold text-xs rounded-[5px] transition-colors cursor-pointer shadow-xs active:scale-[0.99] flex items-center gap-2"
                >
                  {isConfirmingRto ? 'Confirmando venta...' : 'CONFIRMAR Y GENERAR REMITO'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      {continuation.decision && <UnsavedOrderDialog variant={continuation.decision.variant}
        purpose={continuation.decision.purpose}
        onSave={() => { void continuation.resolve('save'); }}
        onDiscard={() => { void continuation.resolve('discard'); }} onKeep={continuation.cancel} />}
    </div>
  );
};
