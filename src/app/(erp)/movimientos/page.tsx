import { redirect } from 'next/navigation';
import { getAuthenticatedUser, isUserAuthorized } from '@/auth/guard';
import { getPatrimonyService, getReportService } from '@/services/composition';
import { addDaysToBusinessDate } from '@/domain/business-period';
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

  // Últimos 90 días desde la fecha comercial de la base (no la hora del servidor).
  const { businessDate } = await getReportService().getCurrentBusinessPeriod();
  const defaultEndDate = businessDate;
  const defaultStartDate = addDaysToBusinessDate(businessDate, -90);

  const patrimonyService = getPatrimonyService();
  // Rango de 90 días filtrado en el servidor por business_date (sin límite previo al filtro).
  const movements = await patrimonyService
    .listMovements({ startDate: defaultStartDate, endDate: defaultEndDate })
    .catch(() => []);

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
