import React from 'react';
import { redirect } from 'next/navigation';
import { getAuthenticatedUser, isUserAuthorized } from '@/auth/guard';
import { getReportingService } from '@/services/composition';
import {
  serializeReportingYears,
  serializeReportingBilling,
  serializeReportingProducts,
  serializeReportingCustomers,
  serializeReportingEntityAnalysis,
} from '@/actions/reporting.dto';
import { ReportingDashboard } from '@/ui/reporting/ReportingDashboard';
import type { ReportingAnalysisState } from '@/ui/reporting/CustomerAnalysis';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Reportes • Steffen ERP',
  description: 'Reportes analíticos: facturación, productos y clientes por año.',
};

/** `?year=YYYY` → número; cualquier otro valor se ignora (el Service valida contra los años disponibles). */
function parseYearParam(value: string | string[] | undefined): number | undefined {
  return typeof value === 'string' && /^\d{4}$/.test(value) ? Number(value) : undefined;
}

/**
 * Reportes analíticos READ-ONLY (docs/REPORTES.md, DESIGN.md §35). El Server
 * Component resuelve el año (una sola lectura de la fecha comercial), carga en
 * paralelo Facturación, Productos y Clientes y entrega DTOs serializados al
 * cliente. Un bloque que falla se muestra con error dentro de su panel.
 */
export default async function ReportesPage(props: { searchParams?: Promise<{ year?: string | string[] }> }) {
  const user = await getAuthenticatedUser();
  if (!user || !isUserAuthorized(user)) {
    redirect('/login');
  }

  const searchParams = props.searchParams ? await props.searchParams : {};
  const service = getReportingService();
  const years = await service.resolveYears(parseYearParam(searchParams.year)).catch(() => null);

  if (!years) {
    return <ReportingDashboard years={null} billing={null} products={null} customers={null} initialAnalysis={null} />;
  }

  const [billing, products, customers] = await Promise.all([
    service.getBilling(years).then(serializeReportingBilling).catch(() => null),
    service.getProducts(years).then(serializeReportingProducts).catch(() => null),
    service.getCustomers(years).then(serializeReportingCustomers).catch(() => null),
  ]);

  // Precargar la primera entidad sin una segunda ida al servidor desde un
  // useEffect cliente. Reutiliza el año y la fecha comercial ya resueltos.
  const firstEntity = customers?.selectableEntities[0];
  let initialAnalysis: ReportingAnalysisState | null = null;
  if (firstEntity) {
    const entityKey = firstEntity.entityKey;
    try {
      const analysis = await service.getEntityAnalysis(years, entityKey);
      initialAnalysis = {
        status: 'ready', year: years.selectedYear, entityKey,
        data: analysis === null ? null : serializeReportingEntityAnalysis(analysis),
      };
    } catch {
      initialAnalysis = { status: 'error', year: years.selectedYear, entityKey, message: 'No se pudo cargar el análisis de esta entidad.' };
    }
  }

  return (
    <ReportingDashboard
      years={serializeReportingYears(years)}
      billing={billing}
      products={products}
      customers={customers}
      initialAnalysis={initialAnalysis}
    />
  );
}
