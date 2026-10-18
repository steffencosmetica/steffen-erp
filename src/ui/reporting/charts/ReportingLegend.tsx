'use client';

import React, { useCallback, useState } from 'react';

/**
 * Leyenda interactiva de series (DESIGN.md §35.6–§35.7): cada ítem es un botón
 * accesible (aria-pressed) que oculta/muestra su serie; funciona igual con
 * mouse y touch. Todas las series visibles al inicio.
 */
export interface LegendItem {
  key: string;
  label: string;
  color: string;
}

export function useSeriesVisibility(keys: readonly string[]) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = useCallback((key: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const isVisible = useCallback((key: string) => keys.includes(key) && !hidden.has(key), [hidden, keys]);
  return { isVisible, toggle };
}

export const ReportingLegend: React.FC<{
  items: readonly LegendItem[];
  isVisible: (key: string) => boolean;
  onToggle: (key: string) => void;
  className?: string;
}> = ({ items, isVisible, onToggle, className = '' }) => (
  <div className={`flex flex-wrap items-center gap-2 ${className}`}>
    {items.map((item) => {
      const visible = isVisible(item.key);
      return (
        <button
          key={item.key}
          type="button"
          aria-pressed={visible}
          onClick={() => onToggle(item.key)}
          className={`ui-list-item inline-flex min-h-[32px] items-center gap-2 rounded-[5px] px-2 text-xs transition-opacity ${visible ? '' : 'opacity-50'}`}
        >
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
          {item.label}
        </button>
      );
    })}
  </div>
);
