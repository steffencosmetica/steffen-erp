import React from 'react';
import { redirect } from 'next/navigation';
import { getAuthenticatedUser, isUserAuthorized } from '@/auth/guard';
import { getOrderService, getPlanningService } from '@/services/composition';
import { serializeOrderListItem } from '@/actions/order.dto';
import { serializePlanningMatrix } from '@/actions/planning.dto';
import { PedidosView } from '@/ui/views/PedidosView';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Pedidos • Steffen ERP',
  description: 'Gestión de pedidos comerciales abiertos y matriz de planificación.',
};

export default async function PedidosPage() {
  const user = await getAuthenticatedUser();
  if (!user || !isUserAuthorized(user)) {
    redirect('/login');
  }

  const orderService = getOrderService();
  const planningService = getPlanningService();

  const [openOrdersRecords, planningMatrix] = await Promise.all([
    orderService.listOpenOrders().catch(() => []),
    planningService.getPlanningMatrix().catch(() => ({
      openOrders: [],
      products: [],
      hasOrders: false,
    })),
  ]);

  const orders = openOrdersRecords.map(serializeOrderListItem);
  const initialPlanning = serializePlanningMatrix(planningMatrix);

  return <PedidosView orders={orders} initialPlanning={initialPlanning} />;
}
