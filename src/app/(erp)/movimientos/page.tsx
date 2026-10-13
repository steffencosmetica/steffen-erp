import { redirect } from 'next/navigation';
import { getAuthenticatedUser, isUserAuthorized } from '@/auth/guard';
import { getPatrimonyService } from '@/services/composition';
import { MovimientosView } from '@/ui/views/MovimientosView';
import type { PatrimonialMovementDTO } from '@/actions/patrimony.dto';
import { toNumericString } from '@/domain/decimal';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Movimientos Patrimoniales • Steffen ERP',
  description: 'Historial completo de movimientos financieros y patrimoniales (MOV).',
};

export default async function MovimientosPage() {
  const user = await getAuthenticatedUser();
  if (!user || !isUserAuthorized(user)) {
    redirect('/login');
  }

  const now = new Date();
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(now.getDate() - 90);

  const defaultEndDate = now.toISOString().split('T')[0];
  const defaultStartDate = ninetyDaysAgo.toISOString().split('T')[0];

  const patrimonyService = getPatrimonyService();
  const movements = await patrimonyService.listMovements({ limit: 500 }).catch(() => []);

  const movementsDTO: PatrimonialMovementDTO[] = movements.map((m) => ({
    id: m.id,
    code: m.code,
    date: m.businessDate || (m.createdAt ? m.createdAt.split('T')[0] : ''),
    type: m.movementType,
    description: m.description,
    amountArs: toNumericString(m.amountArs),
    patrimonialVariation: m.patrimonialVariation || '',
  }));

  return (
    <MovimientosView
      initialMovements={movementsDTO}
      defaultStartDate={defaultStartDate}
      defaultEndDate={defaultEndDate}
    />
  );
}
