'use client';

import React, { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, AlertCircle } from 'lucide-react';
import { ErpIcon } from '@/ui/components/ErpIcon';
import { Button, CreateButton, Panel, SectionHeader, tableStyles } from '@/ui/components/UIComponents';
import type { OrderListItemDTO } from '@/actions/order.dto';
import type { PlanningMatrixDTO } from '@/actions/planning.dto';
import type { PendingRtmBannerDTO } from '@/actions/remittance.dto';
import { reorderProductPrioritiesAction, reorderOrderPrioritiesAction } from '@/actions/planning.actions';
import { NuevoPedidoModal } from '@/ui/modals/NuevoPedidoModal';
import { VerPedidoModal } from '@/ui/modals/VerPedidoModal';
import { CompletarRtmModal } from '@/ui/modals/CompletarRtmModal';

interface PedidosViewProps {
  orders: OrderListItemDTO[];
  initialPlanning: PlanningMatrixDTO;
  pendingRtm?: PendingRtmBannerDTO | null;
}

export const PedidosView: React.FC<PedidosViewProps> = ({ orders, initialPlanning, pendingRtm }) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isNewOrderOpen, setIsNewOrderOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isRtmModalOpen, setIsRtmModalOpen] = useState(false);
  const [planning, setPlanning] = useState<PlanningMatrixDTO>(initialPlanning);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Sincronizar estado local de planificación si cambia desde el servidor
  useEffect(() => {
    setPlanning(initialPlanning);
  }, [initialPlanning]);

  const handleRefresh = () => {
    router.refresh();
  };

  // Reordenar filas de productos (prioridad arriba/abajo)
  const handleMoveProduct = (index: number, direction: 'UP' | 'DOWN') => {
    if (direction === 'UP' && index === 0) return;
    if (direction === 'DOWN' && index === planning.products.length - 1) return;

    setErrorMsg('');
    const targetIndex = direction === 'UP' ? index - 1 : index + 1;
    const newProducts = [...planning.products];
    const [moved] = newProducts.splice(index, 1);
    newProducts.splice(targetIndex, 0, moved);

    // Actualización optimista de UI
    setPlanning({ ...planning, products: newProducts });

    startTransition(async () => {
      const productIds = newProducts.map((p) => p.productId);
      const res = await reorderProductPrioritiesAction(productIds);
      if (!res.success) {
        setErrorMsg(res.error || 'Error actualizando prioridad de productos.');
        setPlanning(initialPlanning);
      } else {
        router.refresh();
      }
    });
  };

  // Reordenar columnas de pedidos (prioridad izquierda/derecha)
  const handleMoveOrder = (index: number, direction: 'LEFT' | 'RIGHT') => {
    if (direction === 'LEFT' && index === 0) return;
    if (direction === 'RIGHT' && index === planning.openOrders.length - 1) return;

    setErrorMsg('');
    const targetIndex = direction === 'LEFT' ? index - 1 : index + 1;
    const newOrders = [...planning.openOrders];
    const [moved] = newOrders.splice(index, 1);
    newOrders.splice(targetIndex, 0, moved);

    // Actualización optimista de UI
    setPlanning({ ...planning, openOrders: newOrders });

    startTransition(async () => {
      const orderIds = newOrders.map((o) => o.orderId);
      const res = await reorderOrderPrioritiesAction(orderIds);
      if (!res.success) {
        setErrorMsg(res.error || 'Error actualizando prioridad de pedidos.');
        setPlanning(initialPlanning);
      } else {
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-6">
      {errorMsg && (
        <div className="p-3 border border-steffen-red text-steffen-red text-xs font-semibold rounded-[5px] flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* BANNER PERSISTENTE RTM_PENDING GATE (prioridad visual máxima, DESIGN.md §18.6) */}
      {pendingRtm && (
        <div className="p-4 border-2 border-steffen-gold rounded-[10px] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <AlertCircle className="w-6 h-6 text-steffen-gold shrink-0 mt-0.5 sm:mt-0" />
            <div>
              <p className="font-semibold text-base text-steffen-surface">
                Remito {pendingRtm.code} pendiente de procesar transporte (RTM_PENDING)
              </p>
              <p className="text-sm text-steffen-surface/80 mt-0.5">
                Destinatario: <strong>{pendingRtm.customerDisplayName}</strong>. No se puede generar un nuevo remito hasta
                completar el RTM de esta venta.
              </p>
            </div>
          </div>
          <Button variant="principal" onClick={() => setIsRtmModalOpen(true)} className="self-start sm:self-center shrink-0">
            Completar RTM
          </Button>
        </div>
      )}

      {/* 1. PEDIDOS — cards seleccionables + `+` (Figma Pedidos) */}
      <div>
        <div className="flex items-center gap-4 overflow-x-auto pb-2">
          {orders.length === 0 && (
            <p className="text-sm text-steffen-surface/70 pr-4">No hay pedidos abiertos.</p>
          )}
          {orders.map((o) => {
            const isSelected = selectedOrderId === o.id;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => setSelectedOrderId(isSelected ? null : o.id)}
                aria-pressed={isSelected}
                title={`Ver o editar pedido ${o.code}`}
                className={`ui-degrade shrink-0 w-[120px] min-h-[102px] px-3 py-3 rounded-[10px] border-2 flex flex-col items-center justify-center text-center gap-1 text-steffen-surface transition-colors cursor-pointer ${
                  isSelected ? 'border-steffen-gold' : 'border-steffen-gray hover:border-steffen-border'
                }`}
              >
                <span className="flex items-center gap-2">
                  <ErpIcon name="pedido" tone="gold" className="w-8 h-8" />
                  <span className="text-2xl font-bold">{o.code}</span>
                </span>
                <span className="text-base font-semibold truncate max-w-full">{o.customerName}</span>
                <span className="text-base font-semibold">{o.formattedDate}</span>
                <span className="text-sm font-semibold tabular-nums">{o.formattedTotalOrder}</span>
              </button>
            );
          })}
          <div className="shrink-0 px-2">
            <CreateButton label="Nuevo pedido" onClick={() => setIsNewOrderOpen(true)} />
          </div>
        </div>
      </div>

      {/* Detalle del PED seleccionado: panel debajo de las cards (Figma Pedidos) */}
      <VerPedidoModal
        variant="inline"
        orderId={selectedOrderId}
        isOpen={selectedOrderId !== null}
        onClose={() => setSelectedOrderId(null)}
        hasPendingRtm={!!pendingRtm}
        pendingRtmCode={pendingRtm?.code || null}
        onOrderUpdated={() => {
          handleRefresh();
        }}
        onOrderDeleted={() => {
          handleRefresh();
        }}
      />

      {/* 2. RESUMEN DE PEDIDOS / PLANIFICACIÓN */}
      <div>
        <SectionHeader title="RESUMEN DE PEDIDOS" />
        <Panel className="space-y-3">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 text-xs text-steffen-surface/70">
            <span>Planificación / simulación — no modifica stock</span>
            <span>
              <strong className="text-steffen-surface">Prioridad:</strong> Filas (arriba reserva primero) • Columnas (izquierda se cubre primero)
            </span>
          </div>

          {planning.openOrders.length === 0 ? (
            <div className="py-12 text-center text-steffen-surface/60 text-xs">No hay pedidos abiertos para planificar.</div>
          ) : planning.products.length === 0 ? (
            <div className="py-12 text-center text-steffen-surface/60 text-xs">
              Los pedidos abiertos no contienen productos para simular.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className={`${tableStyles.table} min-w-[525px]`}>
                <thead>
                  <tr className={tableStyles.headRow}>
                    <th className="py-2 px-3 text-left sticky left-0 bg-steffen-gray z-10 w-64 min-w-[150px]">PRODUCTO</th>

                    {planning.openOrders.map((o, idx) => (
                      <th key={o.orderId} className="py-2 px-3 text-center min-w-[90px]">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            disabled={idx === 0 || isPending}
                            onClick={() => handleMoveOrder(idx, 'LEFT')}
                            className={`p-0.5 rounded-[5px] transition-colors ${
                              idx === 0 || isPending ? 'opacity-30 cursor-not-allowed' : 'hover:bg-black/40 cursor-pointer'
                            }`}
                            title="Mover pedido hacia la izquierda (mayor prioridad)"
                          >
                            <ArrowLeft className="w-3 h-3 stroke-[2.5]" />
                          </button>
                          <span className="font-semibold">{o.code}</span>
                          <button
                            type="button"
                            disabled={idx === planning.openOrders.length - 1 || isPending}
                            onClick={() => handleMoveOrder(idx, 'RIGHT')}
                            className={`p-0.5 rounded-[5px] transition-colors ${
                              idx === planning.openOrders.length - 1 || isPending
                                ? 'opacity-30 cursor-not-allowed'
                                : 'hover:bg-black/40 cursor-pointer'
                            }`}
                            title="Mover pedido hacia la derecha (menor prioridad)"
                          >
                            <ArrowRight className="w-3 h-3 stroke-[2.5]" />
                          </button>
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
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              type="button"
                              disabled={pIdx === 0 || isPending}
                              onClick={() => handleMoveProduct(pIdx, 'UP')}
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
                              onClick={() => handleMoveProduct(pIdx, 'DOWN')}
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
          )}
        </Panel>
      </div>

      {/* MODALES */}
      <NuevoPedidoModal
        isOpen={isNewOrderOpen}
        onClose={() => setIsNewOrderOpen(false)}
        onSuccess={() => {
          handleRefresh();
        }}
      />

      <CompletarRtmModal
        remittanceId={pendingRtm ? pendingRtm.id : null}
        isOpen={isRtmModalOpen}
        onClose={() => setIsRtmModalOpen(false)}
        onCompleted={() => {
          setIsRtmModalOpen(false);
          handleRefresh();
        }}
      />
    </div>
  );
};
