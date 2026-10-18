'use client';

import React from 'react';
import type { TooltipContentProps, TooltipPayloadEntry } from 'recharts';

/**
 * Tooltip de Reportes con el estilo del sistema (panel dark, Border Contenedor).
 * Muestra categoría/mes y el valor EXACTO formateado: `formatValue` recibe la
 * entrada de Recharts (con la fila original en `entry.payload`) y debe leer el
 * texto del DTO, no el número de geometría. Desktop: hover; touch: tap
 * (comportamiento de Recharts; un nuevo tap reemplaza el anterior).
 */
export type ReportingTooltipProps = Partial<Pick<TooltipContentProps, 'active' | 'payload' | 'label'>> & {
  formatLabel?: (label: string | number | undefined) => string;
  formatValue: (entry: TooltipPayloadEntry) => string;
};

export const ReportingChartTooltip: React.FC<ReportingTooltipProps> = ({ active, payload, label, formatLabel, formatValue }) => {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="ui-panel px-3 py-2 text-xs text-steffen-surface">
      <div className="mb-1 font-semibold text-steffen-muted">{formatLabel ? formatLabel(label) : String(label ?? '')}</div>
      <ul className="space-y-0.5">
        {payload.map((entry, i) => (
          <li key={`${String(entry.dataKey ?? entry.name ?? i)}`} className="flex items-center gap-2 whitespace-nowrap">
            <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-steffen-muted">{entry.name}</span>
            <span className="ml-auto tabular-nums">{formatValue(entry)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};
