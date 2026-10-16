import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthenticatedUser, isUserAuthorized } from '@/auth/guard';
import {
  getCustomerService,
  getSupplierService,
  getMasterItemService,
  getFormulaService,
  getProductService,
  getFactoryService,
  getPatrimonyService,
  getOrderService,
} from '@/services/composition';
import { Decimal, toNumericString } from '@/domain/decimal';
import { serializeBulkLot } from '@/actions/factory.dto';
import type { BaseProductOption } from '@/ui/modals/RegistrarFabricacionModal';
import type { PackagingProductOption } from '@/ui/modals/RegistrarEnvasadoModal';
import { DashboardActionsProvider, DashboardActionButton } from '@/ui/components/DashboardQuickAccess';
import { DashboardCuentasCard } from '@/ui/components/DashboardCuentasCard';
import { SectionHeader, KpiCard, Panel, tableStyles, forwardLinkClass, ForwardArrow } from '@/ui/components/UIComponents';
import { ErpIcon } from '@/ui/components/ErpIcon';
import { formatArs, formatKg } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Dashboard • Steffen ERP',
  description: 'Panel operativo principal y centro de control según Figma.',
};

export default async function ErpHomePage() {
  const user = await getAuthenticatedUser();
  if (!user || !isUserAuthorized(user)) {
    redirect('/login');
  }

  // Carga de datos reales sin mocks para el Dashboard
  const [
    mprItems,
    customers,
    suppliers,
    baseProductRecords,
    productRecords,
    openLotsRecords,
    patrimonialSummary,
    openOrdersCount,
  ] = await Promise.all([
    getMasterItemService().listMasterItems('MPR').catch(() => []),
    getCustomerService().listCustomers().catch(() => []),
    getSupplierService().listSuppliers().catch(() => []),
    getFormulaService().listBaseProducts(true).catch(() => []),
    getProductService().listProducts(false).catch(() => []),
    getFactoryService().listOpenBulkLots().catch(() => []),
    getPatrimonyService().getSummary().catch(() => ({
      cajaSteffen: new Decimal(0),
      cajaMercadoLibre: new Decimal(0),
      deudasClientes: new Decimal(0),
      deudasProveedores: new Decimal(0),
      neto: new Decimal(0),
    })),
    getOrderService().countOpenOrders().catch(() => 0),
  ]);

  // Filtrar insumos críticos reales (por debajo del mínimo)
  const criticalItems = mprItems
    .filter((it) => it.stockMinimum && it.balance.lt(it.stockMinimum) && it.active)
    .sort((a, b) => {
      const minA = a.stockMinimum || new Decimal(1);
      const minB = b.stockMinimum || new Decimal(1);
      const ratioA = a.balance.div(minA).toNumber();
      const ratioB = b.balance.div(minB).toNumber();
      return ratioA - ratioB;
    });

  // Cálculo de totales financieros reales
  const totalCustomerDebt = customers.reduce((acc, c) => {
    return acc.plus(c.balanceArs.gt(0) ? c.balanceArs : new Decimal(0));
  }, new Decimal(0));

  const totalSupplierDebt = suppliers.reduce((acc, s) => {
    return acc.plus(s.balance.gt(0) ? s.balance : new Decimal(0));
  }, new Decimal(0));

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
              {/* Cards KPI (DESIGN.md §15.2). Valores: los mismos que ya mostraba esta
                  pantalla; el Dashboard con fuentes reales es Fase 16. */}
              <div className="grid grid-cols-[1fr_1fr_1.35fr] gap-x-4 gap-y-3 items-stretch">
                <KpiCard
                  className="min-h-[109px]"
                  label="Pedidos abiertos"
                  value={openOrdersCount}
                  icon={<ErpIcon name="orden" tone="chrome" className="w-10 h-10" />}
                />
                <KpiCard
                  className="min-h-[109px]"
                  label="Ventas del mes"
                  value="11"
                  icon={<ErpIcon name="ingresos" tone="chrome" className="w-10 h-10" />}
                />
                <div className="row-span-2 flex flex-col gap-3">
                  <KpiCard className="flex-1" label="Total facturado" value="$ 6.536.464" />
                  <KpiCard className="flex-1" label="Ganancia" value="$ 4.234.242" variant="positive" />
                </div>
                <DashboardActionButton action="order" appearance="secondary" className="w-full" />
                <div aria-hidden />
              </div>
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
                cajaSteffen={toNumericString(patrimonialSummary.cajaSteffen)}
                cajaMercadoLibre={toNumericString(patrimonialSummary.cajaMercadoLibre)}
                deudasClientes={toNumericString(patrimonialSummary.deudasClientes)}
                deudasProveedores={toNumericString(patrimonialSummary.deudasProveedores)}
                neto={toNumericString(patrimonialSummary.neto)}
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

          {/* Columna derecha: RESUMEN DE PEDIDOS */}
          <div className="lg:col-span-7">
            <SectionHeader title="Resumen de pedidos" />
            <Panel>
              <div className="overflow-x-auto">
                <table className={tableStyles.table}>
                  <thead>
                    <tr className={tableStyles.headRow}>
                      <th className="py-2 px-3 text-left">PRODUCTO</th>
                      <th className="py-2 px-3 text-center">PED01<br /><span className="text-[11px] font-normal normal-case">Salceh, Tarek</span></th>
                      <th className="py-2 px-3 text-center">PED02<br /><span className="text-[11px] font-normal normal-case">Salceh, Tarek</span></th>
                      <th className="py-2 px-3 text-center">TOTAL</th>
                      <th className="py-2 px-3 text-center">STOCK</th>
                      <th className="py-2 px-3 text-center">FALTANTE</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className={tableStyles.row}>
                      <td className="py-1.5 px-3">Reparador de puntas 30cc</td>
                      <td className="py-1.5 px-3 text-center">100</td>
                      <td className="py-1.5 px-3 text-center">50</td>
                      <td className="py-1.5 px-3 text-center">150</td>
                      <td className="py-1.5 px-3 text-center">50 + <span className="text-steffen-muted">(100)GR</span></td>
                      <td className="py-1.5 px-3 text-center">-</td>
                    </tr>
                    <tr className={tableStyles.row}>
                      <td className="py-1.5 px-3">Shampoo Keratina 350cc</td>
                      <td className="py-1.5 px-3 text-center">10</td>
                      <td className="py-1.5 px-3 text-center">0</td>
                      <td className="py-1.5 px-3 text-center">10</td>
                      <td className="py-1.5 px-3 text-center">(10)GR</td>
                      <td className="py-1.5 px-3 text-center">-</td>
                    </tr>
                    <tr className={tableStyles.row}>
                      <td className="py-1.5 px-3">Emulsion capilar Triple Accion</td>
                      <td className="py-1.5 px-3 text-center">100</td>
                      <td className="py-1.5 px-3 text-center">20</td>
                      <td className="py-1.5 px-3 text-center">120</td>
                      <td className="py-1.5 px-3 text-center">0</td>
                      <td className="py-1.5 px-3 text-center font-semibold text-steffen-red">120</td>
                    </tr>
                    <tr className={tableStyles.row}>
                      <td className="py-1.5 px-3">Shampoo Keratina 1000cc</td>
                      <td className="py-1.5 px-3 text-center">20</td>
                      <td className="py-1.5 px-3 text-center">10</td>
                      <td className="py-1.5 px-3 text-center">30</td>
                      <td className="py-1.5 px-3 text-center text-steffen-muted">(12)GR</td>
                      <td className="py-1.5 px-3 text-center font-semibold text-steffen-red">18</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>
        </div>

        {/* BAJO STOCK (sección de alerta, DESIGN.md §13): MPR críticas + Simular compra */}
        <div>
          <SectionHeader title="Bajo stock" variant="alert" />
          <Panel variant="alert">
            <div className="overflow-x-auto">
              <table className={tableStyles.table}>
                <thead>
                  <tr className={tableStyles.headRowAlert}>
                    <th className="py-2 px-3 text-left">CODIGO</th>
                    <th className="py-2 px-3 text-left">COMPONENTE/MP</th>
                    <th className="py-2 px-3 text-left">PROVEEDOR</th>
                    <th className="py-2 px-3 text-right">ACTUAL</th>
                    <th className="py-2 px-3 text-center !bg-steffen-gray">SIMULAR COMPRA</th>
                    <th className="py-2 px-3 text-right !bg-steffen-gray">$</th>
                  </tr>
                </thead>
                <tbody>
                  {criticalItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-steffen-surface/60">
                        ✓ Todas las materias primas se encuentran en niveles óptimos de stock.
                      </td>
                    </tr>
                  ) : (
                    criticalItems.slice(0, 5).map((it) => {
                      const priceNet = it.referencePriceNet?.toNumber() || 0;
                      const min = it.stockMinimum || new Decimal(0);
                      const stockDiff = Math.max(0, min.minus(it.balance).toNumber());
                      const approxTotal = stockDiff * priceNet * 1.21;

                      return (
                        <tr key={it.id} className={tableStyles.row}>
                          <td className="py-1.5 px-3">{it.code}</td>
                          <td className="py-1.5 px-3 truncate max-w-[135px]">{it.name}</td>
                          <td className="py-1.5 px-3">{it.referenceSupplierCode || '-'}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums text-steffen-red">{formatKg(it.balance)} kg</td>
                          <td className="py-1.5 px-3 text-center tabular-nums">{Math.ceil(stockDiff)}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums font-semibold">{formatArs(approxTotal)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center pt-3 text-sm font-semibold">
              <Link href="/stock" className={forwardLinkClass}>
                Ir a Stock <ForwardArrow />
              </Link>
              <span>
                TOTAL:{' '}
                {formatArs(
                  criticalItems.reduce((acc, it) => {
                    const price = it.referencePriceNet || new Decimal(0);
                    const min = it.stockMinimum || new Decimal(0);
                    const diff = min.minus(it.balance);
                    return acc.plus(diff.gt(0) ? diff.mul(price).mul(1.21) : new Decimal(0));
                  }, new Decimal(0))
                )}
              </span>
            </div>
          </Panel>
        </div>
      </div>
    </DashboardActionsProvider>
  );
}
