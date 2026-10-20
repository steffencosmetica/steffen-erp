'use client';

import React from 'react';
import type { TooltipContentProps, TooltipPayloadEntry } from 'recharts';

/**
 * Tooltip de Reportes con superficie, borde y texto semánticos Dark/Light.
 * Muestra categoría/mes y el valor EXACTO formateado: `formatValue` recibe la
 * entrada de Recharts y la etiqueta de la categoría, y debe leer el texto del
 * DTO (no el número de geometría). Devolver `null` omite la entrada (p. ej. un
 * mes futuro sin dato); si no queda ninguna, no se muestra el tooltip.
 * Desktop: hover; touch: tap (un nuevo tap reemplaza el anterior).
 */
export type ReportingTooltipProps = Partial<Pick<TooltipContentProps, 'active' | 'payload' | 'label'>> & {
  formatLabel?: (label: string | number | undefined) => string;
  formatValue: (entry: TooltipPayloadEntry, label: string | number | undefined) => string | null;
};

export const ReportingChartTooltip: React.FC<ReportingTooltipProps> = ({ active, payload, label, formatLabel, formatValue }) => {
  if (!active || !payload || payload.length === 0) return null;
  const rows = payload
    .map((entry, i) => ({ entry, i, text: formatValue(entry, label) }))
    .filter((row): row is { entry: TooltipPayloadEntry; i: number; text: string } => row.text !== null);
  if (rows.length === 0) return null;
  return (
    <div className="reporting-tooltip !overflow-visible w-max max-w-[min(15rem,calc(100vw-4rem))] break-words px-3 py-2 text-xs">
      <div className="mb-1 font-semibold">{formatLabel ? formatLabel(label) : String(label ?? '')}</div>
      <ul className="space-y-0.5">
        {rows.map(({ entry, i, text }) => (
          <li key={`${String(entry.dataKey ?? entry.name ?? i)}`} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="min-w-0 [overflow-wrap:anywhere] text-[var(--steffen-text-secondary)]">{entry.name}</span>
            <span className="ml-auto min-w-0 [overflow-wrap:anywhere] tabular-nums">{text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};
