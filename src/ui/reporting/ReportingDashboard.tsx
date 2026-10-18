'use client';

import React, { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { BackLink, KpiCard, SectionHeader } from '@/ui/components/UIComponents';
import type {
  ReportingYearsDTO,
  ReportingBillingDTO,
  ReportingProductsDTO,
  ReportingCustomersDTO,
} from '@/actions/reporting.dto';
import { ReportingPanel } from './ReportingPanel';
import { ReportingYearSelect } from './ReportingYearSelect';
import { formatReportingArs, formatReportingCount, formatReportingPct } from './format';
import { BillingMonthlyChart, isMonthlyEmpty } from './charts/BillingMonthlyChart';
import { BillingYearComparisonChart, isYearComparisonEmpty } from './charts/BillingYearComparisonChart';
import { ProductRanking } from './ProductRanking';
import { ProductSharePanel } from './ProductSharePanel';
import { TopBuyersList } from './TopBuyersList';
import { CustomerConcentration } from './CustomerConcentration';
import { CustomerAnalysis, type ReportingAnalysisState } from './CustomerAnalysis';
import { ConcentrationComparison } from './ConcentrationComparison';
import './reporting.css';

/**
 * Raíz cliente de Reportes (DESIGN.md §35). Recibe los DTOs serializados del
 * Server Component (sin fetch inicial en el cliente) y maneja las
 * interacciones. Grilla: < 768 una columna; 768–1279 dos columnas (~50/50);
 * ≥ 1280 doce columnas (7/5 ≈ 60/40). Paneles con altura natural (items-start).
 */
export interface ReportingDashboardProps {
  years: ReportingYearsDTO | null;
  billing: ReportingBillingDTO | null;
  products: ReportingProductsDTO | null;
  customers: ReportingCustomersDTO | null;
  initialAnalysis: ReportingAnalysisState | null;
}

const LOAD_ERROR = 'No se pudieron cargar los datos de este bloque.';
const ROW = 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-5 items-start';
const WIDE = 'xl:col-span-7';
const NARROW = 'xl:col-span-5';

export const ReportingDashboard: React.FC<ReportingDashboardProps> = ({ years, billing, products, customers, initialAnalysis }) => {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const year = years?.selectedYear;

  const selectYear = (next: number) => {
    startTransition(() => {
      router.push(`/reportes?year=${next}`, { scroll: false });
    });
  };

  const summary = billing?.summary;
  const kpis = [
    { label: 'Facturación', value: summary ? formatReportingArs(summary.billedArs) : '—' },
    { label: 'Ganancia', value: summary ? formatReportingArs(summary.gainArs) : '—' },
    { label: 'Gastos operativos', value: summary ? formatReportingArs(summary.expensesArs) : '—' },
    { label: 'Transporte', value: summary ? formatReportingArs(summary.transportArs) : '—' },
    { label: 'Ventas', value: summary ? formatReportingCount(summary.salesCount) : '—' },
    { label: 'Margen %', value: summary ? formatReportingPct(summary.marginPct) : '—' },
  ];

  return (
    <div className="reporting-page min-w-0 space-y-6">
      {/* Encabezado: título + selector global de año (mobile: selector debajo, ancho completo). */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <BackLink href="/" />
          <h1 className="text-lg text-steffen-surface uppercase">Reportes</h1>
        </div>
        {years && (
          <ReportingYearSelect
            availableYears={years.availableYears}
            selectedYear={years.selectedYear}
            onSelect={selectYear}
            disabled={pending}
            className="w-full md:w-40"
          />
        )}
      </div>

      {!years && <p className="text-sm text-steffen-red">No se pudo determinar el período de Reportes.</p>}

      {/* ============================ FACTURACIÓN ============================ */}
      <section aria-label="Facturación" className="space-y-5">
        <SectionHeader title="FACTURACIÓN" variant="strong" className="!mb-0" />

        <ReportingPanel title={year ? `RESUMEN ANUAL · ${year}` : 'RESUMEN ANUAL'} loading={pending} error={billing ? null : LOAD_ERROR}>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {kpis.map((kpi) => (
              <KpiCard
                key={kpi.label}
                label={kpi.label}
                value={<span className="text-[18px] tabular-nums">{kpi.value}</span>}
                className="reporting-kpi min-h-[84px]"
              />
            ))}
          </div>
        </ReportingPanel>

        <div className={ROW}>
          <ReportingPanel
            title="EVOLUCIÓN MENSUAL"
            className={WIDE}
            loading={pending}
            error={billing ? null : LOAD_ERROR}
            empty={billing && isMonthlyEmpty(billing.monthly) ? `Sin facturación, ganancia ni gastos operativos en ${year}.` : null}
          >
            {billing && year !== undefined && <BillingMonthlyChart monthly={billing.monthly} year={year} />}
          </ReportingPanel>
          <ReportingPanel
            title="FACTURACIÓN Y GANANCIA POR AÑO"
            className={NARROW}
            loading={pending}
            error={billing ? null : LOAD_ERROR}
            empty={
              billing && year !== undefined && isYearComparisonEmpty(billing.byYear)
                ? `Sin facturación ni ganancia entre ${year - 2} y ${year}.`
                : null
            }
          >
            {billing && <BillingYearComparisonChart byYear={billing.byYear} />}
          </ReportingPanel>
        </div>
      </section>

      {/* ============================= PRODUCTOS ============================= */}
      <section aria-label="Productos" className="space-y-5">
        <SectionHeader title="PRODUCTOS" variant="strong" className="!mb-0" />

        <div className={ROW}>
          <ProductRanking products={products} year={year} loading={pending} error={products ? null : LOAD_ERROR} className={WIDE} />
          <ProductSharePanel products={products} year={year} loading={pending} error={products ? null : LOAD_ERROR} className={NARROW} />
        </div>
      </section>

      {/* ============================== CLIENTES ============================= */}
      <section aria-label="Clientes" className="space-y-5">
        <SectionHeader title="CLIENTES" variant="strong" className="!mb-0" />

        <div className={ROW}>
          <TopBuyersList customers={customers} year={year} loading={pending} error={customers ? null : LOAD_ERROR} className={WIDE} />
          <CustomerConcentration
            concentration={customers?.concentration ?? null}
            loading={pending}
            error={customers ? null : LOAD_ERROR}
            className={NARROW}
          />
        </div>

        <div className={ROW}>
          <CustomerAnalysis key={year} customers={customers} year={year} loading={pending} error={customers ? null : LOAD_ERROR} initialAnalysis={initialAnalysis} className={WIDE} />
          <ConcentrationComparison
            current={customers?.concentration ?? null}
            previous={customers?.concentrationPrevious ?? null}
            loading={pending}
            error={customers ? null : LOAD_ERROR}
            className={NARROW}
          />
        </div>
      </section>
    </div>
  );
};
