import React, { type ReactNode } from 'react';
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
  /** Carga interna (skeleton); sin spinner global. */
  loading?: boolean;
  /** Mensaje específico de estado vacío (COMPONENTS.md §51); null/undefined = hay datos. */
  empty?: string | null;
  /** Error de carga del bloque. */
  error?: string | null;
  className?: string;
  children?: ReactNode;
}> = ({ title, controls, loading = false, empty, error, className = '', children }) => (
  <Panel className={className}>
    <SectionHeader title={title} actions={controls} />
    <div aria-busy={loading || undefined}>
      {loading ? (
        <div className="space-y-2" aria-label="Cargando">
          <div className="h-4 w-1/3 rounded-[5px] bg-steffen-gray animate-pulse" />
          <div className="h-24 rounded-[5px] bg-steffen-gray/50 animate-pulse" />
        </div>
      ) : error ? (
        <p className="text-sm text-steffen-red">{error}</p>
      ) : empty ? (
        <p className="text-sm text-steffen-muted">{empty}</p>
      ) : (
        children
      )}
    </div>
  </Panel>
);

/** Marcador TÉCNICO temporal de un bloque cuya visualización se implementa en una subfase posterior. */
export const ReportingPendingNotice: React.FC<{ phase: string }> = ({ phase }) => (
  <p className="text-xs text-steffen-muted">Visualización pendiente de implementación ({phase}).</p>
);
