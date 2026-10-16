import React, { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthenticatedUser, isUserAuthorized } from '@/auth/guard';
import {
  getSupplierService,
  getMasterItemService,
  getFormulaService,
  getProductService,
  getFactoryService,
  getPatrimonyService,
  getPlanningService,
  getReportService,
} from '@/services/composition';
import { toNumericString } from '@/domain/decimal';
import { compareStockPriority, isBelowStockMinimum } from '@/domain/stock-priority';
import {
  serializeBulkLot,
  serializeNextManufacturingProduct,
  type NextManufacturingProductDTO,
} from '@/actions/factory.dto';
import { selectNextManufacturingProducts, urgentProductIdsFromPlanning } from '@/domain/next-manufacturing';
import { DashboardLowStock, type LowStockMaterialDTO } from '@/ui/components/DashboardLowStock';
import { serializePlanningMatrix, type PlanningMatrixDTO } from '@/actions/planning.dto';
import type { BaseProductOption } from '@/ui/modals/RegistrarFabricacionModal';
import type { PackagingProductOption } from '@/ui/modals/RegistrarEnvasadoModal';
import { DashboardActionsProvider, DashboardActionButton } from '@/ui/components/DashboardQuickAccess';
import { DashboardCuentasCard } from '@/ui/components/DashboardCuentasCard';
import { PlanningMatrixTable } from '@/ui/components/PlanningMatrixTable';
import { SectionHeader, KpiCard, Panel } from '@/ui/components/UIComponents';
import { ErpIcon } from '@/ui/components/ErpIcon';
import { formatArs } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Dashboard • Steffen ERP',
  description: 'Panel operativo principal y centro de control según Figma.',
};

// Cantidad de ítems más urgentes mostrados en BAJO STOCK (orden normativo por ratio).
const LOW_STOCK_LIMIT = 5;

/** Importes de KPI: misma escala tipográfica compacta, sin desbordar la card. */
const MoneyValue: React.FC<{ value: string }> = ({ value }) => (
  <span className="text-[19px] whitespace-nowrap">{value}</span>
);

/* ==========================================================================
   REPORTE MENSUAL — v_current_reports (BUSINESS_RULES §36)
   ========================================================================== */

function MonthlyKpisGrid({
  openOrders,
  sales,
  billed,
  gain,
  error,
}: {
  openOrders: React.ReactNode;
  sales: React.ReactNode;
  billed: React.ReactNode;
  gain: React.ReactNode;
  error?: string;
}) {
  return (
    <>
      <div className="grid grid-cols-[1fr_1fr_1.35fr] gap-x-4 gap-y-3 items-stretch">
        <KpiCard
          className="min-h-[109px]"
          label="Pedidos abiertos"
          value={openOrders}
          icon={<ErpIcon name="orden" tone="chrome" className="w-10 h-10" />}
        />
        <KpiCard
          className="min-h-[109px]"
          label="Ventas del mes"
          value={sales}
          icon={<ErpIcon name="ingresos" tone="chrome" className="w-10 h-10" />}
        />
        <div className="row-span-2 flex flex-col gap-3">
          <KpiCard className="flex-1" label="Total facturado" value={billed} />
          <KpiCard className="flex-1" label="Ganancia" value={gain} variant="positive" />
        </div>
        <DashboardActionButton action="order" appearance="secondary" className="w-full" />
        <div aria-hidden />
      </div>
      {error && <p className="mt-2 text-xs text-steffen-red">{error}</p>}
    </>
  );
}

async function MonthlyKpis() {
  try {
    const reports = await getReportService().getCurrentReports();
    return (
      <MonthlyKpisGrid
        openOrders={reports.openOrders}
        sales={reports.salesCurrentMonth}
        billed={<MoneyValue value={formatArs(reports.billedCurrentMonthArs)} />}
        gain={<MoneyValue value={formatArs(reports.gainCurrentMonthArs)} />}
      />
    );
  } catch {
    return (
      <MonthlyKpisGrid
        openOrders="—"
        sales="—"
        billed="—"
        gain="—"
        error="No se pudieron cargar las métricas del mes."
      />
    );
  }
}

/* ==========================================================================
   RESUMEN DE PEDIDOS — mismo motor de planificación que Pedidos (§35.1)
   ========================================================================== */

function PlanningSummary({ planning }: { planning: PlanningMatrixDTO | null }) {
  if (!planning) {
    return <p className="py-12 text-center text-xs text-steffen-red">No se pudo cargar el resumen de pedidos.</p>;
  }
  return <PlanningMatrixTable planning={planning} />;
}

/* ==========================================================================
   BAJO STOCK — MPR/COM debajo del mínimo, prioridad por ratio (§8.3)
   ========================================================================== */

async function LowStock({
  products,
  baseProducts,
  urgencyUnavailable,
}: {
  products: NextManufacturingProductDTO[];
  baseProducts: BaseProductOption[];
  urgencyUnavailable: boolean;
}) {
  let materials: LowStockMaterialDTO[];
  try {
    const service = getMasterItemService();
    const [mpr, com] = await Promise.all([service.listMasterItems('MPR', false), service.listMasterItems('COM', false)]);
    materials = [...mpr, ...com]
      .filter((it) => it.active && isBelowStockMinimum(it))
      .sort(compareStockPriority)
      .slice(0, LOW_STOCK_LIMIT)
      .map((it) => ({
        id: it.id,
        name: it.name,
        itemType: it.itemType === 'COM' ? 'COM' : 'MPR',
        supplierName: it.referenceSupplierName,
        balance: toNumericString(it.balance),
        unitCostGrossArs: it.currentTheoreticalCostGrossArs ? toNumericString(it.currentTheoreticalCostGrossArs) : null,
      }));
  } catch {
    return (
      <Panel variant="alert">
        <p className="py-6 text-center text-xs text-steffen-red">No se pudo cargar el bajo stock.</p>
      </Panel>
    );
  }

  return (
    <DashboardLowStock
      materials={materials}
      products={products}
      baseProducts={baseProducts}
      urgencyUnavailable={urgencyUnavailable}
    />
  );
}

const BlockLoading: React.FC<{ label: string }> = ({ label }) => (
  <p className="py-12 text-center text-xs text-steffen-muted">Cargando {label}…</p>
);

export default async function ErpHomePage() {
  const user = await getAuthenticatedUser();
  if (!user || !isUserAuthorized(user)) {
    redirect('/login');
  }

  // Datos de las operaciones rápidas y de CUENTAS (fuentes reales).
  const [suppliers, baseProductRecords, productRecords, openLotsRecords, patrimonialSummary, planningMatrix] = await Promise.all([
    getSupplierService().listSuppliers().catch(() => []),
    getFormulaService().listBaseProducts(true).catch(() => []),
    getProductService().listProducts(false).catch(() => []),
    getFactoryService().listOpenBulkLots().catch(() => []),
    getPatrimonyService()
      .getSummary()
      .catch(() => null),
    // Mismo motor que Pedidos: alimenta RESUMEN DE PEDIDOS y la urgencia de Producto Final.
    getPlanningService()
      .getPlanningMatrix()
      .catch(() => null),
  ]);

  const supplierOptions = suppliers.map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    currencyCode: s.currencyCode as 'ARS' | 'USD',
    active: s.active,
  }));

  const bulkLotsDTO = openLotsRecords.map(serializeBulkLot);

  const baseProductsForFabrication: BaseProductOption[] = baseProductRecords
    .filter((bp) => bp.active && bp.currentFormulaBreakdown)
    .map((bp) => ({
      id: bp.id,
      name: bp.name,
      code: bp.code,
    }));

  const planning = planningMatrix ? serializePlanningMatrix(planningMatrix) : null;
  const nextManufacturingProducts = selectNextManufacturingProducts(
    productRecords,
    urgentProductIdsFromPlanning(planning?.products ?? [])
  ).map(serializeNextManufacturingProduct);

  const productsForPackaging: PackagingProductOption[] = productRecords
    .filter((p) => p.active)
    .map((p) => ({
      productId: p.productId,
      code: p.code,
      name: p.name,
      baseProductId: p.baseProductId,
      presentation: p.presentation,
      weightKg: toNumericString(p.weightKg),
    }));

  return (
    <DashboardActionsProvider
      suppliers={supplierOptions}
      baseProducts={baseProductsForFabrication}
      bulkLots={bulkLotsDTO}
      packagingProducts={productsForPackaging}
    >
      <div className="space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Columna izquierda (Figma Dashboard): REPORTE MENSUAL → ACCESO RÁPIDO → CUENTAS */}
          <div className="lg:col-span-5 space-y-6">
            <div>
              <SectionHeader title="Reporte mensual" />
              <Suspense
                fallback={<MonthlyKpisGrid openOrders="…" sales="…" billed="…" gain="…" />}
              >
                <MonthlyKpis />
              </Suspense>
            </div>

            <div>
              <SectionHeader title="Acceso rápido" />
              <div className="flex flex-wrap items-center gap-3">
                <DashboardActionButton action="purchase" appearance="icon" />
                <DashboardActionButton action="manufacturing" appearance="icon" />
                <DashboardActionButton action="packaging" appearance="icon" />
                <Link
                  href="/precios"
                  className="ui-btn-dark h-[50px] px-5 inline-flex items-center gap-3 rounded-[5px] text-lg transition-colors"
                >
                  <ErpIcon name="lista-precios" className="w-7 h-7" />
                  Listas de precios
                </Link>
              </div>
            </div>

            <div>
              <SectionHeader title="Cuentas" />
              <DashboardCuentasCard
                cajaSteffen={patrimonialSummary ? toNumericString(patrimonialSummary.cajaSteffen) : '0'}
                cajaMercadoLibre={patrimonialSummary ? toNumericString(patrimonialSummary.cajaMercadoLibre) : '0'}
                deudasClientes={patrimonialSummary ? toNumericString(patrimonialSummary.deudasClientes) : '0'}
                deudasProveedores={patrimonialSummary ? toNumericString(patrimonialSummary.deudasProveedores) : '0'}
                neto={patrimonialSummary ? toNumericString(patrimonialSummary.neto) : '0'}
                error={patrimonialSummary ? null : 'No se pudieron cargar los saldos de cuentas.'}
                actions={
                  <>
                    <DashboardActionButton action="supplier-payment" appearance="secondary-large" />
                    <DashboardActionButton action="customer-payment" appearance="success-large" />
                    <DashboardActionButton action="expense" appearance="icon" />
                  </>
                }
              />
            </div>
          </div>

          {/* Columna derecha: RESUMEN DE PEDIDOS (informativo: no reserva ni genera movimientos) */}
          <div className="lg:col-span-7">
            <SectionHeader title="Resumen de pedidos" />
            <Panel>
              <PlanningSummary planning={planning} />
            </Panel>
          </div>
        </div>

        {/* BAJO STOCK (Figma): MPR/COM + simular compra · Producto Final + simular fabricación */}
        <div>
          <SectionHeader title="Bajo stock" variant="alert" />
          <Suspense
            fallback={
              <Panel variant="alert">
                <BlockLoading label="bajo stock" />
              </Panel>
            }
          >
            <LowStock
              products={nextManufacturingProducts}
              baseProducts={baseProductsForFabrication}
              urgencyUnavailable={planning === null}
            />
          </Suspense>
        </div>
      </div>
    </DashboardActionsProvider>
  );
}
