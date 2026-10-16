'use client';

import React, { useState, useEffect } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { previewRtmAction, completeRtmAction } from '@/actions/margin-remittance.actions';
import type { RtmPreviewDTO } from '@/actions/margin-remittance.dto';
import { Decimal } from '@/domain/decimal';
import { formatArs, formatKg } from '@/lib/format';

interface CompletarRtmModalProps {
  remittanceId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onCompleted?: () => void;
}

export const CompletarRtmModal: React.FC<CompletarRtmModalProps> = ({
  remittanceId,
  isOpen,
  onClose,
  onCompleted,
}) => {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [preview, setPreview] = useState<RtmPreviewDTO | null>(null);
  const [transportInput, setTransportInput] = useState<string>('0');

  const [showConfirm, setShowConfirm] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [completeErrorMsg, setCompleteErrorMsg] = useState('');

  useEffect(() => {
    if (isOpen && remittanceId) {
      setErrorMsg('');
      setCompleteErrorMsg('');
      setShowConfirm(false);
      setIsCompleting(false);
      setTransportInput('0');
      setLoading(true);

      previewRtmAction(remittanceId).then((res) => {
        setLoading(false);
        if (res.success && res.data) {
          setPreview(res.data);
        } else {
          setErrorMsg(res.error || 'Error al cargar la previsualización del RTM.');
        }
      });
    }
  }, [isOpen, remittanceId]);

  if (!isOpen) return null;

  const transportDecimal = (() => {
    try {
      const d = new Decimal(transportInput.trim() === '' ? 0 : transportInput);
      return d.isNaN() || d.lt(0) ? null : d;
    } catch {
      return null;
    }
  })();

  const isTransportValid = transportDecimal !== null;

  // Cálculo en vivo: la UI no es autoridad, solo refleja lo que la RPC recalculará al confirmar.
  const liveGainArs =
    preview && transportDecimal !== null
      ? new Decimal(preview.totalOrderArs).minus(preview.productsCostTotalArs).minus(transportDecimal)
      : null;

  const handleOpenConfirm = () => {
    setErrorMsg('');
    if (!isTransportValid) {
      setErrorMsg('El transporte debe ser un número mayor o igual a 0.');
      return;
    }
    setShowConfirm(true);
  };

  const handleConfirmRtm = async () => {
    if (!remittanceId || transportDecimal === null) return;
    setCompleteErrorMsg('');
    setIsCompleting(true);

    try {
      const res = await completeRtmAction(remittanceId, transportDecimal.toString());
      if (!res.success) {
        setCompleteErrorMsg(res.error || 'Error al completar el RTM.');
        setIsCompleting(false);
        return;
      }
      setIsCompleting(false);
      if (onCompleted) onCompleted();
    } catch (err: any) {
      setCompleteErrorMsg(err.message || 'Error inesperado al completar el RTM.');
      setIsCompleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-[10px] border border-steffen-border w-full max-w-3xl p-6 relative my-8 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center pb-3 border-b border-steffen-border">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold tracking-tight text-black">REMITO MARGEN</h2>
            {preview && (
              <span className="text-sm font-bold bg-steffen-gold/20 text-steffen-blue px-2 py-0.5 rounded-[5px]">
                {preview.remittanceCode}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isCompleting}
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

        {loading ? (
          <div className="py-16 text-center text-gray-500 text-sm">Cargando RTM...</div>
        ) : preview ? (
          <div className="overflow-y-auto flex-1 pr-1 space-y-4 mt-4">
            {/* Metadata Header, siguiendo REMITO-MARGEN.png */}
            <div className="bg-steffen-bg border border-steffen-border p-3 rounded-[5px] text-xs space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <span className="font-bold text-gray-700">Id:</span>{' '}
                  <span className="font-semibold text-black">{preview.remittanceCode}</span>
                </div>
                <div>
                  <span className="font-bold text-gray-700">Fecha:</span>{' '}
                  <span className="font-semibold text-black">
                    {new Date(preview.createdAt).toLocaleDateString('es-AR')}
                  </span>
                </div>
                <div>
                  <span className="font-bold text-gray-700">Cliente:</span>{' '}
                  <span className="font-semibold text-black">{preview.customerDisplayName}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <span className="font-bold text-gray-700">Domicilio:</span>{' '}
                  <span className="text-black">{preview.addressSnapshot || '-'}</span>
                </div>
                <div>
                  <span className="font-bold text-gray-700">Transporte:</span>{' '}
                  <span className="text-black">{preview.transportNameSnapshot || '-'}</span>
                </div>
                <div>
                  <span className="font-bold text-gray-700">Direccion:</span>{' '}
                  <span className="text-black">
                    {[preview.localitySnapshot, preview.provinceSnapshot].filter(Boolean).join(', ') || '-'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center pt-1 border-t border-gray-200">
                <div>
                  <span className="font-bold text-gray-700">Cant. bultos:</span>{' '}
                  <span className="font-bold text-black">
                    {preview.packageCountSnapshot !== null ? preview.packageCountSnapshot : '-'}
                  </span>
                </div>
                <div>
                  <span className="font-bold text-gray-700">Peso:</span>{' '}
                  <span className="font-bold text-black">{formatKg(preview.weightKgSnapshot)} kg</span>
                </div>
              </div>
            </div>

            {/* Tabla de líneas enviadas: Cant | Producto | PU | PT | CU | CT */}
            <div className="border border-steffen-border rounded-[5px] overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-steffen-gray text-black font-bold uppercase text-[11px]">
                  <tr>
                    <th className="py-2 px-3 text-center w-16">Cant.</th>
                    <th className="py-2 px-3">Producto</th>
                    <th className="py-2 px-3 text-right">PU</th>
                    <th className="py-2 px-3 text-right">PT</th>
                    <th className="py-2 px-3 text-right bg-steffen-gold/10">CU</th>
                    <th className="py-2 px-3 text-right bg-steffen-gold/10">CT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-steffen-border">
                  {preview.lines.map((l) => (
                    <tr key={l.productId} className="hover:bg-gray-50">
                      <td className="py-2 px-3 text-center font-bold text-black">{l.quantitySent}</td>
                      <td className="py-2 px-3 font-semibold text-black">
                        {l.productCode} - {l.productName}
                      </td>
                      <td className="py-2 px-3 text-right text-black">{formatArs(l.unitPriceArs)}</td>
                      <td className="py-2 px-3 text-right font-bold text-black">{formatArs(l.lineTotalArs)}</td>
                      <td className="py-2 px-3 text-right text-gray-700 bg-steffen-gold/5">
                        {formatArs(l.unitCostTheoreticalArs)}
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-gray-700 bg-steffen-gold/5">
                        {formatArs(l.lineCostTotalArs)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totales: Total pedido, Costo productos, Transporte (editable), Ganancia (en vivo) */}
            <div className="flex flex-col items-end pt-2 border-t border-steffen-border space-y-2 text-xs">
              <div className="flex justify-between w-72">
                <span className="font-extrabold text-black uppercase">TOTAL PEDIDO</span>
                <span className="font-extrabold text-black text-sm">{formatArs(preview.totalOrderArs)}</span>
              </div>

              <div className="flex justify-between w-72">
                <span className="font-bold text-gray-700 uppercase">COSTO PRODUCTOS</span>
                <span className="font-bold text-black">{formatArs(preview.productsCostTotalArs)}</span>
              </div>

              <div className="flex justify-between items-center w-72">
                <label htmlFor="transporte-rtm" className="font-bold text-gray-700 uppercase">
                  Transporte
                </label>
                <input
                  id="transporte-rtm"
                  type="number"
                  min="0"
                  step="1"
                  value={transportInput}
                  onChange={(e) => setTransportInput(e.target.value)}
                  disabled={isCompleting}
                  className={`w-32 p-1.5 border rounded-[5px] text-right font-bold focus:outline-none ${
                    isTransportValid
                      ? 'border-steffen-border focus:border-steffen-gold'
                      : 'border-steffen-red text-steffen-red'
                  }`}
                />
              </div>

              <div className="flex justify-between w-72 pt-1 border-t border-gray-300">
                <span className="font-extrabold text-black uppercase">GANANCIA</span>
                <span
                  className={`font-extrabold text-sm ${
                    liveGainArs && liveGainArs.lt(0) ? 'text-steffen-red' : 'text-steffen-green'
                  }`}
                >
                  {liveGainArs !== null ? formatArs(liveGainArs) : '-'}
                </span>
              </div>
            </div>
          </div>
        ) : null}

        {/* Footer Buttons */}
        <div className="flex justify-end items-center gap-3 pt-4 border-t border-steffen-border mt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isCompleting}
            className="px-4 py-2 bg-steffen-red hover:bg-steffen-red-hover text-white font-bold text-xs rounded-[5px] transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleOpenConfirm}
            disabled={loading || !preview || !isTransportValid}
            className="px-5 py-2 bg-steffen-blue hover:bg-steffen-blue-hover text-white font-bold text-xs rounded-[5px] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Guardar
          </button>
        </div>

        {/* ============================================================== */}
        {/* DIÁLOGO MODAL: CONFIRMACIÓN DE RTM                              */}
        {/* ============================================================== */}
        {showConfirm && preview && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4">
            <div className="bg-white rounded-[10px] border border-steffen-border w-full max-w-md p-6 shadow-xl space-y-4">
              <div className="flex justify-between items-center pb-3 border-b border-steffen-border">
                <h3 className="text-lg font-bold text-black uppercase tracking-tight">Confirmar RTM</h3>
                <button
                  type="button"
                  onClick={() => setShowConfirm(false)}
                  disabled={isCompleting}
                  className="text-gray-400 hover:text-black transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {completeErrorMsg && (
                <div className="p-3 bg-red-50 border border-steffen-red text-steffen-red text-xs font-semibold rounded-[5px] flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{completeErrorMsg}</span>
                </div>
              )}

              <div className="p-3 bg-amber-50 border border-amber-300 rounded-[5px] text-[11px] text-amber-900 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-amber-950">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Confirmar RTM cerrará definitivamente la venta y congelará sus costos y ganancia.</span>
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-amber-900 pl-1">
                  <li>Congela el costo teórico actual de cada producto enviado.</li>
                  {transportDecimal && transportDecimal.gt(0) && (
                    <li>Descuenta {formatArs(transportDecimal)} de Caja Steffen por transporte.</li>
                  )}
                  <li>El remito pasa a estado COMPLETADO y queda inmutable.</li>
                  <li>Esta acción no puede deshacerse.</li>
                </ul>
              </div>

              <div className="flex justify-end items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowConfirm(false)}
                  disabled={isCompleting}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-black font-semibold text-xs rounded-[5px] transition-colors cursor-pointer"
                >
                  Cancelar / Volver
                </button>
                <button
                  type="button"
                  onClick={handleConfirmRtm}
                  disabled={isCompleting}
                  className="px-5 py-2 bg-steffen-green hover:bg-steffen-green-hover text-white font-bold text-xs rounded-[5px] transition-colors cursor-pointer shadow-xs active:scale-[0.99]"
                >
                  {isCompleting ? 'Confirmando...' : 'CONFIRMAR RTM'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
