'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { X, AlertCircle, Loader2 } from 'lucide-react';
import { getPaymentDetailAction, editPaymentAction } from '@/actions/patrimony.actions';
import type { PaymentDetailDTO } from '@/actions/patrimony.dto';

interface EditarPagoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  paymentId: string;
}

export const EditarPagoModal: React.FC<EditarPagoModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  paymentId,
}) => {
  const [payment, setPayment] = useState<PaymentDetailDTO | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [businessDate, setBusinessDate] = useState<string>('');
  const [amountInput, setAmountInput] = useState<string>('');

  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !paymentId) return;

    setLoading(true);
    setErrorMsg(null);
    getPaymentDetailAction(paymentId)
      .then((res) => {
        if (res.success && res.data) {
          setPayment(res.data);
          setBusinessDate(res.data.businessDate);
          setAmountInput(res.data.amountArs);
        } else {
          setErrorMsg(res.error || 'No se pudo cargar el pago');
        }
      })
      .finally(() => setLoading(false));
  }, [isOpen, paymentId]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const numAmount = parseFloat(amountInput.replace(/\./g, '').replace(',', '.'));
    if (isNaN(numAmount) || numAmount <= 0) {
      setErrorMsg('El nuevo importe debe ser mayor a cero.');
      return;
    }

    startTransition(async () => {
      const res = await editPaymentAction({
        paymentId,
        newAmountArs: numAmount,
        newBusinessDate: businessDate,
      });

      if (!res.success) {
        setErrorMsg(res.error || 'Error actualizando pago');
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
            EDITAR PAGO {payment?.code ? `(${payment.code})` : ''}
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

          {loading ? (
            <div className="py-8 flex flex-col items-center justify-center gap-2 text-gray-500">
              <Loader2 className="w-6 h-6 animate-spin text-[#0E50A0]" />
              <span>Cargando datos del pago...</span>
            </div>
          ) : (
            <>
              {/* Entidad (Solo lectura) */}
              <div className="space-y-1.5">
                <label className="font-bold text-gray-800 uppercase text-[11px]">
                  {payment?.paymentType === 'CUSTOMER' ? 'Cliente' : 'Proveedor'}
                </label>
                <div className="w-full h-9 px-3 bg-gray-100 border border-[#D9D9D9] rounded-[5px] flex items-center font-semibold text-black">
                  {payment?.entityName || '—'}
                </div>
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

              {/* Nuevo Importe */}
              <div className="space-y-1.5">
                <label className="font-bold text-gray-800 uppercase text-[11px]">
                  Nuevo Importe (ARS)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-gray-500">$</span>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    disabled={isPending}
                    required
                    className="w-full h-9 pl-8 pr-3 border border-[#D9D9D9] rounded-[5px] font-mono font-bold text-right text-black focus:outline-none focus:border-[#0E50A0]"
                  />
                </div>
                <p className="text-[10px] text-gray-400">
                  Modifica el comprobante original y ajusta saldos mediante estrategia delta. No genera movimientos compensatorios.
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
                  <span>GUARDAR CAMBIOS</span>
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
};
