'use client';

import React, { useState, useTransition, useMemo } from 'react';
import { useProtectedRouter as useRouter } from '@/ui/navigation/NavigationProtectionProvider';
import { Search } from 'lucide-react';
import {
  type CostGainAnalysisDTO,
  formatCostFactor,
} from '@/actions/cost-gain.dto';
import { formatArs } from '@/lib/format';
import { Panel, SectionHeader, tableStyles } from '@/ui/components/UIComponents';

interface CostGainViewProps {
  analysis: CostGainAnalysisDTO;
  basePath?: string;
}

export const CostGainView: React.FC<CostGainViewProps> = ({
  analysis,
  basePath = '/fabrica',
}) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [searchTerm, setSearchTerm] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const { selectedProfile, availableProfiles, products } = analysis;

  // Cambiar perfil de descuento vía selector desplegable
  const handleSelectProfile = (profileId: string) => {
    if (profileId === selectedProfile.id) return;
    startTransition(() => {
      router.push(`${basePath}?profileId=${profileId}`);
    });
  };

  // Filtrado de productos en memoria
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // Filtro de inactivos
      if (!showInactive && !p.productActive) return false;

      // Búsqueda por texto
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        p.productCode.toLowerCase().includes(term) ||
        p.productName.toLowerCase().includes(term) ||
        p.presentation.toLowerCase().includes(term)
      );
    });
  }, [products, showInactive, searchTerm]);

  return (
    <Panel className="flex flex-col" >
      <div id="costo-ganancia">
      <SectionHeader
        title="Costo-Ganancia"
        actions={
          isPending ? (
            <span className="text-[11px] text-steffen-blue-hover font-semibold animate-pulse">Recalculando...</span>
          ) : undefined
        }
      />
      <p className="text-[11px] text-steffen-surface/60 -mt-1 mb-3">
        Simulación de rentabilidad por producto sobre Lista Salón • No modifica datos persistidos
      </p>

      {/* Barra de Filtros y Búsqueda Compacta */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2.5 mb-3">
        <div />
        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none whitespace-nowrap">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded border-gray-300 text-steffen-blue focus:ring-steffen-gold h-3.5 w-3.5 cursor-pointer"
            />
            <span>Ver inactivos</span>
          </label>

          <div className="relative">
            <input
              type="text"
              placeholder="Buscar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-7 pl-2.5 pr-7 text-xs border border-steffen-border rounded-[10px] w-36 sm:w-44 focus:outline-none focus:border-steffen-gold placeholder-gray-400 text-black"
            />
            <Search className="w-3.5 h-3.5 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Tabla según formato de Figma MI-FABRICA */}
      {filteredProducts.length === 0 ? (
        <div className="py-8 text-center text-gray-400 text-xs font-medium">
          No se encontraron productos que coincidan con los filtros seleccionados.
        </div>
      ) : (
        <div className="max-h-[285px] overflow-y-auto">
          <table className={tableStyles.table}>
            <thead>
              <tr className={`${tableStyles.headRow} sticky top-0 z-10`}>
                <th className="py-2 px-3 text-left w-[30%]">PRODUCTO FINAL</th>
                <th className="py-2 px-3 text-right w-[14%]">COSTO TOTAL</th>
                <th className="py-2 px-3 text-right w-[14%]">PRECIO LISTA</th>
                <th className="py-1 px-2 text-right w-[18%]">
                  {/* Selector de descuento integrado en el encabezado (Figma Mi Fábrica) */}
                  <label htmlFor="discount-profile-select" className="sr-only">
                    Simular descuento
                  </label>
                  <select
                    id="discount-profile-select"
                    value={selectedProfile.id}
                    onChange={(e) => handleSelectProfile(e.target.value)}
                    disabled={isPending}
                    title="Simular descuento (precio final)"
                    className="w-full h-8 px-2 text-xs font-semibold normal-case border border-steffen-border rounded-[5px] cursor-pointer"
                  >
                    {availableProfiles.map((prof) => (
                      <option key={prof.id} value={prof.id}>
                        {prof.stepsSummary} {prof.name !== prof.stepsSummary ? `(${prof.name})` : ''}
                      </option>
                    ))}
                  </select>
                </th>
                <th className="py-2 px-3 text-center w-[11%]">MARKUP</th>
                <th className="py-2 px-3 text-right w-[13%]">GANANCIA</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((p) => {
                const isLoss = p.gainArs !== null && p.gainArs.startsWith('-');
                const isZeroGain = p.gainArs !== null && (p.gainArs === '0' || p.gainArs === '0.00');

                return (
                  <tr
                    key={p.productId}
                    className={`${tableStyles.row} hover:bg-steffen-gray/55 transition-colors ${
                      !p.productActive ? 'opacity-60' : ''
                    }`}
                  >
                    {/* Producto Final */}
                    <td className="py-2.5 px-3">
                      <span className="font-semibold">{p.productName}</span>
                    </td>

                    {/* Costo Total */}
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      {p.hasCost ? (
                        <span className="text-gray-800 font-medium">
                          {formatArs(p.theoreticalCostArs)}
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-600 border border-gray-200"
                          title={p.costError || 'Sin fórmula vigente o insumos'}
                        >
                          Sin costo
                        </span>
                      )}
                    </td>

                    {/* Precio Lista Salón */}
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      {p.hasSalonPrice ? (
                        <span className="text-black font-semibold">
                          {formatArs(p.salonPriceArs)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                          Sin precio
                        </span>
                      )}
                    </td>

                    {/* Precio Final (Neto) */}
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      {p.netPriceArs !== null ? (
                        <span className="text-black font-semibold">
                          {formatArs(p.netPriceArs)}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>

                    {/* Factor (x Costo) */}
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      {p.markup !== null ? (
                        <span
                          className="font-bold text-gray-900"
                          title={`Multiplicador de costo: ${formatCostFactor(p.markup)}`}
                        >
                          {formatCostFactor(p.markup)}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>

                    {/* Ganancia */}
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      {p.gainArs !== null ? (
                        <span
                          className={`font-bold ${
                            isLoss
                              ? 'text-steffen-red'
                              : isZeroGain
                              ? 'text-gray-700'
                              : 'text-steffen-green'
                          }`}
                        >
                          {formatArs(p.gainArs)}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Nota al pie compacta */}
      <div className="mt-3 pt-2.5 border-t border-steffen-gray flex flex-col sm:flex-row justify-between items-start sm:items-center text-[11px] text-steffen-surface/60 gap-2">
        <div>
          Fórmulas: <code>Markup = Precio final / Costo total</code> • <code>Ganancia = Precio final - Costo total</code>
        </div>
        <div>
          Mostrando {filteredProducts.length} de {products.length} productos
        </div>
      </div>
      </div>
    </Panel>
  );
};
