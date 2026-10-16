import test from 'node:test';
import assert from 'node:assert';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/database/types';
import { Decimal } from '../src/domain/decimal';
import { compareStockPriority, isBelowStockMinimum } from '../src/domain/stock-priority';
import { selectNextManufacturingProducts, urgentProductIdsFromPlanning } from '../src/domain/next-manufacturing';
import { businessPeriodFromDate } from '../src/domain/business-period';
import { isValidSimulationQuantity, simulatedPurchaseAmount } from '../src/domain/purchase-simulation';
import {
  PURCHASE_SIMULATION_STORAGE_KEY,
  readPurchaseSimulation,
  withSimulationQuantity,
  writePurchaseSimulation,
  type SimulationStorage,
} from '../src/lib/purchase-simulation-storage';
import { ReportRepository } from '../src/repositories/report.repository';
import { ReportDomainService } from '../src/services/report.service';
import { RemittanceRepository } from '../src/repositories/remittance.repository';
import { PlanningRepository } from '../src/repositories/planning.repository';
import { PlanningDomainService } from '../src/services/planning.service';

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

class MemoryStorage implements SimulationStorage {
  data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

test('FASE 16 — Dashboard: prioridad de stock (dominio)', async (t) => {
  const item = (code: string, balance: string, min: string | null) => ({
    code,
    balance: new Decimal(balance),
    stockMinimum: min === null ? null : new Decimal(min),
  });

  await t.test('orden por ratio ascendente (stock_actual / stock_mínimo), desempate por código', () => {
    const list = [item('C', '50', '100'), item('A', '10', '100'), item('B', '10', '100'), item('D', '300', '100')];
    assert.deepStrictEqual([...list].sort(compareStockPriority).map((i) => i.code), ['A', 'B', 'C', 'D']);
  });

  await t.test('debajo del mínimo solo si balance < mínimo', () => {
    assert.strictEqual(isBelowStockMinimum(item('X', '99.999', '100')), true);
    assert.strictEqual(isBelowStockMinimum(item('X', '100', '100')), false);
    assert.strictEqual(isBelowStockMinimum(item('X', '0', null)), false);
  });
});

test('FASE 16 — Próxima fabricación: URG PARA PEDIDOS según Pedidos OPEN + planificación', async (t) => {
  const p = (productId: string, balance: string, min: string | null, active = true) => ({
    productId,
    name: productId,
    active,
    baseProductId: 'PBA-' + productId,
    balance: new Decimal(balance),
    stockMinimum: min === null ? null : new Decimal(min),
  });

  await t.test('urgentes = productos de pedidos OPEN con faltante final', () => {
    const urgent = urgentProductIdsFromPlanning([
      { productId: 'A', finalShortage: 5 },
      { productId: 'B', finalShortage: 0 },
    ]);
    assert.deepStrictEqual([...urgent], ['A']);
  });

  await t.test('stock <= 0 sin pedidos NO es urgente: queda POCO STOCK', () => {
    const res = selectNextManufacturingProducts([p('Z', '0', '10')], new Set());
    assert.deepStrictEqual(res.map((r) => [r.productId, r.isUrgentForOrders]), [['Z', false]]);
  });

  await t.test('urgente aunque esté sobre el mínimo; urgentes primero; inactivos fuera', () => {
    const res = selectNextManufacturingProducts(
      [p('LOW', '5', '10'), p('URG', '50', '10'), p('OK', '20', '10'), p('OFF', '0', '10', false)],
      new Set(['URG', 'OFF'])
    );
    assert.deepStrictEqual(
      res.map((r) => [r.productId, r.isUrgentForOrders, r.baseProductId]),
      [
        ['URG', true, 'PBA-URG'],
        ['LOW', false, 'PBA-LOW'],
      ]
    );
  });

  await t.test('con datos reales: todo faltante de la planificación sale como URG PARA PEDIDOS', async () => {
    const matrix = await new PlanningDomainService(new PlanningRepository(supabase)).getPlanningMatrix();
    const urgent = urgentProductIdsFromPlanning(matrix.products);
    const synthetic = matrix.products.map((row) => p(row.productId, '1000000', '1'));
    const res = selectNextManufacturingProducts(synthetic, urgent);
    const expected = matrix.products.filter((row) => row.finalShortage > 0).map((row) => row.productId);
    assert.deepStrictEqual(res.filter((r) => r.isUrgentForOrders).map((r) => r.productId), expected);
    assert.ok(res.every((r) => r.isUrgentForOrders));
  });
});

test('FASE 16 — Período comercial único (v_current_business_date)', async (t) => {
  const service = new ReportDomainService(new ReportRepository(supabase));

  await t.test('parseo textual de la fecha comercial, sin zona horaria', () => {
    assert.deepStrictEqual(businessPeriodFromDate('2026-12-31'), { businessDate: '2026-12-31', year: 2026, month: 12 });
    assert.deepStrictEqual(businessPeriodFromDate('2027-01-01'), { businessDate: '2027-01-01', year: 2027, month: 1 });
    assert.throws(() => businessPeriodFromDate('2026-13-01'));
    assert.throws(() => businessPeriodFromDate('2026-10-15T23:00:00Z'));
  });

  await t.test('Dashboard (v_current_reports) y Administración (ventas del período) usan el mismo año/mes', async () => {
    const period = await service.getCurrentBusinessPeriod();
    const [reports, sales] = await Promise.all([
      service.getCurrentReports(),
      new RemittanceRepository(supabase).listCompletedSalesForMonth(period.year, period.month),
    ]);
    assert.strictEqual(sales.length, reports.salesCurrentMonth);
    const billed = sales.reduce((acc, s) => acc.plus(s.totalOrderArs), new Decimal(0));
    const gain = sales.reduce((acc, s) => acc.plus(s.gainArs), new Decimal(0));
    assert.strictEqual(billed.toFixed(2), reports.billedCurrentMonthArs.toFixed(2));
    assert.strictEqual(gain.toFixed(2), reports.gainCurrentMonthArs.toFixed(2));
  });

  await t.test('métricas: importes Decimal exactos, PEDIDOS ABIERTOS = COUNT(orders OPEN)', async () => {
    const r = await service.getCurrentReports();
    assert.ok(r.billedCurrentMonthArs instanceof Decimal);
    assert.ok(r.gainCurrentMonthArs instanceof Decimal);
    const { count, error } = await supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'OPEN');
    assert.ifError(error);
    assert.strictEqual(r.openOrders, count);
  });
});

test('FASE 16 — Simular compra: validación, cálculo y persistencia local', async (t) => {
  await t.test('MPR: kg >= 0 con hasta 3 decimales', () => {
    for (const ok of ['', '0', '12', '12.5', '0,350', '180.125']) assert.ok(isValidSimulationQuantity('MPR', ok), ok);
    for (const bad of ['-1', '1.2345', 'abc', '1e3']) assert.ok(!isValidSimulationQuantity('MPR', bad), bad);
  });

  await t.test('COM: unidades enteras >= 0', () => {
    for (const ok of ['', '0', '180']) assert.ok(isValidSimulationQuantity('COM', ok), ok);
    for (const bad of ['1.5', '-2', '1,0']) assert.ok(!isValidSimulationQuantity('COM', bad), bad);
  });

  await t.test('importe = cantidad × costo bruto vigente (sin volver a aplicar IVA), exacto', () => {
    assert.strictEqual(simulatedPurchaseAmount('MPR', '0,350', '1210.00').toString(), '423.5');
    assert.strictEqual(simulatedPurchaseAmount('COM', '180', '99.99').toString(), '17998.2');
    assert.ok(simulatedPurchaseAmount('MPR', '', '1210').isZero());
    assert.ok(simulatedPurchaseAmount('COM', '5', null).isZero());
  });

  await t.test('persiste solo cantidades por ID y las restaura; el importe usa el costo vigente', () => {
    const storage = new MemoryStorage();
    let map = withSimulationQuantity({}, 'item-mpr', '0.350');
    map = withSimulationQuantity(map, 'item-com', '180');
    map = withSimulationQuantity(map, 'item-zero', '0');
    writePurchaseSimulation(storage, map);

    const stored = JSON.parse(storage.getItem(PURCHASE_SIMULATION_STORAGE_KEY)!);
    assert.deepStrictEqual(stored, { 'item-mpr': '0.350', 'item-com': '180' });

    const restored = readPurchaseSimulation(storage);
    assert.deepStrictEqual(restored, { 'item-mpr': '0.350', 'item-com': '180' });
    // Cambia el costo vigente: la cantidad persiste y el importe se recalcula.
    assert.strictEqual(simulatedPurchaseAmount('MPR', restored['item-mpr'], '2000').toString(), '700');
    assert.strictEqual(simulatedPurchaseAmount('MPR', restored['item-mpr'], '3000').toString(), '1050');
  });

  await t.test('borrar o poner 0 elimina la entrada', () => {
    assert.deepStrictEqual(withSimulationQuantity({ a: '5' }, 'a', ''), {});
    assert.deepStrictEqual(withSimulationQuantity({ a: '5' }, 'a', '0,000'), {});
  });

  await t.test('sin localStorage o con datos corruptos no rompe', () => {
    assert.deepStrictEqual(readPurchaseSimulation(null), {});
    const broken = new MemoryStorage();
    broken.setItem(PURCHASE_SIMULATION_STORAGE_KEY, '{no json');
    assert.deepStrictEqual(readPurchaseSimulation(broken), {});
    const throwing: SimulationStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    assert.deepStrictEqual(readPurchaseSimulation(throwing), {});
    assert.doesNotThrow(() => writePurchaseSimulation(throwing, { a: '1' }));
  });
});
