'use client';

import React, { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import type { ReportingEntityMonthlyPointDTO } from '@/actions/reporting.dto';
import { chartTheme, plotValue, seriesColors } from './chartTheme';
import { ReportingChartFrame } from './ReportingChartFrame';
import { ReportingChartTooltip } from './ReportingChartTooltip';
import { MONTH_LABELS_SHORT, formatReportingArs, formatReportingArsTick } from '../format';

/**
 * Facturación mensual de una entidad (REPORTES §9.3), enero–diciembre, en
 * barras (la documentación no fija el tipo). 0 = mes sin compras → barra
 * mínima sobre la base (valor real); null = mes futuro → sin barra.
 * Tooltip con el texto exacto del DTO. Scroll horizontal interno en mobile.
 */

interface EntityMonthRow {
  label: string;
  billed: number | null;
  exact: string | null;
}

const MIN_CHART_WIDTH = 520;
const CHART_HEIGHT = 220;

export const EntityMonthlyChart: React.FC<{ monthly: readonly ReportingEntityMonthlyPointDTO[]; year: number; entityLabel: string }> = ({
  monthly,
  year,
  entityLabel,
}) => {
  const rows: EntityMonthRow[] = useMemo(
    () => monthly.map((p) => ({ label: MONTH_LABELS_SHORT[p.month - 1], billed: plotValue(p.billedArs), exact: p.billedArs })),
    [monthly]
  );
  const rowByLabel = useMemo(() => new Map(rows.map((r) => [r.label, r])), [rows]);

  return (
    <ReportingChartFrame height={CHART_HEIGHT} minWidth={MIN_CHART_WIDTH} ariaLabel={`Facturación mensual ${year} de ${entityLabel}`}>
      <BarChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
        <CartesianGrid stroke={chartTheme.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" interval={0} tick={{ fill: chartTheme.axis, fontSize: chartTheme.fontSize }} axisLine={{ stroke: chartTheme.grid }} tickLine={false} />
        <YAxis
          width={72}
          domain={[0, (max: number) => Math.max(0, max)]}
          tickFormatter={formatReportingArsTick}
          tick={{ fill: chartTheme.axis, fontSize: chartTheme.fontSize }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: chartTheme.cursor }}
          content={(props) => (
            <ReportingChartTooltip
              {...props}
              formatLabel={(label) => `${String(label ?? '')} ${year}`}
              formatValue={(_entry, label) => {
                const exact = rowByLabel.get(String(label))?.exact ?? null;
                return exact === null ? null : formatReportingArs(exact);
              }}
            />
          )}
        />
        <Bar dataKey="billed" name="Facturación" fill={seriesColors.billed} minPointSize={2} maxBarSize={28} radius={[3, 3, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ReportingChartFrame>
  );
};
