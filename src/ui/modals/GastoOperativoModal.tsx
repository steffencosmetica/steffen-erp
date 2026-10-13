'use client';

import React, { useState, useTransition } from 'react';
import { X, AlertCircle, Loader2 } from 'lucide-react';
import { registerOperatingExpenseAction } from '@/actions/patrimony.actions';
import type { ExpenseType } from '@/database/domain-types';

interface GastoOperativoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const GastoOperativoModal: React.FC<GastoOperativoModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [expenseType, setExpenseType] = useState<ExpenseType>('LUZ');
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

    if (expenseType === 'OTRO' && !description.trim()) {
      setErrorMsg('La descripción es obligatoria cuando el tipo de gasto es OTRO.');
      return;
    }

    const numAmount = parseFloat(amountInput.replace(/\./g, '').replace(',', '.'));
    if (isNaN(numAmount) || numAmount <= 0) {
      setErrorMsg('El importe del gasto debe ser mayor a cero.');
      return;
    }

    startTransition(async () => {
      const res = await registerOperatingExpenseAction({
        expenseType,
        description: description.trim(),
        amountArs: numAmount,
        businessDate,
      });

      if (!res.success) {
        setErrorMsg(res.error || 'Error registrando gasto operativo');
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
            REGISTRAR GASTO OPERATIVO
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

          {/* Tipo de Gasto */}
          <div className="space-y-1.5">
            <label className="font-bold text-gray-800 uppercase text-[11px]">Tipo de Gasto</label>
            <select
              value={expenseType}
              onChange={(e) => setExpenseType(e.target.value as ExpenseType)}
              disabled={isPending}
              required
              className="w-full h-9 px-3 border border-[#D9D9D9] rounded-[5px] bg-white text-black font-semibold focus:outline-none focus:border-[#0E50A0]"
            >
              <option value="LUZ">LUZ</option>
              <option value="ALQUILER">ALQUILER</option>
              <option value="COMISIÓN">COMISIÓN</option>
              <option value="OTRO">OTRO</option>
            </select>
          </div>

          {/* Fecha */}
          <div className="space-y-1.5">
            <label className="font-bold text-gray-800 uppercase text-[11px]">Fecha</label>
            <input
              type="date"
              value={businessDate}
              onChange={(e) => setBusinessDate(e.target.value)}
              disabled={isPending}
              required
              className="w-full h-9 px-3 border border-[#D9D9D9] rounded-[5px] text-black focus:outline-none focus:border-[#0E50A0]"
            />
          </div>

          {/* Descripción */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="font-bold text-gray-800 uppercase text-[11px]">
                Descripción {expenseType === 'OTRO' ? '(Obligatoria)' : '(Opcional)'}
              </label>
            </div>
            <input
              type="text"
              placeholder={expenseType === 'OTRO' ? 'Especifique el concepto del gasto...' : 'Detalle adicional...'}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isPending}
              required={expenseType === 'OTRO'}
              className="w-full h-9 px-3 border border-[#D9D9D9] rounded-[5px] text-black focus:outline-none focus:border-[#0E50A0]"
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
                placeholder="0"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                disabled={isPending}
                required
                className="w-full h-9 pl-8 pr-3 border border-[#D9D9D9] rounded-[5px] font-mono font-bold text-right text-black focus:outline-none focus:border-[#0E50A0]"
              />
            </div>
            <p className="text-[10px] text-gray-400">
              Descuenta de Caja Steffen y genera MOV GASTO_OPERATIVO.
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
              disabled={isPending}
              className="h-9 px-5 bg-[#0E50A0] hover:bg-[#0c4386] text-white rounded-[5px] font-bold transition-colors uppercase tracking-wider flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>REGISTRAR GASTO</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
