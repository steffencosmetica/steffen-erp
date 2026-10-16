'use client';

import React, { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  ConfirmDialog,
  IconButton,
  ListItemButton,
  Panel,
  SectionHeader,
  tableStyles,
} from '../components/UIComponents';
import { StockListToolbar } from '../components/StockListToolbar';
import { NewRawMaterialModal } from '../modals/NewRawMaterialModal';
import { EditRawMaterialModal } from '../modals/EditRawMaterialModal';
import { toggleRawMaterialActiveAction } from '@/actions/master-item.actions';
import type { RawMaterialDTO, ComponentDTO, SupplierOptionDTO } from '@/actions/master-item.dto';
import type {
  FinalProductDTO,
  BaseProductOptionDTO,
  ComponentOptionDTO,
} from '@/actions/product.dto';
import { ComponentsView } from './ComponentsView';
import { ProductsView } from './ProductsView';
import { NewProductModal } from '../modals/NewProductModal';
import { StockAdjustmentModal, type StockAdjustableItem } from '../modals/StockAdjustmentModal';
import type { StockMovementDTO } from '@/actions/stock.dto';
import { formatArs, formatKg } from '@/lib/format';
import { Edit3, Power, RefreshCw } from 'lucide-react';
import { ErpIcon } from '../components/ErpIcon';

interface RawMaterialsViewProps {
  initialRawMaterials: RawMaterialDTO[];
  initialComponents?: ComponentDTO[];
  initialProducts?: FinalProductDTO[];
  initialMovements?: StockMovementDTO[];
  activeSuppliers: SupplierOptionDTO[];
  activeBaseProducts?: BaseProductOptionDTO[];
  activeComponents?: ComponentOptionDTO[];
  defaultTab?: 'PRO' | 'MPR' | 'COM';
  defaultAction?: string;
}

export const RawMaterialsView: React.FC<RawMaterialsViewProps> = ({
  initialRawMaterials,
  initialComponents = [],
  initialProducts = [],
  initialMovements = [],
  activeSuppliers,
  activeBaseProducts = [],
  activeComponents = [],
  defaultTab = 'PRO',
  defaultAction,
}) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [activeTab, setActiveTab] = useState<'PRO' | 'MPR' | 'COM'>(defaultTab);
  const [searchTerm, setSearchTerm] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [onlyCritical, setOnlyCritical] = useState(false);

  // Modales
  const [createOpen, setCreateOpen] = useState(false);
  const [createProductOpen, setCreateProductOpen] = useState(defaultAction === 'new' && defaultTab === 'PRO');
  const [selectedRawMaterial, setSelectedRawMaterial] = useState<RawMaterialDTO | null>(null);
  const [adjustmentModalOpen, setAdjustmentModalOpen] = useState(false);
  const [preselectedAdjustItemId, setPreselectedAdjustItemId] = useState<string | null>(null);
  const [movementNotice, setMovementNotice] = useState<string | null>(null);

  // Diálogo de confirmación para desactivación
  const [confirmDialogMpr, setConfirmDialogMpr] = useState<RawMaterialDTO | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Lista consolidada de ítems para el modal de ajuste manual de stock (PRO, MPR, COM)
  const adjustableItems: StockAdjustableItem[] = useMemo(() => {
    const list: StockAdjustableItem[] = [];
    for (const p of initialProducts) {
      list.push({
        id: p.id,
        code: p.code,
        name: p.name,
        itemType: 'PRO',
        unitType: 'UNIT',
        currentBalance: p.stockCurrent,
      });
    }
    for (const m of initialRawMaterials) {
      list.push({
        id: m.id,
        code: m.code,
        name: m.name,
        itemType: 'MPR',
        unitType: 'KG',
        currentBalance: m.stockCurrentKg,
      });
    }
    for (const c of initialComponents) {
      list.push({
        id: c.id,
        code: c.code,
        name: c.name,
        itemType: 'COM',
        unitType: 'UNIT',
        currentBalance: c.stockCurrentUnits,
      });
    }
    return list.sort((a, b) => a.code.localeCompare(b.code));
  }, [initialProducts, initialRawMaterials, initialComponents]);

  // Filtrado en cliente sobre DTOs ya ordenados por ratio en servidor
  const filteredMaterials = initialRawMaterials.filter((m) => {
    if (!showInactive && !m.active) return false;
    if (onlyCritical && !m.isBelowMinimum) return false;
    if (!searchTerm.trim()) return true;

    const term = searchTerm.toLowerCase();
    return (
      m.code.toLowerCase().includes(term) ||
      m.name.toLowerCase().includes(term) ||
      (m.inci && m.inci.toLowerCase().includes(term)) ||
      (m.supplierName && m.supplierName.toLowerCase().includes(term)) ||
      (m.supplierCode && m.supplierCode.toLowerCase().includes(term))
    );
  });

  const criticalCount = initialRawMaterials.filter((m) => m.active && m.isBelowMinimum).length;

  const handleToggleActiveClick = (mpr: RawMaterialDTO) => {
    if (mpr.active) {
      setConfirmDialogMpr(mpr);
    } else {
      handleExecuteToggle(mpr, true);
    }
  };

  const handleExecuteToggle = async (mpr: RawMaterialDTO, targetActive: boolean) => {
    setActionError(null);
    startTransition(async () => {
      const res = await toggleRawMaterialActiveAction(mpr.id, targetActive);
      if (!res.success) {
        setActionError(res.error || 'Error al cambiar estado de la materia prima');
      } else {
        router.refresh();
      }
      setConfirmDialogMpr(null);
    });
  };

  // Precios para columnas de Figma: P.U. USD, P.U $, P.U+ IVA
  const getPriceDisplays = (m: RawMaterialDTO) => {
    if (!m.quotedPriceNet || !m.supplierCurrency) {
      return { usd: '-', ars: '-', grossArs: '-' };
    }
    const num = parseFloat(m.quotedPriceNet) || 0;
    if (m.supplierCurrency === 'USD') {
      const usdStr = `usd ${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
      return {
        usd: usdStr,
        ars: '-',
        grossArs: '-',
      };
    }

    const netArs = formatArs(num);
    const grossArs = formatArs(num * 1.21);
    return {
      usd: '-',
      ars: netArs,
      grossArs,
    };
  };

  const stockTabs: { key: 'PRO' | 'MPR' | 'COM'; label: string; icon: React.ReactNode }[] = [
    { key: 'PRO', label: 'Productos', icon: <ErpIcon name="productos" className="w-6 h-6" /> },
    { key: 'MPR', label: 'Materia Prima', icon: <ErpIcon name="materia-prima" className="w-6 h-6" /> },
    { key: 'COM', label: 'Componentes', icon: <ErpIcon name="envase" className="w-6 h-6" /> },
  ];

  return (
    <div className="space-y-6">
      {/* Barra de Stock (Figma Stock): pestañas como ítems de lista + acciones */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div className="flex flex-wrap items-center gap-3" role="tablist" aria-label="Tipo de stock">
            {stockTabs.map((t) => (
              <ListItemButton
                key={t.key}
                role="tab"
                aria-selected={activeTab === t.key}
                selected={activeTab === t.key}
                onClick={() => setActiveTab(t.key)}
                icon={t.icon}
                className="w-auto font-normal text-base whitespace-nowrap"
              >
                {t.label}
              </ListItemButton>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <IconButton
              label="Refrescar datos del servidor"
              icon={<RefreshCw className={`w-4 h-4 ${isPending ? 'animate-spin' : ''}`} />}
              onClick={() => {
                startTransition(() => {
                  router.refresh();
                });
              }}
              disabled={isPending}
            />

            <Button
              variant="secundario"
              onClick={() => {
                setPreselectedAdjustItemId(null);
                setAdjustmentModalOpen(true);
              }}
            >
              Ajuste de stock
            </Button>

            {activeTab === 'PRO' ? (
              <Button variant="secundario" onClick={() => setCreateProductOpen(true)}>
                Nuevo producto
              </Button>
            ) : (
              <Button variant="secundario" onClick={() => setCreateOpen(true)}>
                Nueva materia prima/componente
              </Button>
            )}
          </div>
        </div>

        {movementNotice && (
          <div className="mt-4 p-3 border border-steffen-green rounded-[5px] text-xs font-semibold text-steffen-surface flex justify-between items-center">
            <span>{movementNotice}</span>
            <button
              onClick={() => setMovementNotice(null)}
              aria-label="Cerrar aviso"
              className="text-steffen-surface/60 hover:text-steffen-surface font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {actionError && (
          <div className="mt-4 p-3 border border-steffen-red rounded-[5px] text-xs font-semibold text-steffen-red flex justify-between items-center">
            <span>{actionError}</span>
            <button
              onClick={() => setActionError(null)}
              aria-label="Cerrar error"
              className="text-steffen-surface/60 hover:text-steffen-surface font-bold"
            >
              ✕
            </button>
          </div>
        )}

      <Panel>
        {/* Contenido según pestaña activa */}
        {activeTab === 'PRO' ? (
          <ProductsView
            products={initialProducts}
            baseProducts={activeBaseProducts}
            components={activeComponents}
          />
        ) : activeTab === 'COM' ? (
          <ComponentsView
            components={initialComponents}
            activeSuppliers={activeSuppliers}
          />
        ) : (
          /* Contenedor Interior de Tabla idéntico a Figma */
          <div>
            
            {/* Encabezado (Figma Stock): TÍTULO ——— filtros + Buscar */}
            <StockListToolbar
              title="Materia prima"
              criticalCount={criticalCount}
              onlyCritical={onlyCritical}
              onToggleCritical={() => setOnlyCritical(!onlyCritical)}
              showInactive={showInactive}
              onShowInactiveChange={setShowInactive}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
            />

            {/* Tabla de Materia Prima con columnas exactas de Figma SOLAPA-MATERIA-Y-COMPONENTES.png */}
            {filteredMaterials.length === 0 ? (
              <div className="py-12 text-center text-steffen-surface/60 text-xs">
                No hay materias primas registradas para los filtros seleccionados.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className={tableStyles.table}>
                  <thead>
                    <tr className={tableStyles.headRow}>
                      <th className="py-2 px-3 text-left">CODIGO</th>
                      <th className="py-2 px-3 text-left">PROVEEDOR</th>
                      <th className="py-2 px-3 text-left">MATERIA PRIMA</th>
                      <th className="py-2 px-3 text-left">INCI</th>
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
                    {filteredMaterials.map((m) => {
                      const prices = getPriceDisplays(m);
                      // Regla Figma: Si está bajo mínimo, fila completa en color salmón/rojo claro (#B10000)
                      const isRowCritical = m.isBelowMinimum;

                      return (
                        <tr
                          key={m.id}
                          className={`transition-colors ${
                            isRowCritical
                              ? tableStyles.rowAlert
                              : !m.active
                              ? `${tableStyles.row} opacity-60`
                              : `${tableStyles.row} hover:bg-steffen-gray/40`
                          }`}
                        >
                          {/* Código */}
                          <td className="py-1.5 px-3 font-bold">
                            {m.code}
                          </td>

                          {/* Proveedor */}
                          <td className="py-1.5 px-3 font-semibold">
                            {m.supplierName || '-'}
                          </td>

                          {/* Nombre Materia Prima */}
                          <td className="py-1.5 px-3 font-medium">
                            {m.name}
                          </td>

                          {/* INCI */}
                          <td className="py-1.5 px-3 italic text-gray-700">
                            {m.inci || '-'}
                          </td>

                          {/* Última Compra */}
                          <td className="py-1.5 px-3 text-gray-700">
                            -
                          </td>

                          {/* Última Act Precio */}
                          <td className="py-1.5 px-3 text-gray-700">
                            {m.priceUpdatedAt
                              ? new Date(m.priceUpdatedAt).toLocaleDateString('es-AR')
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

                          {/* Stock Actual */}
                          <td className="py-1.5 px-3 text-right">
                            {m.stockCurrentKg} kg
                          </td>

                          {/* Stock Mínimo */}
                          <td className="py-1.5 px-3 text-right text-gray-700">
                            {m.stockMinimumKg} kg
                          </td>

                          {/* Acciones */}
                          <td className="py-1.5 px-3 text-center whitespace-nowrap space-x-1">
                            <button
                              onClick={() => setSelectedRawMaterial(m)}
                              title="Editar Ficha / Cotización"
                              className="p-1 rounded-[5px] hover:bg-steffen-gray text-steffen-surface/80 hover:text-steffen-surface transition-colors cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleToggleActiveClick(m)}
                              title={m.active ? 'Desactivar insumo' : 'Activar insumo'}
                              className={`p-1 rounded-[5px] hover:bg-steffen-gray transition-colors cursor-pointer ${
                                m.active ? 'text-steffen-surface/60 hover:text-steffen-surface' : 'text-steffen-green'
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
        )}
      </Panel>

      {/* MOVIMIENTOS DE STOCK (Figma Stock) */}
      <Panel>
        <SectionHeader
          title="Movimientos de stock"
          actions={
            <span className="text-xs text-steffen-surface/60">Últimos {initialMovements.length} movimientos (MST)</span>
          }
        />

        <div className="overflow-x-auto max-h-[315px] overflow-y-auto">
          <table className={tableStyles.table}>
            <thead className="sticky top-0 z-10">
              <tr className={tableStyles.headRow}>
                <th className="py-2 px-3 text-left">CODIGO</th>
                <th className="py-2 px-3 text-left">FECHA</th>
                <th className="py-2 px-3 text-left">TIPO</th>
                <th className="py-2 px-3 text-left">REGISTRO</th>
                <th className="py-2 px-3 text-left">DESCRIPCION</th>
              </tr>
            </thead>
            <tbody>
              {initialMovements.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-steffen-surface/60 text-xs">
                    No hay movimientos de stock registrados en el sistema.
                  </td>
                </tr>
              ) : (
                initialMovements.map((m) => {
                  const isPositive = m.quantityDeltaFormatted.startsWith('+');
                  return (
                    <tr key={m.id} className={tableStyles.row}>
                      <td className="py-1.5 px-3">{m.code}</td>
                      <td className="py-1.5 px-3 whitespace-nowrap">{m.businessDate || m.createdAt.slice(0, 10)}</td>
                      <td className="py-1.5 px-3 whitespace-nowrap">{m.movementType}</td>
                      <td className="py-1.5 px-3">
                        <span>
                          [{m.itemCode}] {m.itemName}
                        </span>
                        <span
                          className={`ml-2 font-semibold whitespace-nowrap ${
                            isPositive ? 'text-steffen-green' : 'text-steffen-red'
                          }`}
                        >
                          {m.quantityDeltaFormatted}
                        </span>
                      </td>
                      <td className="py-1.5 px-3 text-steffen-surface/80">{m.description}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Modal de Alta */}
      <NewRawMaterialModal
        isOpen={createOpen}
        activeSuppliers={activeSuppliers}
        initialType={activeTab === 'COM' ? 'COM' : 'MPR'}
        onClose={() => setCreateOpen(false)}
        onSuccess={() => {
          startTransition(() => {
            router.refresh();
          });
        }}
      />

      {/* Modal de Edición */}
      <EditRawMaterialModal
        isOpen={Boolean(selectedRawMaterial)}
        rawMaterial={selectedRawMaterial}
        activeSuppliers={activeSuppliers}
        onClose={() => setSelectedRawMaterial(null)}
        onSuccess={() => {
          startTransition(() => {
            router.refresh();
          });
        }}
      />

      {/* Modal de Alta de Producto Final */}
      {createProductOpen && (
        <NewProductModal
          isOpen={createProductOpen}
          baseProducts={activeBaseProducts}
          components={activeComponents}
          onClose={() => setCreateProductOpen(false)}
          onSuccess={() => {
            startTransition(() => {
              router.refresh();
            });
          }}
        />
      )}

      {/* Modal de Ajuste Manual de Stock */}
      <StockAdjustmentModal
        isOpen={adjustmentModalOpen}
        items={adjustableItems}
        preselectedItemId={preselectedAdjustItemId}
        onClose={() => setAdjustmentModalOpen(false)}
        onSuccess={(res) => {
          setMovementNotice(`Ajuste ${res.movementCode} registrado con éxito.`);
          startTransition(() => {
            router.refresh();
          });
        }}
      />

      {/* ConfirmDialog para Desactivación */}
      {confirmDialogMpr && (
        <ConfirmDialog
          isOpen={true}
          title="Desactivar Materia Prima"
          message={`¿Estás seguro de que deseas desactivar la materia prima "${confirmDialogMpr.name}" (${confirmDialogMpr.code})? Ya no estará disponible para nuevas formulaciones ni órdenes de producción.`}
          onConfirm={() => handleExecuteToggle(confirmDialogMpr, false)}
          onCancel={() => setConfirmDialogMpr(null)}
        />
      )}

    </div>
  );
};
