'use client';

import React, { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Panel, SectionHeader } from '@/ui/components/UIComponents';

/**
 * Panel de Reportes (DESIGN.md §35.1, §35.8; COMPONENTS.md §60.1): reutiliza
 * Panel + SectionHeader del sistema. Nunca se oculta por falta de datos: el
 * título y los controles se mantienen y el estado (carga / vacío / error) se
 * muestra DENTRO del panel. Altura natural (sin equal-height).
 */
export const ReportingPanel: React.FC<{
  title: string;
  controls?: ReactNode;
  bodyControls?: ReactNode;
  tabPanel?: { id: string; labelledBy: string };
  initialLoadingHeight?: number;
  /** Carga interna (skeleton); sin spinner global. */
  loading?: boolean;
  /** Mensaje específico de estado vacío (COMPONENTS.md §51); null/undefined = hay datos. */
  empty?: string | null;
  /** Error de carga del bloque. */
  error?: string | null;
  className?: string;
  children?: ReactNode;
}> = ({ title, controls, bodyControls, tabPanel, initialLoadingHeight = 112, loading = false, empty, error, className = '', children }) => {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(initialLoadingHeight);
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body || loading) return;
    const observer = new ResizeObserver(() => setHeight(body.getBoundingClientRect().height));
    observer.observe(body);
    return () => observer.disconnect();
  }, [loading]);

  return (
    <Panel className={`min-w-0 overflow-visible ${className}`}>
      <SectionHeader title={title} actions={controls} className="[&>h2]:whitespace-normal [&>h2]:min-w-0 [&>h2]:break-words" />
      {bodyControls && <div className="mb-4 min-w-0">{bodyControls}</div>}
      <div
        ref={bodyRef}
        id={tabPanel?.id}
        role={tabPanel ? 'tabpanel' : undefined}
        aria-labelledby={tabPanel?.labelledBy}
        tabIndex={tabPanel ? 0 : undefined}
        className="min-w-0 focus-visible:outline focus-visible:outline-1 focus-visible:outline-steffen-gold"
        aria-busy={loading || undefined}
        style={loading ? { minHeight: height } : undefined}
      >
        {loading ? (
          <div className="space-y-2" role="status">
            <span className="sr-only">Cargando {title.toLowerCase()}.</span>
            <div aria-hidden className="h-4 w-1/3 rounded-[5px] bg-steffen-gray animate-pulse motion-reduce:animate-none" />
            <div aria-hidden className="h-24 rounded-[5px] bg-steffen-gray/50 animate-pulse motion-reduce:animate-none" />
          </div>
        ) : error ? (
          <p role="alert" className="break-words text-sm text-steffen-red">{error}</p>
        ) : empty ? (
          <p role="status" className="py-3 text-sm text-steffen-muted">{empty}</p>
        ) : (
          children
        )}
      </div>
    </Panel>
  );
};
