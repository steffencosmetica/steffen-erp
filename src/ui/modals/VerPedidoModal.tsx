'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { X, Plus, Trash2, Edit2, AlertCircle } from 'lucide-react';
import {
  getOrderDetailAction,
  updateOrderAction,
  cancelOrderAction,
  getOrderFormDataAction,
} from '@/actions/order.actions';
import type { OrderDetailDTO, OrderProductOptionDTO } from '@/actions/order.dto';
import { Decimal, toWholePesos, toKgPrecision } from '@/domain/decimal';

interface VerPedidoModalProps {
  orderId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onOrderUpdated?: () => void;
  onOrderDeleted?: () => void;
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
}) => {
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [order, setOrder] = useState<OrderDetailDTO | null>(null);

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

  // Load order data
  useEffect(() => {
    if (isOpen && orderId) {
      setErrorMsg('');
      setLoading(true);
      setShowDeleteConfirm(false);
      setShowAddProduct(false);

      Promise.all([
        getOrderDetailAction(orderId),
        getOrderFormDataAction(),
      ]).then(([orderRes, formRes]) => {
        setLoading(false);
        if (orderRes.success && orderRes.data) {
          const ord = orderRes.data;
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
      });
    }
  }, [isOpen, orderId]);

  if (!isOpen) return null;

  const formatPesos = (d: Decimal | number | string) => {
    const num = typeof d === 'number' ? d : Math.round(new Decimal(d).toNumber());
    return `$ ${num.toLocaleString('es-AR')}`;
  };

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
      const updated = [...lines];
      updated[existingIndex].requestedQuantity += qty;
      if (ag !== null) updated[existingIndex].agQuantity = ag;
      setLines(updated);
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

  // Save changes
  const handleSave = () => {
    if (!order) return;
    setErrorMsg('');

    const payload = {
      packageCount: packageCount.trim() !== '' ? parseInt(packageCount, 10) : null,
      recipientName: order.customerSource === 'CONSUMER_FINAL' ? recipientName : undefined,
      address: order.customerSource === 'CONSUMER_FINAL' ? address : undefined,
      locality: order.customerSource === 'CONSUMER_FINAL' ? locality : undefined,
      province: order.customerSource === 'CONSUMER_FINAL' ? province : undefined,
      phone: order.customerSource === 'CONSUMER_FINAL' ? phone : undefined,
      transportName: order.customerSource === 'CONSUMER_FINAL' ? transportName : undefined,
      items: lines.map((l) => ({
        productId: l.productId,
        requestedQuantity: l.requestedQuantity,
        agQuantity: l.agQuantity,
      })),
    };

    startTransition(async () => {
      const res = await updateOrderAction(order.id, payload);
      if (res.success) {
        if (onOrderUpdated) onOrderUpdated();
        onClose();
      } else {
        setErrorMsg(res.error || 'Error al guardar pedido.');
      }
    });
  };

  // Delete Order
  const handleDeleteOrder = () => {
    if (!order) return;
    startTransition(async () => {
      const res = await cancelOrderAction(order.id);
      if (res.success) {
        if (onOrderDeleted) onOrderDeleted();
        onClose();
      } else {
        setErrorMsg(res.error || 'Error al borrar pedido.');
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-[5px] border border-[#D9D9D9] w-full max-w-4xl p-6 relative my-8 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center pb-3 border-b border-[#D9D9D9]">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold tracking-tight text-black">PEDIDO</h2>
            {order && (
              <span className="text-sm font-bold bg-[#D2AB68]/20 text-[#0E50A0] px-2 py-0.5 rounded-[2px]">
                {order.code}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-black transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="mt-3 p-3 bg-red-50 border border-[#DD0000] text-[#DD0000] text-xs font-semibold rounded-[2px] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-gray-500 text-sm">Cargando pedido...</div>
        ) : order ? (
          <div className="overflow-y-auto flex-1 pr-1 space-y-4 mt-4">
            {/* Metadata Header Exacto a Figma PEDIDO.png */}
            <div className="bg-[#FBFBFB] border border-[#D9D9D9] p-3 rounded-[4px] text-xs space-y-2">
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center pt-1 border-t border-gray-200">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-700">Cant. bultos:</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={packageCount}
                    onChange={(e) => setPackageCount(e.target.value)}
                    placeholder="-"
                    className="w-20 p-1 border border-[#D9D9D9] rounded-[2px] bg-white text-center font-bold focus:outline-none focus:border-[#D2AB68]"
                  />
                </div>
                <div>
                  <span className="font-bold text-gray-700">Peso (kg):</span>{' '}
                  <span className="font-bold text-black">{toKgPrecision(totalWeight).toString()} kg</span>
                </div>
                <div>
                  <span className="font-bold text-gray-700">Lista congelada:</span>{' '}
                  <span className="text-gray-600 font-medium">{order.priceListName}</span>
                </div>
              </div>
            </div>

            {/* Tabla de Renglones Exacta a Figma PEDIDO.png */}
            <div className="border border-[#D9D9D9] rounded-[2px] overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#D9D9D9] text-black font-bold uppercase text-[11px]">
                  <tr>
                    <th className="py-2 px-3 w-14 text-center">Acción</th>
                    <th className="py-2 px-3 w-20 text-center">Cant.</th>
                    <th className="py-2 px-3">Producto</th>
                    <th className="py-2 px-3 text-right w-24">PU</th>
                    <th className="py-2 px-3 text-right w-28">PT</th>
                    <th className="py-2 px-3 text-center w-24">AG</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D9D9D9]">
                  {lines.map((l) => {
                    const linePt = l.unitPriceArs.times(l.requestedQuantity);
                    return (
                      <tr key={l.id} className="hover:bg-gray-50">
                        <td className="py-2 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(l.id)}
                            className="w-5 h-5 inline-flex items-center justify-center bg-red-600 hover:bg-red-700 text-white rounded-full transition-colors cursor-pointer"
                            title="Eliminar producto"
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
                            className="w-16 p-1 border border-[#D9D9D9] rounded-[2px] text-center font-bold focus:outline-none focus:border-[#D2AB68]"
                          />
                        </td>
                        <td className="py-2 px-3 font-semibold text-black">
                          {l.productCode} - {l.productName}
                        </td>
                        <td className="py-2 px-3 text-right font-medium text-black">{formatPesos(l.unitPriceArs)}</td>
                        <td className="py-2 px-3 text-right font-bold text-black">{formatPesos(linePt)}</td>
                        <td className="py-1 px-2 text-center">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={l.agQuantity !== null ? l.agQuantity : ''}
                            onChange={(e) => handleUpdateLineAg(l.id, e.target.value)}
                            placeholder={String(l.requestedQuantity)}
                            className="w-20 p-1 border border-[#D9D9D9] rounded-[2px] text-center text-xs font-semibold focus:outline-none focus:border-[#D2AB68]"
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
                className="h-[32px] px-3 bg-black hover:bg-gray-800 text-[#D2AB68] font-bold rounded-[2px] flex items-center gap-1.5 transition-colors cursor-pointer text-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Agregar producto</span>
              </button>
            ) : (
              <div className="border border-[#D9D9D9] p-3 rounded-[4px] bg-[#FBFBFB] space-y-2 text-xs">
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
                      className="w-full p-1.5 border border-[#D9D9D9] rounded-[2px] bg-white text-center font-bold"
                    />
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-gray-600 font-medium mb-1">Producto</label>
                    <select
                      value={selectedNewProdId}
                      onChange={(e) => setSelectedNewProdId(e.target.value)}
                      className="w-full p-1.5 border border-[#D9D9D9] rounded-[2px] bg-white"
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
                      className="w-full p-1.5 border border-[#D9D9D9] rounded-[2px] bg-white text-center"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddProductToOrder}
                    className="h-[32px] px-3 bg-black hover:bg-gray-800 text-[#D2AB68] font-bold rounded-[2px] transition-colors"
                  >
                    Añadir
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddProduct(false)}
                    className="h-[32px] px-3 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded-[2px] transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* Totales alineados a la derecha Exactos a Figma PEDIDO.png */}
            <div className="flex flex-col items-end pt-2 border-t border-[#D9D9D9] space-y-1 text-xs">
              <div className="flex justify-between w-64">
                <span className="font-bold text-gray-700 uppercase">SUBTOTAL</span>
                <span className="font-bold text-black">{formatPesos(subtotal)}</span>
              </div>

              {liveDiscountSteps.map((ds) => (
                <div key={ds.position} className="flex justify-between w-64 text-red-600">
                  <span className="font-bold uppercase">DESCUENTO {ds.percent.toString()}%</span>
                  <span>- {formatPesos(ds.amount)}</span>
                </div>
              ))}

              <div className="flex justify-between w-64 pt-1 border-t border-gray-200">
                <span className="font-extrabold text-black uppercase">TOTAL PEDIDO</span>
                <span className="font-extrabold text-black text-sm">{formatPesos(totalPedido)}</span>
              </div>

              {order.customerSource === 'REGISTERED_CUSTOMER' && (
                <div className="flex justify-between w-64">
                  <span className="font-bold text-gray-600 uppercase">SALDO</span>
                  <span className={priorBalance.gt(0) ? 'font-bold text-[#0E50A0]' : 'text-gray-600'}>
                    {formatPesos(priorBalance)}
                  </span>
                </div>
              )}

              <div className="flex justify-between w-64 pt-1 border-t border-gray-300">
                <span className="font-extrabold text-black uppercase">TOTAL A COBRAR</span>
                <span className="font-extrabold text-[#0E50A0] text-sm">{formatPesos(totalToCollect)}</span>
              </div>
            </div>

            {/* Confirmación de Borrado */}
            {showDeleteConfirm && (
              <div className="p-3 bg-red-50 border border-red-300 rounded-[3px] text-xs space-y-2 mt-2">
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
                    className="px-3 py-1 bg-gray-200 hover:bg-gray-300 text-black font-semibold rounded-[2px]"
                  >
                    No, mantener
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteOrder}
                    disabled={isPending}
                    className="px-3 py-1 bg-[#DD0000] hover:bg-red-700 text-white font-bold rounded-[2px]"
                  >
                    {isPending ? 'Borrando...' : 'Sí, borrar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* Footer Buttons Exactos a Figma PEDIDO.png */}
        <div className="flex justify-between items-center pt-4 border-t border-[#D9D9D9] mt-4">
          <div>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isPending || !order}
              className="px-4 py-2 bg-[#DD0000] hover:bg-[#b80000] text-white font-bold text-xs rounded-[2px] transition-colors cursor-pointer"
            >
              Borrar pedido
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2 bg-[#0E50A0]/10 hover:bg-[#0E50A0]/20 text-[#0E50A0] font-bold text-xs rounded-[2px] transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending || !order}
              className="px-5 py-2 bg-[#0E50A0] hover:bg-[#0c4386] text-white font-bold text-xs rounded-[2px] transition-colors cursor-pointer"
            >
              {isPending ? 'Guardando...' : 'Guardar'}
            </button>
            <button
              type="button"
              disabled
              title="Disponible en Fase 12 — RTO"
              className="px-5 py-2 bg-[#008102] text-white font-bold text-xs rounded-[2px] opacity-70 cursor-not-allowed"
            >
              Generar Remito
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
