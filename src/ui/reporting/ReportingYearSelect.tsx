'use client';

import React from 'react';

/**
 * Selector global de año (REPORTES §3, DESIGN.md §35.1/§35.6): solo ofrece los
 * años disponibles resueltos por el servidor y actualiza al seleccionar (sin
 * botón Aplicar). El servidor vuelve a validar el año.
 */
export const ReportingYearSelect: React.FC<{
  availableYears: readonly number[];
  selectedYear: number;
  onSelect: (year: number) => void;
  disabled?: boolean;
  className?: string;
}> = ({ availableYears, selectedYear, onSelect, disabled = false, className = '' }) => (
  <select
    value={selectedYear}
    onChange={(e) => {
      const year = Number(e.target.value);
      if (availableYears.includes(year) && year !== selectedYear) onSelect(year);
    }}
    disabled={disabled}
    aria-label="Año del reporte"
    className={`h-10 px-3 text-sm border border-steffen-border rounded-[5px] cursor-pointer disabled:opacity-50 ${className}`}
  >
    {availableYears.map((year) => (
      <option key={year} value={year}>
        {year}
      </option>
    ))}
  </select>
);
