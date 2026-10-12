'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { X, Plus, Trash2, AlertCircle, Loader2, Sparkles } from 'lucide-react';
import {
  registerPurchaseAction,
  editPurchaseAction,
  getSupplierPurchaseCatalogAction,
} from '@/actions/purchase.actions';
import type {
  PurchaseDetailDTO,
  AvailableSupplierItemDTO,
} from '@/actions/purchase.dto';
import { AltaRapidaInsumoModal } from './AltaRapidaInsumoModal';
import type { CreatedMasterItemResultDTO } from '@/actions/master-item.actions';

export interface SupplierOption {
  id: string;
  code: string;
  name: string;
  currencyCode: 'ARS' | 'USD';
  active: boolean;
}

interface PurchaseLineForm {
  stockItemId: string;
  quantity: string;
  unitPriceNetSource: string;
  vatRatePct: string;
  unitType: 'KG' | 'UNIT';
  itemType: 'MPR' | 'COM';
}

interface RegistrarCompraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  suppliers: SupplierOption[];
  initialSupplierId?: string;
  purchaseToEdit?: PurchaseDetailDTO | null;
}

export const RegistrarCompraModal: React.FC<RegistrarCompraModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  suppliers,
  initialSupplierId,
  purchaseToEdit,
}) => {
  const isEditMode = Boolean(purchaseToEdit);

  // 1. Estados de cabecera
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [businessDate, setBusinessDate] = useState<string>(() =>
    new Date().toISOString().split('T')[0]
  );
  const [paymentMode, setPaymentMode] = useState<'PAID' | 'DEBT'>('PAID');
  const [exchangeRate, setExchangeRate] = useState<string>('');
  const [observations, setObservations] = useState<string>('');

  // 2. Catálogo de insumos disponibles para el proveedor seleccionado
  const [catalogItems, setCatalogItems] = useState<AvailableSupplierItemDTO[]>([]);
  const [supplierCurrency, setSupplierCurrency] = useState<'ARS' | 'USD'>('ARS');
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  // 3. Líneas de compra
  const [lines, setLines] = useState<PurchaseLineForm[]>([]);

  // 4. Estados de envío y error
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 5. Alta rápida de insumo desde la compra (FLOWS.md §8)
  const [isAltaRapidaOpen, setIsAltaRapidaOpen] = useState(false);
  const [targetLineIdxForAltaRapida, setTargetLineIdxForAltaRapida] = useState<number | null>(null);

  // Inicializar formulario
  useEffect(() => {
    if (!isOpen) return;

    setErrorMsg(null);

    if (purchaseToEdit) {
      // Modo Edición
      setSelectedSupplierId(purchaseToEdit.supplierId);
      setBusinessDate(purchaseToEdit.businessDate);
      setPaymentMode(purchaseToEdit.paymentMode);
      setExchangeRate(purchaseToEdit.exchangeRateUsed || '');
      setObservations(purchaseToEdit.observations || '');
      setSupplierCurrency(purchaseToEdit.currencyCodeSnapshot);

      const initialLines: PurchaseLineForm[] = purchaseToEdit.items.map((it) => ({
        stockItemId: it.stockItemId,
        quantity: it.quantity,
        unitPriceNetSource: it.unitPriceNetSource,
        vatRatePct: it.vatRatePct || '21',
        unitType: it.unitType,
        itemType: it.stockItemType,
      }));
      setLines(initialLines);
    } else {
      // Modo Nueva Compra
      const defaultSupplier = initialSupplierId
        ? suppliers.find((s) => s.id === initialSupplierId)
        : suppliers.find((s) => s.active) || suppliers[0];

      const sId = defaultSupplier ? defaultSupplier.id : '';
      setSelectedSupplierId(sId);
      setBusinessDate(new Date().toISOString().split('T')[0]);
      setPaymentMode('PAID');
      setExchangeRate('');
      setObservations('');
      setLines([]);
    }
  }, [isOpen, purchaseToEdit, initialSupplierId, suppliers]);

  // Cargar catálogo de insumos cuando cambia el proveedor
  useEffect(() => {
    if (!isOpen || !selectedSupplierId) {
      setCatalogItems([]);
      return;
    }

    let isMounted = true;
    setLoadingCatalog(true);

    getSupplierPurchaseCatalogAction(selectedSupplierId)
      .then((res) => {
        if (!isMounted) return;
        setLoadingCatalog(false);
        if (res.success && res.data) {
          setCatalogItems(res.data.items);
          setSupplierCurrency(res.data.supplierCurrency);
          if (!purchaseToEdit && res.data.supplierCurrency === 'USD') {
            setExchangeRate(res.data.currentUsdRate || '1420.00');
          }
          // Si estamos en modo nuevo y no hay líneas, agregar una vacía
          if (!purchaseToEdit && lines.length === 0 && res.data.items.length > 0) {
            const first = res.data.items[0];
            setLines([
              {
                stockItemId: first.id,
                quantity: first.unitType === 'KG' ? '1.000' : '1',
                unitPriceNetSource: first.quotedUnitPriceNet || '0.00',
                vatRatePct: '21',
                unitType: first.unitType,
                itemType: first.itemType,
              },
            ]);
          }
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setLoadingCatalog(false);
        console.error('Error cargando catálogo:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, selectedSupplierId]);

  if (!isOpen) return null;

  const currentSupplier = suppliers.find((s) => s.id === selectedSupplierId);

  // Agregar nueva línea
  const handleAddLine = () => {
    const unselectedItem = catalogItems.find(
      (cat) => !lines.some((l) => l.stockItemId === cat.id)
    ) || catalogItems[0];

    if (!unselectedItem) return;

    setLines([
      ...lines,
      {
        stockItemId: unselectedItem.id,
        quantity: unselectedItem.unitType === 'KG' ? '1.000' : '1',
        unitPriceNetSource: unselectedItem.quotedUnitPriceNet || '0.00',
        vatRatePct: '21',
        unitType: unselectedItem.unitType,
        itemType: unselectedItem.itemType,
      },
    ]);
  };

  // Eliminar línea
  const handleRemoveLine = (index: number) => {
    setLines(lines.filter((_, idx) => idx !== index));
  };

  // Modificar línea
  const handleLineChange = (index: number, field: keyof PurchaseLineForm, value: string) => {
    if (field === 'stockItemId' && value === '__NEW__') {
      setTargetLineIdxForAltaRapida(index);
      setIsAltaRapidaOpen(true);
      return;
    }

    const nextLines = [...lines];
    const target = { ...nextLines[index], [field]: value };

    if (field === 'stockItemId') {
      const selectedItem = catalogItems.find((c) => c.id === value);
      if (selectedItem) {
        target.unitType = selectedItem.unitType;
        target.itemType = selectedItem.itemType;
        if (selectedItem.quotedUnitPriceNet) {
          target.unitPriceNetSource = selectedItem.quotedUnitPriceNet;
        }
        if (selectedItem.unitType === 'KG' && !target.quantity.includes('.')) {
          target.quantity = target.quantity + '.000';
        }
      }
    }

    nextLines[index] = target;
    setLines(nextLines);
  };

  // Callback de éxito de Alta Rápida (FLOWS.md §8)
  const handleAltaRapidaSuccess = (createdItem: CreatedMasterItemResultDTO) => {
    const newItem: AvailableSupplierItemDTO = {
      id: createdItem.id,
      code: createdItem.code,
      name: createdItem.name,
      itemType: createdItem.itemType,
      unitType: createdItem.unitType,
      isAssociated: true,
      quotedUnitPriceNet: createdItem.quotedUnitPriceNet,
      priceUpdatedAt: new Date().toISOString(),
      currentStock: '0',
    };

    setCatalogItems((prev) => [newItem, ...prev.filter((c) => c.id !== newItem.id)]);

    if (
      targetLineIdxForAltaRapida !== null &&
      targetLineIdxForAltaRapida >= 0 &&
      targetLineIdxForAltaRapida < lines.length
    ) {
      const nextLines = [...lines];
      const current = nextLines[targetLineIdxForAltaRapida];
      nextLines[targetLineIdxForAltaRapida] = {
        ...current,
        stockItemId: newItem.id,
        unitType: newItem.unitType,
        itemType: newItem.itemType,
        unitPriceNetSource: newItem.quotedUnitPriceNet || '0.00',
        quantity:
          !current.quantity || current.quantity === '0'
            ? newItem.unitType === 'KG'
              ? '1.000'
              : '1'
            : current.quantity,
      };
      setLines(nextLines);
    } else {
      setLines((prev) => [
        ...prev,
        {
          stockItemId: newItem.id,
          quantity: newItem.unitType === 'KG' ? '1.000' : '1',
          unitPriceNetSource: newItem.quotedUnitPriceNet || '0.00',
          vatRatePct: '21',
          unitType: newItem.unitType,
          itemType: newItem.itemType,
        },
      ]);
    }

    setTargetLineIdxForAltaRapida(null);
  };

  const associatedItems = catalogItems.filter((c) => c.isAssociated);
  const unassociatedItems = catalogItems.filter((c) => !c.isAssociated);

  // Cálculos reactivos de subtotales
  const fxNumber = parseFloat(exchangeRate) || 1.0;
  const isUsd = supplierCurrency === 'USD';

  let totalNetSource = 0;
  let totalGrossArs = 0;

  const calculatedLines = lines.map((line) => {
    const qty = parseFloat(line.quantity) || 0;
    const netSource = parseFloat(line.unitPriceNetSource) || 0;
    const vatRate = (parseFloat(line.vatRatePct) || 21) / 100;

    const lineNetSource = qty * netSource;
    const unitGrossArs = isUsd ? netSource * fxNumber * (1 + vatRate) : netSource * (1 + vatRate);
    const lineTotalGross = qty * unitGrossArs;

    totalNetSource += lineNetSource;
    totalGrossArs += lineTotalGross;

    return {
      ...line,
      lineNetSource,
      unitGrossArs,
      lineTotalGross,
    };
  });

  const totalVatSource = totalNetSource * 0.21;
  const totalGrossSource = totalNetSource * 1.21;

  // Validación de formulario
  const validateForm = (): string | null => {
    if (!selectedSupplierId) return 'Debe seleccionar un proveedor.';
    if (lines.length === 0) return 'La compra debe tener al menos un ítem.';
    if (isUsd && (!exchangeRate || parseFloat(exchangeRate) <= 0)) {
      return 'Para proveedores en USD debe indicar una cotización válida.';
    }

    const seenItems = new Set<string>();
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.stockItemId) return `Línea #${i + 1}: Debe seleccionar un insumo.`;
      if (seenItems.has(line.stockItemId)) {
        return `Línea #${i + 1}: El insumo ya fue seleccionado en otra línea.`;
      }
      seenItems.add(line.stockItemId);

      const qty = parseFloat(line.quantity);
      if (isNaN(qty) || qty <= 0) return `Línea #${i + 1}: La cantidad debe ser mayor a 0.`;

      if (line.unitType === 'UNIT' && !Number.isInteger(qty)) {
        return `Línea #${i + 1}: Los componentes por unidad deben ser números enteros.`;
      }

      if (line.unitType === 'KG') {
        const decimals = (line.quantity.split('.')[1] || '').length;
        if (decimals > 3) {
          return `Línea #${i + 1}: La cantidad en kg admite como máximo 3 decimales.`;
        }
      }

      const price = parseFloat(line.unitPriceNetSource);
      if (isNaN(price) || price <= 0) {
        return `Línea #${i + 1}: El precio unitario neto debe ser mayor a 0.`;
      }
    }

    return null;
  };

  // Envío
  const handleSubmit = (chosenPaymentMode: 'PAID' | 'DEBT') => {
    const err = validateForm();
    if (err) {
      setErrorMsg(err);
      return;
    }

    setErrorMsg(null);

    startTransition(async () => {
      try {
        const payloadItems = lines.map((l) => ({
          stockItemId: l.stockItemId,
          quantity: l.quantity.trim(),
          unitPriceNetSource: l.unitPriceNetSource.trim(),
          vatRatePct: l.vatRatePct || '21',
        }));

        if (isEditMode && purchaseToEdit) {
          const res = await editPurchaseAction({
            purchaseId: purchaseToEdit.id,
            businessDate,
            paymentMode: chosenPaymentMode,
            exchangeRateUsed: isUsd ? exchangeRate.trim() : null,
            observations: observations.trim() || null,
            items: payloadItems,
          });

          if (!res.success) {
            setErrorMsg(res.error || 'Error al actualizar la compra.');
            return;
          }
        } else {
          const res = await registerPurchaseAction({
            supplierId: selectedSupplierId,
            businessDate,
            paymentMode: chosenPaymentMode,
            exchangeRateUsed: isUsd ? exchangeRate.trim() : null,
            observations: observations.trim() || null,
            items: payloadItems,
          });

          if (!res.success) {
            setErrorMsg(res.error || 'Error al registrar la compra.');
            return;
          }
        }

        onSuccess();
        onClose();
      } catch (e: unknown) {
        setErrorMsg(e instanceof Error ? e.message : 'Error inesperado.');
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white border border-[#D9D9D9] rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
        
        {/* Cabecera del modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#D9D9D9] bg-white">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-black uppercase tracking-wider">
              {isEditMode ? `Editar Compra ${purchaseToEdit?.code}` : 'Compra'}
            </h2>
            <span className="text-xs px-2.5 py-1 rounded bg-[#0E50A0]/10 text-[#0E50A0] font-bold">
              {isEditMode ? 'MODIFICACIÓN ATÓMICA' : 'REGISTRO DE INSUMOS'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="p-1 rounded text-gray-400 hover:text-black transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cuerpo con scroll */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs text-black">
          
          {/* Mensaje de error si existe */}
          {errorMsg && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-xs font-semibold text-[#DD0000] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Fila 1: Proveedor, Código, Fecha */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-black mb-1.5">
                Proveedor *
              </label>
              <select
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                disabled={isEditMode || isPending}
                className="w-full h-9 px-3 border border-[#D9D9D9] rounded-[2px] bg-white text-xs font-medium focus:outline-none focus:border-[#0E50A0] disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                <option value="">Seleccione un proveedor...</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} - {s.name} ({s.currencyCode}){!s.active ? ' [Inactivo]' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-black mb-1.5">
                Código
              </label>
              <input
                type="text"
                readOnly
                value={purchaseToEdit ? purchaseToEdit.code : '(Automático CMPxxxx)'}
                className="w-full h-9 px-3 border border-[#D9D9D9] rounded-[2px] bg-gray-50 text-xs font-mono text-gray-600 cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-black mb-1.5">
                Fecha *
              </label>
              <input
                type="date"
                value={businessDate}
                onChange={(e) => setBusinessDate(e.target.value)}
                disabled={isPending}
                className="w-full h-9 px-3 border border-[#D9D9D9] rounded-[2px] bg-white text-xs focus:outline-none focus:border-[#0E50A0]"
              />
            </div>
          </div>

          {/* Fila 2 (si aplica USD): Cotización de la compra */}
          {isUsd && (
            <div className="p-3.5 bg-blue-50/70 border border-[#0E50A0]/20 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-[#0E50A0]">
                  Proveedor opera en Dólares Estadounidenses (USD)
                </div>
                <div className="text-[11px] text-gray-600">
                  La cotización quedará congelada exclusivamente para esta compra (CMP) sin alterar el tipo de cambio general ni producciones históricas.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs text-black whitespace-nowrap">Cotización USD:</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="Ej: 1420.00"
                  value={exchangeRate}
                  onChange={(e) => setExchangeRate(e.target.value)}
                  disabled={isPending}
                  className="w-32 h-8 px-2.5 border border-[#D9D9D9] rounded-[2px] bg-white text-xs font-bold text-right focus:outline-none focus:border-[#0E50A0]"
                />
              </div>
            </div>
          )}

          {/* Modo edición: Selector de modalidad de pago */}
          {isEditMode && (
            <div className="p-3 bg-gray-50 border border-[#D9D9D9] rounded-xl flex items-center justify-between">
              <span className="font-bold text-xs text-black">Modalidad financiera actual:</span>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-xs">
                  <input
                    type="radio"
                    name="editPaymentMode"
                    value="PAID"
                    checked={paymentMode === 'PAID'}
                    onChange={() => setPaymentMode('PAID')}
                    disabled={isPending}
                  />
                  Paga (Caja Steffen)
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-xs">
                  <input
                    type="radio"
                    name="editPaymentMode"
                    value="DEBT"
                    checked={paymentMode === 'DEBT'}
                    onChange={() => setPaymentMode('DEBT')}
                    disabled={isPending}
                  />
                  A Deuda (Cta. Proveedor)
                </label>
              </div>
            </div>
          )}

          {/* Tabla de Renglones / Insumos */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs uppercase tracking-wider text-black">
                Renglones de la compra ({lines.length})
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTargetLineIdxForAltaRapida(null);
                    setIsAltaRapidaOpen(true);
                  }}
                  disabled={isPending || !selectedSupplierId}
                  className="px-3 py-1.5 bg-white border border-[#0E50A0] text-[#0E50A0] hover:bg-blue-50 rounded-[2px] font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  title="Alta rápida de Materia Prima o Componente con stock inicial 0"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  + Crear Insumo
                </button>
                <button
                  type="button"
                  onClick={handleAddLine}
                  disabled={isPending || loadingCatalog || catalogItems.length === 0}
                  className="px-3 py-1.5 bg-[#0E50A0] text-white rounded-[2px] font-bold text-xs flex items-center gap-1.5 hover:bg-[#0c4386] transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Agregar Ítem
                </button>
              </div>
            </div>

            {loadingCatalog ? (
              <div className="py-8 flex items-center justify-center gap-2 text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin text-[#0E50A0]" />
                <span>Cargando catálogo del proveedor...</span>
              </div>
            ) : lines.length === 0 ? (
              <div className="py-8 text-center text-gray-400 border border-dashed border-[#D9D9D9] rounded-xl">
                Haga clic en &quot;Agregar Ítem&quot; para registrar insumos adquiridos.
              </div>
            ) : (
              <div className="overflow-x-auto border border-[#D9D9D9] rounded-xl">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[#D9D9D9] text-black font-bold uppercase text-left">
                      <th className="py-2.5 px-3">INSUMO</th>
                      <th className="py-2.5 px-3 w-28">CANTIDAD</th>
                      <th className="py-2.5 px-3 w-20 text-center">MONEDA</th>
                      <th className="py-2.5 px-3 w-36 text-right">P.U NETO</th>
                      <th className="py-2.5 px-3 w-36 text-right">P.U BRUTO (ARS)</th>
                      <th className="py-2.5 px-3 w-36 text-right">TOTAL (ARS)</th>
                      <th className="py-2.5 px-2 w-10 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E5E5] bg-white">
                    {calculatedLines.map((line, idx) => (
                      <tr key={idx} className="hover:bg-gray-50/50">
                        {/* Insumo selector */}
                        <td className="py-2 px-3">
                          <select
                            value={line.stockItemId}
                            onChange={(e) => handleLineChange(idx, 'stockItemId', e.target.value)}
                            disabled={isPending}
                            className="w-full h-8 px-2 border border-[#D9D9D9] rounded-[2px] bg-white text-xs focus:outline-none focus:border-[#0E50A0]"
                          >
                            <option value="">Seleccione insumo...</option>
                            <option value="__NEW__" className="text-[#0E50A0] font-bold">
                              + Crear nuevo insumo (Alta rápida)...
                            </option>
                            {associatedItems.length > 0 && (
                              <optgroup label="★ Insumos asociados al proveedor">
                                {associatedItems.map((cat) => (
                                  <option key={cat.id} value={cat.id}>
                                    [{cat.itemType}] {cat.code} - {cat.name} ({cat.unitType}) ★
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            {unassociatedItems.length > 0 && (
                              <optgroup label="Otros insumos disponibles (no asociados)">
                                {unassociatedItems.map((cat) => (
                                  <option key={cat.id} value={cat.id}>
                                    [{cat.itemType}] {cat.code} - {cat.name} ({cat.unitType})
                                  </option>
                                ))}
                              </optgroup>
                            )}
                          </select>
                        </td>

                        {/* Cantidad */}
                        <td className="py-2 px-3">
                          <div className="relative">
                            <input
                              type="number"
                              step={line.unitType === 'KG' ? '0.001' : '1'}
                              min="0"
                              placeholder={line.unitType === 'KG' ? '0.000' : '0'}
                              value={line.quantity}
                              onChange={(e) => handleLineChange(idx, 'quantity', e.target.value)}
                              disabled={isPending}
                              className="w-full h-8 pl-2 pr-7 border border-[#D9D9D9] rounded-[2px] bg-white text-xs text-right focus:outline-none focus:border-[#0E50A0]"
                            />
                            <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 font-bold pointer-events-none">
                              {line.unitType}
                            </span>
                          </div>
                        </td>

                        {/* Moneda badge */}
                        <td className="py-2 px-3 text-center">
                          <span
                            className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                              isUsd ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'
                            }`}
                          >
                            {supplierCurrency}
                          </span>
                        </td>

                        {/* Precio unitario neto */}
                        <td className="py-2 px-3 text-right">
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 font-bold pointer-events-none">
                              {isUsd ? 'U$S' : '$'}
                            </span>
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              value={line.unitPriceNetSource}
                              onChange={(e) => handleLineChange(idx, 'unitPriceNetSource', e.target.value)}
                              disabled={isPending}
                              className="w-full h-8 pl-9 pr-2 border border-[#D9D9D9] rounded-[2px] bg-white text-xs text-right focus:outline-none focus:border-[#0E50A0]"
                            />
                          </div>
                        </td>

                        {/* Precio unitario bruto con IVA en ARS (calculado) */}
                        <td className="py-2 px-3 text-right font-mono text-gray-700">
                          $ {line.unitGrossArs.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>

                        {/* Total renglón en ARS */}
                        <td className="py-2 px-3 text-right font-bold font-mono text-black">
                          $ {line.lineTotalGross.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>

                        {/* Botón eliminar */}
                        <td className="py-2 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(idx)}
                            disabled={isPending}
                            title="Eliminar ítem"
                            className="p-1 text-gray-400 hover:text-[#DD0000] transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Resumen de totales */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-gray-50 border border-[#D9D9D9] rounded-xl text-center">
            <div>
              <div className="text-[10px] font-bold text-gray-500 uppercase">
                Subtotal Neto ({supplierCurrency})
              </div>
              <div className="text-base font-bold text-black mt-0.5">
                {isUsd ? `U$S ${totalNetSource.toFixed(2)}` : `$ ${totalNetSource.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </div>
            </div>

            <div>
              <div className="text-[10px] font-bold text-gray-500 uppercase">
                IVA (21%)
              </div>
              <div className="text-base font-bold text-gray-700 mt-0.5">
                {isUsd ? `U$S ${totalVatSource.toFixed(2)}` : `$ ${totalVatSource.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </div>
            </div>

            <div className="bg-[#0E50A0]/10 rounded-lg p-2 border border-[#0E50A0]/20">
              <div className="text-[10px] font-bold text-[#0E50A0] uppercase">
                TOTAL BRUTO (ARS)
              </div>
              <div className="text-lg font-extrabold text-[#0E50A0] mt-0.5">
                $ {totalGrossArs.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          {/* Observaciones */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-black mb-1.5">
              Observaciones
            </label>
            <textarea
              rows={2}
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              disabled={isPending}
              placeholder="Número de factura, detalles del transporte o notas del remito..."
              className="w-full p-2.5 border border-[#D9D9D9] rounded-[2px] bg-white text-xs focus:outline-none focus:border-[#0E50A0]"
            />
          </div>

        </div>

        {/* Pie de modal con botones de acción */}
        <div className="px-6 py-4 border-t border-[#D9D9D9] bg-gray-50 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="px-4 py-2 border border-[#DD0000] text-[#DD0000] hover:bg-red-50 rounded-[2px] font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>

          <div className="flex items-center gap-3">
            {isEditMode ? (
              <button
                type="button"
                onClick={() => handleSubmit(paymentMode)}
                disabled={isPending || lines.length === 0}
                className="px-5 py-2.5 bg-[#0E50A0] hover:bg-[#0c4386] text-white rounded-[2px] font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-colors cursor-pointer shadow-sm disabled:opacity-50"
              >
                {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Guardar Cambios
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => handleSubmit('DEBT')}
                  disabled={isPending || lines.length === 0}
                  className="px-5 py-2.5 bg-[#0E50A0] hover:bg-[#0c4386] text-white rounded-[2px] font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-colors cursor-pointer shadow-sm disabled:opacity-50"
                >
                  {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Registrar Deuda Proveedor
                </button>

                <button
                  type="button"
                  onClick={() => handleSubmit('PAID')}
                  disabled={isPending || lines.length === 0}
                  className="px-5 py-2.5 bg-[#0E50A0] hover:bg-[#0c4386] text-white rounded-[2px] font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-colors cursor-pointer shadow-sm disabled:opacity-50"
                >
                  {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Registrar Compra (Paga)
                </button>
              </>
            )}
          </div>
        </div>

      </div>

      {/* Submodal de Alta Rápida de Insumo (FLOWS.md §8) */}
      {isAltaRapidaOpen && currentSupplier && (
        <AltaRapidaInsumoModal
          isOpen={isAltaRapidaOpen}
          onClose={() => {
            setIsAltaRapidaOpen(false);
            setTargetLineIdxForAltaRapida(null);
          }}
          supplierId={currentSupplier.id}
          supplierName={currentSupplier.name}
          supplierCurrency={currentSupplier.currencyCode}
          onSuccess={handleAltaRapidaSuccess}
        />
      )}
    </div>
  );
};
