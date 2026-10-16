'use client';

import React, { useEffect, useState } from 'react';
import { X, History, AlertCircle, Clock } from 'lucide-react';
import { getPriceHistoryAction } from '@/actions/price-list.actions';
import {
  type PriceListDTO,
  type ProductPriceRowDTO,
  type PriceHistoryRecordDTO,
  formatExactIntegerArs,
} from '@/actions/price-list.dto';

interface PriceHistoryModalProps {
  isOpen: boolean;
  priceList: PriceListDTO;
  product: ProductPriceRowDTO;
  onClose: () => void;
}

export const PriceHistoryModal: React.FC<PriceHistoryModalProps> = ({
  isOpen,
  priceList,
  product,
  onClose,
}) => {
  const [history, setHistory] = useState<PriceHistoryRecordDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    setLoading(true);
    setError(null);

    getPriceHistoryAction(priceList.id, product.productId)
      .then((res) => {
        if (!isMounted) return;
        if (res.success && res.data) {
          setHistory(res.data);
        } else {
          setError(res.error || 'Error al obtener historial de precios.');
        }
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : 'Error de comunicación.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, priceList.id, product.productId]);

  if (!isOpen) return null;

  const formatDate = (iso: string | null | undefined) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-2xl bg-white border border-steffen-border rounded-[5px] shadow-2xl p-6 max-h-[90vh] flex flex-col">
        {/* Encabezado */}
        <div className="flex items-center justify-between pb-4 border-b border-steffen-border shrink-0">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-steffen-blue" />
            <h2 className="text-lg font-bold tracking-tight text-black uppercase">
              HISTORIAL DE PRECIOS — {product.productCode}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-black transition-colors cursor-pointer"
            title="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Subencabezado de Contexto */}
        <div className="mt-3 p-3 bg-gray-50 border border-steffen-border rounded-[5px] text-xs flex justify-between items-center shrink-0">
          <div>
            <span className="block text-gray-500 font-bold uppercase tracking-wider text-[10px]">
              Producto
            </span>
            <span className="font-bold text-black">{product.productName} ({product.presentation})</span>
          </div>
          <div className="text-right">
            <span className="block text-gray-500 font-bold uppercase tracking-wider text-[10px]">
              Lista
            </span>
            <span className="font-bold text-steffen-blue">{priceList.name}</span>
          </div>
        </div>

        {/* Contenido */}
        <div className="mt-4 flex-1 overflow-y-auto">
          {loading ? (
            <div className="py-12 text-center text-gray-400 text-xs font-medium">
              Cargando historial de precios...
            </div>
          ) : error ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-[5px] text-xs font-semibold text-steffen-red flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : history.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-xs font-medium">
              No hay historial de precios registrado para este producto en la lista seleccionada.
            </div>
          ) : (
            <div className="border border-steffen-border rounded-[5px] overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-steffen-gray text-black font-bold uppercase text-left border-b border-steffen-border">
                    <th className="py-2.5 px-3">Estado</th>
                    <th className="py-2.5 px-3 text-right">Precio</th>
                    <th className="py-2.5 px-3">Vigente Desde</th>
                    <th className="py-2.5 px-3">Vigente Hasta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {history.map((record) => (
                    <tr
                      key={record.id}
                      className={`hover:bg-gray-50 ${record.isActive ? 'bg-green-50/40' : ''}`}
                    >
                      <td className="py-2.5 px-3">
                        {record.isActive ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-green-100 text-steffen-green border border-green-300">
                            VIGENTE
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-600 border border-gray-200">
                            HISTÓRICO
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-black">
                        {formatExactIntegerArs(record.priceArs)}
                      </td>
                      <td className="py-2.5 px-3 text-gray-700">
                        {formatDate(record.validFrom)}
                      </td>
                      <td className="py-2.5 px-3 text-gray-600">
                        {record.validTo ? formatDate(record.validTo) : (
                          <span className="font-semibold text-steffen-green">Actualidad</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-4 border-t border-steffen-border mt-4 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="h-[29px] px-5 rounded-[5px] text-xs font-bold uppercase tracking-wider bg-white border border-steffen-border text-black hover:bg-gray-100 transition-colors cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
