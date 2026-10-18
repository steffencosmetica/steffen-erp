'use client';

import React, { useState } from 'react';
import type { ReportingProductRowDTO, ReportingProductsDTO } from '@/actions/reporting.dto';
import { ReportingPanel } from './ReportingPanel';
import { ReportingSegmented, type SegmentedOption } from './ReportingSegmented';
import { chartPalette, plotValue } from './charts/chartTheme';
import { formatReportingArs, formatReportingUnits } from './format';

/**
 * Ranking de productos (REPORTES §6.1–§6.6, DESIGN.md §35.4/§35.10):
 * pestañas locales (Más vendidos / Mayor facturación / Mayor contribución) y
 * Top 5 / Top 10 local, sobre los rankings que ya entrega el backend (hasta
 * 10, orden métrica DESC / productId ASC; la UI no reordena). Cada fila:
 * posición, nombre, barra proporcional y valor exacto. La barra usa una escala
 * con base 0: con contribuciones negativas el cero se desplaza y la barra
 * negativa crece hacia la izquierda (no se recorta a 0).
 */

type RankingTab = 'units' | 'billed' | 'contribution';
type RankingLimit = '5' | '10';

const TABS: readonly SegmentedOption<RankingTab>[] = [
  { value: 'units', label: 'Más vendidos' },
  { value: 'billed', label: 'Mayor facturación' },
  { value: 'contribution', label: 'Mayor contribución' },
];
const LIMITS: readonly SegmentedOption<RankingLimit>[] = [
  { value: '5', label: 'Top 5' },
  { value: '10', label: 'Top 10' },
];

function exactValue(row: ReportingProductRowDTO, tab: RankingTab): string {
  if (tab === 'units') return String(row.units);
  return tab === 'billed' ? row.billedArs : row.contributionArs;
}

function formatValue(value: string, tab: RankingTab): string {
  return tab === 'units' ? formatReportingUnits(Number(value)) : formatReportingArs(value);
}

/** Geometría de la barra (porcentajes CSS) con base 0 sobre los valores visibles. */
function barGeometry(values: readonly number[]) {
  const maxPos = Math.max(0, ...values);
  const maxNeg = Math.max(0, ...values.map((v) => -v));
  const span = maxPos + maxNeg;
  const zero = span === 0 ? 0 : (maxNeg / span) * 100;
  return (v: number) => {
    if (span === 0 || v === 0) return { left: zero, width: 0 };
    const width = (Math.abs(v) / span) * 100;
    return { left: v > 0 ? zero : zero - width, width };
  };
}

export const ProductRanking: React.FC<{
  products: ReportingProductsDTO | null;
  year: number | undefined;
  loading: boolean;
  error: string | null;
  className?: string;
}> = ({ products, year, loading, error, className }) => {
  const [tab, setTab] = useState<RankingTab>('units');
  const [limit, setLimit] = useState<RankingLimit>('5');

  const rows = (products?.rankings[tab] ?? []).slice(0, Number(limit));
  const values = rows.map((r) => exactValue(r, tab));
  const geometry = barGeometry(values.map((v) => plotValue(v) ?? 0));
  const hasNegative = values.some((v) => v.startsWith('-'));

  return (
    <ReportingPanel
      title="RANKING DE PRODUCTOS"
      className={className}
      loading={loading}
      error={error}
      empty={products && products.rows.length === 0 ? `No hay productos vendidos en ${year}.` : null}
      controls={<ReportingSegmented mode="toggle" ariaLabel="Cantidad de productos" options={LIMITS} value={limit} onChange={setLimit} />}
    >
      <div className="space-y-4">
        <ReportingSegmented mode="tabs" ariaLabel="Criterio del ranking" options={TABS} value={tab} onChange={setTab} />
        <div role="tabpanel" aria-label={TABS.find((t) => t.value === tab)?.label}>
        <ol className="space-y-3">
          {rows.map((row, i) => {
            const value = values[i];
            const bar = geometry(plotValue(value) ?? 0);
            return (
              <li key={row.productId} className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
                <span className="row-span-2 self-start pt-0.5 text-sm text-steffen-muted tabular-nums">{i + 1}</span>
                <span className="truncate text-sm text-steffen-surface" title={row.label}>
                  {row.label}
                </span>
                <span className="row-span-2 self-start text-sm text-steffen-surface tabular-nums whitespace-nowrap">{formatValue(value, tab)}</span>
                <span aria-hidden className="relative block h-2 rounded-full bg-steffen-gray/50">
                  {hasNegative && <span className="absolute inset-y-[-2px] w-px bg-steffen-muted" style={{ left: `${geometry(0).left}%` }} />}
                  <span
                    className="absolute inset-y-0 rounded-full"
                    style={{ left: `${bar.left}%`, width: `${bar.width}%`, backgroundColor: chartPalette.gold }}
                  />
                </span>
              </li>
            );
          })}
        </ol>
        </div>
      </div>
    </ReportingPanel>
  );
};
