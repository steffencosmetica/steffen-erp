import test, { mock } from 'node:test';
import assert from 'node:assert';

/**
 * Costo teórico ACTUAL de MPR/COM con proveedor USD (Stock y Fórmulas):
 * P.U USD = precio USD vigente; P.U $ = USD × cotización GLOBAL vigente; P.U + IVA = P.U $ × 1,21.
 * La cotización particular de una CMP (exchange_rate_used) no entra. Sin red ni DB.
 */

// Los repositorios reales nunca se instancian: se aísla el cliente server-side.
mock.module('@/database/server', {
  namedExports: { serverSupabase: {}, getServerSupabaseClient: () => ({}) },
});

type Currency = 'ARS' | 'USD';

test('Costos USD/ARS — P.U USD / P.U $ / P.U + IVA', async (t) => {
  const { Decimal } = await import('../src/domain/decimal');
  const { computeCurrentItemCostArs, CostEngineService } = await import('../src/services/cost-engine.service');
  const { MasterItemDomainService } = await import('../src/services/master-item.service');
  const { serializeRawMaterial, serializeComponent } = await import('../src/actions/master-item.dto');
  const { itemPriceDisplays } = await import('../src/lib/item-price-display');
  const { InvalidExchangeRateError } = await import('../src/domain/errors');
  type DecimalT = InstanceType<typeof Decimal>;

  // ------------------------------------------------------------------------
  // Fakes: precio vigente del proveedor y cotización GLOBAL (exchange_rates is_current)
  // ------------------------------------------------------------------------
  const state = {
    globalUsdRate: new Decimal('1000') as DecimalT | null,
    items: new Map<string, { currency: Currency; quoted: DecimalT; type: 'MPR' | 'COM' }>(),
    /** Snapshots de CMP: solo histórico, nunca consultado por el costo teórico. */
    purchases: [] as Array<{ stockItemId: string; exchangeRateUsed: DecimalT; unitPriceNetSource: DecimalT }>,
  };
  state.items.set('mpr-usd', { currency: 'USD', quoted: new Decimal('1'), type: 'MPR' });
  state.items.set('com-usd', { currency: 'USD', quoted: new Decimal('1'), type: 'COM' });
  state.items.set('mpr-ars', { currency: 'ARS', quoted: new Decimal('100'), type: 'MPR' });
  state.items.set('com-ars', { currency: 'ARS', quoted: new Decimal('100'), type: 'COM' });

  const supplierItemRepo = {
    getLatestSupplierItem: async (stockItemId: string) => {
      const it = state.items.get(stockItemId);
      return it
        ? {
            supplierItemId: `si-${stockItemId}`,
            supplierId: `sup-${it.currency}`,
            stockItemId,
            quotedUnitPriceNet: it.quoted,
            priceUpdatedAt: '2026-10-16T00:00:00Z',
            supplierCode: 'PRV0001',
            supplierName: `Proveedor ${it.currency}`,
            supplierCurrency: it.currency,
          }
        : null;
    },
    getCurrentUsdExchangeRate: async () => state.globalUsdRate,
    listBySupplier: async () => [],
  };

  const masterItemRepo = {
    listAll: async (itemType?: 'MPR' | 'COM' | 'PRO') =>
      [...state.items.entries()]
        .filter(([, it]) => !itemType || it.type === itemType)
        .map(([id, it]) => ({
          id,
          code: id.toUpperCase(),
          itemType: it.type,
          name: id,
          unitType: it.type === 'MPR' ? ('KG' as const) : ('UNIT' as const),
          stockMinimum: new Decimal('1'),
          active: true,
          createdDate: '2026-10-16',
          createdAt: '2026-10-16T00:00:00Z',
          updatedAt: '2026-10-16T00:00:00Z',
        })),
    getBatchItemCosts: async () =>
      new Map(
        [...state.items.entries()].map(([id, it]) => [
          id,
          {
            stockItemId: id,
            supplierId: `sup-${it.currency}`,
            supplierName: `Proveedor ${it.currency}`,
            supplierCurrency: it.currency,
            quotedUnitPriceNet: it.quoted,
            priceUpdatedAt: '2026-10-16T00:00:00Z',
          },
        ])
      ),
  };
  const supplierRepo = { listAll: async () => [] };
  const stockDomainService = { getBatchBalances: async () => new Map<string, DecimalT>() };
  const formulaRepo = {
    getCurrentFormulaWithItems: async () => ({
      formulaVersionId: 'fv-1',
      baseProductId: 'pba-1',
      versionNumber: 1,
      items: [{ id: 'l1', rawMaterialId: 'mpr-usd', quantityKg: new Decimal('1'), sortOrder: 1 }],
    }),
  };

  type CostEngineArgs = ConstructorParameters<typeof CostEngineService>;
  const costEngine = new CostEngineService(
    supplierItemRepo as unknown as CostEngineArgs[0],
    formulaRepo as unknown as CostEngineArgs[1],
    {} as CostEngineArgs[2]
  );
  type MasterArgs = ConstructorParameters<typeof MasterItemDomainService>;
  const masterItemService = new MasterItemDomainService(
    masterItemRepo as unknown as MasterArgs[0],
    supplierRepo as unknown as MasterArgs[1],
    undefined,
    stockDomainService as unknown as MasterArgs[3],
    costEngine,
    supplierItemRepo as unknown as MasterArgs[5]
  );

  /** Columnas de Stock tal como las ve el usuario (backend → DTO → presentación). */
  async function stockColumns(id: string) {
    const it = state.items.get(id)!;
    const list = await masterItemService.listMasterItems(it.type, true);
    const record = list.find((r) => r.id === id)!;
    const dto = it.type === 'MPR' ? serializeRawMaterial(record) : serializeComponent(record);
    return itemPriceDisplays(dto);
  }

  await t.test('regla pura: USD 1 × 1000 = 1000 / 1210; USD 1 × 1200 = 1200 / 1452; ARS 100 = 100 / 121', () => {
    const usd1000 = computeCurrentItemCostArs(new Decimal('1'), 'USD', new Decimal('1000'));
    assert.deepStrictEqual([usd1000?.netArs.toString(), usd1000?.grossArs.toString()], ['1000', '1210']);
    const usd1200 = computeCurrentItemCostArs(new Decimal('1'), 'USD', new Decimal('1200'));
    assert.deepStrictEqual([usd1200?.netArs.toString(), usd1200?.grossArs.toString()], ['1200', '1452']);
    const ars = computeCurrentItemCostArs(new Decimal('100'), 'ARS', null);
    assert.deepStrictEqual([ars?.netArs.toString(), ars?.grossArs.toString()], ['100', '121']);
    // Ejemplo del pedido: USD 1 × 1.239,67 → P.U $ = $ 1.239,67 / P.U + IVA = 1500,0007 → "$ 1.500,00"
    const ex = computeCurrentItemCostArs(new Decimal('1'), 'USD', new Decimal('1239.67'));
    assert.strictEqual(ex?.netArs.toString(), '1239.67');
    assert.strictEqual(ex?.grossArs.toString(), '1500.0007');
    assert.deepStrictEqual(
      itemPriceDisplays({
        supplierCurrency: 'USD',
        quotedPriceNet: '1',
        theoreticalCostNetArs: ex.netArs.toString(),
        theoreticalCostGrossArs: ex.grossArs.toString(),
      }),
      { usd: 'usd 1', ars: '$ 1.239,67', grossArs: '$ 1.500,00' }
    );
  });

  await t.test('USD sin cotización global vigente: costo no disponible (nunca 1:1)', () => {
    assert.strictEqual(computeCurrentItemCostArs(new Decimal('1'), 'USD', null), null);
    assert.strictEqual(computeCurrentItemCostArs(new Decimal('1'), 'USD', new Decimal('0')), null);
  });

  await t.test('Stock MPR/COM USD: P.U USD = usd 1, P.U $ = $ 1.000,00, P.U + IVA = $ 1.210,00', async () => {
    state.globalUsdRate = new Decimal('1000');
    for (const id of ['mpr-usd', 'com-usd']) {
      assert.deepStrictEqual(await stockColumns(id), { usd: 'usd 1', ars: '$ 1.000,00', grossArs: '$ 1.210,00' }, id);
    }
  });

  await t.test('cambio de cotización global 1000 → 1200: P.U $ = $ 1.200,00 y P.U + IVA = $ 1.452,00', async () => {
    state.globalUsdRate = new Decimal('1200');
    for (const id of ['mpr-usd', 'com-usd']) {
      assert.deepStrictEqual(await stockColumns(id), { usd: 'usd 1', ars: '$ 1.200,00', grossArs: '$ 1.452,00' }, id);
    }
    assert.strictEqual((await costEngine.getCurrentStockItemCost('mpr-usd')).toString(), '1452');
    state.globalUsdRate = new Decimal('1000');
  });

  await t.test('CMP con exchange_rate_used distinto NO cambia el costo teórico actual de Stock/Fórmulas', async () => {
    state.globalUsdRate = new Decimal('1000');
    // La CMP guarda su cotización solo en el snapshot y actualiza el precio del proveedor
    // en moneda de origen (USD), igual que create_purchase_atomic.
    state.purchases.push({ stockItemId: 'mpr-usd', exchangeRateUsed: new Decimal('1600'), unitPriceNetSource: new Decimal('1') });
    state.items.get('mpr-usd')!.quoted = state.purchases[0].unitPriceNetSource;

    assert.deepStrictEqual(await stockColumns('mpr-usd'), { usd: 'usd 1', ars: '$ 1.000,00', grossArs: '$ 1.210,00' });
    assert.strictEqual((await costEngine.getCurrentStockItemCost('mpr-usd')).toString(), '1210');
    const formula = await costEngine.getCurrentFormulaCost('pba-1');
    assert.strictEqual(formula.costPerKg.toString(), '1210', 'fórmula: USD vigente × cotización global × 1,21');
  });

  await t.test('Fórmulas: costo teórico del PBA usa USD × cotización global vigente × 1,21', async () => {
    state.globalUsdRate = new Decimal('1200');
    assert.strictEqual((await costEngine.getCurrentFormulaCost('pba-1')).costPerKg.toString(), '1452');
    // Lo mismo que la vista previa de fórmulas recibe de listMasterItems (currentTheoreticalCostGrossArs)
    const mpr = (await masterItemService.listMasterItems('MPR', true)).find((r) => r.id === 'mpr-usd')!;
    assert.strictEqual(mpr.currentTheoreticalCostGrossArs?.toString(), '1452');
    state.globalUsdRate = new Decimal('1000');
  });

  await t.test('ARS: P.U USD = "-", P.U $ = neto ARS, P.U + IVA = neto × 1,21 (independiente de la cotización)', async () => {
    for (const rate of ['1000', '1200']) {
      state.globalUsdRate = new Decimal(rate);
      for (const id of ['mpr-ars', 'com-ars']) {
        assert.deepStrictEqual(await stockColumns(id), { usd: '-', ars: '$ 100,00', grossArs: '$ 121,00' }, `${id} @${rate}`);
      }
    }
    state.globalUsdRate = new Decimal('1000');
  });

  await t.test('USD sin cotización global: Stock muestra "Sin cotización" y Fórmulas rechazan (nunca USD como ARS)', async () => {
    state.globalUsdRate = null;
    try {
      assert.deepStrictEqual(await stockColumns('com-usd'), { usd: 'usd 1', ars: 'Sin cotización', grossArs: '-' });
      await assert.rejects(costEngine.getCurrentStockItemCost('mpr-usd'), InvalidExchangeRateError);
      // ARS no depende de la cotización
      assert.deepStrictEqual(await stockColumns('com-ars'), { usd: '-', ars: '$ 100,00', grossArs: '$ 121,00' });
    } finally {
      state.globalUsdRate = new Decimal('1000');
    }
  });
});
