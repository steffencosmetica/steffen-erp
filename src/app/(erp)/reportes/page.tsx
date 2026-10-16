import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthenticatedUser, isUserAuthorized } from '@/auth/guard';
import { getReportService } from '@/services/composition';
import { formatArs } from '@/lib/format';
import { ErpIcon } from '@/ui/components/ErpIcon';
import { KpiCard, Panel, SecondaryHeader, SectionHeader, forwardLinkClass, ForwardArrow } from '@/ui/components/UIComponents';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Reportes • Steffen ERP',
  description: 'Resumen mensual: ventas, total facturado, ganancia y pedidos abiertos.',
};

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const MoneyValue: React.FC<{ value: string }> = ({ value }) => (
  <span className="text-[22px] whitespace-nowrap">{value}</span>
);

/**
 * Reportes (BUSINESS_RULES §36, DESIGN.md §35): exactamente cuatro cards derivadas
 * en tiempo real de v_current_reports (mes corriente por business_date; Pedidos
 * abiertos sin filtro mensual). Accesos a los reportes detallados existentes.
 */
export default async function ReportesPage() {
  const user = await getAuthenticatedUser();
  if (!user || !isUserAuthorized(user)) {
    redirect('/login');
  }

  const reportService = getReportService();
  const [reports, period] = await Promise.all([
    reportService.getCurrentReports().catch(() => null),
    reportService.getCurrentBusinessPeriod().catch(() => null),
  ]);

  return (
    <div className="space-y-5">
      <SecondaryHeader title="Reportes" backHref="/" />

      <Panel>
        <SectionHeader
          title={period ? `RESUMEN MENSUAL · ${MONTH_NAMES[period.month - 1].toUpperCase()} ${period.year}` : 'RESUMEN MENSUAL'}
        />
        {!reports && <p className="mb-3 text-xs text-steffen-red">No se pudieron cargar las métricas del mes.</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-[720px]">
          <KpiCard
            className="min-h-[110px]"
            label="Ventas del mes"
            value={reports ? reports.salesCurrentMonth : '—'}
            icon={<ErpIcon name="ingresos" tone="chrome" className="w-10 h-10" />}
          />
          <KpiCard
            className="min-h-[110px]"
            label="Total facturado"
            value={reports ? <MoneyValue value={formatArs(reports.billedCurrentMonthArs)} /> : '—'}
          />
          <KpiCard
            className="min-h-[110px]"
            label="Ganancia"
            variant="positive"
            value={reports ? <MoneyValue value={formatArs(reports.gainCurrentMonthArs)} /> : '—'}
          />
          <KpiCard
            className="min-h-[110px]"
            label="Pedidos abiertos"
            value={reports ? reports.openOrders : '—'}
            icon={<ErpIcon name="orden" tone="chrome" className="w-10 h-10" />}
          />
        </div>
      </Panel>

      <div className="flex flex-wrap items-center gap-8 px-1">
        <Link href="/ventas" className={forwardLinkClass}>
          IR A VENTAS <ForwardArrow />
        </Link>
        <Link href="/clientes" className={forwardLinkClass}>
          IR A CLIENTES <ForwardArrow />
        </Link>
        <Link href="/proveedores" className={forwardLinkClass}>
          IR A PROVEEDORES <ForwardArrow />
        </Link>
        <Link href="/movimientos" className={forwardLinkClass}>
          IR A MOVIMIENTOS <ForwardArrow />
        </Link>
      </div>
    </div>
  );
}
