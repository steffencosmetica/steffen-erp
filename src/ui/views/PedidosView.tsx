'use client';

import React, { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, AlertCircle } from 'lucide-react';
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
        <div className="p-3 bg-red-50 border border-[#DD0000] text-[#DD0000] text-xs font-semibold rounded-[2px] flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* BANNER PERSISTENTE RTM_PENDING GATE */}
      {pendingRtm && (
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-[5px] text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start sm:items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
            <div>
              <p className="font-bold text-sm text-black">
                Remito {pendingRtm.code} pendiente de procesar transporte (RTM_PENDING)
              </p>
              <p className="text-xs text-amber-800 mt-0.5">
                Destinatario: <strong>{pendingRtm.customerDisplayName}</strong>.
                No se puede generar un nuevo remito hasta completar el RTM de esta venta.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsRtmModalOpen(true)}
            className="self-start sm:self-center px-4 py-2 bg-[#0E50A0] hover:bg-[#0c4386] text-white font-bold text-xs rounded-[2px] transition-colors cursor-pointer shrink-0"
          >
            COMPLETAR RTM
          </button>
        </div>
      )}

      {/* ============================================================== */}
      {/* 1. TARJETA PRINCIPAL: PEDIDOS ABIERTOS (Figma PEDIDOS.png)     */}
      {/* ============================================================== */}
      <div className="bg-white rounded-[5px] border border-[#D9D9D9] p-5 shadow-xs">
        <div className="flex justify-between items-center pb-4 border-b border-[#D9D9D9]">
          <h2 className="text-xl font-bold tracking-tight text-black">
            Pedidos abiertos
          </h2>

          <button
            type="button"
            onClick={() => setIsNewOrderOpen(true)}
            className="h-[36px] px-5 bg-[#0E50A0] hover:bg-[#0c4386] text-white font-bold text-xs rounded-[2px] transition-colors cursor-pointer flex items-center gap-2 shadow-xs active:scale-[0.99]"
          >
            NUEVO PEDIDO
          </button>
        </div>

        <div className="mt-4 border border-[#D9D9D9] rounded-[2px] overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-[#D9D9D9] text-black font-bold uppercase text-[11px]">
              <tr>
                <th className="py-2.5 px-4">CODIGO</th>
                <th className="py-2.5 px-4">FECHA</th>
                <th className="py-2.5 px-4">CLIENTE</th>
                <th className="py-2.5 px-4 text-right">IMPORTE FINAL</th>
                <th className="py-2.5 px-4 text-center w-28">VER PEDIDO</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D9D9D9]">
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-gray-500 font-medium">
                    No hay pedidos abiertos.
                  </td>
                </tr>
              ) : (
                orders.map((o) => (
                  <tr key={o.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4 font-bold text-[#0E50A0]">
                      {o.code}
                    </td>
                    <td className="py-3 px-4 text-gray-700 font-medium">
                      {o.formattedDate}
                    </td>
                    <td className="py-3 px-4 font-semibold text-black">
                      {o.customerName}
                    </td>
                    <td className="py-3 px-4 text-right font-extrabold text-black">
                      {o.formattedTotalOrder}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => setSelectedOrderId(o.id)}
                        title={`Ver o editar pedido ${o.code}`}
                        className="p-1 text-black hover:text-[#0E50A0] transition-colors cursor-pointer inline-flex items-center justify-center"
                      >
                        <Eye className="w-5 h-5 stroke-[2]" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 2. TARJETA RESUMEN DE PEDIDOS / PLANIFICACIÓN (Figma PEDIDOS.png) */}
      {/* ============================================================== */}
      <div className="bg-white rounded-[5px] border border-[#D9D9D9] p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 pb-3 border-b border-[#D9D9D9]">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-black">
              Resumen de pedidos
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Planificación / simulación — no modifica stock
            </p>
          </div>
          <div className="text-[11px] bg-gray-50 border border-[#D9D9D9] text-gray-700 px-3 py-1.5 rounded-[2px]">
            <strong>Prioridad:</strong> Filas (arriba reserva primero) • Columnas (izquierda se cubre primero)
          </div>
        </div>

        {planning.openOrders.length === 0 ? (
          <div className="py-12 text-center text-gray-500 font-medium text-xs">
            No hay pedidos abiertos para planificar.
          </div>
        ) : planning.products.length === 0 ? (
          <div className="py-12 text-center text-gray-500 font-medium text-xs">
            Los pedidos abiertos no contienen productos para simular.
          </div>
        ) : (
          <div className="border border-[#D9D9D9] rounded-[2px] overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[700px]">
              <thead>
                <tr className="bg-[#D9D9D9] text-black font-bold uppercase text-[11px] border-b border-[#D9D9D9]">
                  {/* Columna PRODUCTO */}
                  <th className="py-2.5 px-3 text-left border-r border-[#D9D9D9] sticky left-0 bg-[#D9D9D9] z-10 w-64 min-w-[200px]">
                    PRODUCTO
                  </th>

                  {/* Columnas dinámicas de pedidos abiertos */}
                  {planning.openOrders.map((o, idx) => (
                    <th
                      key={o.orderId}
                      className="py-2 px-3 text-center border-r border-[#D9D9D9] min-w-[120px] bg-[#D9D9D9]"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          disabled={idx === 0 || isPending}
                          onClick={() => handleMoveOrder(idx, 'LEFT')}
                          className={`p-0.5 rounded text-gray-700 transition-colors ${
                            idx === 0 || isPending ? 'opacity-30 cursor-not-allowed' : 'hover:bg-white/60 cursor-pointer'
                          }`}
                          title="Mover pedido hacia la izquierda (mayor prioridad)"
                        >
                          <ArrowLeft className="w-3 h-3 stroke-[2.5]" />
                        </button>
                        <span className="font-bold text-[#0E50A0] text-xs">
                          {o.code}
                        </span>
                        <button
                          type="button"
                          disabled={idx === planning.openOrders.length - 1 || isPending}
                          onClick={() => handleMoveOrder(idx, 'RIGHT')}
                          className={`p-0.5 rounded text-gray-700 transition-colors ${
                            idx === planning.openOrders.length - 1 || isPending ? 'opacity-30 cursor-not-allowed' : 'hover:bg-white/60 cursor-pointer'
                          }`}
                          title="Mover pedido hacia la derecha (menor prioridad)"
                        >
                          <ArrowRight className="w-3 h-3 stroke-[2.5]" />
                        </button>
                      </div>
                      <div className="text-[11px] font-normal normal-case text-gray-800 truncate max-w-[120px] mx-auto mt-0.5">
                        {o.customerDisplayName}
                      </div>
                    </th>
                  ))}

                  {/* Columnas finales */}
                  <th className="py-2.5 px-3 text-center border-r border-[#D9D9D9] w-24">
                    TOTAL
                  </th>
                  <th className="py-2.5 px-3 text-center border-r border-[#D9D9D9] w-36">
                    STOCK
                  </th>
                  <th className="py-2.5 px-3 text-center w-28">
                    FALTANTE
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D9D9D9]">
                {planning.products.map((p, pIdx) => (
                  <tr key={p.productId} className="hover:bg-gray-50 transition-colors">
                    {/* Celda Producto con controles de prioridad */}
                    <td className="py-2.5 px-3 border-r border-[#D9D9D9] sticky left-0 bg-white z-10">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="font-bold text-black block truncate" title={p.productName}>
                            {p.productName}
                          </span>
                          <span className="text-[10px] text-gray-500 block truncate">
                            {p.productCode}
                          </span>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            disabled={pIdx === 0 || isPending}
                            onClick={() => handleMoveProduct(pIdx, 'UP')}
                            className={`p-1 rounded text-gray-600 transition-colors ${
                              pIdx === 0 || isPending ? 'opacity-30 cursor-not-allowed' : 'hover:bg-gray-200 cursor-pointer'
                            }`}
                            title="Mover producto arriba (mayor prioridad)"
                          >
                            <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
                          </button>
                          <button
                            type="button"
                            disabled={pIdx === planning.products.length - 1 || isPending}
                            onClick={() => handleMoveProduct(pIdx, 'DOWN')}
                            className={`p-1 rounded text-gray-600 transition-colors ${
                              pIdx === planning.products.length - 1 || isPending ? 'opacity-30 cursor-not-allowed' : 'hover:bg-gray-200 cursor-pointer'
                            }`}
                            title="Mover producto abajo (menor prioridad)"
                          >
                            <ArrowDown className="w-3.5 h-3.5 stroke-[2.5]" />
                          </button>
                        </div>
                      </div>
                    </td>

                    {/* Celdas de pedidos: rojo si hay faltante */}
                    {planning.openOrders.map((o) => {
                      const cell = p.ordersCoverage[o.orderId] || { requested: 0, covered: 0, hasShortage: false };
                      const hasShortage = cell.hasShortage;
                      return (
                        <td
                          key={o.orderId}
                          className={`py-2 px-3 text-center border-r border-[#D9D9D9] font-semibold ${
                            hasShortage
                              ? 'text-[#DD0000] font-bold bg-[#FFA8A8]/20'
                              : cell.requested > 0
                              ? 'text-black'
                              : 'text-gray-400 font-normal'
                          }`}
                          title={`Solicitado: ${cell.requested} | Cubierto: ${cell.covered}`}
                        >
                          {cell.requested}
                        </td>
                      );
                    })}

                    {/* Total Requerido */}
                    <td className="py-2 px-3 text-center font-bold text-black border-r border-[#D9D9D9]">
                      {p.totalRequested}
                    </td>

                    {/* Stock (físico + granel virtual en azul #0E50A0) */}
                    <td className="py-2 px-3 text-center font-semibold text-black border-r border-[#D9D9D9]">
                      {p.stockProPart > 0 && p.bulkPart > 0 ? (
                        <span>
                          {p.stockProPart} + <span className="text-[#0E50A0] font-bold">({p.bulkPart})GR</span>
                        </span>
                      ) : p.stockProPart === 0 && p.bulkPart > 0 ? (
                        <span className="text-[#0E50A0] font-bold">({p.bulkPart})GR</span>
                      ) : p.stockProPart > 0 && p.bulkPart === 0 ? (
                        <span>{p.stockProPart}</span>
                      ) : (
                        <span className="text-gray-600">0</span>
                      )}
                    </td>

                    {/* Faltante (rojo si > 0, guion si 0) */}
                    <td className="py-2 px-3 text-center font-bold">
                      {p.finalShortage > 0 ? (
                        <span className="text-[#DD0000]">{p.finalShortage}</span>
                      ) : (
                        <span className="text-gray-600 font-normal">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ============================================================== */}
      {/* 3. MODALES                                                     */}
      {/* ============================================================== */}
      <NuevoPedidoModal
        isOpen={isNewOrderOpen}
        onClose={() => setIsNewOrderOpen(false)}
        onSuccess={() => {
          handleRefresh();
        }}
      />

      <VerPedidoModal
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
