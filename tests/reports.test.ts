import test from 'node:test';
import assert from 'node:assert';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/database/types';
import { Decimal } from '../src/domain/decimal';
import { aggregateSalesByPeriod } from '../src/domain/sales-period';
import { addDaysToBusinessDate } from '../src/domain/business-period';
import { serializeMonthlySale } from '../src/actions/remittance.dto';
import { RemittanceRepository } from '../src/repositories/remittance.repository';
import { RemittanceDomainService } from '../src/services/remittance.service';
import { ReportRepository } from '../src/repositories/report.repository';
import { ReportDomainService } from '../src/services/report.service';
import { PatrimonyRepository } from '../src/repositories/patrimony.repository';
import type { IOrderRepository } from '../src/repositories/order.repository';
import type { IStockRepository } from '../src/repositories/stock.repository';
import type { ICostEngineService } from '../src/services/cost-engine.service';
import type { IDocumentRepository } from '../src/repositories/document.repository';
import type { IMarginRemittanceRepository } from '../src/repositories/margin-remittance.repository';

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

test('FASE 17 — Reportes: dominio', async (t) => {
  await t.test('ventas por mes/año: agrupa por business_date, suma exacta, orden descendente', () => {
    const sale = (businessDate: string, total: string, gain: string) => ({
      businessDate,
      totalOrderArs: new Decimal(total),
      gainArs: new Decimal(gain),
    });
    const res = aggregateSalesByPeriod([
      sale('2026-09-30', '1000.10', '100.01'),
      sale('2026-10-01', '0.1', '0.2'),
      sale('2026-10-31', '0.2', '0.1'),
      sale('2025-12-15', '50', '5'),
    ]);
    assert.deepStrictEqual(
      res.map((p) => [p.year, p.month, p.salesCount, p.billedArs.toString(), p.gainArs.toString()]),
      [
        [2026, 10, 2, '0.3', '0.3'],
        [2026, 9, 1, '1000.1', '100.01'],
        [2025, 12, 1, '50', '5'],
      ]
    );
  });

  await t.test('últimos 90 días: aritmética de calendario sobre la fecha comercial', () => {
    assert.strictEqual(addDaysToBusinessDate('2026-10-16', -90), '2026-07-18');
    assert.strictEqual(addDaysToBusinessDate('2026-01-01', -1), '2025-12-31');
    assert.strictEqual(addDaysToBusinessDate('2028-03-01', -1), '2028-02-29');
  });

  await t.test('DTO de ventas: importes como string NUMERIC exacto (sin Number)', () => {
    const dto = serializeMonthlySale({
      remittanceId: 'r',
      marginRemittanceId: 'm',
      rtoCode: 'RTO0001',
      rtmCode: 'RTM0001',
      businessDate: '2026-10-01',
      customerSource: 'REGISTERED_CUSTOMER',
      customerDisplayName: 'Cliente',
      totalOrderArs: new Decimal('12345678901234.123456'),
      gainArs: new Decimal('0.000001'),
      rtoDocumentStatus: 'READY',
      rtmDocumentStatus: 'MISSING',
    });
    assert.strictEqual(dto.totalOrderArs, '12345678901234.123456');
    assert.strictEqual(dto.gainArs, '0.000001');
  });
});

test('FASE 17 — Reportes: datos reales (solo lectura)', async (t) => {
  const remittanceService = new RemittanceDomainService(
    new RemittanceRepository(supabase),
    {} as IOrderRepository,
    {} as IStockRepository,
    {} as IMarginRemittanceRepository,
    {} as ICostEngineService,
    { listStatusesBySourceIds: async () => new Map() } as unknown as IDocumentRepository
  );
  const reportService = new ReportDomainService(new ReportRepository(supabase));

  await t.test('período comercial vigente: Ventas por mes coincide con v_current_reports', async () => {
    const [period, periods, reports] = await Promise.all([
      reportService.getCurrentBusinessPeriod(),
      remittanceService.listSalesByPeriod(),
      reportService.getCurrentReports(),
    ]);
    const current = periods.find((p) => p.year === period.year && p.month === period.month);
    assert.strictEqual(current?.salesCount ?? 0, reports.salesCurrentMonth);
    assert.strictEqual((current?.billedArs ?? new Decimal(0)).toString(), reports.billedCurrentMonthArs.toString());
    assert.strictEqual((current?.gainArs ?? new Decimal(0)).toString(), reports.gainCurrentMonthArs.toString());
  });

  await t.test('cada período agregado coincide con el detalle de Ventas del mes', async () => {
    const periods = await remittanceService.listSalesByPeriod();
    for (const p of periods.slice(0, 3)) {
      const sales = await remittanceService.listCompletedSalesForMonth(p.year, p.month);
      assert.strictEqual(sales.length, p.salesCount, `${p.year}-${p.month}`);
      const billed = sales.reduce((acc, s) => acc.plus(s.totalOrderArs), new Decimal(0));
      const gain = sales.reduce((acc, s) => acc.plus(s.gainArs), new Decimal(0));
      assert.strictEqual(billed.toString(), p.billedArs.toString());
      assert.strictEqual(gain.toString(), p.gainArs.toString());
      // Orden: más reciente primero.
      const dates = sales.map((s) => s.businessDate);
      assert.deepStrictEqual(dates, [...dates].sort().reverse());
    }
  });

  await t.test('Movimientos: últimos 90 días filtrados en servidor por business_date, completos y en orden descendente', async () => {
    const { businessDate } = await reportService.getCurrentBusinessPeriod();
    const startDate = addDaysToBusinessDate(businessDate, -90);
    const movements = await new PatrimonyRepository(supabase).listMovements({ startDate, endDate: businessDate });

    assert.ok(movements.every((m) => m.businessDate >= startDate && m.businessDate <= businessDate));
    const dates = movements.map((m) => m.businessDate);
    assert.deepStrictEqual(dates, [...dates].sort().reverse());

    const { count, error } = await supabase
      .from('patrimonial_movements')
      .select('id, business_operations!inner(business_date)', { count: 'exact', head: true })
      .gte('business_operations.business_date', startDate)
      .lte('business_operations.business_date', businessDate);
    assert.ifError(error);
    assert.strictEqual(movements.length, count);
  });
});
