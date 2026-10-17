'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog, tableStyles } from '../components/UIComponents';
import { StockListToolbar } from '../components/StockListToolbar';
import { EditComponentModal } from '../modals/EditComponentModal';
import { toggleComponentActiveAction } from '@/actions/master-item.actions';
import type { ComponentDTO, SupplierOptionDTO } from '@/actions/master-item.dto';
import { Edit3, Power } from 'lucide-react';
import { itemPriceDisplays } from '@/lib/item-price-display';

interface ComponentsViewProps {
  components: ComponentDTO[];
  activeSuppliers: SupplierOptionDTO[];
}

export const ComponentsView: React.FC<ComponentsViewProps> = ({
  components,
  activeSuppliers,
}) => {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [searchTerm, setSearchTerm] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [onlyCritical, setOnlyCritical] = useState(false);

  // Modales
  const [selectedComponent, setSelectedComponent] = useState<ComponentDTO | null>(null);
  const [confirmDialogComp, setConfirmDialogComp] = useState<ComponentDTO | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Filtrado en cliente sobre DTOs ya ordenados por ratio en servidor
  const filteredComponents = components.filter((c) => {
    if (!showInactive && !c.active) return false;
    if (onlyCritical && !c.isBelowMinimum) return false;
    if (!searchTerm.trim()) return true;

    const term = searchTerm.toLowerCase();
    return (
      c.code.toLowerCase().includes(term) ||
      c.name.toLowerCase().includes(term) ||
      (c.supplierName && c.supplierName.toLowerCase().includes(term)) ||
      (c.supplierCode && c.supplierCode.toLowerCase().includes(term))
    );
  });

  const criticalCount = components.filter((c) => c.active && c.isBelowMinimum).length;

  const handleToggleActiveClick = (comp: ComponentDTO) => {
    if (comp.active) {
      setConfirmDialogComp(comp);
    } else {
      handleExecuteToggle(comp, true);
    }
  };

  const handleExecuteToggle = async (comp: ComponentDTO, targetActive: boolean) => {
    setActionError(null);
    startTransition(async () => {
      const res = await toggleComponentActiveAction(comp.id, targetActive);
      if (!res.success) {
        setActionError(res.error || 'Error al cambiar estado del componente');
      } else {
        router.refresh();
      }
      setConfirmDialogComp(null);
    });
  };

  // Precios para columnas de Figma: P.U. USD, P.U $, P.U+ IVA (resuelto por backend)
  const getPriceDisplays = (c: ComponentDTO) => itemPriceDisplays(c);

  return (
    <>
      {actionError && (
        <div className="mt-4 p-3 border border-steffen-red rounded-[5px] text-xs font-semibold text-steffen-red flex justify-between items-center">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-gray-400 hover:text-black font-bold">
            ✕
          </button>
        </div>
      )}

      {/* Contenedor Interior de Tabla idéntico a Figma */}
      <div>
        
        {/* Encabezado (Figma Stock): TÍTULO ——— filtros + Buscar */}
        <StockListToolbar
          title="Componentes"
          criticalCount={criticalCount}
          onlyCritical={onlyCritical}
          onToggleCritical={() => setOnlyCritical(!onlyCritical)}
          showInactive={showInactive}
          onShowInactiveChange={setShowInactive}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
        />

        {/* Tabla de Componentes con columnas de Figma SOLAPA-MATERIA-Y-COMPONENTES.png */}
        {filteredComponents.length === 0 ? (
          <div className="py-12 text-center text-steffen-surface/60 text-xs">
            No hay componentes registrados para los filtros seleccionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className={tableStyles.table}>
              <thead>
                <tr className={tableStyles.headRow}>
                  <th className="py-2 px-3 text-left">CODIGO</th>
                  <th className="py-2 px-3 text-left">PROVEEDOR</th>
                  <th className="py-2 px-3 text-left">COMPONENTE</th>
                  <th className="py-2 px-3 text-left">ULTIMA COMPRA</th>
                  <th className="py-2 px-3 text-left">ULTIMA ACT PRECIO</th>
                  <th className="py-2 px-3 text-right">P.U. USD</th>
                  <th className="py-2 px-3 text-right">P.U $</th>
                  <th className="py-2 px-3 text-right">P.U+ IVA</th>
                  <th className="py-2 px-3 text-right">STOCK ACTUAL</th>
                  <th className="py-2 px-3 text-right">STOCK MINIMO</th>
                  <th className="py-2 px-3 text-center">ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                {filteredComponents.map((c) => {
                  const prices = getPriceDisplays(c);
                  // Regla Figma: Si está bajo mínimo, fila completa en color salmón/rojo claro (#B10000)
                  const isRowCritical = c.isBelowMinimum;

                  return (
                    <tr
                      key={c.id}
                      className={`transition-colors ${
                        isRowCritical
                          ? tableStyles.rowAlert
                          : !c.active
                          ? `${tableStyles.row} opacity-60`
                          : `${tableStyles.row} hover:bg-steffen-gray/40`
                      }`}
                    >
                      {/* Código */}
                      <td className="py-1.5 px-3 font-bold">
                        {c.code}
                      </td>

                      {/* Proveedor */}
                      <td className="py-1.5 px-3 font-semibold">
                        {c.supplierName || '-'}
                      </td>

                      {/* Nombre Componente */}
                      <td className="py-1.5 px-3 font-medium">
                        {c.name}
                      </td>

                      {/* Última Compra */}
                      <td className="py-1.5 px-3 text-gray-700">
                        -
                      </td>

                      {/* Última Act Precio */}
                      <td className="py-1.5 px-3 text-gray-700">
                        {c.priceUpdatedAt
                          ? new Date(c.priceUpdatedAt).toLocaleDateString('es-AR')
                          : '-'}
                      </td>

                      {/* P.U. USD */}
                      <td className="py-1.5 px-3 text-right">
                        {prices.usd}
                      </td>

                      {/* P.U $ (Neto) */}
                      <td className="py-1.5 px-3 text-right">
                        {prices.ars}
                      </td>

                      {/* P.U+ IVA */}
                      <td className="py-1.5 px-3 text-right font-semibold">
                        {prices.grossArs}
                      </td>

                      {/* Stock Actual en Unidades Enteras */}
                      <td className="py-1.5 px-3 text-right">
                        {c.stockCurrentUnits} u
                      </td>

                      {/* Stock Mínimo en Unidades Enteras */}
                      <td className="py-1.5 px-3 text-right text-gray-700">
                        {c.stockMinimumUnits} u
                      </td>

                      {/* Acciones */}
                      <td className="py-1.5 px-3 text-center whitespace-nowrap space-x-1">
                        <button
                          onClick={() => setSelectedComponent(c)}
                          title="Editar Ficha / Cotización"
                          className="p-1 rounded-[5px] hover:bg-steffen-gray text-steffen-surface/80 hover:text-steffen-surface transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleToggleActiveClick(c)}
                          title={c.active ? 'Desactivar insumo' : 'Activar insumo'}
                          className={`p-1 rounded-[5px] hover:bg-steffen-gray transition-colors cursor-pointer ${
                            c.active ? 'text-steffen-surface/60 hover:text-steffen-surface' : 'text-steffen-green'
                          }`}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

      </div>

      {/* Modal de Edición de Componente */}
      <EditComponentModal
        isOpen={Boolean(selectedComponent)}
        component={selectedComponent}
        activeSuppliers={activeSuppliers}
        onClose={() => setSelectedComponent(null)}
        onSuccess={() => {
          startTransition(() => {
            router.refresh();
          });
        }}
      />

      {/* ConfirmDialog para Desactivación */}
      {confirmDialogComp && (
        <ConfirmDialog
          isOpen={true}
          title="Desactivar Componente"
          message={`¿Estás seguro de que deseas desactivar el componente "${confirmDialogComp.name}" (${confirmDialogComp.code})? Ya no estará disponible para nuevos productos ni órdenes.`}
          onConfirm={() => handleExecuteToggle(confirmDialogComp, false)}
          onCancel={() => setConfirmDialogComp(null)}
        />
      )}
    </>
  );
};
