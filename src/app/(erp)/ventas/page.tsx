import { redirect } from 'next/navigation';
import { getAuthenticatedUser, isUserAuthorized } from '@/auth/guard';
import { getRemittanceService, getReportService } from '@/services/composition';
import { toNumericString } from '@/domain/decimal';
import { serializeMonthlySale } from '@/actions/remittance.dto';
import { VentasView, type SalesPeriodTotalDTO } from '@/ui/views/VentasView';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Ventas • Steffen ERP',
  description: 'Ventas cerradas por período comercial: RTO, RTM, total facturado y ganancia.',
};

function parsePeriodParam(value: string | undefined, min: number, max: number): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const n = Number(value);
  return n >= min && n <= max ? n : null;
}

export default async function VentasPage(props: { searchParams?: Promise<{ year?: string; month?: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user || !isUserAuthorized(user)) {
    redirect('/login');
  }

  const searchParams = props.searchParams ? await props.searchParams : {};

  // Período comercial vigente: fecha de la base (misma fuente que Dashboard y Administración).
  const current = await getReportService().getCurrentBusinessPeriod();
  const year = parsePeriodParam(searchParams.year, 2000, 2100) ?? current.year;
  const month = parsePeriodParam(searchParams.month, 1, 12) ?? current.month;

  const remittanceService = getRemittanceService();
  const [sales, periods] = await Promise.all([
    remittanceService.listCompletedSalesForMonth(year, month).catch(() => null),
    remittanceService.listSalesByPeriod().catch(() => null),
  ]);

  const periodsDTO: SalesPeriodTotalDTO[] | null = periods
    ? periods.map((p) => ({
        year: p.year,
        month: p.month,
        salesCount: p.salesCount,
        billedArs: toNumericString(p.billedArs),
        gainArs: toNumericString(p.gainArs),
      }))
    : null;

  return (
    <VentasView
      year={year}
      month={month}
      currentYear={current.year}
      currentMonth={current.month}
      sales={sales ? sales.map(serializeMonthlySale) : null}
      periods={periodsDTO}
    />
  );
}
