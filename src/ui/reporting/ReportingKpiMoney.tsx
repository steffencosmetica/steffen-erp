'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { formatReportingArs, formatReportingKpiArs } from './format';

/** Importe compacto con acceso al completo por hover, foco o tap. */
export const ReportingKpiMoney: React.FC<{ value: string; label: string }> = ({ value, label }) => {
  const id = useId();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismissOutside);
    return () => document.removeEventListener('pointerdown', dismissOutside);
  }, [open]);
  return (
    <span
      ref={container}
      className="reporting-kpi-money"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={(event) => {
        if (!event.currentTarget.contains(document.activeElement)) setOpen(false);
      }}
    >
      <button
        type="button"
        className="reporting-kpi-money-trigger"
        aria-label={`${label}: ${formatReportingKpiArs(value)}. Ver importe completo`}
        aria-describedby={open ? id : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
        }}
      >
        {formatReportingKpiArs(value)}
      </button>
      {open && <span id={id} role="tooltip" className="reporting-tooltip reporting-kpi-money-tooltip">{formatReportingArs(value)}</span>}
    </span>
  );
};
