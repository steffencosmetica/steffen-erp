'use client';

import React, { useState, useTransition } from 'react';
import { X, AlertCircle, Loader2 } from 'lucide-react';
import { registerWithdrawalAction } from '@/actions/patrimony.actions';
import { normalizePositiveAmountInput } from '@/lib/amount-input';

interface RetiroCajaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const RetiroCajaModal: React.FC<RetiroCajaModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [businessDate, setBusinessDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [description, setDescription] = useState<string>('');
  const [amountInput, setAmountInput] = useState<string>('');

  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!description.trim()) {
      setErrorMsg('El motivo / concepto del retiro es obligatorio.');
      return;
    }

    // String decimal exacto (es-AR: "1.250,50" → "1250.50"); nunca Number.
    const amountArs = normalizePositiveAmountInput(amountInput);
    if (!amountArs) {
      setErrorMsg('El importe del retiro debe ser mayor a cero.');
      return;
    }

    startTransition(async () => {
      const res = await registerWithdrawalAction({
        amountArs,
        description: description.trim(),
        businessDate,
      });

      if (!res.success) {
        setErrorMsg(res.error || 'Error registrando retiro de caja');
      } else {
        onSuccess();
        onClose();
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="bg-white border border-steffen-border rounded-[10px] w-full max-w-md shadow-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black">
          <h2 className="text-base font-bold text-black uppercase tracking-wider">
            RETIRO DE CAJA
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
            <div className="p-3 bg-red-50 border border-steffen-red text-steffen-red rounded-[5px] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Fecha */}
          <div className="space-y-1.5">
            <label className="font-bold text-gray-800 uppercase text-[11px]">Fecha</label>
            <input
              type="date"
              value={businessDate}
              onChange={(e) => setBusinessDate(e.target.value)}
              disabled={isPending}
              required
              className="w-full h-9 px-3 border border-steffen-border rounded-[10px] text-black focus:outline-none focus:border-steffen-red"
            />
          </div>

          {/* Motivo / Descripción */}
          <div className="space-y-1.5">
            <label className="font-bold text-gray-800 uppercase text-[11px]">
              Motivo / Destino del Retiro
            </label>
            <input
              type="text"
              placeholder="Ej: Retiro titular, gastos particulares..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isPending}
              required
              className="w-full h-9 px-3 border border-steffen-border rounded-[10px] text-black focus:outline-none focus:border-steffen-red"
            />
          </div>

          {/* Importe */}
          <div className="space-y-1.5">
            <label className="font-bold text-gray-800 uppercase text-[11px]">Importe (ARS)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-gray-500">$</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                disabled={isPending}
                required
                className="w-full h-9 pl-8 pr-3 border border-steffen-border rounded-[10px] font-bold text-right text-black focus:outline-none focus:border-steffen-red"
              />
            </div>
            <p className="text-[10px] text-gray-400">
              Descuenta directamente de Caja Steffen. Se permite saldo negativo en caja. No afecta stock.
            </p>
          </div>

          {/* Botones de acción */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="h-9 px-4 border border-steffen-border rounded-[10px] font-bold text-gray-700 hover:bg-gray-100 transition-colors uppercase tracking-wider"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="h-9 px-5 bg-steffen-red hover:bg-steffen-red-hover text-white rounded-[10px] font-bold transition-colors uppercase tracking-wider flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>REGISTRAR RETIRO</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
