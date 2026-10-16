'use client';

import React, { useState } from 'react';
import { Button, Panel } from './UIComponents';

/**
 * Cotización dólar: misma implementación vigente de Administración (valor inicial
 * desde la cotización actual, confirmación al actualizar), compartida por
 * Administración y Dashboard (Acceso rápido) sin duplicar lógica.
 */
export const UsdRateCard: React.FC<{
  currentUsdRate: string | null;
  layout?: 'inline' | 'stacked';
  className?: string;
}> = ({ currentUsdRate, layout = 'inline', className = '' }) => {
  const [usdInput, setUsdInput] = useState(currentUsdRate || '1350');

  const input = (
    <input
      type="text"
      value={usdInput}
      onChange={(e) => setUsdInput(e.target.value)}
      aria-label="Nueva cotización"
      className="flex-1 min-w-0 h-[26px] px-2.5 text-sm text-right tabular-nums border border-steffen-border rounded-[5px]"
      placeholder="1.350"
    />
  );
  const action = (
    <Button variant="verde" onClick={() => alert(`Cotización actualizada: $ ${usdInput}`)}>
      Actualizar
    </Button>
  );

  if (layout === 'stacked') {
    return (
      <Panel className={`flex flex-col gap-3 ${className}`}>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold uppercase leading-tight shrink-0">
            Cotización
            <br />
            dólar
          </span>
          {input}
        </div>
        <div className="flex justify-center">{action}</div>
      </Panel>
    );
  }

  return (
    <Panel className={`!py-3 flex flex-wrap items-center justify-between gap-4 ${className}`}>
      <span className="text-sm font-semibold uppercase leading-tight">
        Cotización
        <br />
        dólar
      </span>
      {input}
      {action}
    </Panel>
  );
};
