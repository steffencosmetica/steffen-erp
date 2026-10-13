'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, ShoppingCart } from 'lucide-react';
import type { OrderListItemDTO } from '@/actions/order.dto';
import { NuevoPedidoModal } from '@/ui/modals/NuevoPedidoModal';
import { VerPedidoModal } from '@/ui/modals/VerPedidoModal';

interface PedidosViewProps {
  orders: OrderListItemDTO[];
}

export const PedidosView: React.FC<PedidosViewProps> = ({ orders }) => {
  const router = useRouter();
  const [isNewOrderOpen, setIsNewOrderOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const handleRefresh = () => {
    router.refresh();
  };

  return (
    <div className="space-y-6">
      {/* Tarjeta Principal: Pedidos Abiertos (Figma PEDIDOS.png) */}
      <div className="bg-white rounded-[5px] border border-[#D9D9D9] p-5 shadow-xs">
        
        {/* Cabecera de la solapa */}
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

        {/* Tabla de Pedidos Abiertos */}
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

      {/* Modales */}
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
        onOrderUpdated={() => {
          handleRefresh();
        }}
        onOrderDeleted={() => {
          handleRefresh();
        }}
      />
    </div>
  );
};
