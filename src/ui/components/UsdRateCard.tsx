'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Panel } from './UIComponents';
import { updateUsdExchangeRateAction } from '@/actions/exchange-rate.actions';
import { normalizePositiveAmountInput } from '@/lib/amount-input';
import { formatArs } from '@/lib/format';

/**
 * Cotización dólar GLOBAL (USD → ARS), compartida por Administración y Dashboard.
 * "Actual" es la cotización vigente persistida (nunca un valor fijo); "Actualizar"
 * guarda una nueva vigente (la anterior queda en el historial) y refresca la vista.
 */
export const UsdRateCard: React.FC<{
  /** Cotización vigente persistida (string decimal exacto) o null si no existe. */
  currentUsdRate: string | null;
  layout?: 'inline' | 'stacked';
  className?: string;
}> = ({ currentUsdRate, layout = 'inline', className = '' }) => {
  const router = useRouter();
  const [current, setCurrent] = useState<string | null>(currentUsdRate);
  const [usdInput, setUsdInput] = useState('');
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  // El valor del servidor manda (p. ej. tras router.refresh o al recargar).
  useEffect(() => {
    setCurrent(currentUsdRate);
  }, [currentUsdRate]);

  useEffect(() => {
    if (feedback?.kind !== 'ok') return;
    const timer = setTimeout(() => setFeedback(null), 3000);
    return () => clearTimeout(timer);
  }, [feedback]);

  const handleUpdate = () => {
    setFeedback(null);
    const rate = normalizePositiveAmountInput(usdInput);
    if (!rate) {
      setFeedback({ kind: 'error', text: 'Ingresá una cotización mayor a cero.' });
      return;
    }
    startTransition(async () => {
      const res = await updateUsdExchangeRateAction(rate);
      if (!res.success || !res.data) {
        setFeedback({ kind: 'error', text: res.error || 'No se pudo actualizar la cotización.' });
        return;
      }
      setCurrent(res.data.rateToArs);
      setUsdInput('');
      setFeedback({ kind: 'ok', text: 'Cotización actualizada.' });
      router.refresh();
    });
  };

  const actual = (
    <span className="text-xs text-steffen-surface/80 whitespace-nowrap" data-testid="usd-rate-current">
      Actual: <span className="font-semibold tabular-nums">{current ? formatArs(current) : 'Sin cotización'}</span>
    </span>
  );
  const input = (
    <input
      type="text"
      inputMode="decimal"
      value={usdInput}
      onChange={(e) => setUsdInput(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') handleUpdate();
      }}
      disabled={isPending}
      aria-label="Nueva cotización"
      className="flex-1 min-w-0 h-[26px] px-2.5 text-sm text-right tabular-nums border border-steffen-border rounded-[5px]"
      placeholder="Nueva cotización"
    />
  );
  const action = (
    <Button variant="verde" onClick={handleUpdate} disabled={isPending}>
      {isPending ? 'Guardando…' : 'Actualizar'}
    </Button>
  );
  const message = feedback && (
    <p role="status" className={`text-[11px] ${feedback.kind === 'ok' ? 'text-steffen-green' : 'text-steffen-red'}`}>
      {feedback.text}
    </p>
  );
  const title = (
    <span className="text-sm font-semibold uppercase leading-tight shrink-0">
      Cotización
      <br />
      dólar
    </span>
  );

  if (layout === 'stacked') {
    return (
      <Panel className={`flex flex-col gap-3 ${className}`}>
        <div className="flex items-center gap-3">
          {title}
          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
            {actual}
            {input}
          </div>
        </div>
        <div className="flex flex-col items-center gap-1">
          {action}
          {message}
        </div>
      </Panel>
    );
  }

  return (
    <Panel className={`!py-3 flex flex-col gap-1.5 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        {title}
        {actual}
        {input}
        {action}
      </div>
      {message}
    </Panel>
  );
};
