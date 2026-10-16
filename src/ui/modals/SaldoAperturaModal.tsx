'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { X, AlertCircle, Loader2 } from 'lucide-react';
import { ConfirmDialog } from '@/ui/components/UIComponents';
import {
  registerOpeningBalanceAction,
  editOpeningBalanceAction,
  deleteOpeningBalanceAction,
} from '@/actions/patrimony.actions';
import type { OpeningBalancePartyTypeDTO, OpeningBalanceStateDTO } from '@/actions/patrimony.dto';
import { normalizePositiveAmountInput } from '@/lib/amount-input';

interface SaldoAperturaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  partyType: OpeningBalancePartyTypeDTO;
  partyId: string;
  partyName: string;
  /** Moneda de compras del proveedor: la deuda patrimonial se registra siempre en ARS. */
  supplierCurrencyCode?: string;
  /** Apertura existente (modo edición) o null (alta). */
  opening: OpeningBalanceStateDTO['opening'];
}

/** Saldo de apertura: deuda previa al inicio operativo del ERP (no es venta ni compra). */
export const SaldoAperturaModal: React.FC<SaldoAperturaModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  partyType,
  partyId,
  partyName,
  supplierCurrencyCode,
  opening,
}) => {
  const [businessDate, setBusinessDate] = useState<string>('');
  const [amountInput, setAmountInput] = useState<string>('');
  const [observation, setObservation] = useState<string>('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    setConfirmDelete(false);
    setBusinessDate(opening?.businessDate ?? new Date().toISOString().split('T')[0]);
    setAmountInput(opening ? opening.amountArs.replace('.', ',') : '');
    setObservation(opening?.observation ?? '');
  }, [isOpen, opening]);

  if (!isOpen) return null;

  const isEdit = opening !== null;
  const partyLabel = partyType === 'CUSTOMER' ? 'Cliente' : 'Proveedor';

  const finish = (res: { success: boolean; error?: string }, fallback: string) => {
    if (!res.success) {
      setErrorMsg(res.error || fallback);
      return;
    }
    onSuccess();
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const amountArs = normalizePositiveAmountInput(amountInput);
    if (!amountArs) {
      setErrorMsg('El importe del saldo de apertura debe ser mayor a cero.');
      return;
    }
    if (!businessDate) {
      setErrorMsg('La fecha de apertura es obligatoria.');
      return;
    }

    startTransition(async () => {
      if (opening) {
        const res = await editOpeningBalanceAction(partyType, {
          openingBalanceId: opening.id,
          amountArs,
          businessDate,
          observation: observation.trim() || undefined,
        });
        finish(res, 'Error editando saldo de apertura');
      } else {
        const res = await registerOpeningBalanceAction({
          partyType,
          partyId,
          amountArs,
          businessDate,
          observation: observation.trim() || undefined,
        });
        finish(res, 'Error registrando saldo de apertura');
      }
    });
  };

  const handleDelete = () => {
    if (!opening) return;
    setConfirmDelete(false);
    setErrorMsg(null);
    startTransition(async () => {
      const res = await deleteOpeningBalanceAction(partyType, opening.id);
      finish(res, 'Error eliminando saldo de apertura');
    });
  };

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="bg-white border border-steffen-border rounded-[10px] w-full max-w-md shadow-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black">
          <h2 className="text-base font-bold text-black uppercase tracking-wider">
            {isEdit ? 'EDITAR SALDO DE APERTURA' : 'SALDO DE APERTURA'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-gray-400 hover:text-black transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4 text-xs">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-steffen-red text-steffen-red rounded-[5px] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <p className="text-sm">
            <span className="font-bold uppercase text-[11px] text-gray-800">{partyLabel}: </span>
            <span className="font-semibold">{partyName}</span>
            {isEdit && opening.movementCode && <span className="text-gray-400"> · {opening.movementCode}</span>}
          </p>

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
                className="w-full h-9 pl-8 pr-3 border border-steffen-border rounded-[10px] font-bold text-right text-black focus:outline-none focus:border-steffen-gold"
              />
            </div>
            <p className="text-[10px] text-gray-400">
              {partyType === 'CUSTOMER'
                ? 'Deuda del cliente con Steffen previa al inicio del ERP. Aumenta Deudas Clientes.'
                : 'Deuda de Steffen con el proveedor previa al inicio del ERP. Aumenta Deudas Proveedores.'}{' '}
              No es venta ni compra: no afecta caja ni stock.
              {partyType === 'SUPPLIER' && supplierCurrencyCode === 'USD' && ' La deuda patrimonial se registra en ARS.'}
            </p>
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
              className="w-full h-9 px-3 border border-steffen-border rounded-[10px] text-black focus:outline-none focus:border-steffen-gold"
            />
          </div>

          {/* Observación */}
          <div className="space-y-1.5">
            <label className="font-bold text-gray-800 uppercase text-[11px]">Observación (opcional)</label>
            <input
              type="text"
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
              disabled={isPending}
              className="w-full h-9 px-3 border border-steffen-border rounded-[10px] text-black focus:outline-none focus:border-steffen-gold"
            />
          </div>

          {/* Botones de acción */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-200">
            {isEdit && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={isPending}
                className="h-9 px-4 mr-auto bg-steffen-red hover:bg-steffen-red-hover text-white rounded-[10px] font-bold transition-colors uppercase tracking-wider cursor-pointer disabled:opacity-50"
              >
                Eliminar
              </button>
            )}
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
              className="h-9 px-5 bg-steffen-blue hover:bg-steffen-blue-hover text-white rounded-[10px] font-bold transition-colors uppercase tracking-wider flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{isEdit ? 'GUARDAR' : 'REGISTRAR'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>

    <ConfirmDialog
      isOpen={confirmDelete}
      title="Eliminar saldo de apertura"
      message={`¿Eliminar el saldo de apertura de ${partyName}? La cuenta vuelve a su saldo anterior.`}
      onConfirm={handleDelete}
      onCancel={() => setConfirmDelete(false)}
    />
    </>
  );
};
