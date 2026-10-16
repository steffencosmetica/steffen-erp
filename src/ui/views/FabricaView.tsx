'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { ErpIcon } from '@/ui/components/ErpIcon';
import { SimulateManufacturingButton, useManufacturingSimulation } from '@/ui/components/ManufacturingSimulation';
import { Panel, SectionHeader, CreateButton, tableStyles, forwardLinkClass, ForwardArrow } from '@/ui/components/UIComponents';
import { type CostGainAnalysisDTO } from '@/actions/cost-gain.dto';
import { CostGainView } from './CostGainView';
import { RegistrarFabricacionModal, type BaseProductOption } from '@/ui/modals/RegistrarFabricacionModal';
import { RegistrarEnvasadoModal, type PackagingProductOption } from '@/ui/modals/RegistrarEnvasadoModal';
import type { BulkLotDTO, FactoryMovementDTO, NextManufacturingProductDTO } from '@/actions/factory.dto';
import { formatKg } from '@/lib/format';

export interface FabricaFormulaOptionDTO {
  id: string;
  name: string;
  code: string;
  items: Array<{
    rawMaterialName: string;
    quantityKg: string;
  }>;
}

/** Misma regla y DTO que Dashboard → BAJO STOCK (Producto Final). */
export type FabricaLowStockProductDTO = NextManufacturingProductDTO;

interface FabricaViewProps {
  costGainAnalysis: CostGainAnalysisDTO;
  formulaOptions?: FabricaFormulaOptionDTO[];
  lowStockProducts?: FabricaLowStockProductDTO[];
  bulkLots?: BulkLotDTO[];
  factoryMovements?: FactoryMovementDTO[];
  baseProductsForFabrication?: BaseProductOption[];
  productsForPackaging?: PackagingProductOption[];
}

export const FabricaView: React.FC<FabricaViewProps> = ({
  costGainAnalysis,
  formulaOptions = [],
  lowStockProducts = [],
  bulkLots = [],
  factoryMovements = [],
  baseProductsForFabrication = [],
  productsForPackaging = [],
}) => {
  const router = useRouter();
  const [selectedFormulaId, setSelectedFormulaId] = useState<string>(
    formulaOptions[0]?.id || ''
  );
  const [isFabricacionModalOpen, setIsFabricacionModalOpen] = useState<boolean>(false);
  const { simulate, modal: simulationModal } = useManufacturingSimulation(baseProductsForFabrication);
  const [isEnvasadoModalOpen, setIsEnvasadoModalOpen] = useState<boolean>(false);

  const activeFormula = formulaOptions.find((f) => f.id === selectedFormulaId) || formulaOptions[0] || null;

  // Atajo visual: tocar un granel abre Envasado con ese lote preseleccionado (DESIGN.md §4.3).
  const [envasadoLotId, setEnvasadoLotId] = useState<string | undefined>(undefined);
  const openEnvasadoForLot = (lotId: string) => {
    setEnvasadoLotId(lotId);
    setIsEnvasadoModalOpen(true);
  };

  return (
    <div className=" pb-16 space-y-5">
      {/* 1. GRANELES — tiles por lote abierto + `+` para registrar fabricación (Figma Mi Fábrica) */}
      <Panel className="!py-6">
        <div className="flex items-center gap-8 overflow-x-auto pb-2 px-4">
          {bulkLots.map((lot) => (
            <button
              key={lot.id}
              type="button"
              onClick={() => openEnvasadoForLot(lot.id)}
              title={`Registrar envasado del lote ${lot.code}`}
              className="shrink-0 w-[143px] flex flex-col items-center text-center gap-1 px-2 py-2 rounded-[10px] border border-transparent hover:border-steffen-gold transition-colors cursor-pointer"
            >
              <ErpIcon name="tanque" tone="original" className="w-[98px] h-[120px] grayscale brightness-[1.6]" />
              <span className="mt-2 text-lg text-steffen-surface truncate max-w-full">{lot.baseProductName}</span>
              <span className="text-2xl font-bold text-steffen-surface">{formatKg(lot.kgAvailable)}Kg</span>
              <span className="mt-1 text-base text-steffen-surface">
                <span>{lot.code}</span> - {lot.businessDate}
              </span>
            </button>
          ))}
          <div className="shrink-0 flex items-center px-4">
            <CreateButton label="Registrar fabricación" onClick={() => setIsFabricacionModalOpen(true)} />
          </div>
        </div>
        <p className="mt-4 text-base text-steffen-surface text-center">
          {bulkLots.length > 0
            ? 'Presionar un granel para registrar un envasado'
            : 'Sin lotes a granel disponibles. Usá + para registrar una fabricación.'}
        </p>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        {/* Columna izquierda: Próxima fabricación + Costo-Ganancia */}
        <div className="lg:col-span-2 space-y-5">
          <Panel>
            <SectionHeader
              title="Próxima fabricación"
              actions={
                <>
                  <Link
                    href="/stock?tab=productos&action=new"
                    className="ui-btn-dark h-8 px-3 inline-flex items-center gap-1.5 rounded-[5px] text-xs font-semibold transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Nuevo producto
                  </Link>
                  <Link
                    href="/stock?tab=productos"
                    className={forwardLinkClass}
                  >
                    Ver todos <ForwardArrow />
                  </Link>
                </>
              }
            />
            <div className="max-h-[195px] overflow-y-auto">
              <table className={tableStyles.table}>
                <thead>
                  <tr className={`${tableStyles.headRow} sticky top-0 z-10`}>
                    <th className="py-2 px-3 text-left w-[40%]">PRODUCTO FINAL</th>
                    <th className="py-2 px-3 text-center w-[15%]">STOCK MINIMO</th>
                    <th className="py-2 px-3 text-center w-[15%]">STOCK ACTUAL</th>
                    <th className="py-2 px-3 text-center w-[20%]">ESTADO</th>
                    <th className="py-2 px-3 text-center w-[10%]">SIMULAR</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStockProducts.length > 0 ? (
                    lowStockProducts.map((p) => (
                      <tr key={p.id} className={p.isUrgentForOrders ? tableStyles.rowAlert : tableStyles.row}>
                        <td className="py-1.5 px-3 font-medium truncate max-w-0">{p.name}</td>
                        <td className="py-1.5 px-3 text-center tabular-nums">{p.stockMinimum}</td>
                        <td className="py-1.5 px-3 text-center tabular-nums">{p.stockActual}</td>
                        <td className="py-1.5 px-3 text-center font-medium">
                          {p.isUrgentForOrders ? 'URG PARA PEDIDOS' : 'POCO STOCK'}
                        </td>
                        <td className="py-1.5 px-3 text-center">
                          <SimulateManufacturingButton productName={p.name} onClick={() => simulate(p.baseProductId)} />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-xs text-steffen-surface/60">
                        Sin alertas de producción bajo stock
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

          {/* Costo-Ganancia (Panel propio) */}
          <CostGainView analysis={costGainAnalysis} basePath="/fabrica" />
        </div>

        {/* Columna derecha: Fórmulas */}
        <Panel className="flex flex-col min-h-[390px]">
          <SectionHeader title="Formulas" />
          <select
            value={selectedFormulaId}
            onChange={(e) => setSelectedFormulaId(e.target.value)}
            aria-label="Seleccionar producto base"
            className="w-full h-8 px-2.5 mb-3 text-sm border border-steffen-border rounded-[5px] cursor-pointer"
          >
            {formulaOptions.length === 0 && <option value="">No hay fórmulas cargadas</option>}
            {formulaOptions.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} ({f.code})
              </option>
            ))}
          </select>

          <div className="flex-1 overflow-y-auto min-h-0">
            <table className="w-full text-sm text-steffen-surface">
              <thead>
                <tr className="border-b border-steffen-border font-semibold uppercase text-sm">
                  <th className="py-1.5 text-left">Materia prima</th>
                  <th className="py-1.5 text-right">Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {activeFormula && activeFormula.items.length > 0 ? (
                  activeFormula.items.map((it, idx) => (
                    <tr key={idx}>
                      <td className="py-1 truncate max-w-0">{it.rawMaterialName}</td>
                      <td className="py-1 text-right tabular-nums whitespace-nowrap">{formatKg(it.quantityKg)} kg</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={2} className="py-8 text-center text-xs text-steffen-surface/60">
                      Seleccione un producto base para ver su fórmula
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between pt-4">
            <Link
              href="/formulas?action=new"
              className="ui-btn-dark h-10 px-10 inline-flex items-center rounded-[5px] text-lg transition-colors"
            >
              Nueva formula
            </Link>
            <Link
              href="/formulas"
              className={forwardLinkClass}
            >
              Ver todas <ForwardArrow />
            </Link>
          </div>
        </Panel>
      </div>

      {/* MOVIMIENTOS DE FÁBRICA (ancho completo) */}
      <Panel>
        <SectionHeader title="Movimientos de fábrica" />
        <div className="max-h-[225px] overflow-y-auto">
          <table className={tableStyles.table}>
            <thead>
              <tr className={`${tableStyles.headRow} sticky top-0 z-10`}>
                <th className="py-2 px-3 text-left w-[13%]">CODIGO</th>
                <th className="py-2 px-3 text-left w-[12%]">FECHA</th>
                <th className="py-2 px-3 text-left w-[13%]">TIPO</th>
                <th className="py-2 px-3 text-left w-[37%]">DESCRIPCION</th>
                <th className="py-2 px-3 text-right w-[25%]">REGISTRO</th>
              </tr>
            </thead>
            <tbody>
              {factoryMovements.length > 0 ? (
                factoryMovements.map((mov) => (
                  <tr key={mov.id} className={tableStyles.row}>
                    <td className="py-1.5 px-3">{mov.code}</td>
                    <td className="py-1.5 px-3">{mov.businessDate}</td>
                    <td className="py-1.5 px-3">{mov.movementType}</td>
                    <td className="py-1.5 px-3 truncate max-w-0">{mov.description}</td>
                    <td className="py-1.5 px-3 text-right text-xs">
                      {mov.movementType === 'FABRICACIÓN' || mov.movementType === 'FABRICACION'
                        ? '- MATERIA PRIMA + GRANEL'
                        : mov.movementType === 'ENVASADO'
                        ? '- GRANEL - COMPONENTES + PRODUCTOS'
                        : mov.movementType === 'MERMA'
                        ? '- GRANEL'
                        : mov.movementType === 'SOBRANTE'
                        ? '+ PRODUCTOS'
                        : '-'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-xs text-steffen-surface/60">
                    Sin movimientos de fábrica registrados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Modal de Registro de Fabricación */}
      <RegistrarFabricacionModal
        isOpen={isFabricacionModalOpen}
        onClose={() => setIsFabricacionModalOpen(false)}
        onSuccess={() => router.refresh()}
        baseProducts={baseProductsForFabrication}
      />

      {/* Modal de Registro de Envasado */}
      <RegistrarEnvasadoModal
        isOpen={isEnvasadoModalOpen}
        onClose={() => setIsEnvasadoModalOpen(false)}
        onSuccess={() => router.refresh()}
        bulkLots={bulkLots}
        products={productsForPackaging}
        initialBulkLotId={envasadoLotId}
      />
      {simulationModal}
    </div>
  );
};
