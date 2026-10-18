'use client';

import React, { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import type { ReportingMonthlyPointDTO } from '@/actions/reporting.dto';
import { chartTheme, plotValue, seriesColors } from './chartTheme';
import { ReportingChartFrame } from './ReportingChartFrame';
import { ReportingChartTooltip } from './ReportingChartTooltip';
import { ReportingLegend, useSeriesVisibility, type LegendItem } from './ReportingLegend';
import { MONTH_LABELS_SHORT, formatReportingArs, formatReportingArsTick } from '../format';

/**
 * Evolución mensual (REPORTES §5.2, DESIGN.md §35.3/§35.6): líneas de
 * Facturación, Ganancia y Gastos operativos, enero–diciembre.
 * - 0 = mes transcurrido sin movimiento → se dibuja sobre la base.
 * - null = mes futuro del año corriente → sin punto ni tramo (no se convierte a 0).
 * Geometría con números (plotValue); tooltip con el texto exacto del DTO.
 */

type SeriesKey = 'billed' | 'gain' | 'expenses';

interface MonthlyRow {
  label: string;
  billed: number | null;
  gain: number | null;
  expenses: number | null;
  exact: Record<SeriesKey, string | null>;
}

const SERIES: readonly (LegendItem & { key: SeriesKey })[] = [
  { key: 'billed', label: 'Facturación', color: seriesColors.billed },
  { key: 'gain', label: 'Ganancia', color: seriesColors.gain },
  { key: 'expenses', label: 'Gastos operativos', color: seriesColors.expenses },
];
const SERIES_KEYS = SERIES.map((s) => s.key);

/** Ancho mínimo del área gráfica: en pantallas angostas se activa el scroll horizontal INTERNO (12 meses legibles). */
const MIN_CHART_WIDTH = 600;
const CHART_HEIGHT = 300;

const isSeriesKey = (value: unknown): value is SeriesKey => typeof value === 'string' && (SERIES_KEYS as readonly string[]).includes(value);

export const BillingMonthlyChart: React.FC<{ monthly: readonly ReportingMonthlyPointDTO[]; year: number }> = ({ monthly, year }) => {
  const { isVisible, toggle } = useSeriesVisibility(SERIES_KEYS);

  const rows: MonthlyRow[] = useMemo(
    () =>
      monthly.map((p) => ({
        label: MONTH_LABELS_SHORT[p.month - 1],
        billed: plotValue(p.billedArs),
        gain: plotValue(p.gainArs),
        expenses: plotValue(p.expensesArs),
        exact: { billed: p.billedArs, gain: p.gainArs, expenses: p.expensesArs },
      })),
    [monthly]
  );
  const rowByLabel = useMemo(() => new Map(rows.map((r) => [r.label, r])), [rows]);
  const hasNegative = rows.some((r) => SERIES_KEYS.some((k) => (r[k] ?? 0) < 0));

  return (
    <div className="space-y-3">
      <ReportingLegend items={SERIES} isVisible={isVisible} onToggle={toggle} />
      <ReportingChartFrame
        height={CHART_HEIGHT}
        minWidth={MIN_CHART_WIDTH}
        ariaLabel={`Evolución mensual ${year}: facturación, ganancia y gastos operativos de enero a diciembre`}
      >
        <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid stroke={chartTheme.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            interval={0}
            tick={{ fill: chartTheme.axis, fontSize: chartTheme.fontSize }}
            axisLine={{ stroke: chartTheme.grid }}
            tickLine={false}
          />
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
            cursor={{ stroke: chartTheme.grid }}
            content={(props) => (
              <ReportingChartTooltip
                {...props}
                formatLabel={(label) => `${String(label ?? '')} ${year}`}
                formatValue={(entry, label) => {
                  const row = rowByLabel.get(String(label));
                  if (!row || !isSeriesKey(entry.dataKey)) return null;
                  const exact = row.exact[entry.dataKey];
                  return exact === null ? null : formatReportingArs(exact);
                }}
              />
            )}
          />
          {SERIES.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={{ r: 3, fill: s.color, stroke: s.color }}
              activeDot={{ r: 5 }}
              connectNulls={false}
              hide={!isVisible(s.key)}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ReportingChartFrame>
    </div>
  );
};

/** true si ningún mes transcurrido tiene movimiento (los futuros son null). */
export function isMonthlyEmpty(monthly: readonly ReportingMonthlyPointDTO[]): boolean {
  const isZeroOrNull = (v: string | null) => v === null || /^-?0+(\.0+)?$/.test(v);
  return monthly.every((p) => isZeroOrNull(p.billedArs) && isZeroOrNull(p.gainArs) && isZeroOrNull(p.expensesArs));
}
