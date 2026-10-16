import { redirect } from 'next/navigation';
import { getAuthenticatedUser, isUserAuthorized } from '@/auth/guard';
import {
  getCustomerService,
  getPatrimonyService,
  getSupplierItemRepository,
  getRemittanceService,
  getReportService,
} from '@/services/composition';
import { AdministracionView } from '@/ui/views/AdministracionView';
import { type AdministracionDashboardDTO } from '@/actions/administracion.dto';
import { serializeMonthlySale } from '@/actions/remittance.dto';
import { Decimal, toNumericString } from '@/domain/decimal';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Administración • Steffen ERP',
  description: 'Control de ventas, cuentas corrientes, deudas comerciales, cotizaciones y caja.',
};

export default async function AdministracionPage() {
  // 1. Guard obligatorio de servidor: valida sesión activa del usuario
  const user = await getAuthenticatedUser();
  if (!user || !isUserAuthorized(user)) {
    redirect('/login');
  }

  // 2. Consulta en paralelo a los servicios y repositorios del backend real
  const customerService = getCustomerService();
  const patrimonyService = getPatrimonyService();
  const supplierItemRepo = getSupplierItemRepository();
  const remittanceService = getRemittanceService();

  // Período comercial desde la fecha de la base (misma fuente que el Dashboard); nunca la hora de Node.
  const { year: currentYear, month: currentMonth } = await getReportService().getCurrentBusinessPeriod();

  const [customerRecords, customerLastActivityMap, supplierDebts, summary, recentMovements, usdRate, monthlySales] =
    await Promise.all([
      customerService.listCustomers(true).catch(() => []),
      patrimonyService.getCustomerLastActivityMap().catch(() => new Map()),
      patrimonyService.listSupplierDebtsWithActivity().catch(() => []),
      patrimonyService.getSummary().catch(() => ({
        cajaSteffen: new Decimal(0),
        cajaMercadoLibre: new Decimal(0),
        deudasClientes: new Decimal(0),
        deudasProveedores: new Decimal(0),
        neto: new Decimal(0),
      })),
      patrimonyService.listRecentMovements(10).catch(() => []),
      supplierItemRepo.getCurrentUsdExchangeRate().catch(() => null),
      remittanceService.listCompletedSalesForMonth(currentYear, currentMonth).catch(() => []),
    ]);

  // Total de la tabla Deudas Proveedores: suma únicamente los saldos > 0 mostrados
  const totalTablaProveedores = supplierDebts.reduce(
    (acc, s) => acc.plus(s.balanceArs),
    new Decimal(0)
  );

  // 4. Mapeo a DTOs JSON-safe para Client Component
  const dashboardDTO: AdministracionDashboardDTO = {
    currentUsdRate: usdRate ? toNumericString(usdRate) : null,
    cajaSteffenArs: toNumericString(summary.cajaSteffen),
    cajaMercadoLibreArs: toNumericString(summary.cajaMercadoLibre),
    deudasClientesArs: toNumericString(summary.deudasClientes),
    deudasProveedoresArs: toNumericString(summary.deudasProveedores),
    totalDeudasProveedoresTablaArs: toNumericString(totalTablaProveedores),
    netoArs: toNumericString(summary.neto),
    customerRows: customerRecords.map((c) => ({
      id: c.id,
      name: c.name,
      balanceArs: toNumericString(c.balanceArs),
      lastPaymentDate: customerLastActivityMap.get(c.id)?.lastPaymentDate ?? null,
      lastPurchaseDate: customerLastActivityMap.get(c.id)?.lastPurchaseDate ?? null,
    })),
    supplierRows: supplierDebts.map((s) => ({
      id: s.supplierId,
      name: s.name,
      balanceArs: toNumericString(s.balanceArs),
      lastPaymentDate: s.lastPaymentDate,
      lastPurchaseDate: s.lastPurchaseDate,
    })),
    recentMovements: recentMovements.map((m) => ({
      id: m.id,
      code: m.code,
      date: m.businessDate || (m.createdAt ? m.createdAt.split('T')[0] : '—'),
      type: m.movementType,
      description: m.description,
      amountArs: toNumericString(m.amountArs),
      patrimonialVariation: m.patrimonialVariation || '',
    })),
  };

  return (
    <AdministracionView
      data={dashboardDTO}
      initialMonthlySales={monthlySales.map(serializeMonthlySale)}
      initialYear={currentYear}
      initialMonth={currentMonth}
    />
  );
}
