'use client';

import React, { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import type { ReportingShareDTO } from '@/actions/reporting.dto';
import { chartTheme, plotValue, shareOthersColor, shareSliceColors } from './chartTheme';
import { ReportingChartFrame } from './ReportingChartFrame';
import { ReportingChartTooltip } from './ReportingChartTooltip';
import { formatReportingArs, formatReportingArsTick, formatReportingPct, formatReportingUnits } from '../format';

/**
 * Participación por producto (REPORTES §6.8, DESIGN.md §35.4): Top 4 + Otros
 * tal como lo entrega el backend (la UI no recalcula el Top 4).
 * - Dona si no hay valores negativos.
 * - Barras horizontales con base 0 si `hasNegative` (cambio automático): nunca
 *   se fuerzan negativos dentro de una dona y no se inventan porcentajes.
 * Valores y porcentajes mostrados = texto exacto del DTO; números solo para geometría.
 */

export type ShareMetric = 'units' | 'billed' | 'contribution';

interface SliceRow {
  key: string;
  label: string;
  plot: number;
  value: string;
  sharePct: string | null;
  color: string;
}

const OTHERS_KEY = 'OTHERS';
const DONUT_HEIGHT = 280;
const BAR_ROW_HEIGHT = 44;

function formatShareValue(value: string, metric: ShareMetric): string {
  return metric === 'units' ? formatReportingUnits(Number(value)) : formatReportingArs(value);
}

/** Clave de la fila original en una entrada de tooltip de Recharts (sin casts). */
function sliceKeyOf(payload: unknown): string | null {
  return typeof payload === 'object' && payload !== null && 'key' in payload && typeof payload.key === 'string' ? payload.key : null;
}

export const ProductShareChart: React.FC<{ share: ReportingShareDTO; metric: ShareMetric; metricLabel: string }> = ({ share, metric, metricLabel }) => {
  const rows: SliceRow[] = useMemo(
    () =>
      share.slices.map((s, i) => ({
        key: s.key,
        label: s.label,
        plot: plotValue(s.value) ?? 0,
        value: s.value,
        sharePct: s.sharePct,
        color: s.key === OTHERS_KEY ? shareOthersColor : shareSliceColors[i % shareSliceColors.length],
      })),
    [share]
  );
  const byKey = useMemo(() => new Map(rows.map((r) => [r.key, r])), [rows]);
  const allZero = rows.every((r) => r.plot === 0);

  const tooltip = (
    <Tooltip
      cursor={share.hasNegative ? { fill: chartTheme.cursor } : false}
      content={(props) => (
        <ReportingChartTooltip
          {...props}
          formatLabel={(label) => share.hasNegative ? String(label ?? metricLabel) : metricLabel}
          formatValue={(entry) => {
            const row = byKey.get(sliceKeyOf(entry.payload) ?? '');
            if (!row) return null;
            const pct = row.sharePct === null ? '' : ` · ${formatReportingPct(row.sharePct)}`;
            return `${formatShareValue(row.value, metric)}${pct}`;
          }}
        />
      )}
    />
  );

  if (allZero) {
    return <p className="text-sm text-steffen-muted">Sin valores para representar en {metricLabel.toLowerCase()}.</p>;
  }

  return (
    <div className="space-y-4">
      {share.hasNegative ? (
        <ReportingChartFrame height={rows.length * BAR_ROW_HEIGHT + 32} ariaLabel={`Participación por producto (${metricLabel}) en barras: incluye valores negativos`}>
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
            <CartesianGrid stroke={chartTheme.grid} strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              domain={[(min: number) => Math.min(0, min), (max: number) => Math.max(0, max)]}
              tickFormatter={formatReportingArsTick}
              tick={{ fill: chartTheme.axis, fontSize: chartTheme.fontSize }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={110}
              tick={{ fill: chartTheme.text, fontSize: chartTheme.fontSize }}
              tickFormatter={(label: string) => (label.length > 16 ? `${label.slice(0, 15)}…` : label)}
              axisLine={false}
              tickLine={false}
            />
            <ReferenceLine x={0} stroke={chartTheme.axis} />
            {tooltip}
            <Bar dataKey="plot" name={metricLabel} maxBarSize={22} isAnimationActive={false}>
              {rows.map((r) => (
                <Cell key={r.key} fill={r.color} />
              ))}
            </Bar>
          </BarChart>
        </ReportingChartFrame>
      ) : (
        <ReportingChartFrame height={DONUT_HEIGHT} ariaLabel={`Participación por producto (${metricLabel}) en dona`}>
          <PieChart>
            <Pie data={rows} dataKey="plot" nameKey="label" innerRadius="55%" outerRadius="85%" paddingAngle={1} stroke="var(--steffen-bg)" isAnimationActive={false}>
              {rows.map((r) => (
                <Cell key={r.key} fill={r.color} />
              ))}
            </Pie>
            {tooltip}
          </PieChart>
        </ReportingChartFrame>
      )}

      <ul className="space-y-1.5 text-sm" aria-label={`Detalle de participación (${metricLabel})`}>
        {rows.map((r) => (
          <li key={r.key} className="grid grid-cols-[0.75rem_minmax(0,1fr)_minmax(0,1fr)] items-start gap-x-2 gap-y-0.5">
            <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.color }} />
            <span className={`truncate ${r.key === OTHERS_KEY ? 'text-steffen-muted' : 'text-steffen-surface'}`} title={r.label}>
              {r.label}
            </span>
            <span className="row-span-2 min-w-0 text-right tabular-nums [overflow-wrap:anywhere] text-steffen-surface">{formatShareValue(r.value, metric)}</span>
            <span className="col-start-2 min-w-0 tabular-nums text-steffen-muted">
              {r.sharePct === null ? '' : formatReportingPct(r.sharePct)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};
