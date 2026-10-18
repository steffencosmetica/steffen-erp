'use client';

import React, { useEffect, useId, useState } from 'react';
import { getReportingEntityAnalysisAction } from '@/actions/reporting.actions';
import type { ReportingCustomersDTO, ReportingEntityAnalysisDTO, ReportingEntitySaleDTO } from '@/actions/reporting.dto';
import { KpiCard } from '@/ui/components/UIComponents';
import { ReportingPanel } from './ReportingPanel';
import { ReportingEntitySelect } from './ReportingEntitySelect';
import { EntityMonthlyChart } from './charts/EntityMonthlyChart';
import { formatReportingArs, formatReportingCount, formatReportingDate, formatReportingDays } from './format';

/**
 * Análisis individual (REPORTES §9, DESIGN.md §35.5/§35.10). Selección
 * inicial: primera entidad disponible del año. Al cambiar la entidad se llama
 * a la Server Action y se actualiza SOLO este panel (sin recargar la página).
 * Carreras: cada respuesta se etiqueta con (año, entidad) y solo se muestra si
 * coincide con la selección vigente; las respuestas viejas se descartan.
 */

type AnalysisState =
  | { status: 'ready'; year: number; entityKey: string; data: ReportingEntityAnalysisDTO | null }
  | { status: 'error'; year: number; entityKey: string; message: string };

export const CustomerAnalysis: React.FC<{
  customers: ReportingCustomersDTO | null;
  year: number | undefined;
  loading: boolean;
  error: string | null;
  className?: string;
}> = ({ customers, year, loading, error, className }) => {
  const options = customers?.selectableEntities ?? [];
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [state, setState] = useState<AnalysisState | null>(null);

  // Entidad efectiva: la elegida si sigue disponible en el año; si no, la primera.
  const entityKey = options.some((o) => o.entityKey === selectedKey) ? selectedKey : (options[0]?.entityKey ?? null);

  useEffect(() => {
    if (year === undefined || entityKey === null) return;
    let cancelled = false;
    getReportingEntityAnalysisAction(year, entityKey)
      .then((res) => {
        if (cancelled) return;
        setState(
          res.success
            ? { status: 'ready', year, entityKey, data: res.data ?? null }
            : { status: 'error', year, entityKey, message: res.error ?? 'No se pudo cargar el análisis.' }
        );
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', year, entityKey, message: 'No se pudo cargar el análisis.' });
      });
    return () => {
      cancelled = true;
    };
  }, [year, entityKey]);

  const current = state && state.year === year && state.entityKey === entityKey ? state : null;
  const analysisLoading = entityKey !== null && current === null;

  return (
    <ReportingPanel
      title="ANÁLISIS INDIVIDUAL"
      className={className}
      loading={loading}
      error={error}
      empty={customers && options.length === 0 ? `No hay clientes con compras en ${year}.` : null}
    >
      <div className="space-y-4">
        <ReportingEntitySelect options={options} value={entityKey} onChange={setSelectedKey} className="w-full md:max-w-sm" />

        {analysisLoading ? (
          <div className="space-y-2" aria-busy="true" aria-label="Cargando análisis">
            <div className="h-20 rounded-[5px] bg-steffen-gray/50 animate-pulse" />
            <div className="h-40 rounded-[5px] bg-steffen-gray/50 animate-pulse" />
          </div>
        ) : current?.status === 'error' ? (
          <p className="text-sm text-steffen-red">{current.message}</p>
        ) : current?.status === 'ready' && current.data === null ? (
          <p className="text-sm text-steffen-muted">Sin compras de esta entidad en {year}.</p>
        ) : current?.status === 'ready' && current.data ? (
          <AnalysisBody key={`${current.year}|${current.entityKey}`} analysis={current.data} />
        ) : null}
      </div>
    </ReportingPanel>
  );
};

const AnalysisBody: React.FC<{ analysis: ReportingEntityAnalysisDTO }> = ({ analysis }) => {
  const e = analysis.entity;
  const kpis = [
    { label: 'Total anual', value: formatReportingArs(e.billedArs) },
    { label: 'Promedio mensual', value: formatReportingArs(e.monthlyAverageArs) },
    { label: 'Ticket promedio', value: formatReportingArs(e.ticketAverageArs) },
    { label: 'Compras / Ventas', value: formatReportingCount(e.salesCount) },
    { label: 'Frecuencia', value: formatReportingDays(e.frequencyDays) },
    { label: 'Última compra', value: formatReportingDate(e.lastPurchaseDate) },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} label={kpi.label} value={<span className="text-[16px] whitespace-nowrap tabular-nums">{kpi.value}</span>} className="min-h-[76px]" />
        ))}
      </div>
      <EntityMonthlyChart monthly={analysis.monthly} year={analysis.year} entityLabel={e.label} />
      <SalesHistory history={analysis.history} />
    </div>
  );
};

/** Historial expandible (cerrado por defecto). Sin enlace: hoy no existe una ruta de detalle de RTO. */
const SalesHistory: React.FC<{ history: readonly ReportingEntitySaleDTO[] }> = ({ history }) => {
  const [open, setOpen] = useState(false);
  const listId = useId();
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className="ui-btn-dark inline-flex min-h-[40px] items-center rounded-[5px] px-4 text-sm font-semibold"
      >
        {open ? 'Ocultar historial' : `Ver historial (${history.length})`}
      </button>
      {open && (
        <div id={listId} className="mt-3">
          {history.length === 0 ? (
            <p className="text-sm text-steffen-muted">Sin ventas registradas para mostrar.</p>
          ) : (
            <ul className="divide-y divide-steffen-gray text-sm" aria-label="Historial de ventas">
              <li aria-hidden className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-4 pb-1.5 text-xs font-semibold text-steffen-muted">
                <span>RTO</span>
                <span className="text-right">Fecha</span>
                <span className="w-32 text-right">Total</span>
              </li>
              {history.map((sale) => (
                <li key={sale.remittanceId} className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-4 py-1.5">
                  <span className="truncate text-steffen-surface">{sale.rtoCode}</span>
                  <span className="text-right tabular-nums text-steffen-muted">{formatReportingDate(sale.businessDate)}</span>
                  <span className="w-32 text-right tabular-nums whitespace-nowrap text-steffen-surface">{formatReportingArs(sale.totalOrderArs)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
