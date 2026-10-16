'use client';

import React, { useEffect, useState } from 'react';
import { X, History, CheckCircle2, Clock } from 'lucide-react';
import { getBaseProductVersionsAction } from '@/actions/formula.actions';
import type { BaseProductDTO, FormulaVersionDTO } from '@/actions/formula.dto';
import { formatArs as formatArsCanonical } from '@/lib/format';

interface FormulaHistoryModalProps {
  isOpen: boolean;
  baseProduct: BaseProductDTO;
  onClose: () => void;
}

export const FormulaHistoryModal: React.FC<FormulaHistoryModalProps> = ({
  isOpen,
  baseProduct,
  onClose,
}) => {
  const [versions, setVersions] = useState<FormulaVersionDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    setLoading(true);
    setError(null);

    getBaseProductVersionsAction(baseProduct.id)
      .then((res) => {
        if (!isMounted) return;
        if (res.success && res.data) {
          setVersions(res.data);
          // Seleccionar por defecto la versión vigente
          const current = res.data.find((v) => v.isCurrent) || res.data[0];
          if (current) {
            setSelectedVersionId(current.id);
          }
        } else {
          setError(res.error || 'Error al obtener versiones históricas.');
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
  }, [isOpen, baseProduct.id]);

  if (!isOpen) return null;

  const activeVersion = versions.find((v) => v.id === selectedVersionId);

  const formatArs = (str: string | null | undefined) => formatArsCanonical(str);

  const formatKg = (str: string | null | undefined) => {
    if (!str) return '0 kg';
    const num = parseFloat(str);
    if (isNaN(num)) return '0 kg';
    return `${num.toLocaleString('es-AR', { maximumFractionDigits: 3 })} kg`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-5xl bg-white border border-steffen-border rounded-[5px] shadow-2xl p-6 max-h-[90vh] flex flex-col">
        {/* Encabezado */}
        <div className="flex items-center justify-between pb-4 border-b border-steffen-border shrink-0">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-steffen-blue" />
            <h2 className="text-xl font-bold tracking-tight text-black uppercase">
              HISTORIAL DE VERSIONES — {baseProduct.name} ({baseProduct.code})
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

        {loading ? (
          <div className="py-16 text-center text-xs text-gray-500 font-medium">
            Cargando historial de versiones...
          </div>
        ) : error ? (
          <div className="p-4 my-4 bg-red-50 text-red-700 text-xs rounded-[5px] border border-red-200">
            {error}
          </div>
        ) : (
          <div className="mt-4 flex-1 flex flex-col md:flex-row gap-6 min-h-0 overflow-hidden">
            {/* Lista Lateral de Versiones */}
            <div className="w-full md:w-64 border border-steffen-border rounded-[5px] p-2 overflow-y-auto shrink-0 bg-gray-50/50">
              <p className="text-[11px] font-bold uppercase text-gray-500 px-2 py-1 mb-1">
                Versiones ({versions.length})
              </p>
              <div className="space-y-1">
                {versions.map((ver) => {
                  const isSelected = ver.id === selectedVersionId;
                  return (
                    <button
                      key={ver.id}
                      onClick={() => setSelectedVersionId(ver.id)}
                      className={`w-full text-left p-2.5 rounded-[5px] transition-colors cursor-pointer flex flex-col gap-1 border ${
                        isSelected
                          ? 'border-steffen-blue bg-steffen-blue/10 text-steffen-blue'
                          : 'border-transparent hover:bg-gray-100 text-black'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs">
                          Versión v{ver.versionNumber}
                        </span>
                        {ver.isCurrent ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-steffen-green bg-green-100 px-1.5 py-0.5 rounded-[5px]">
                            <CheckCircle2 className="w-3 h-3" />
                            Vigente
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded-[5px]">
                            <Clock className="w-3 h-3" />
                            Histórica
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-600">
                        {ver.businessDate || ver.createdAt.slice(0, 10)}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Ficha Detallada de la Versión Seleccionada (Solo Lectura) */}
            <div className="flex-1 border border-steffen-border rounded-[5px] p-4 flex flex-col min-h-0 overflow-y-auto bg-white">
              {activeVersion ? (
                <>
                  <div className="flex items-center justify-between pb-3 border-b border-steffen-border mb-4">
                    <div>
                      <span className="text-sm font-bold text-black uppercase">
                        Versión v{activeVersion.versionNumber}
                      </span>
                      {activeVersion.isCurrent && (
                        <span className="ml-2 px-2 py-0.5 bg-green-100 text-steffen-green text-[10px] font-bold uppercase rounded-[5px]">
                          Fórmula Vigente
                        </span>
                      )}
                      <p className="text-xs text-gray-500 mt-0.5">
                        Fecha: {activeVersion.businessDate || activeVersion.createdAt.slice(0, 10)}
                        {activeVersion.observations && ` • ${activeVersion.observations}`}
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="text-xs text-gray-500 uppercase block">Costo / kg</span>
                      <span className="text-sm font-bold text-black">
                        {formatArs(activeVersion.costBreakdown.costPerKgPbaArs)}
                      </span>
                    </div>
                  </div>

                  {/* Tabla de composición */}
                  <div className="flex-1 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-steffen-gray text-black font-bold uppercase text-left">
                          <th className="py-2 px-2.5">CODIGO</th>
                          <th className="py-2 px-2.5">MATERIA PRIMA</th>
                          <th className="py-2 px-2.5 text-right">CANTIDAD (KG)</th>
                          <th className="py-2 px-2.5 text-right">COSTO POR KILO</th>
                          <th className="py-2 px-2.5 text-right">COSTO FINAL</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {activeVersion.costBreakdown.lines.map((line, idx) => (
                          <tr key={idx} className="hover:bg-gray-50/50">
                            <td className="py-2 px-2.5 font-bold text-black">
                              {line.rawMaterialCode}
                            </td>
                            <td className="py-2 px-2.5 font-medium text-black">
                              {line.rawMaterialName}
                            </td>
                            <td className="py-2 px-2.5 text-right text-black">
                              {formatKg(line.quantityKg)}
                            </td>
                            <td className="py-2 px-2.5 text-right text-gray-700">
                              {formatArs(line.currentUnitCost)}
                            </td>
                            <td className="py-2 px-2.5 text-right font-bold text-black">
                              {formatArs(line.partialCost)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Totales de la versión */}
                  <div className="mt-4 pt-3 border-t border-steffen-border flex flex-wrap items-center justify-between gap-4 text-xs font-semibold bg-gray-50 p-3 rounded-[5px]">
                    <div>
                      <span className="text-gray-500 uppercase">Total Kg Granel:</span>{' '}
                      <span className="font-bold text-black">
                        {formatKg(activeVersion.costBreakdown.totalKgBulk)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500 uppercase">Costo Granel:</span>{' '}
                      <span className="font-bold text-black">
                        {formatArs(activeVersion.costBreakdown.totalCostBulkArs)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500 uppercase">Costo producto por kg:</span>{' '}
                      <span className="font-bold text-steffen-blue">
                        {formatArs(activeVersion.costBreakdown.costPerKgPbaArs)}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="py-12 text-center text-xs text-gray-400">
                  Seleccione una versión para ver su composición histórica.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Pie del modal */}
        <div className="pt-4 mt-4 border-t border-steffen-border flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 bg-gray-200 text-black hover:bg-gray-300 text-xs font-bold uppercase rounded-[5px] transition-colors cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
