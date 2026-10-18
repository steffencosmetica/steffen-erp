'use client';

import React, { useState } from 'react';
import type { ReportingProductsDTO } from '@/actions/reporting.dto';
import { ReportingPanel } from './ReportingPanel';
import { ReportingSegmented, type SegmentedOption } from './ReportingSegmented';
import { ProductShareChart, type ShareMetric } from './charts/ProductShareChart';

/**
 * Panel de Participación por producto (DESIGN.md §35.4): selector propio
 * Unidades / Facturación / Contribución, independiente de las pestañas del
 * ranking. Estado inicial: Unidades.
 */
const METRICS: readonly SegmentedOption<ShareMetric>[] = [
  { value: 'units', label: 'Unidades' },
  { value: 'billed', label: 'Facturación' },
  { value: 'contribution', label: 'Contribución' },
];

export const ProductSharePanel: React.FC<{
  products: ReportingProductsDTO | null;
  year: number | undefined;
  loading: boolean;
  error: string | null;
  className?: string;
}> = ({ products, year, loading, error, className }) => {
  const [metric, setMetric] = useState<ShareMetric>('units');
  const metricLabel = METRICS.find((m) => m.value === metric)?.label ?? '';

  return (
    <ReportingPanel
      title="PARTICIPACIÓN POR PRODUCTO"
      className={className}
      loading={loading}
      error={error}
      empty={products && products.rows.length === 0 ? `No hay productos vendidos en ${year}.` : null}
      bodyControls={<ReportingSegmented mode="toggle" ariaLabel="Métrica de participación" options={METRICS} value={metric} onChange={setMetric} />}
    >
      <div className="space-y-4">
        {products && <ProductShareChart share={products.share[metric]} metric={metric} metricLabel={metricLabel} />}
      </div>
    </ReportingPanel>
  );
};
