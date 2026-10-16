'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { X, Plus, Trash2, AlertCircle } from 'lucide-react';
import { createOrderAction, getOrderFormDataAction } from '@/actions/order.actions';
import type { OrderCustomerOptionDTO, OrderProductOptionDTO } from '@/actions/order.dto';
import type { CustomerSource } from '@/database/domain-types';
import { Decimal, toWholePesos, toKgPrecision } from '@/domain/decimal';
import { formatArs, formatKg } from '@/lib/format';

interface NuevoPedidoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (orderId: string, code: string) => void;
}

interface DraftLine {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  weightKg: Decimal;
  requestedQuantity: number;
  agQuantity: number | null;
  unitPriceArs: Decimal;
}

export const NuevoPedidoModal: React.FC<NuevoPedidoModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [isPending, startTransition] = useTransition();
  const [loadingData, setLoadingData] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Data catalogs
  const [customers, setCustomers] = useState<OrderCustomerOptionDTO[]>([]);
  const [products, setProducts] = useState<OrderProductOptionDTO[]>([]);

  // Form Header State
  const [customerSource, setCustomerSource] = useState<CustomerSource>('REGISTERED_CUSTOMER');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [manualDiscount, setManualDiscount] = useState('');
  const [packageCount, setPackageCount] = useState('');

  // Manual Destination Fields (for Consumidor Final)
  const [recipientName, setRecipientName] = useState('');
  const [address, setAddress] = useState('');
  const [locality, setLocality] = useState('');
  const [province, setProvince] = useState('');
  const [phone, setPhone] = useState('');
  const [transportName, setTransportName] = useState('');
  const [transportAddress, setTransportAddress] = useState('');

  // Lines
  const [lines, setLines] = useState<DraftLine[]>([]);

  // Line Builder State
  const [builderProductId, setBuilderProductId] = useState('');
  const [builderQuantity, setBuilderQuantity] = useState('1');
  const [builderAgQuantity, setBuilderAgQuantity] = useState('');

  // Load catalogs on open
  useEffect(() => {
    if (isOpen) {
      setErrorMsg('');
      setLoadingData(true);
      getOrderFormDataAction().then((res) => {
        setLoadingData(false);
        if (res.success && res.data) {
          setCustomers(res.data.customers);
          setProducts(res.data.products);
          if (res.data.customers.length > 0 && !selectedCustomerId) {
            setSelectedCustomerId(res.data.customers[0].id);
          }
        } else {
          setErrorMsg(res.error || 'Error cargando datos para pedido.');
        }
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Selected customer
  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId) || null;

  // Resolve current active price for a product based on source
  const getProductPrice = (p: OrderProductOptionDTO): Decimal | null => {
    let pStr: string | null = null;
    if (customerSource === 'REGISTERED_CUSTOMER') pStr = p.salonPrice;
    else if (customerSource === 'MERCADO_LIBRE') pStr = p.ecommercePrice;
    else if (customerSource === 'CONSUMER_FINAL') pStr = p.publicPrice;

    if (!pStr) return null;
    const d = new Decimal(pStr);
    return d.gt(0) ? d : null;
  };

  // Builder current preview
  const builderProduct = products.find((p) => p.productId === builderProductId) || null;
  const builderUnitPrice = builderProduct ? getProductPrice(builderProduct) : null;
  const builderQtyNum = parseInt(builderQuantity, 10) || 0;
  const builderTotalPrice = builderUnitPrice && builderQtyNum > 0 ? builderUnitPrice.times(builderQtyNum) : null;

  // Add line handler
  const handleAddLine = () => {
    setErrorMsg('');
    if (!builderProduct) {
      setErrorMsg('Seleccione un producto.');
      return;
    }
    if (!builderUnitPrice) {
      const listName =
        customerSource === 'REGISTERED_CUSTOMER' ? 'Salón' : customerSource === 'MERCADO_LIBRE' ? 'Ecommerce' : 'Público';
      setErrorMsg(`El producto ${builderProduct.name} no posee precio vigente en la Lista ${listName}.`);
      return;
    }
    if (builderQtyNum <= 0) {
      setErrorMsg('La cantidad solicitada debe ser mayor a 0.');
      return;
    }

    const agNum = builderAgQuantity.trim() !== '' ? parseInt(builderAgQuantity, 10) : null;
    if (agNum !== null && agNum < 0) {
      setErrorMsg('La cantidad AG no puede ser negativa.');
      return;
    }

    // Check if already in lines
    const existingIndex = lines.findIndex((l) => l.productId === builderProduct.productId);
    if (existingIndex >= 0) {
      const updated = [...lines];
      updated[existingIndex].requestedQuantity += builderQtyNum;
      if (agNum !== null) updated[existingIndex].agQuantity = agNum;
      setLines(updated);
    } else {
      setLines([
        ...lines,
        {
          id: `draft_${Date.now()}_${Math.random()}`,
          productId: builderProduct.productId,
          productCode: builderProduct.code,
          productName: builderProduct.name,
          weightKg: new Decimal(builderProduct.weightKg || 0),
          requestedQuantity: builderQtyNum,
          agQuantity: agNum,
          unitPriceArs: builderUnitPrice,
        },
      ]);
    }

    // Reset builder
    setBuilderProductId('');
    setBuilderQuantity('1');
    setBuilderAgQuantity('');
  };

  const handleRemoveLine = (id: string) => {
    setLines(lines.filter((l) => l.id !== id));
  };

  const handleUpdateLineAg = (id: string, valStr: string) => {
    const val = valStr.trim() === '' ? null : parseInt(valStr, 10);
    setLines(lines.map((l) => (l.id === id ? { ...l, agQuantity: isNaN(val as any) ? null : val } : l)));
  };

  // Calculate live totals
  let subtotal = new Decimal(0);
  let totalWeight = new Decimal(0);
  for (const l of lines) {
    subtotal = subtotal.plus(l.unitPriceArs.times(l.requestedQuantity));
    totalWeight = totalWeight.plus(l.weightKg.times(l.requestedQuantity));
  }

  // Calculate discounts
  const discountSteps: Array<{ position: number; percent: Decimal; amount: Decimal }> = [];
  let running = subtotal;

  if (customerSource === 'REGISTERED_CUSTOMER' && selectedCustomer) {
    const d1 = new Decimal(selectedCustomer.discount1 || 0);
    const d2 = new Decimal(selectedCustomer.discount2 || 0);
    const d3 = new Decimal(selectedCustomer.discount3 || 0);

    if (d1.gt(0)) {
      const amt = running.times(d1.div(100));
      discountSteps.push({ position: 1, percent: d1, amount: amt });
      running = running.minus(amt);
    }
    if (d2.gt(0)) {
      const amt = running.times(d2.div(100));
      discountSteps.push({ position: 2, percent: d2, amount: amt });
      running = running.minus(amt);
    }
    if (d3.gt(0)) {
      const amt = running.times(d3.div(100));
      discountSteps.push({ position: 3, percent: d3, amount: amt });
      running = running.minus(amt);
    }
  } else if (manualDiscount.trim() !== '') {
    const md = new Decimal(manualDiscount);
    if (md.gt(0) && md.lte(100)) {
      const amt = running.times(md.div(100));
      discountSteps.push({ position: 1, percent: md, amount: amt });
      running = running.minus(amt);
    }
  }

  const totalPedido = toWholePesos(running);
  const priorBalance =
    customerSource === 'REGISTERED_CUSTOMER' && selectedCustomer
      ? new Decimal(selectedCustomer.balanceArs || 0)
      : new Decimal(0);
  const totalToCollect = totalPedido.plus(priorBalance);

  // Submit Handler
  const handleSubmit = () => {
    setErrorMsg('');
    if (lines.length === 0) {
      setErrorMsg('Debe agregar al menos un producto al pedido.');
      return;
    }
    if (customerSource === 'REGISTERED_CUSTOMER' && !selectedCustomerId) {
      setErrorMsg('Debe seleccionar un cliente registrado.');
      return;
    }

    const payload = {
      customerSource,
      customerId: customerSource === 'REGISTERED_CUSTOMER' ? selectedCustomerId : null,
      recipientName: customerSource === 'CONSUMER_FINAL' ? recipientName : null,
      address: customerSource === 'CONSUMER_FINAL' ? address : null,
      locality: customerSource === 'CONSUMER_FINAL' ? locality : null,
      province: customerSource === 'CONSUMER_FINAL' ? province : null,
      phone: customerSource === 'CONSUMER_FINAL' ? phone : null,
      transportName: customerSource === 'CONSUMER_FINAL' ? transportName : null,
      transportAddress: customerSource === 'CONSUMER_FINAL' ? transportAddress : null,
      packageCount: packageCount.trim() !== '' ? parseInt(packageCount, 10) : null,
      manualDiscountPercent:
        customerSource !== 'REGISTERED_CUSTOMER' && manualDiscount.trim() !== ''
          ? parseFloat(manualDiscount)
          : null,
      items: lines.map((l) => ({
        productId: l.productId,
        requestedQuantity: l.requestedQuantity,
        agQuantity: l.agQuantity,
      })),
    };

    startTransition(async () => {
      const res = await createOrderAction(payload);
      if (res.success && res.data) {
        if (onSuccess) onSuccess(res.data.id, res.data.code);
        onClose();
      } else {
        setErrorMsg(res.error || 'Error al registrar pedido.');
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-[10px] border border-steffen-border w-full max-w-4xl p-6 relative my-8 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center pb-3 border-b border-steffen-border">
          <h2 className="text-xl font-bold tracking-tight text-black">NUEVO PEDIDO</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-black transition-colors"
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

        <div className="overflow-y-auto flex-1 pr-1 space-y-5 mt-4">
          {/* Fila superior: Cod | Fecha | Origen & Cliente */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center bg-steffen-bg p-3 rounded-[5px] border border-steffen-border">
            <div>
              <span className="text-xs font-bold text-gray-500 block">Cod</span>
              <span className="text-sm font-semibold text-black">Automático (PEDxxxx)</span>
            </div>
            <div>
              <span className="text-xs font-bold text-gray-500 block">Fecha</span>
              <span className="text-sm font-semibold text-black">Automático (Hoy)</span>
            </div>
            <div>
              <span className="text-xs font-bold text-black block mb-1">Origen / Cliente</span>
              <select
                value={
                  customerSource === 'REGISTERED_CUSTOMER'
                    ? `cli_${selectedCustomerId}`
                    : customerSource
                }
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'MERCADO_LIBRE') {
                    setCustomerSource('MERCADO_LIBRE');
                    setSelectedCustomerId('');
                  } else if (val === 'CONSUMER_FINAL') {
                    setCustomerSource('CONSUMER_FINAL');
                    setSelectedCustomerId('');
                  } else if (val.startsWith('cli_')) {
                    setCustomerSource('REGISTERED_CUSTOMER');
                    setSelectedCustomerId(val.replace('cli_', ''));
                  }
                }}
                className="w-full text-xs p-1.5 border border-steffen-border rounded-[5px] bg-white focus:outline-none focus:border-steffen-gold"
              >
                <optgroup label="Cliente Registrado (Lista Salón)">
                  {customers.map((c) => (
                    <option key={c.id} value={`cli_${c.id}`}>
                      {c.code} - {c.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Canales Especiales">
                  <option value="MERCADO_LIBRE">Mercado Libre (Lista Ecommerce)</option>
                  <option value="CONSUMER_FINAL">Consumidor Final (Lista Público)</option>
                </optgroup>
              </select>
            </div>
          </div>

          {/* Info del Cliente Registrado */}
          {customerSource === 'REGISTERED_CUSTOMER' && selectedCustomer && (
            <div className="flex flex-wrap items-center justify-between text-xs p-2.5 bg-blue-50/50 border border-blue-200 rounded-[5px]">
              <div>
                <span className="font-bold text-gray-700">Lista asignada:</span> Lista Salón
                <span className="mx-2 text-gray-300">|</span>
                <span className="font-bold text-gray-700">Descuentos de ficha:</span>{' '}
                {[selectedCustomer.discount1, selectedCustomer.discount2, selectedCustomer.discount3]
                  .filter((d) => d && parseFloat(d) > 0)
                  .map((d) => `${d}%`)
                  .join(' + ') || '0%'}
              </div>
              <div>
                <span className="font-bold text-gray-700">Saldo actual deudor:</span>{' '}
                <span className={parseFloat(selectedCustomer.balanceArs) > 0 ? 'text-steffen-blue font-bold' : 'text-gray-600'}>
                  {selectedCustomer.formattedBalance}
                </span>
              </div>
            </div>
          )}

          {/* Campos manuales para Consumidor Final */}
          {customerSource === 'CONSUMER_FINAL' && (
            <div className="p-3 bg-steffen-bg border border-steffen-border rounded-[5px] space-y-3">
              <span className="text-xs font-bold text-black uppercase block">Datos de Consumidor Final</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <div>
                  <label className="block text-gray-600 font-medium mb-0.5">Nombre / Destinatario</label>
                  <input
                    type="text"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    placeholder="Ej: Juan Pérez"
                    className="w-full p-1.5 border border-steffen-border rounded-[5px] bg-white focus:outline-none focus:border-steffen-gold"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 font-medium mb-0.5">Teléfono</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Ej: 11-4455-6677"
                    className="w-full p-1.5 border border-steffen-border rounded-[5px] bg-white focus:outline-none focus:border-steffen-gold"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 font-medium mb-0.5">Transporte</label>
                  <input
                    type="text"
                    value={transportName}
                    onChange={(e) => setTransportName(e.target.value)}
                    placeholder="Ej: Expreso San José"
                    className="w-full p-1.5 border border-steffen-border rounded-[5px] bg-white focus:outline-none focus:border-steffen-gold"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 font-medium mb-0.5">Domicilio</label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Ej: Av. San Martín 1234"
                    className="w-full p-1.5 border border-steffen-border rounded-[5px] bg-white focus:outline-none focus:border-steffen-gold"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 font-medium mb-0.5">Localidad</label>
                  <input
                    type="text"
                    value={locality}
                    onChange={(e) => setLocality(e.target.value)}
                    placeholder="Ej: Morón"
                    className="w-full p-1.5 border border-steffen-border rounded-[5px] bg-white focus:outline-none focus:border-steffen-gold"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 font-medium mb-0.5">Provincia</label>
                  <input
                    type="text"
                    value={province}
                    onChange={(e) => setProvince(e.target.value)}
                    placeholder="Ej: Buenos Aires"
                    className="w-full p-1.5 border border-steffen-border rounded-[5px] bg-white focus:outline-none focus:border-steffen-gold"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Descuento manual y Cant. Bultos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {customerSource !== 'REGISTERED_CUSTOMER' && (
              <div>
                <label className="text-xs font-bold text-black block mb-1">
                  Descuento Manual Excepcional (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={manualDiscount}
                  onChange={(e) => setManualDiscount(e.target.value)}
                  placeholder="0"
                  className="w-full text-xs p-1.5 border border-steffen-border rounded-[5px] bg-white focus:outline-none focus:border-steffen-gold"
                />
              </div>
            )}
            <div>
              <label className="text-xs font-bold text-black block mb-1">Cant. Bultos (opcional)</label>
              <input
                type="number"
                min="0"
                step="1"
                value={packageCount}
                onChange={(e) => setPackageCount(e.target.value)}
                placeholder="Cantidad de bultos"
                className="w-full text-xs p-1.5 border border-steffen-border rounded-[5px] bg-white focus:outline-none focus:border-steffen-gold"
              />
            </div>
          </div>

          {/* Constructor de Renglón (Figma NUEVO-PEDIDO.png) */}
          <div className="border border-steffen-border p-3 rounded-[5px] space-y-3">
            <span className="text-xs font-bold text-black uppercase tracking-wider block">Agregar Producto al Pedido</span>
            <div className="flex flex-wrap items-end gap-3 text-xs">
              <div className="w-20">
                <label className="block text-gray-600 font-medium mb-1">Cant.</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={builderQuantity}
                  onChange={(e) => setBuilderQuantity(e.target.value)}
                  className="w-full p-1.5 border border-steffen-border rounded-[5px] bg-white text-center font-bold focus:outline-none focus:border-steffen-gold"
                />
              </div>

              <div className="flex-1 min-w-[150px]">
                <label className="block text-gray-600 font-medium mb-1">Producto Final</label>
                <select
                  value={builderProductId}
                  onChange={(e) => setBuilderProductId(e.target.value)}
                  className="w-full p-1.5 border border-steffen-border rounded-[5px] bg-white focus:outline-none focus:border-steffen-gold"
                >
                  <option value="">Seleccionar producto...</option>
                  {products.map((p) => {
                    const price = getProductPrice(p);
                    const priceLabel = price ? formatArs(price) : 'Sin precio';
                    return (
                      <option key={p.productId} value={p.productId}>
                        {p.code} - {p.name} ({priceLabel})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="w-28 text-right">
                <span className="block text-gray-500 font-medium mb-1 text-[11px]">Precio unitario</span>
                <span className="block font-bold text-black py-1.5">
                  {builderUnitPrice ? formatArs(builderUnitPrice) : 'Automático'}
                </span>
              </div>

              <div className="w-28 text-right">
                <span className="block text-gray-500 font-medium mb-1 text-[11px]">Precio total</span>
                <span className="block font-bold text-black py-1.5">
                  {builderTotalPrice ? formatArs(builderTotalPrice) : 'Automático'}
                </span>
              </div>

              <div className="w-20">
                <label className="block text-gray-600 font-medium mb-1">AG (previsto)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={builderAgQuantity}
                  onChange={(e) => setBuilderAgQuantity(e.target.value)}
                  placeholder="AG"
                  className="w-full p-1.5 border border-steffen-border rounded-[5px] bg-white text-center focus:outline-none focus:border-steffen-gold"
                />
              </div>

              <button
                type="button"
                onClick={handleAddLine}
                className="h-[24px] px-3 bg-black hover:bg-gray-800 text-steffen-gold font-bold rounded-[5px] flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Agregar producto</span>
              </button>
            </div>
          </div>

          {/* Tabla de Renglones Cargados */}
          {lines.length > 0 && (
            <div className="border border-steffen-border rounded-[5px] overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-steffen-gray text-black font-bold uppercase text-[11px]">
                  <tr>
                    <th className="py-2 px-3 w-16 text-center">Cant.</th>
                    <th className="py-2 px-3">Producto</th>
                    <th className="py-2 px-3 text-right">PU</th>
                    <th className="py-2 px-3 text-right">PT</th>
                    <th className="py-2 px-3 w-20 text-center">AG</th>
                    <th className="py-2 px-3 w-12 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-steffen-border">
                  {lines.map((l) => {
                    const linePt = l.unitPriceArs.times(l.requestedQuantity);
                    return (
                      <tr key={l.id} className="hover:bg-gray-50">
                        <td className="py-2 px-3 text-center font-bold text-black">{l.requestedQuantity}</td>
                        <td className="py-2 px-3 font-semibold text-black">
                          {l.productCode} - {l.productName}
                        </td>
                        <td className="py-2 px-3 text-right font-medium text-black">{formatArs(l.unitPriceArs)}</td>
                        <td className="py-2 px-3 text-right font-bold text-black">{formatArs(linePt)}</td>
                        <td className="py-1 px-3 text-center">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={l.agQuantity !== null ? l.agQuantity : ''}
                            onChange={(e) => handleUpdateLineAg(l.id, e.target.value)}
                            placeholder={String(l.requestedQuantity)}
                            className="w-16 p-1 border border-steffen-border rounded-[5px] text-center text-xs focus:outline-none focus:border-steffen-gold"
                          />
                        </td>
                        <td className="py-2 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(l.id)}
                            className="text-red-500 hover:text-red-700 transition-colors p-1"
                            title="Quitar producto"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Bloque de Totales alineado a la derecha según Figma PEDIDO.png */}
          <div className="flex flex-col items-end pt-2 border-t border-steffen-border space-y-1 text-xs">
            <div className="flex justify-between w-64">
              <span className="font-bold text-gray-700 uppercase">SUBTOTAL</span>
              <span className="font-bold text-black">{formatArs(subtotal)}</span>
            </div>

            {discountSteps.map((ds) => (
              <div key={ds.position} className="flex justify-between w-64 text-red-600">
                <span className="font-bold uppercase">DESCUENTO {ds.percent.toString()}%</span>
                <span>- {formatArs(ds.amount)}</span>
              </div>
            ))}

            <div className="flex justify-between w-64 pt-1 border-t border-gray-200">
              <span className="font-extrabold text-black uppercase">TOTAL PEDIDO</span>
              <span className="font-extrabold text-black text-sm">{formatArs(totalPedido)}</span>
            </div>

            {customerSource === 'REGISTERED_CUSTOMER' && (
              <div className="flex justify-between w-64">
                <span className="font-bold text-gray-600 uppercase">SALDO ANTERIOR</span>
                <span className={priorBalance.gt(0) ? 'font-bold text-steffen-blue' : 'text-gray-600'}>
                  {formatArs(priorBalance)}
                </span>
              </div>
            )}

            <div className="flex justify-between w-64 pt-1 border-t border-gray-300">
              <span className="font-extrabold text-black uppercase">TOTAL A COBRAR</span>
              <span className="font-extrabold text-steffen-blue text-sm">{formatArs(totalToCollect)}</span>
            </div>

            <div className="text-[11px] text-gray-500 pt-1">
              Peso total estimado: <span className="font-bold text-black">{formatKg(toKgPrecision(totalWeight))} kg</span>
            </div>
          </div>
        </div>

        {/* Botones inferiores */}
        <div className="flex justify-end gap-3 pt-4 border-t border-steffen-border mt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="px-5 py-2 bg-steffen-red hover:bg-steffen-red-hover text-white font-bold text-xs rounded-[5px] transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending || loadingData}
            className="px-6 py-2 bg-steffen-blue hover:bg-steffen-blue-hover text-white font-bold text-xs rounded-[5px] transition-colors cursor-pointer flex items-center gap-2"
          >
            {isPending ? 'Registrando...' : 'Registrar pedido'}
          </button>
        </div>
      </div>
    </div>
  );
};
