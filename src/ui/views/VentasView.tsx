import React from 'react';
import Link from 'next/link';
import { Decimal } from '@/domain/decimal';
import { formatArs } from '@/lib/format';
import type { MonthlySaleDTO } from '@/actions/remittance.dto';
import { DocumentPdfButton } from '@/ui/components/DocumentPdfButton';
import { ErpIcon } from '@/ui/components/ErpIcon';
import { KpiCard, Panel, SecondaryHeader, SectionHeader, tableStyles } from '@/ui/components/UIComponents';

const MONTH_LABELS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/** Totales por período comercial (string NUMERIC exacto). */
export interface SalesPeriodTotalDTO {
  year: number;
  month: number;
  salesCount: number;
  billedArs: string;
  gainArs: string;
}

interface VentasViewProps {
  year: number;
  month: number;
  /** Período comercial vigente (fecha de la base). */
  currentYear: number;
  currentMonth: number;
  /** null si la consulta falló. */
  sales: MonthlySaleDTO[] | null;
  periods: SalesPeriodTotalDTO[] | null;
}

const periodHref = (year: number, month: number) => `/ventas?year=${year}&month=${month}`;

const MoneyValue: React.FC<{ value: string }> = ({ value }) => (
  <span className="text-[19px] font-bold whitespace-nowrap">{value}</span>
);

/**
 * Ventas — pantalla completa (DESIGN.md §24): selector año/mes, cards del período,
 * Ventas del mes con acceso a RTO/RTM (PDF READY existente) y Ventas por mes/año.
 * Solo lectura: RTO COMPLETED con RTM, snapshots congelados, business_date.
 */
export const VentasView: React.FC<VentasViewProps> = ({ year, month, currentYear, currentMonth, sales, periods }) => {
  const years = Array.from(new Set([currentYear, year, ...(periods ?? []).map((p) => p.year)])).sort((a, b) => b - a);
  const billed = (sales ?? []).reduce((acc, s) => acc.plus(s.totalOrderArs), new Decimal(0));
  const gain = (sales ?? []).reduce((acc, s) => acc.plus(s.gainArs), new Decimal(0));

  return (
    <div className="space-y-5">
      <SecondaryHeader title="Ventas" backHref="/reportes" />

      {/* Selector de período: año + 12 meses (mes seleccionado en Blue) */}
      <Panel className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2" aria-label="Año">
          {years.map((y) => (
            <Link
              key={y}
              href={periodHref(y, y === currentYear ? Math.min(month, currentMonth) : month)}
              aria-current={y === year ? 'true' : undefined}
              className={`px-3 h-[26px] inline-flex items-center rounded-[5px] text-sm font-semibold transition-colors ${
                y === year ? 'text-steffen-surface' : 'text-steffen-muted hover:text-steffen-surface'
              }`}
            >
              {y}
            </Link>
          ))}
        </div>
        <div className="grid grid-cols-6 md:grid-cols-12 gap-1.5 flex-1 min-w-0" aria-label="Mes">
          {MONTH_LABELS.map((label, idx) => {
            const m = idx + 1;
            const selected = m === month;
            return (
              <Link
                key={label}
                href={periodHref(year, m)}
                aria-current={selected ? 'true' : undefined}
                className={`h-[26px] inline-flex items-center justify-center rounded-[5px] border text-xs font-semibold transition-colors ${
                  selected
                    ? 'ui-period-selected'
                    : 'ui-btn-primary'
                }`}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </Panel>

      {/* Cards del período seleccionado */}
      <Panel className="sales-kpis flex flex-wrap items-stretch gap-4">
        <KpiCard
          presentation="horizontal"
          className="min-w-[110px]"
          label="Ventas"
          value={sales ? sales.length : '—'}
          icon={<ErpIcon name="orden" tone="chrome" className="w-9 h-9" />}
        />
        <KpiCard presentation="horizontal" className="min-w-[180px]" label="Total facturado" value={sales ? <MoneyValue value={formatArs(billed)} /> : '—'} />
        <KpiCard
          presentation="horizontal"
          className="min-w-[180px]"
          label="Ganancia"
          variant="positive"
          value={sales ? <MoneyValue value={formatArs(gain)} /> : '—'}
        />
      </Panel>

      {/* Ventas del mes */}
      <Panel>
        <SectionHeader title={`VENTAS DEL MES · ${MONTH_NAMES[month - 1].toUpperCase()} ${year}`} />
        {sales === null ? (
          <p className="py-8 text-center text-xs text-steffen-red">No se pudieron cargar las ventas del período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className={tableStyles.table}>
              <thead>
                <tr className={tableStyles.headRow}>
                  <th className="py-2 px-3 text-left">FECHA</th>
                  <th className="py-2 px-3 text-left">CLIENTE / ORIGEN</th>
                  <th className="py-2 px-3 text-right">TOTAL</th>
                  <th className="py-2 px-3 text-right">GANANCIA</th>
                  <th className="py-2 px-3 text-center">N.º RTO</th>
                  <th className="py-2 px-3 text-center">RTO</th>
                  <th className="py-2 px-3 text-center">RTM</th>
                </tr>
              </thead>
              <tbody>
                {sales.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-xs text-steffen-surface/60">
                      Sin ventas cerradas en el período seleccionado.
                    </td>
                  </tr>
                ) : (
                  sales.map((s) => (
                    <tr key={s.remittanceId} className={tableStyles.row}>
                      <td className="py-1.5 px-3 whitespace-nowrap">{s.businessDate}</td>
                      <td className="py-1.5 px-3">{s.customerDisplayName}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums">{formatArs(s.totalOrderArs)}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums text-steffen-green">{formatArs(s.gainArs)}</td>
                      <td className="py-1.5 px-3 text-center">{s.rtoCode}</td>
                      <td className="py-1.5 px-3 text-center">
                        <DocumentPdfButton sourceType="RTO" sourceId={s.remittanceId} knownStatus={s.rtoDocumentStatus} />
                      </td>
                      <td className="py-1.5 px-3 text-center">
                        <DocumentPdfButton sourceType="RTM" sourceId={s.marginRemittanceId} knownStatus={s.rtmDocumentStatus} />
                      </td>
                    </tr>
                  ))
                )}
                {sales.length > 0 && (
                  <tr className="font-semibold">
                    <td className="py-1.5 px-3" colSpan={2}>
                      TOTAL
                    </td>
                    <td className="py-1.5 px-3 text-right tabular-nums">{formatArs(billed)}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums text-steffen-green">{formatArs(gain)}</td>
                    <td colSpan={3} />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Ventas por mes / año */}
      <Panel>
        <SectionHeader title="VENTAS POR MES" />
        {periods === null ? (
          <p className="py-8 text-center text-xs text-steffen-red">No se pudo cargar el histórico por período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className={tableStyles.table}>
              <thead>
                <tr className={tableStyles.headRow}>
                  <th className="py-2 px-3 text-left">PERÍODO</th>
                  <th className="py-2 px-3 text-right">VENTAS</th>
                  <th className="py-2 px-3 text-right">TOTAL FACTURADO</th>
                  <th className="py-2 px-3 text-right">GANANCIA</th>
                </tr>
              </thead>
              <tbody>
                {periods.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-xs text-steffen-surface/60">
                      Sin ventas cerradas registradas.
                    </td>
                  </tr>
                ) : (
                  periods.map((p) => {
                    const selected = p.year === year && p.month === month;
                    return (
                      <tr
                        key={`${p.year}-${p.month}`}
                        className={`${tableStyles.row} ${selected ? 'bg-steffen-gray/55' : ''}`}
                      >
                        <td className="py-1.5 px-3">
                          <Link href={periodHref(p.year, p.month)} className="hover:text-steffen-gold transition-colors">
                            {MONTH_NAMES[p.month - 1]} {p.year}
                          </Link>
                        </td>
                        <td className="py-1.5 px-3 text-right tabular-nums">{p.salesCount}</td>
                        <td className="py-1.5 px-3 text-right tabular-nums">{formatArs(p.billedArs)}</td>
                        <td className="py-1.5 px-3 text-right tabular-nums text-steffen-green">{formatArs(p.gainArs)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
};
