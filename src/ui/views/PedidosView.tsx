'use client';

import React, { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { PlanningMatrixTable } from '@/ui/components/PlanningMatrixTable';
import { ErpIcon } from '@/ui/components/ErpIcon';
import { Button, CreateButton, Panel, SectionHeader } from '@/ui/components/UIComponents';
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
                className="ui-order-card shrink-0 text-steffen-surface transition-colors cursor-pointer"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <ErpIcon name="pedido" tone="gold" className="w-6 h-6" />
                  <span className="min-w-0 truncate text-base font-semibold" title={o.customerName}>{o.customerName}</span>
                </span>
                <span className="ui-order-card-details">
                  <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-steffen-muted">
                    <span>{o.code}</span>
                    <span>{o.formattedDate}</span>
                  </span>
                  <span className="min-w-0 text-right text-base tabular-nums [overflow-wrap:anywhere]">{o.formattedTotalOrder}</span>
                </span>
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

          <PlanningMatrixTable
            planning={planning}
            isPending={isPending}
            onMoveOrder={handleMoveOrder}
            onMoveProduct={handleMoveProduct}
          />
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
