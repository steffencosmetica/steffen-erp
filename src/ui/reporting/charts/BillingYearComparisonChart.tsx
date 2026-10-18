'use client';

import React, { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import type { ReportingYearTotalsDTO } from '@/actions/reporting.dto';
import { chartTheme, plotValue, seriesColors } from './chartTheme';
import { ReportingChartFrame } from './ReportingChartFrame';
import { ReportingChartTooltip } from './ReportingChartTooltip';
import { formatReportingArs, formatReportingArsTick } from '../format';

/**
 * Facturación y Ganancia por año (REPORTES §5.3, DESIGN.md §35.3): barras
 * agrupadas (no líneas) del año seleccionado y los 2 anteriores, en orden
 * ascendente. Admite ganancia negativa (dominio incluye 0 y negativos).
 * Leyenda simple (no interactiva); tooltip con el texto exacto del DTO.
 */

type SeriesKey = 'billed' | 'gain';

interface YearRow {
  label: string;
  billed: number;
  gain: number;
  exact: Record<SeriesKey, string>;
}

const SERIES: readonly { key: SeriesKey; label: string; color: string }[] = [
  { key: 'billed', label: 'Facturación', color: seriesColors.billed },
  { key: 'gain', label: 'Ganancia', color: seriesColors.gain },
];

const CHART_HEIGHT = 300;

const isSeriesKey = (value: unknown): value is SeriesKey => value === 'billed' || value === 'gain';

export const BillingYearComparisonChart: React.FC<{ byYear: readonly ReportingYearTotalsDTO[] }> = ({ byYear }) => {
  const rows: YearRow[] = useMemo(
    () =>
      byYear.map((y) => ({
        label: String(y.year),
        billed: plotValue(y.billedArs) ?? 0,
        gain: plotValue(y.gainArs) ?? 0,
        exact: { billed: y.billedArs, gain: y.gainArs },
      })),
    [byYear]
  );
  const rowByLabel = useMemo(() => new Map(rows.map((r) => [r.label, r])), [rows]);
  const hasNegative = rows.some((r) => r.billed < 0 || r.gain < 0);
  const years = rows.map((r) => r.label);

  return (
    <div className="space-y-3">
      <ul className="flex flex-wrap items-center gap-4 text-xs text-steffen-surface" aria-label="Series">
        {SERIES.map((s) => (
          <li key={s.key} className="inline-flex items-center gap-2">
            <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
          </li>
        ))}
      </ul>
      <ReportingChartFrame
        height={CHART_HEIGHT}
        ariaLabel={`Facturación y ganancia por año: ${years.join(', ')}`}
      >
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 8 }} barCategoryGap="25%" barGap={4}>
          <CartesianGrid stroke={chartTheme.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: chartTheme.axis, fontSize: chartTheme.fontSize }} axisLine={{ stroke: chartTheme.grid }} tickLine={false} />
          <YAxis
            width={72}
            domain={[(min: number) => Math.min(0, min), (max: number) => Math.max(0, max)]}
            tickFormatter={formatReportingArsTick}
            tick={{ fill: chartTheme.axis, fontSize: chartTheme.fontSize }}
            axisLine={false}
            tickLine={false}
          />
          {hasNegative && <ReferenceLine y={0} stroke={chartTheme.axis} />}
          <Tooltip
            cursor={{ fill: chartTheme.cursor }}
            content={(props) => (
              <ReportingChartTooltip
                {...props}
                formatValue={(entry, label) => {
                  const row = rowByLabel.get(String(label));
                  return row && isSeriesKey(entry.dataKey) ? formatReportingArs(row.exact[entry.dataKey]) : null;
                }}
              />
            )}
          />
          {SERIES.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[3, 3, 0, 0]} maxBarSize={48} isAnimationActive={false} />
          ))}
        </BarChart>
      </ReportingChartFrame>
    </div>
  );
};

/** true si los tres años tienen facturación y ganancia en 0. */
export function isYearComparisonEmpty(byYear: readonly ReportingYearTotalsDTO[]): boolean {
  const isZero = (v: string) => /^-?0+(\.0+)?$/.test(v);
  return byYear.every((y) => isZero(y.billedArs) && isZero(y.gainArs));
}
