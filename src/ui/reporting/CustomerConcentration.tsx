'use client';

import React, { useMemo } from 'react';
import { Cell, Pie, PieChart, Tooltip } from 'recharts';
import type { ReportingConcentrationDTO, ReportingConcentrationSliceDTO } from '@/actions/reporting.dto';
import { ReportingPanel } from './ReportingPanel';
import { ReportingChartFrame } from './charts/ReportingChartFrame';
import { ReportingChartTooltip } from './charts/ReportingChartTooltip';
import { concentrationColors, plotValue } from './charts/chartTheme';
import { formatReportingPct } from './format';

/**
 * Concentración (REPORTES §10, DESIGN.md §35.5): dona con grupos NO
 * superpuestos (posiciones 1–5 / 6–10 / Resto, tal como los entrega el
 * backend) e indicadores ACUMULADOS debajo (Top 5 / Top 10 / Resto). Sin
 * facturación: "Sin datos" con indicadores "—" (nunca 0 %).
 */

export const CONCENTRATION_GROUP_LABELS: Record<ReportingConcentrationSliceDTO['group'], string> = {
  POS_1_5: 'Posiciones 1–5',
  POS_6_10: 'Posiciones 6–10',
  REST: 'Resto',
};

const DONUT_HEIGHT = 220;

function groupOf(payload: unknown): ReportingConcentrationSliceDTO['group'] | null {
  if (typeof payload !== 'object' || payload === null || !('group' in payload)) return null;
  const g = payload.group;
  return g === 'POS_1_5' || g === 'POS_6_10' || g === 'REST' ? g : null;
}

export const CustomerConcentration: React.FC<{
  concentration: ReportingConcentrationDTO | null;
  loading: boolean;
  error: string | null;
  className?: string;
}> = ({ concentration, loading, error, className }) => {
  const rows = useMemo(
    () =>
      (concentration?.slices ?? []).map((s) => ({
        group: s.group,
        label: CONCENTRATION_GROUP_LABELS[s.group],
        plot: plotValue(s.pct) ?? 0,
        pct: s.pct,
        color: concentrationColors[s.group],
      })),
    [concentration]
  );
  const pctByGroup = useMemo(() => new Map(rows.map((r) => [r.group, r.pct])), [rows]);
  const hasData = concentration?.hasData === true;

  const indicators = [
    { label: 'Top 5', value: concentration?.top5Pct ?? null },
    { label: 'Top 10', value: concentration?.top10Pct ?? null },
    { label: 'Resto', value: concentration?.restPct ?? null },
  ];

  return (
    <ReportingPanel title="CONCENTRACIÓN" className={className} loading={loading} error={error}>
      <div className="space-y-4">
        {hasData ? (
          <ReportingChartFrame
            height={DONUT_HEIGHT}
            ariaLabel={`Concentración de la facturación ${concentration?.year}: ${rows.map((r) => `${r.label} ${formatReportingPct(r.pct)}`).join(', ')}`}
          >
            <PieChart>
              <Pie data={rows} dataKey="plot" nameKey="label" innerRadius="55%" outerRadius="85%" paddingAngle={1} stroke="var(--steffen-bg)" isAnimationActive={false}>
                {rows.map((r) => (
                  <Cell key={r.group} fill={r.color} />
                ))}
              </Pie>
              <Tooltip
                content={(props) => (
                  <ReportingChartTooltip
                    {...props}
                    formatLabel={() => `Concentración ${concentration?.year ?? ''}`}
                    formatValue={(entry) => {
                      const group = groupOf(entry.payload);
                      const pct = group ? pctByGroup.get(group) : undefined;
                      return pct === undefined ? null : formatReportingPct(pct);
                    }}
                  />
                )}
              />
            </PieChart>
          </ReportingChartFrame>
        ) : (
          <p className="py-6 text-center text-sm text-steffen-muted">Sin datos</p>
        )}

        {hasData && (
          <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-steffen-surface" aria-label="Grupos de la dona">
            {rows.map((r) => (
              <li key={r.group} className="inline-flex items-center gap-2">
                <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                {r.label}
              </li>
            ))}
          </ul>
        )}

        <dl className="grid grid-cols-3 gap-2 text-center">
          {indicators.map((ind) => (
            <div key={ind.label} className="rounded-[5px] border border-steffen-gray px-2 py-2">
              <dt className="text-xs font-semibold uppercase text-steffen-muted">{ind.label}</dt>
              <dd className="mt-1 text-base tabular-nums text-steffen-surface">{formatReportingPct(ind.value)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </ReportingPanel>
  );
};
