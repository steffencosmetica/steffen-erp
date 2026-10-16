'use client';

import React from 'react';
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react';
import type { PlanningMatrixDTO } from '@/actions/planning.dto';
import { tableStyles } from './UIComponents';

interface PlanningMatrixTableProps {
  planning: PlanningMatrixDTO;
  isPending?: boolean;
  /** Reordenamiento de columnas (Pedidos). Sin handler, la matriz es de solo lectura (Dashboard). */
  onMoveOrder?: (index: number, direction: 'LEFT' | 'RIGHT') => void;
  /** Reordenamiento de filas (Pedidos). Sin handler, la matriz es de solo lectura (Dashboard). */
  onMoveProduct?: (index: number, direction: 'UP' | 'DOWN') => void;
}

/**
 * Matriz de planificación (BUSINESS_RULES §35.1): presenta exactamente el resultado
 * del motor de planificación (reservas virtuales, cobertura con granel y faltantes).
 * No calcula nada ni genera movimientos.
 */
export const PlanningMatrixTable: React.FC<PlanningMatrixTableProps> = ({
  planning,
  isPending = false,
  onMoveOrder,
  onMoveProduct,
}) => {
  if (planning.openOrders.length === 0) {
    return <div className="py-12 text-center text-steffen-surface/60 text-xs">No hay pedidos abiertos para planificar.</div>;
  }
  if (planning.products.length === 0) {
    return (
      <div className="py-12 text-center text-steffen-surface/60 text-xs">
        Los pedidos abiertos no contienen productos para simular.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className={`${tableStyles.table} min-w-[525px]`}>
        <thead>
          <tr className={tableStyles.headRow}>
            <th className="py-2 px-3 text-left sticky left-0 bg-steffen-gray z-10 w-64 min-w-[150px]">PRODUCTO</th>

            {planning.openOrders.map((o, idx) => (
              <th key={o.orderId} className="py-2 px-3 text-center min-w-[90px]">
                <div className="flex items-center justify-center gap-1">
                  {onMoveOrder && (
                    <button
                      type="button"
                      disabled={idx === 0 || isPending}
                      onClick={() => onMoveOrder(idx, 'LEFT')}
                      className={`p-0.5 rounded-[5px] transition-colors ${
                        idx === 0 || isPending ? 'opacity-30 cursor-not-allowed' : 'hover:bg-black/40 cursor-pointer'
                      }`}
                      title="Mover pedido hacia la izquierda (mayor prioridad)"
                    >
                      <ArrowLeft className="w-3 h-3 stroke-[2.5]" />
                    </button>
                  )}
                  <span className="font-semibold">{o.code}</span>
                  {onMoveOrder && (
                    <button
                      type="button"
                      disabled={idx === planning.openOrders.length - 1 || isPending}
                      onClick={() => onMoveOrder(idx, 'RIGHT')}
                      className={`p-0.5 rounded-[5px] transition-colors ${
                        idx === planning.openOrders.length - 1 || isPending
                          ? 'opacity-30 cursor-not-allowed'
                          : 'hover:bg-black/40 cursor-pointer'
                      }`}
                      title="Mover pedido hacia la derecha (menor prioridad)"
                    >
                      <ArrowRight className="w-3 h-3 stroke-[2.5]" />
                    </button>
                  )}
                </div>
                <div className="text-[11px] font-normal normal-case truncate max-w-[90px] mx-auto mt-0.5">
                  {o.customerDisplayName}
                </div>
              </th>
            ))}

            <th className="py-2 px-3 text-center w-24">TOTAL</th>
            <th className="py-2 px-3 text-center w-36">STOCK</th>
            <th className="py-2 px-3 text-center w-28">FALTANTE</th>
          </tr>
        </thead>
        <tbody>
          {planning.products.map((p, pIdx) => (
            <tr key={p.productId} className={tableStyles.row}>
              <td className="py-1.5 px-3 sticky left-0 bg-black z-10">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-medium block truncate" title={p.productName}>
                      {p.productName}
                    </span>
                    <span className="text-[10px] text-steffen-surface/60 block truncate">{p.productCode}</span>
                  </div>
                  {onMoveProduct && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        disabled={pIdx === 0 || isPending}
                        onClick={() => onMoveProduct(pIdx, 'UP')}
                        className={`p-1 rounded-[5px] transition-colors ${
                          pIdx === 0 || isPending ? 'opacity-30 cursor-not-allowed' : 'hover:bg-steffen-gray cursor-pointer'
                        }`}
                        title="Mover producto arriba (mayor prioridad)"
                      >
                        <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
                      </button>
                      <button
                        type="button"
                        disabled={pIdx === planning.products.length - 1 || isPending}
                        onClick={() => onMoveProduct(pIdx, 'DOWN')}
                        className={`p-1 rounded-[5px] transition-colors ${
                          pIdx === planning.products.length - 1 || isPending
                            ? 'opacity-30 cursor-not-allowed'
                            : 'hover:bg-steffen-gray cursor-pointer'
                        }`}
                        title="Mover producto abajo (menor prioridad)"
                      >
                        <ArrowDown className="w-3.5 h-3.5 stroke-[2.5]" />
                      </button>
                    </div>
                  )}
                </div>
              </td>

              {planning.openOrders.map((o) => {
                const cell = p.ordersCoverage[o.orderId] || { requested: 0, covered: 0, hasShortage: false };
                return (
                  <td
                    key={o.orderId}
                    className={`py-1.5 px-3 text-center tabular-nums ${
                      cell.hasShortage
                        ? 'text-steffen-surface font-semibold bg-steffen-alert'
                        : cell.requested > 0
                        ? ''
                        : 'text-steffen-surface/40'
                    }`}
                    title={`Solicitado: ${cell.requested} | Cubierto: ${cell.covered}`}
                  >
                    {cell.requested}
                  </td>
                );
              })}

              <td className="py-1.5 px-3 text-center font-semibold tabular-nums">{p.totalRequested}</td>

              {/* Stock (físico + granel virtual) */}
              <td className="py-1.5 px-3 text-center tabular-nums">
                {p.stockProPart > 0 && p.bulkPart > 0 ? (
                  <span>
                    {p.stockProPart} + <span className="text-steffen-blue">({p.bulkPart})GR</span>
                  </span>
                ) : p.stockProPart === 0 && p.bulkPart > 0 ? (
                  <span className="text-steffen-blue">({p.bulkPart})GR</span>
                ) : p.stockProPart > 0 && p.bulkPart === 0 ? (
                  <span>{p.stockProPart}</span>
                ) : (
                  <span>0</span>
                )}
              </td>

              <td className="py-1.5 px-3 text-center font-semibold tabular-nums">
                {p.finalShortage > 0 ? (
                  <span className="text-steffen-red">{p.finalShortage}</span>
                ) : (
                  <span className="font-normal">-</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
