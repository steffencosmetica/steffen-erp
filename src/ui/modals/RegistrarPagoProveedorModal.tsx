'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { X, AlertCircle, Loader2 } from 'lucide-react';
import {
  registerSupplierPaymentAction,
  getSupplierPaymentOptionsAction,
} from '@/actions/patrimony.actions';
import type { AccountPaymentOptionDTO } from '@/actions/patrimony.dto';
import { formatArsInteger } from '@/actions/administracion.dto';

interface RegistrarPagoProveedorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialSupplierId?: string;
  suppliers?: AccountPaymentOptionDTO[];
}

export const RegistrarPagoProveedorModal: React.FC<RegistrarPagoProveedorModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialSupplierId,
  suppliers: initialSuppliersList,
}) => {
  const [supplierOptions, setSupplierOptions] = useState<AccountPaymentOptionDTO[]>(
    initialSuppliersList || []
  );
  const [loadingSuppliers, setLoadingSuppliers] = useState<boolean>(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(initialSupplierId || '');
  const [businessDate, setBusinessDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [amountInput, setAmountInput] = useState<string>('');

  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Cargar proveedores al abrir si no fueron pasados
  useEffect(() => {
    if (!isOpen) return;

    if (!initialSuppliersList || initialSuppliersList.length === 0) {
      setLoadingSuppliers(true);
      getSupplierPaymentOptionsAction()
        .then((res) => {
          if (res.success && res.data) {
            const withDebtOnly = res.data.filter((s) => parseFloat(s.balanceArs) > 0);
            setSupplierOptions(withDebtOnly);
            if (initialSupplierId) {
              const matched = withDebtOnly.find((s) => s.id === initialSupplierId);
              if (matched) {
                setSelectedSupplierId(matched.id);
              } else {
                setSelectedSupplierId('');
                setErrorMsg('El proveedor seleccionado no posee deuda pendiente.');
              }
            } else if (withDebtOnly.length > 0) {
              setSelectedSupplierId(withDebtOnly[0].id);
            }
          }
        })
        .finally(() => setLoadingSuppliers(false));
    } else {
      const withDebtOnly = initialSuppliersList.filter((s) => parseFloat(s.balanceArs) > 0);
      setSupplierOptions(withDebtOnly);
      if (initialSupplierId) {
        const matched = withDebtOnly.find((s) => s.id === initialSupplierId);
        if (matched) {
          setSelectedSupplierId(matched.id);
        } else {
          setSelectedSupplierId('');
          setErrorMsg('El proveedor seleccionado no posee deuda pendiente.');
        }
      } else if (withDebtOnly.length > 0) {
        setSelectedSupplierId(withDebtOnly[0].id);
      }
    }
  }, [isOpen, initialSupplierId, initialSuppliersList]);

  if (!isOpen) return null;

  // Normativa: selector muestra ÚNICAMENTE proveedores con deuda > 0
  const visibleOptions = supplierOptions.filter((s) => parseFloat(s.balanceArs) > 0);
  const selectedSupplier = visibleOptions.find((s) => s.id === selectedSupplierId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!selectedSupplierId || !selectedSupplier || parseFloat(selectedSupplier.balanceArs) <= 0) {
      setErrorMsg('Debe seleccionar un proveedor con deuda pendiente mayor a cero.');
      return;
    }

    const numAmount = parseFloat(amountInput.replace(/\./g, '').replace(',', '.'));
    if (isNaN(numAmount) || numAmount <= 0) {
      setErrorMsg('El importe del pago debe ser mayor a cero.');
      return;
    }

    const currentDebt = parseFloat(selectedSupplier.balanceArs);
    if (numAmount > currentDebt) {
      setErrorMsg('El importe no puede superar la deuda actual del proveedor.');
      return;
    }

    startTransition(async () => {
      const res = await registerSupplierPaymentAction({
        supplierId: selectedSupplierId,
        amountArs: numAmount,
        businessDate,
      });

      if (!res.success) {
        setErrorMsg(res.error || 'Error registrando pago');
      } else {
        onSuccess();
        onClose();
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="bg-white border border-[#D9D9D9] rounded-[5px] w-full max-w-md shadow-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black">
          <h2 className="text-base font-bold text-black uppercase tracking-wider">
            REGISTRAR PAGO PROVEEDOR
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-black transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4 text-xs">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-[#DD0000] text-[#DD0000] rounded-[3px] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Selector Proveedor */}
          <div className="space-y-1.5">
            <label className="font-bold text-gray-800 uppercase text-[11px] block">Proveedor</label>
            <select
              value={selectedSupplierId}
              onChange={(e) => setSelectedSupplierId(e.target.value)}
              disabled={loadingSuppliers || isPending}
              required
              className="w-full h-9 px-3 border border-[#D9D9D9] rounded-[5px] bg-white text-black font-medium focus:outline-none focus:border-[#008102]"
            >
              {visibleOptions.length === 0 ? (
                <option value="">No hay proveedores con deuda pendiente</option>
              ) : (
                visibleOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} | DEUDA: {formatArsInteger(s.balanceArs)}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Deuda Actual informativa */}
          {selectedSupplier && (
            <div className="p-2.5 bg-gray-50 border border-gray-200 rounded-[5px] flex items-center justify-between text-xs">
              <span className="text-gray-600 font-medium">Deuda actual con el proveedor:</span>
              <span
                className={`font-mono font-bold ${
                  selectedSupplier.hasDebt ? 'text-[#DD0000]' : 'text-gray-700'
                }`}
              >
                {formatArsInteger(selectedSupplier.balanceArs)}
              </span>
            </div>
          )}

          {/* Fecha */}
          <div className="space-y-1.5">
            <label className="font-bold text-gray-800 uppercase text-[11px]">Fecha de Pago</label>
            <input
              type="date"
              value={businessDate}
              onChange={(e) => setBusinessDate(e.target.value)}
              disabled={isPending}
              required
              className="w-full h-9 px-3 border border-[#D9D9D9] rounded-[5px] text-black focus:outline-none focus:border-[#008102]"
            />
          </div>

          {/* Importe */}
          <div className="space-y-1.5">
            <label className="font-bold text-gray-800 uppercase text-[11px]">Importe (ARS)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-gray-500">$</span>
              <input
                type="number"
                step="any"
                min="0.01"
                max={selectedSupplier ? parseFloat(selectedSupplier.balanceArs) : undefined}
                placeholder="0"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                disabled={isPending}
                required
                className="w-full h-9 pl-8 pr-3 border border-[#D9D9D9] rounded-[5px] font-mono font-bold text-right text-black focus:outline-none focus:border-[#008102]"
              />
            </div>
            <p className="text-[10px] text-gray-400">
              Permite pagos parciales o cancelación total de la deuda. No se permite sobrepago. Descuenta de Caja Steffen.
            </p>
          </div>

          {/* Botones de acción */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="h-9 px-4 border border-[#D9D9D9] rounded-[5px] font-bold text-gray-700 hover:bg-gray-100 transition-colors uppercase tracking-wider"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending || !selectedSupplierId}
              className="h-9 px-5 bg-[#008102] hover:bg-[#007002] text-white rounded-[5px] font-bold transition-colors uppercase tracking-wider flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>REGISTRAR PAGO</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
