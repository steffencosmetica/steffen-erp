'use client';

import React, { type ReactElement } from 'react';
import { ResponsiveContainer } from 'recharts';

/**
 * Contenedor responsive común de los gráficos de Reportes. Cada gráfico define
 * su altura natural (DESIGN.md §35.8: sin altura uniforme). `minWidth` permite
 * el scroll horizontal INTERNO del área gráfica en mobile (§35.10) sin
 * desbordar la página.
 */
export const ReportingChartFrame: React.FC<{
  height: number;
  minWidth?: number;
  ariaLabel: string;
  children: ReactElement;
}> = ({ height, minWidth, ariaLabel, children }) => (
  <div className={minWidth ? 'w-full overflow-x-auto' : 'w-full'} role="img" aria-label={ariaLabel}>
    <div style={minWidth ? { minWidth } : undefined}>
      <ResponsiveContainer width="100%" height={height}>
        {children}
      </ResponsiveContainer>
    </div>
  </div>
);
