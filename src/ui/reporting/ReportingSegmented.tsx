'use client';

import React from 'react';

/**
 * Control segmentado de Reportes con el estilo de ítem de lista del sistema
 * (`.ui-list-item`, mismo patrón que las pestañas de Stock).
 * - `tabs`: role="tablist"/"tab" + aria-selected (pestañas del ranking).
 * - `toggle`: grupo de botones con aria-pressed (Top 5/10, métrica).
 * Scroll horizontal INTERNO si no entra (nunca se convierte en select).
 * Touch target mínimo 40 px (DESIGN.md §3.22).
 */
export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export function ReportingSegmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  mode,
  className = '',
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  mode: 'tabs' | 'toggle';
  className?: string;
}) {
  return (
    <div
      role={mode === 'tabs' ? 'tablist' : 'group'}
      aria-label={ariaLabel}
      className={`flex max-w-full items-center gap-2 overflow-x-auto ${className}`}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role={mode === 'tabs' ? 'tab' : undefined}
            aria-selected={mode === 'tabs' ? active : undefined}
            aria-pressed={mode === 'toggle' ? active : undefined}
            onClick={() => onChange(option.value)}
            className={`ui-list-item inline-flex min-h-[40px] shrink-0 items-center rounded-[5px] px-3 text-sm whitespace-nowrap transition-colors ${
              active ? 'text-steffen-surface' : 'text-steffen-muted hover:text-steffen-surface'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
