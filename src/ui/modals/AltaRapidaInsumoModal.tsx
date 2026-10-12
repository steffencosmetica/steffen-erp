'use client';

import React, { useState } from 'react';
import { X, AlertCircle, Loader2, Sparkles, Check } from 'lucide-react';
import {
  createRawMaterialAction,
  createComponentAction,
  type CreatedMasterItemResultDTO,
} from '@/actions/master-item.actions';

export interface AltaRapidaInsumoModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplierId: string;
  supplierName: string;
  supplierCurrency: 'ARS' | 'USD';
  onSuccess: (item: CreatedMasterItemResultDTO) => void;
}

export const AltaRapidaInsumoModal: React.FC<AltaRapidaInsumoModalProps> = ({
  isOpen,
  onClose,
  supplierId,
  supplierName,
  supplierCurrency,
  onSuccess,
}) => {
  const [itemType, setItemType] = useState<'MPR' | 'COM'>('MPR');
  const [name, setName] = useState('');
  const [inci, setInci] = useState('');
  const [stockMinimum, setStockMinimum] = useState('1.000');
  const [quotedPriceNet, setQuotedPriceNet] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const isCom = itemType === 'COM';
  const isUsd = supplierCurrency === 'USD';

  const handleTypeChange = (newType: 'MPR' | 'COM') => {
    setItemType(newType);
    setErrorMsg(null);
    if (newType === 'COM') {
      setStockMinimum('10');
    } else {
      setStockMinimum('1.000');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMsg(`El nombre del ${isCom ? 'Componente' : 'la Materia Prima'} es obligatorio.`);
      return;
    }

    const minNum = parseFloat(stockMinimum);
    if (!stockMinimum || isNaN(minNum) || minNum <= 0) {
      setErrorMsg(
        isCom
          ? 'El stock mínimo de un Componente debe ser un número entero mayor a 0 unidades.'
          : 'El stock mínimo de la Materia Prima debe ser mayor a 0 kg.'
      );
      return;
    }

    if (isCom) {
      if (!Number.isInteger(minNum)) {
        setErrorMsg('El stock mínimo de un Componente (UNIT) debe ser un número entero sin decimales.');
        return;
      }
    } else {
      if (stockMinimum.includes('.')) {
        const dec = stockMinimum.split('.')[1];
        if (dec && dec.length > 3) {
          setErrorMsg('El stock mínimo en kg admite como máximo 3 decimales (ej: 1.500).');
          return;
        }
      }
    }

    const priceNum = parseFloat(quotedPriceNet);
    if (!quotedPriceNet || isNaN(priceNum) || priceNum <= 0) {
      setErrorMsg('El precio neto cotizado debe ser mayor a cero.');
      return;
    }

    setIsSubmitting(true);

    try {
      if (isCom) {
        const res = await createComponentAction({
          name: trimmedName,
          stockMinimumUnits: Math.trunc(minNum),
          initialStockUnits: 0, // Regla normativa: stock inicial 0
          initialSupplierId: supplierId,
          initialQuotedPriceNet: quotedPriceNet.trim(),
        });

        if (!res.success || !res.data) {
          setErrorMsg(res.error || 'Error al crear el componente');
        } else {
          onSuccess(res.data);
          onClose();
        }
      } else {
        const res = await createRawMaterialAction({
          name: trimmedName,
          inci: inci.trim() || null,
          stockMinimumKg: stockMinimum.trim(),
          initialStockKg: '0', // Regla normativa: stock inicial 0
          initialSupplierId: supplierId,
          initialQuotedPriceNet: quotedPriceNet.trim(),
        });

        if (!res.success || !res.data) {
          setErrorMsg(res.error || 'Error al crear la materia prima');
        } else {
          onSuccess(res.data);
          onClose();
        }
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error inesperado al crear el maestro');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-100">
      <div className="bg-white border border-[#D9D9D9] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden my-auto flex flex-col">
        {/* Cabecera */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#D9D9D9] bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#0E50A0]/10 flex items-center justify-center text-[#0E50A0]">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-black uppercase tracking-wider">
                Alta Rápida de Insumo
              </h3>
              <p className="text-[11px] text-gray-500">
                Crea el maestro y lo asocia automáticamente a la compra
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1 rounded text-gray-400 hover:text-black transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs text-black">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-semibold text-[#DD0000] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Banner normativo */}
          <div className="p-3 bg-blue-50/80 border border-[#0E50A0]/20 rounded-xl text-[11px] text-[#0E50A0] leading-relaxed">
            <strong>Normativa de Compras (FLOWS.md §8):</strong> El insumo se crea con stock inicial{' '}
            <strong>0</strong> y queda preasociado a <strong>{supplierName}</strong> ({supplierCurrency}).
            El ingreso físico de stock se registrará únicamente al confirmar la compra actual.
          </div>

          {/* Selector de Tipo (MPR vs COM) */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-black mb-1.5">
              Tipo de Insumo *
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleTypeChange('MPR')}
                className={`py-2 px-3 rounded-[2px] font-bold text-xs uppercase tracking-wider border transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                  !isCom
                    ? 'bg-[#0E50A0] text-white border-[#0E50A0]'
                    : 'bg-white text-gray-700 border-[#D9D9D9] hover:bg-gray-50'
                }`}
              >
                {!isCom && <Check className="w-3.5 h-3.5" />}
                Materia Prima (MPR - kg)
              </button>
              <button
                type="button"
                onClick={() => handleTypeChange('COM')}
                className={`py-2 px-3 rounded-[2px] font-bold text-xs uppercase tracking-wider border transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                  isCom
                    ? 'bg-[#0E50A0] text-white border-[#0E50A0]'
                    : 'bg-white text-gray-700 border-[#D9D9D9] hover:bg-gray-50'
                }`}
              >
                {isCom && <Check className="w-3.5 h-3.5" />}
                Componente (COM - unid)
              </button>
            </div>
          </div>

          {/* Nombre */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-black mb-1.5">
              Nombre del Insumo *
            </label>
            <input
              type="text"
              required
              placeholder={isCom ? 'Ej: Válvula Cremera 24/410 Negra' : 'Ej: Aceite de Argán Puro'}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitting}
              className="w-full h-9 px-3 border border-[#D9D9D9] rounded-[2px] bg-white text-xs font-medium focus:outline-none focus:border-[#0E50A0]"
            />
          </div>

          {/* INCI (solo si MPR) */}
          {!isCom && (
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-black mb-1.5">
                INCI (Nomenclatura Cosmética - Opcional)
              </label>
              <input
                type="text"
                placeholder="Ej: Argania Spinosa Kernel Oil"
                value={inci}
                onChange={(e) => setInci(e.target.value)}
                disabled={isSubmitting}
                className="w-full h-9 px-3 border border-[#D9D9D9] rounded-[2px] bg-white text-xs font-medium focus:outline-none focus:border-[#0E50A0]"
              />
            </div>
          )}

          {/* Fila: Stock Mínimo y Precio Neto Cotizado */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-black mb-1.5">
                Stock Mínimo ({isCom ? 'unid' : 'kg'}) *
              </label>
              <input
                type="number"
                required
                min={isCom ? '1' : '0.001'}
                step={isCom ? '1' : '0.001'}
                value={stockMinimum}
                onChange={(e) => setStockMinimum(e.target.value)}
                disabled={isSubmitting}
                className="w-full h-9 px-3 border border-[#D9D9D9] rounded-[2px] bg-white text-xs font-medium text-right focus:outline-none focus:border-[#0E50A0]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-black mb-1.5">
                Precio Neto Cotizado ({supplierCurrency}) *
              </label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold pointer-events-none">
                  {isUsd ? 'U$S' : '$'}
                </span>
                <input
                  type="number"
                  required
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  value={quotedPriceNet}
                  onChange={(e) => setQuotedPriceNet(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full h-9 pl-9 pr-3 border border-[#D9D9D9] rounded-[2px] bg-white text-xs font-medium text-right focus:outline-none focus:border-[#0E50A0]"
                />
              </div>
            </div>
          </div>

          {/* Fila Informativa de Stock Inicial */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                Proveedor Inicial
              </label>
              <input
                type="text"
                readOnly
                value={supplierName}
                className="w-full h-8 px-2.5 border border-[#D9D9D9] rounded-[2px] bg-gray-50 text-[11px] font-semibold text-gray-600 cursor-not-allowed truncate"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                Stock Inicial en Maestro
              </label>
              <input
                type="text"
                readOnly
                value={isCom ? '0 unid (Sin MST)' : '0.000 kg (Sin MST)'}
                className="w-full h-8 px-2.5 border border-[#D9D9D9] rounded-[2px] bg-gray-50 text-[11px] font-mono text-gray-600 cursor-not-allowed"
              />
            </div>
          </div>

          {/* Botones de Pie */}
          <div className="pt-3 border-t border-[#D9D9D9] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 border border-[#DD0000] text-[#DD0000] hover:bg-red-50 rounded-[2px] font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-[#0E50A0] hover:bg-[#0c4386] text-white rounded-[2px] font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-colors cursor-pointer shadow-sm disabled:opacity-50"
            >
              {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Crear y Usar en Compra
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
