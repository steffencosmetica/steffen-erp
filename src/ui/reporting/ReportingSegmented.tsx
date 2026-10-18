'use client';

import React from 'react';

/**
 * Control segmentado de Reportes con el estilo de ítem de lista del sistema
 * (`.ui-list-item`, mismo patrón que las pestañas de Stock).
 * - `tabs`: role="tablist"/"tab" + aria-selected (pestañas del ranking).
 * - `toggle`: grupo de botones con aria-pressed (Top 5/10, métrica).
 * Scroll horizontal INTERNO si no entra (nunca se convierte en select).
 * Touch targets de 44 px (DESIGN.md §3.22).
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
  id,
  panelId,
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  mode: 'tabs' | 'toggle';
  className?: string;
  id?: string;
  panelId?: string;
}) {
  return (
    <div
      role={mode === 'tabs' ? 'tablist' : 'group'}
      aria-label={ariaLabel}
      className={`flex max-w-full items-center gap-2 overflow-x-auto ${className}`}
    >
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role={mode === 'tabs' ? 'tab' : undefined}
            id={id ? `${id}-${option.value}` : undefined}
            aria-controls={mode === 'tabs' ? panelId : undefined}
            tabIndex={mode === 'tabs' && !active ? -1 : 0}
            aria-selected={mode === 'tabs' ? active : undefined}
            aria-pressed={mode === 'toggle' ? active : undefined}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => {
              if (mode !== 'tabs') return;
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
                : event.key === 'ArrowRight' ? (index + 1) % options.length
                : event.key === 'ArrowLeft' ? (index - 1 + options.length) % options.length : null;
              if (next === null) return;
              event.preventDefault();
              onChange(options[next].value);
              const button = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next];
              button?.focus();
              button?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            }}
            className={`ui-list-item inline-flex min-h-[44px] shrink-0 items-center rounded-[5px] px-3 text-sm whitespace-nowrap transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-steffen-gold focus-visible:-outline-offset-2 ${
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
