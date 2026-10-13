import React from 'react';
import { redirect } from 'next/navigation';
import { getAuthenticatedUser, isUserAuthorized } from '@/auth/guard';
import { getOrderService } from '@/services/composition';
import { serializeOrderListItem } from '@/actions/order.dto';
import { PedidosView } from '@/ui/views/PedidosView';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Pedidos • Steffen ERP',
  description: 'Gestión y control de pedidos abiertos y clientes.',
};

export default async function PedidosPage() {
  const user = await getAuthenticatedUser();
  if (!user || !isUserAuthorized(user)) {
    redirect('/login');
  }

  const orderService = getOrderService();
  const openOrdersRecords = await orderService.listOpenOrders();
  const orders = openOrdersRecords.map(serializeOrderListItem);

  return <PedidosView orders={orders} />;
}
