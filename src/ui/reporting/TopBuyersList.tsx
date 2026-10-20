'use client';

import React, { useState } from 'react';
import type { ReportingCustomersDTO } from '@/actions/reporting.dto';
import { ReportingPanel } from './ReportingPanel';
import { ReportingSegmented, type SegmentedOption } from './ReportingSegmented';
import { chartPalette, plotValue } from './charts/chartTheme';
import { formatReportingArs, formatReportingDate, formatReportingDays } from './format';

/**
 * Mayores compradores (REPORTES §8, DESIGN.md §35.5/§35.10): Top 5 / Top 10
 * local sobre `topBuyers` (orden del backend: facturación DESC, entityKey ASC;
 * la UI no reordena). Barra = facturación respecto del mayor comprador
 * visible. Frecuencia como valor simple, sin estados interpretativos.
 * ≥ 1280: fila en columnas; debajo: fila compacta de dos niveles (sin tabla
 * horizontal).
 */

type BuyersLimit = '5' | '10';
const LIMITS: readonly SegmentedOption<BuyersLimit>[] = [
  { value: '5', label: 'Top 5' },
  { value: '10', label: 'Top 10' },
];

const COLUMNS = 'xl:grid xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)] xl:items-center xl:gap-x-2';

export const TopBuyersList: React.FC<{
  customers: ReportingCustomersDTO | null;
  year: number | undefined;
  loading: boolean;
  error: string | null;
  className?: string;
}> = ({ customers, year, loading, error, className }) => {
  const [limit, setLimit] = useState<BuyersLimit>('5');
  const rows = (customers?.topBuyers ?? []).slice(0, Number(limit));
  const max = Math.max(0, ...rows.map((r) => plotValue(r.billedArs) ?? 0));

  return (
    <ReportingPanel
      title="MAYORES COMPRADORES"
      className={className}
      loading={loading}
      error={error}
      empty={customers && customers.topBuyers.length === 0 ? `No hay compras registradas en ${year}.` : null}
      controls={<ReportingSegmented mode="toggle" ariaLabel="Cantidad de compradores" options={LIMITS} value={limit} onChange={setLimit} />}
    >
      <div role="table" aria-label="Mayores compradores" className="space-y-3">
        <div role="row" className={`hidden text-xs font-semibold text-steffen-muted ${COLUMNS}`}>
          <span role="columnheader">Nombre</span>
          <span role="columnheader" className="text-right">Total</span>
          <span role="columnheader" className="text-right">Prom./mes</span>
          <span role="columnheader" className="text-right">Última compra</span>
          <span role="columnheader" className="text-right">Frecuencia</span>
        </div>
        {rows.map((row) => {
          const width = max === 0 ? 0 : ((plotValue(row.billedArs) ?? 0) / max) * 100;
          return (
            <div key={row.entityKey} role="row" className={`text-sm ${COLUMNS}`}>
              {/* Nombre + barra (en mobile, nivel superior incluye el total). */}
              <div role="cell" className="min-w-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-steffen-surface" title={row.label}>
                    {row.label}
                  </span>
                  <span className="xl:hidden min-w-0 max-w-[60%] text-right tabular-nums [overflow-wrap:anywhere] text-steffen-surface">{formatReportingArs(row.billedArs)}</span>
                </div>
                <div className="mt-0.5 text-xs [overflow-wrap:anywhere] text-steffen-muted xl:hidden">
                  {formatReportingArs(row.monthlyAverageArs)}/mes · {formatReportingDate(row.lastPurchaseDate)} · {formatReportingDays(row.frequencyDays)}
                </div>
                <span aria-hidden className="mt-1.5 block h-2 rounded-full bg-steffen-gray/50">
                  <span className="block h-full rounded-full" style={{ width: `${width}%`, backgroundColor: chartPalette.blue }} />
                </span>
              </div>
              <span role="cell" className="hidden xl:block min-w-0 text-right tabular-nums [overflow-wrap:anywhere] text-steffen-surface">
                {formatReportingArs(row.billedArs)}
              </span>
              <span role="cell" className="hidden xl:block min-w-0 text-right tabular-nums [overflow-wrap:anywhere] text-steffen-surface">
                {formatReportingArs(row.monthlyAverageArs)}
              </span>
              <span role="cell" className="hidden xl:block min-w-0 text-right tabular-nums [overflow-wrap:anywhere] text-steffen-surface">
                {formatReportingDate(row.lastPurchaseDate)}
              </span>
              <span role="cell" className="hidden xl:block min-w-0 text-right tabular-nums [overflow-wrap:anywhere] text-steffen-surface">
                {formatReportingDays(row.frequencyDays)}
              </span>
            </div>
          );
        })}
      </div>
    </ReportingPanel>
  );
};
