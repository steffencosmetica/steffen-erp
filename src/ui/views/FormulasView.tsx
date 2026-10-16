'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Plus, Edit3, History, Power } from 'lucide-react';
import { ErpIcon } from '../components/ErpIcon';
import type { BaseProductDTO, ActiveRawMaterialDTO } from '@/actions/formula.dto';
import { toggleBaseProductActiveAction } from '@/actions/formula.actions';
import { NewFormulaModal } from '../modals/NewFormulaModal';
import { NewFormulaVersionModal } from '../modals/NewFormulaVersionModal';
import { FormulaHistoryModal } from '../modals/FormulaHistoryModal';
import { Button, ConfirmDialog, ListItemButton, Panel, SecondaryHeader, tableStyles } from '../components/UIComponents';
import { formatArs as formatArsCanonical } from '@/lib/format';

interface FormulasViewProps {
  initialBaseProducts?: BaseProductDTO[];
  activeRawMaterials?: ActiveRawMaterialDTO[];
  defaultAction?: string;
}

export const FormulasView: React.FC<FormulasViewProps> = ({
  initialBaseProducts = [],
  activeRawMaterials = [],
  defaultAction,
}) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [searchTerm, setSearchTerm] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [selectedPbaId, setSelectedPbaId] = useState<string>(
    initialBaseProducts[0]?.id || ''
  );

  // Modales
  const [isNewFormulaModalOpen, setIsNewFormulaModalOpen] = useState(defaultAction === 'new');
  const [isNewVersionModalOpen, setIsNewVersionModalOpen] = useState(false);
  const [editingBaseProduct, setEditingBaseProduct] = useState<BaseProductDTO | null>(null);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

  const handleOpenEditVersion = (pba: BaseProductDTO) => {
    setEditingBaseProduct(pba);
    setIsNewVersionModalOpen(true);
  };

  const handleCloseEditVersion = () => {
    setIsNewVersionModalOpen(false);
    setEditingBaseProduct(null);
  };

  // Diálogo para cambiar estado activo
  const [confirmTogglePba, setConfirmTogglePba] = useState<BaseProductDTO | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Filtrado de PBAs en memoria (lado cliente)
  const filteredBaseProducts = initialBaseProducts.filter((bp) => {
    if (!showInactive && !bp.active) return false;
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return bp.name.toLowerCase().includes(term) || bp.code.toLowerCase().includes(term);
  });

  // PBA actualmente seleccionado
  const selectedPba =
    initialBaseProducts.find((bp) => bp.id === selectedPbaId) ||
    filteredBaseProducts[0] ||
    null;

  const formatArs = (str: string | null | undefined) => formatArsCanonical(str);

  const formatKg = (str: string | null | undefined) => {
    if (!str) return '0 kg';
    const num = parseFloat(str);
    if (isNaN(num)) return '0 kg';
    return `${num.toLocaleString('es-AR', { maximumFractionDigits: 3 })} kg`;
  };

  const handleToggleActiveClick = (pba: BaseProductDTO) => {
    if (pba.active) {
      setConfirmTogglePba(pba);
    } else {
      executeToggleActive(pba, true);
    }
  };

  const executeToggleActive = async (pba: BaseProductDTO, targetActive: boolean) => {
    setActionError(null);
    startTransition(async () => {
      const res = await toggleBaseProductActiveAction(pba.id, targetActive);
      if (!res.success) {
        setActionError(res.error || 'Error al cambiar estado del Producto Base.');
      } else {
        router.refresh();
      }
      setConfirmTogglePba(null);
    });
  };

  return (
    <div className="space-y-6">
      {/* Barra superior (Figma Fórmulas): Volver · FORMULAS · NUEVA FORMULA */}
      <SecondaryHeader
        title="Formulas"
        backHref="/stock"
        actions={
          <Button variant="secundario" onClick={() => setIsNewFormulaModalOpen(true)}>
            <Plus className="w-4 h-4" />
            Nueva formula
          </Button>
        }
      />

      {actionError && (
        <div className="p-3 border border-steffen-red text-steffen-red text-xs font-semibold rounded-[5px]">{actionError}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Lista lateral de Productos Base (ListItem) */}
        <div className="lg:col-span-3 flex flex-col gap-3">
          <div className="space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 text-steffen-surface/50 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar Producto Base o código..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-[26px] pl-9 pr-3 border border-steffen-border text-xs rounded-[5px] focus:outline-none focus:border-steffen-gold"
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-steffen-surface/60 px-1">
              <span>{filteredBaseProducts.length} productos base</span>
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                  className="rounded border-steffen-border accent-steffen-gold focus:ring-0"
                />
                <span>Mostrar inactivos</span>
              </label>
            </div>
          </div>

          <div className="space-y-2 overflow-y-auto max-h-[420px] pr-1">
            {filteredBaseProducts.length === 0 ? (
              <div className="py-12 text-center text-xs text-steffen-surface/60">No se encontraron productos base.</div>
            ) : (
              filteredBaseProducts.map((bp) => {
                const isSelected = selectedPba?.id === bp.id;
                return (
                  <ListItemButton
                    key={bp.id}
                    selected={isSelected}
                    onClick={() => setSelectedPbaId(bp.id)}
                    title={`${bp.code}${bp.currentVersion ? ` • v${bp.currentVersion}` : ''}${!bp.active ? ' (Inactivo)' : ''}`}
                    icon={<span className={isSelected ? '' : 'opacity-0'}><ErpIcon name="envase" tone="light" className="w-5 h-5" /></span>}
                    className={!bp.active ? 'opacity-60' : ''}
                  >
                    {bp.name}
                    {!bp.active ? ' (Inactivo)' : ''}
                  </ListItemButton>
                );
              })
            )}
          </div>
        </div>

        {/* Panel de la fórmula vigente */}
        <Panel className="lg:col-span-9 min-h-[390px] flex flex-col">
          {selectedPba ? (
            <div className="flex flex-col flex-1 gap-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-semibold text-sm uppercase">Producto base</span>
                  <span className="text-sm">{selectedPba.name}</span>
                  {selectedPba.currentVersion && (
                    <span className="ml-2 px-2 py-0.5 border border-steffen-gold text-steffen-gold text-[10px] font-semibold uppercase rounded-[5px]">
                      v{selectedPba.currentVersion} vigente
                    </span>
                  )}
                  {!selectedPba.active && (
                    <span className="ml-2 px-2 py-0.5 bg-steffen-gray text-steffen-surface/80 text-[10px] font-semibold uppercase rounded-[5px]">
                      Inactivo
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-semibold text-sm uppercase">Codigo</span>
                    <span className="text-sm">{selectedPba.code}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleActiveClick(selectedPba)}
                    title={selectedPba.active ? 'Desactivar Producto Base' : 'Activar Producto Base'}
                    aria-label={selectedPba.active ? 'Desactivar Producto Base' : 'Activar Producto Base'}
                    className={`p-1.5 rounded-[5px] hover:bg-steffen-gray transition-colors cursor-pointer ${
                      selectedPba.active ? 'text-steffen-surface/60 hover:text-steffen-red' : 'text-steffen-green'
                    }`}
                  >
                    <Power className="w-4 h-4" />
                  </button>
                  <Button
                    variant="secundario"
                    onClick={() => setIsHistoryModalOpen(true)}
                    title="Ver versiones anteriores de esta fórmula"
                  >
                    <History className="w-3.5 h-3.5" />
                    Historial
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className={tableStyles.table}>
                  <thead>
                    <tr className="font-semibold uppercase text-sm border-b border-steffen-surface">
                      <th className="py-2 px-3 text-left w-28">CODIGO</th>
                      <th className="py-2 px-3 text-left">MATERIA PRIMA</th>
                      <th className="py-2 px-3 text-right w-36">CANTIDAD (KG)</th>
                      <th className="py-2 px-3 text-right w-36">COSTO POR KILO</th>
                      <th className="py-2 px-3 text-right w-36">COSTO FINAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPba.currentFormulaBreakdown?.lines &&
                    selectedPba.currentFormulaBreakdown.lines.length > 0 ? (
                      selectedPba.currentFormulaBreakdown.lines.map((line, idx) => (
                        <tr key={idx}>
                          <td className="py-1.5 px-3">{line.rawMaterialCode}</td>
                          <td className="py-1.5 px-3">{line.rawMaterialName}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums">{formatKg(line.quantityKg)}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums">{formatArs(line.currentUnitCost)}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums">{formatArs(line.partialCost)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-10 text-center text-steffen-surface/60">
                          No se registran renglones en la fórmula vigente.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {selectedPba.currentFormulaBreakdown && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div className="flex items-center gap-3">
                    <span>Total Kg Granel</span>
                    <span className="tabular-nums">{formatKg(selectedPba.currentFormulaBreakdown.totalKgBulk)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span>Costo Granel:</span>
                    <span className="tabular-nums">{formatArs(selectedPba.currentFormulaBreakdown.totalCostBulkArs)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span>Costo producto por kg:</span>
                    <span className="tabular-nums font-semibold">
                      {formatArs(selectedPba.currentFormulaBreakdown.costPerKgPbaArs)}
                    </span>
                  </div>
                </div>
              )}

              <div className="mt-auto pt-6 flex justify-end">
                <Button variant="secundario" onClick={() => handleOpenEditVersion(selectedPba)}>
                  <Edit3 className="w-4 h-4" />
                  Editar formula
                </Button>
              </div>
            </div>
          ) : (
            <div className="py-24 text-center text-steffen-surface/60 text-xs">
              Seleccione un Producto Base de la lista para consultar su fórmula.
            </div>
          )}
        </Panel>
      </div>

      {/* Modal Nueva Formula (Alta PBA + v1) */}
      <NewFormulaModal
        isOpen={isNewFormulaModalOpen}
        activeRawMaterials={activeRawMaterials}
        onClose={() => setIsNewFormulaModalOpen(false)}
        onSuccess={(created) => {
          setSelectedPbaId(created.id);
          startTransition(() => {
            router.refresh();
          });
        }}
      />

      {/* Modal Editar Formula (Nueva Versión) */}
      {isNewVersionModalOpen && editingBaseProduct && (
        <NewFormulaVersionModal
          key={editingBaseProduct.id}
          isOpen={isNewVersionModalOpen}
          baseProduct={editingBaseProduct}
          activeRawMaterials={activeRawMaterials}
          onClose={handleCloseEditVersion}
          onSuccess={() => {
            handleCloseEditVersion();
            startTransition(() => {
              router.refresh();
            });
          }}
        />
      )}

      {/* Modal Historial de Versiones */}
      {isHistoryModalOpen && selectedPba && (
        <FormulaHistoryModal
          key={selectedPba.id}
          isOpen={isHistoryModalOpen}
          baseProduct={selectedPba}
          onClose={() => setIsHistoryModalOpen(false)}
        />
      )}

      {/* ConfirmDialog Desactivación PBA */}
      {confirmTogglePba && (
        <ConfirmDialog
          isOpen={true}
          title="Desactivar Producto Base"
          message={`¿Estás seguro de que deseas desactivar el Producto Base "${confirmTogglePba.name}" (${confirmTogglePba.code})? Ya no se podrán crear nuevas versiones de fórmula ni asignarlo a nuevos productos.`}
          onConfirm={() => executeToggleActive(confirmTogglePba, false)}
          onCancel={() => setConfirmTogglePba(null)}
        />
      )}
    </div>
  );
};
