'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { X, AlertCircle, Loader2 } from 'lucide-react';
import {
  registerCustomerPaymentAction,
  getCustomerPaymentOptionsAction,
} from '@/actions/patrimony.actions';
import type { AccountPaymentOptionDTO } from '@/actions/patrimony.dto';
import { formatArsInteger } from '@/actions/administracion.dto';

interface RegistrarPagoClienteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialCustomerId?: string;
  customers?: AccountPaymentOptionDTO[];
}

export const RegistrarPagoClienteModal: React.FC<RegistrarPagoClienteModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialCustomerId,
  customers: initialCustomersList,
}) => {
  const [customerOptions, setCustomerOptions] = useState<AccountPaymentOptionDTO[]>(
    initialCustomersList || []
  );
  const [loadingCustomers, setLoadingCustomers] = useState<boolean>(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(initialCustomerId || '');
  const [businessDate, setBusinessDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [amountInput, setAmountInput] = useState<string>('');

  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Cargar clientes al abrir si no fueron pasados
  useEffect(() => {
    if (!isOpen) return;

    if (!initialCustomersList || initialCustomersList.length === 0) {
      setLoadingCustomers(true);
      getCustomerPaymentOptionsAction()
        .then((res) => {
          if (res.success && res.data) {
            // Filtrar únicamente clientes con saldo > 0
            const withDebtOnly = res.data.filter((c) => parseFloat(c.balanceArs) > 0);
            setCustomerOptions(withDebtOnly);
            if (initialCustomerId) {
              const matched = withDebtOnly.find((c) => c.id === initialCustomerId);
              if (matched) {
                setSelectedCustomerId(matched.id);
              } else {
                setSelectedCustomerId('');
                setErrorMsg('El cliente seleccionado no posee saldo deudor pendiente.');
              }
            } else if (withDebtOnly.length > 0) {
              setSelectedCustomerId(withDebtOnly[0].id);
            }
          }
        })
        .finally(() => setLoadingCustomers(false));
    } else {
      const withDebtOnly = initialCustomersList.filter((c) => parseFloat(c.balanceArs) > 0);
      setCustomerOptions(withDebtOnly);
      if (initialCustomerId) {
        const matched = withDebtOnly.find((c) => c.id === initialCustomerId);
        if (matched) {
          setSelectedCustomerId(matched.id);
        } else {
          setSelectedCustomerId('');
          setErrorMsg('El cliente seleccionado no posee saldo deudor pendiente.');
        }
      } else if (withDebtOnly.length > 0) {
        setSelectedCustomerId(withDebtOnly[0].id);
      }
    }
  }, [isOpen, initialCustomerId, initialCustomersList]);

  if (!isOpen) return null;

  // Normativa: selector muestra ÚNICAMENTE clientes con saldo > 0
  const visibleOptions = customerOptions.filter((c) => parseFloat(c.balanceArs) > 0);
  const selectedCustomer = visibleOptions.find((c) => c.id === selectedCustomerId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!selectedCustomerId || !selectedCustomer || parseFloat(selectedCustomer.balanceArs) <= 0) {
      setErrorMsg('Debe seleccionar un cliente con saldo deudor pendiente mayor a cero.');
      return;
    }

    const numAmount = parseFloat(amountInput.replace(/\./g, '').replace(',', '.'));
    if (isNaN(numAmount) || numAmount <= 0) {
      setErrorMsg('El importe del pago debe ser mayor a cero.');
      return;
    }

    startTransition(async () => {
      const res = await registerCustomerPaymentAction({
        customerId: selectedCustomerId,
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
            REGISTRAR PAGO CLIENTE
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

          {/* Selector Cliente */}
          <div className="space-y-1.5">
            <label className="font-bold text-gray-800 uppercase text-[11px] block">Cliente</label>
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              disabled={loadingCustomers || isPending}
              required
              className="w-full h-9 px-3 border border-[#D9D9D9] rounded-[5px] bg-white text-black font-medium focus:outline-none focus:border-[#008102]"
            >
              {visibleOptions.length === 0 ? (
                <option value="">No hay clientes con deuda pendiente</option>
              ) : (
                visibleOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} | SALDO: {formatArsInteger(c.balanceArs)}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Saldo Actual informativo */}
          {selectedCustomer && (
            <div className="p-2.5 bg-gray-50 border border-gray-200 rounded-[5px] flex items-center justify-between text-xs">
              <span className="text-gray-600 font-medium">Saldo actual del cliente:</span>
              <span
                className={`font-mono font-bold ${
                  selectedCustomer.hasDebt ? 'text-[#008102]' : 'text-gray-700'
                }`}
              >
                {formatArsInteger(selectedCustomer.balanceArs)}
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
                placeholder="0"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                disabled={isPending}
                required
                className="w-full h-9 pl-8 pr-3 border border-[#D9D9D9] rounded-[5px] font-mono font-bold text-right text-black focus:outline-none focus:border-[#008102]"
              />
            </div>
            <p className="text-[10px] text-gray-400">
              Pagos superiores a la deuda generan saldo a favor (saldo &lt; 0).
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
              disabled={isPending || !selectedCustomerId}
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
