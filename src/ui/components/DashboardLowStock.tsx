'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Decimal } from '@/domain/decimal';
import { formatArs, formatKg } from '@/lib/format';
import { isValidSimulationQuantity, simulatedPurchaseAmount } from '@/domain/purchase-simulation';
import {
  browserSimulationStorage,
  readPurchaseSimulation,
  withSimulationQuantity,
  writePurchaseSimulation,
  type PurchaseSimulationMap,
} from '@/lib/purchase-simulation-storage';
import type { NextManufacturingProductDTO } from '@/actions/factory.dto';
import type { BaseProductOption } from '@/ui/modals/RegistrarFabricacionModal';
import { Panel, tableStyles, forwardLinkClass, ForwardArrow } from './UIComponents';
import { SimulateManufacturingButton, useManufacturingSimulation } from './ManufacturingSimulation';

/** MPR/COM debajo del mínimo, ya ordenados por la regla normativa de prioridad. */
export interface LowStockMaterialDTO {
  id: string;
  name: string;
  itemType: 'MPR' | 'COM';
  supplierName: string | null;
  balance: string;
  /** Costo bruto vigente en ARS (con IVA y USD convertido). null si no hay proveedor de referencia. */
  unitCostGrossArs: string | null;
}

interface DashboardLowStockProps {
  materials: LowStockMaterialDTO[];
  products: NextManufacturingProductDTO[];
  baseProducts: BaseProductOption[];
  /** La planificación no pudo cargarse: la urgencia por pedidos no está disponible. */
  urgencyUnavailable?: boolean;
}

/** Mapa a persistir: solo cantidades no vacías/no cero, por ID de ítem (nunca importes). */
function toPersistedMap(quantities: PurchaseSimulationMap): PurchaseSimulationMap {
  return Object.entries(quantities).reduce<PurchaseSimulationMap>(
    (acc, [id, raw]) => withSimulationQuantity(acc, id, raw),
    {}
  );
}

/**
 * BAJO STOCK (Figma Dashboard): simulación de compra MPR/COM y Producto Final con
 * simular fabricación. Informativo: no modifica stock ni crea compras, movimientos
 * o reservas. Las cantidades simuladas se recuerdan en localStorage por ID de ítem;
 * el importe se recalcula siempre con el costo vigente.
 */
export const DashboardLowStock: React.FC<DashboardLowStockProps> = ({
  materials,
  products,
  baseProducts,
  urgencyUnavailable = false,
}) => {
  // Estado inicial vacío (igual en servidor y cliente); se restaura tras montar.
  const [quantities, setQuantities] = useState<PurchaseSimulationMap>({});
  const { simulate, modal } = useManufacturingSimulation(baseProducts);

  useEffect(() => {
    setQuantities(readPurchaseSimulation(browserSimulationStorage()));
  }, []);

  const rows = materials.map((m) => {
    const stored = quantities[m.id] ?? '';
    // Un valor guardado que no respeta la regla del tipo actual no se muestra.
    const raw = isValidSimulationQuantity(m.itemType, stored) ? stored : '';
    return { material: m, raw, amount: simulatedPurchaseAmount(m.itemType, raw, m.unitCostGrossArs) };
  });
  const total = rows.reduce((acc, r) => acc.plus(r.amount), new Decimal(0));

  const handleChange = (m: LowStockMaterialDTO, value: string) => {
    if (!isValidSimulationQuantity(m.itemType, value)) return;
    setQuantities((prev) => {
      const next = { ...prev, [m.id]: value };
      writePurchaseSimulation(browserSimulationStorage(), toPersistedMap(next));
      return next;
    });
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1.45fr_1fr] gap-5 items-start">
      {/* Izquierda: Componente/MP + simular compra */}
      <Panel variant="alert">
        <div className="overflow-x-auto">
          <table className={tableStyles.table}>
            <thead>
              <tr className={tableStyles.headRowAlert}>
                <th className="py-2 px-3 text-left">COMPONENTE/MP</th>
                <th className="py-2 px-3 text-left">PROVEEDOR</th>
                <th className="py-2 px-3 text-right">ACTUAL</th>
                <th className="py-2 px-3 text-center !bg-steffen-gray">SIMULAR COMPRA</th>
                <th className="py-2 px-3 text-right !bg-steffen-gray">$</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-steffen-surface/60">
                    Todas las materias primas y componentes están sobre su stock mínimo.
                  </td>
                </tr>
              ) : (
                rows.map(({ material: m, raw, amount }) => {
                  const unit = m.itemType === 'MPR' ? 'kg' : 'u';
                  return (
                    <tr key={m.id} className={tableStyles.row}>
                      <td className="py-1.5 px-3 truncate max-w-[160px]" title={m.name}>
                        {m.name}
                      </td>
                      <td className="py-1.5 px-3">{m.supplierName || '-'}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums text-steffen-red">
                        {formatKg(m.balance)} {unit}
                      </td>
                      <td className="py-1 px-3 text-center">
                        <input
                          type="text"
                          inputMode={m.itemType === 'MPR' ? 'decimal' : 'numeric'}
                          value={raw}
                          onChange={(e) => handleChange(m, e.target.value)}
                          placeholder="0"
                          aria-label={`Simular compra de ${m.name} (${unit})`}
                          title={m.unitCostGrossArs ? undefined : 'Sin costo vigente de referencia'}
                          className="w-[90px] h-[22px] px-2 text-right tabular-nums text-xs border border-steffen-border"
                        />
                      </td>
                      <td className="py-1.5 px-3 text-right tabular-nums">{formatArs(amount)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex justify-between items-center pt-3 text-sm">
          <Link href="/stock" className={forwardLinkClass}>
            Ir a Stock <ForwardArrow />
          </Link>
          <span className="font-semibold">
            TOTAL <span className="tabular-nums">{formatArs(total)}</span>
          </span>
        </div>
      </Panel>

      {/* Derecha: Producto Final (misma fuente que Mi Fábrica → Próxima fabricación) */}
      <Panel variant="alert">
        {urgencyUnavailable && (
          <p className="mb-2 text-xs text-steffen-red">
            No se pudo cargar la planificación: la urgencia por pedidos no está disponible.
          </p>
        )}
        <div className="overflow-x-auto">
          <table className={tableStyles.table}>
            <thead>
              <tr className={tableStyles.headRowAlert}>
                <th className="py-2 px-3 text-left">PRODUCTO FINAL</th>
                <th className="py-2 px-3 text-center">ACTUAL</th>
                <th className="py-2 px-3 text-center">ESTADO</th>
                <th className="py-2 px-3 text-center">SIMULAR</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-steffen-surface/60">
                    Sin productos finales para fabricar.
                  </td>
                </tr>
              ) : (
                products.map((p) => (
                  <tr key={p.id} className={tableStyles.row}>
                    <td className="py-1.5 px-3 truncate max-w-[180px]" title={p.name}>
                      {p.name}
                    </td>
                    <td className="py-1.5 px-3 text-center tabular-nums">{p.stockActual}</td>
                    <td className="py-1.5 px-3 text-center">{p.isUrgentForOrders ? 'URG PARA PEDIDOS' : 'POCO STOCK'}</td>
                    <td className="py-1 px-3 text-center">
                      <SimulateManufacturingButton productName={p.name} onClick={() => simulate(p.baseProductId)} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {modal}
    </div>
  );
};
