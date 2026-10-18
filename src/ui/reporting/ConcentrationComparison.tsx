'use client';

import React, { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import type { ReportingConcentrationDTO } from '@/actions/reporting.dto';
import { ReportingPanel } from './ReportingPanel';
import { ReportingChartFrame } from './charts/ReportingChartFrame';
import { ReportingChartTooltip } from './charts/ReportingChartTooltip';
import { chartTheme, plotValue, yearComparisonColors } from './charts/chartTheme';
import { formatReportingPct } from './format';

/**
 * Evolución de la concentración (REPORTES §11, DESIGN.md §35.5): barras
 * HORIZONTALES agrupadas Top 5 / Top 10 / Resto, año seleccionado vs año
 * anterior (cada año con su propio ranking, ya resuelto en backend). Un año
 * sin facturación NO se dibuja como 0 %: su serie se omite y se indica
 * "Sin datos"; la comparación no se oculta.
 */

type Metric = 'top5' | 'top10' | 'rest';
type SeriesKey = 'selected' | 'previous';

const METRICS: readonly { key: Metric; label: string; pick: (c: ReportingConcentrationDTO) => string | null }[] = [
  { key: 'top5', label: 'Top 5', pick: (c) => c.top5Pct },
  { key: 'top10', label: 'Top 10', pick: (c) => c.top10Pct },
  { key: 'rest', label: 'Resto', pick: (c) => c.restPct },
];

interface YearSeries {
  key: SeriesKey;
  data: ReportingConcentrationDTO;
  color: string;
}

interface ComparisonRow {
  label: string;
  selected: number | null;
  previous: number | null;
  exact: Record<SeriesKey, string | null>;
}

const CHART_HEIGHT = 220;

const isSeriesKey = (value: unknown): value is SeriesKey => value === 'selected' || value === 'previous';

export const ConcentrationComparison: React.FC<{
  current: ReportingConcentrationDTO | null;
  previous: ReportingConcentrationDTO | null;
  loading: boolean;
  error: string | null;
  className?: string;
}> = ({ current, previous, loading, error, className }) => {
  const series = useMemo(() => {
    const list: YearSeries[] = [];
    if (previous) list.push({ key: 'previous', data: previous, color: yearComparisonColors.previous });
    if (current) list.push({ key: 'selected', data: current, color: yearComparisonColors.selected });
    return list;
  }, [current, previous]);
  const withData = series.filter((s) => s.data.hasData);

  const rows: ComparisonRow[] = useMemo(
    () =>
      METRICS.map((m) => ({
        label: m.label,
        selected: current?.hasData ? plotValue(m.pick(current)) : null,
        previous: previous?.hasData ? plotValue(m.pick(previous)) : null,
        exact: {
          selected: current?.hasData ? m.pick(current) : null,
          previous: previous?.hasData ? m.pick(previous) : null,
        },
      })),
    [current, previous]
  );
  const rowByLabel = useMemo(() => new Map(rows.map((r) => [r.label, r])), [rows]);
  const yearOf = (key: SeriesKey) => (key === 'selected' ? current?.year : previous?.year);

  return (
    <ReportingPanel title="EVOLUCIÓN DE LA CONCENTRACIÓN" className={className} loading={loading} error={error}>
      <div className="space-y-3">
        <ul className="flex flex-wrap items-center gap-4 text-xs text-steffen-surface" aria-label="Años comparados">
          {series.map((s) => (
            <li key={s.key} className="inline-flex items-center gap-2">
              <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
              {s.data.year}
              {!s.data.hasData && <span className="text-steffen-muted">· Sin datos</span>}
            </li>
          ))}
        </ul>

        {withData.length === 0 ? (
          <p className="py-6 text-center text-sm text-steffen-muted">Sin datos</p>
        ) : (
          <ReportingChartFrame
            height={CHART_HEIGHT}
            ariaLabel={`Concentración Top 5, Top 10 y Resto: ${series.map((s) => `${s.data.year}${s.data.hasData ? '' : ' sin datos'}`).join(' vs ')}`}
          >
            <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }} barGap={3} barCategoryGap="25%">
              <CartesianGrid stroke={chartTheme.grid} strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                domain={[0, 100]}
                tickFormatter={(v: number) => `${v} %`}
                tick={{ fill: chartTheme.axis, fontSize: chartTheme.fontSize }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis type="category" dataKey="label" width={56} tick={{ fill: chartTheme.text, fontSize: chartTheme.fontSize }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: chartTheme.cursor }}
                content={(props) => (
                  <ReportingChartTooltip
                    {...props}
                    formatValue={(entry, label) => {
                      const row = rowByLabel.get(String(label));
                      if (!row || !isSeriesKey(entry.dataKey)) return null;
                      const exact = row.exact[entry.dataKey];
                      return exact === null ? null : formatReportingPct(exact);
                    }}
                  />
                )}
              />
              {withData.map((s) => (
                <Bar key={s.key} dataKey={s.key} name={String(yearOf(s.key) ?? '')} fill={s.color} maxBarSize={16} isAnimationActive={false} />
              ))}
            </BarChart>
          </ReportingChartFrame>
        )}
      </div>
    </ReportingPanel>
  );
};
