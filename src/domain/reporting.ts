import { Decimal } from './decimal';
import { DomainError } from './errors';
import { businessPeriodFromDate } from './business-period';
import type { CustomerSource } from '../database/domain-types';

/**
 * Dominio puro de Reportes (docs/REPORTES.md, BUSINESS_RULES §36).
 * Sin DB ni dependencias server-only. Importes, porcentajes y días con Decimal
 * exacto (precisión global del proyecto); `number` solo para años, meses,
 * conteos, índices y límites Top N. Fechas como texto 'YYYY-MM-DD' (sin zona
 * horaria). La atribución de facturación por producto y su residuo viven en
 * PostgreSQL (R4.1): este módulo recibe totales ya agregados.
 */

const HUNDRED = new Decimal(100);
const MONTHS_PER_YEAR = 12;

// ---------------------------------------------------------------------------
// Fechas y períodos
// ---------------------------------------------------------------------------

/** Estado de un mes respecto de la fecha comercial vigente (REPORTES §4.5). */
export type MonthStatus = 'ELAPSED' | 'CURRENT' | 'FUTURE';

function assertInteger(value: number, field: string): void {
  if (!Number.isInteger(value)) {
    throw new DomainError(`${field}: se esperaba un entero y se recibió ${value}.`);
  }
}

function assertMonth(month: number): void {
  if (!Number.isInteger(month) || month < 1 || month > MONTHS_PER_YEAR) {
    throw new DomainError(`Mes inválido: ${month}.`);
  }
}

/** Días transcurridos desde 1970-01-01 para una fecha 'YYYY-MM-DD' válida (UTC como contenedor, sin zona local). */
function epochDay(businessDate: string): number {
  const { year, month } = businessPeriodFromDate(businessDate);
  const day = Number(businessDate.slice(8, 10));
  const ms = Date.UTC(year, month - 1, day);
  const roundTrip = new Date(ms).toISOString().slice(0, 10);
  if (roundTrip !== businessDate) {
    throw new DomainError(`Fecha comercial inválida: "${businessDate}".`);
  }
  return ms / 86_400_000;
}

/** Año de la fecha comercial vigente; un año posterior no es consultable. */
function assertNotFutureYear(year: number, asOfDate: string): number {
  assertInteger(year, 'year');
  const current = businessPeriodFromDate(asOfDate);
  if (year > current.year) {
    throw new DomainError(`El año ${year} es posterior a la fecha comercial vigente (${asOfDate}).`);
  }
  return current.month;
}

/**
 * Años del selector global (REPORTES §3): del primer año con información
 * relevante al año actual, descendente, con intermedios y sin años futuros.
 */
export function buildAvailableYears(firstYear: number | null, currentYear: number): number[] {
  assertInteger(currentYear, 'currentYear');
  if (firstYear === null) return [currentYear];
  assertInteger(firstYear, 'firstYear');
  const from = Math.min(firstYear, currentYear);
  const years: number[] = [];
  for (let y = currentYear; y >= from; y -= 1) years.push(y);
  return years;
}

/** Meses transcurridos del año (REPORTES §7.5): año cerrado → 12; año actual → mes de la fecha vigente. */
export function monthsElapsed(year: number, asOfDate: string): number {
  const currentMonth = assertNotFutureYear(year, asOfDate);
  return year < businessPeriodFromDate(asOfDate).year ? MONTHS_PER_YEAR : currentMonth;
}

/** Clasificación de un mes del año seleccionado (REPORTES §4.5). */
export function monthStatus(year: number, month: number, asOfDate: string): MonthStatus {
  assertMonth(month);
  const elapsed = monthsElapsed(year, asOfDate);
  const isCurrentYear = year === businessPeriodFromDate(asOfDate).year;
  if (!isCurrentYear || month < elapsed) return 'ELAPSED';
  return month === elapsed ? 'CURRENT' : 'FUTURE';
}

// ---------------------------------------------------------------------------
// Series mensuales (enero–diciembre)
// ---------------------------------------------------------------------------

/** Fila mensual económica agregada (meses con datos). */
export interface EconomicMonthTotals {
  month: number;
  billedArs: Decimal;
  gainArs: Decimal;
  expensesArs: Decimal;
}

/** Punto mensual económico: `null` solo en meses futuros del año corriente. */
export interface EconomicMonthlyPoint {
  month: number;
  billedArs: Decimal | null;
  gainArs: Decimal | null;
  expensesArs: Decimal | null;
}

/** Fila mensual de una entidad analítica (meses con compras). */
export interface EntityMonthTotals {
  month: number;
  billedArs: Decimal;
}

/** Punto mensual de una entidad: `null` solo en meses futuros del año corriente. */
export interface EntityMonthlyPoint {
  month: number;
  billedArs: Decimal | null;
}

/**
 * Núcleo genérico: indexa filas por mes (sin duplicados) y produce los 12
 * puntos según el estado de cada mes. Una fila en un mes futuro contradice el
 * corte `business_date <= fecha vigente` y se rechaza.
 */
function fillTwelveMonths<TRow extends { month: number }, TPoint>(
  rows: readonly TRow[],
  year: number,
  asOfDate: string,
  build: { fromRow: (row: TRow) => TPoint; zero: (month: number) => TPoint; future: (month: number) => TPoint }
): TPoint[] {
  const byMonth = new Map<number, TRow>();
  for (const row of rows) {
    assertMonth(row.month);
    if (byMonth.has(row.month)) {
      throw new DomainError(`Serie mensual: mes ${row.month} duplicado.`);
    }
    byMonth.set(row.month, row);
  }
  const points: TPoint[] = [];
  for (let month = 1; month <= MONTHS_PER_YEAR; month += 1) {
    const status = monthStatus(year, month, asOfDate);
    const row = byMonth.get(month);
    if (status === 'FUTURE') {
      if (row) throw new DomainError(`Serie mensual: el mes ${month} es futuro respecto de ${asOfDate} y no puede tener datos.`);
      points.push(build.future(month));
    } else {
      points.push(row ? build.fromRow(row) : build.zero(month));
    }
  }
  return points;
}

/** Serie económica general (Facturación, Ganancia, Gastos operativos). REPORTES §5.2. */
export function fillEconomicMonthlySeries(
  rows: readonly EconomicMonthTotals[],
  year: number,
  asOfDate: string
): EconomicMonthlyPoint[] {
  return fillTwelveMonths<EconomicMonthTotals, EconomicMonthlyPoint>(rows, year, asOfDate, {
    fromRow: (r) => ({ month: r.month, billedArs: r.billedArs, gainArs: r.gainArs, expensesArs: r.expensesArs }),
    zero: (month) => ({ month, billedArs: new Decimal(0), gainArs: new Decimal(0), expensesArs: new Decimal(0) }),
    future: (month) => ({ month, billedArs: null, gainArs: null, expensesArs: null }),
  });
}

/** Serie de facturación de una entidad analítica. REPORTES §9.3. */
export function fillEntityMonthlySeries(
  rows: readonly EntityMonthTotals[],
  year: number,
  asOfDate: string
): EntityMonthlyPoint[] {
  return fillTwelveMonths<EntityMonthTotals, EntityMonthlyPoint>(rows, year, asOfDate, {
    fromRow: (r) => ({ month: r.month, billedArs: r.billedArs }),
    zero: (month) => ({ month, billedArs: new Decimal(0) }),
    future: (month) => ({ month, billedArs: null }),
  });
}

// ---------------------------------------------------------------------------
// KPIs derivados
// ---------------------------------------------------------------------------

/** Margen % = Ganancia / Facturación × 100; Facturación = 0 → null (REPORTES §5.1). */
export function marginPct(gainArs: Decimal, billedArs: Decimal): Decimal | null {
  if (billedArs.isZero()) return null;
  return gainArs.times(HUNDRED).div(billedArs);
}

/** Promedio mensual: total / meses transcurridos (año actual) o / 12 (año cerrado). REPORTES §7.5. */
export function monthlyAverage(totalArs: Decimal, year: number, asOfDate: string): Decimal {
  return totalArs.div(monthsElapsed(year, asOfDate));
}

function assertCount(count: number, field: string): void {
  if (!Number.isInteger(count) || count < 0) {
    throw new DomainError(`${field}: se esperaba un conteo entero no negativo y se recibió ${count}.`);
  }
}

/** Ticket promedio: total / cantidad de RTO COMPLETED; sin compras → null. REPORTES §7.4. */
export function ticketAverage(totalArs: Decimal, count: number): Decimal | null {
  assertCount(count, 'count');
  if (count === 0) return null;
  return totalArs.div(count);
}

/**
 * Frecuencia (REPORTES §7.6): (última − primera) / (n − 1) en días; n < 2 → null.
 * Dos RTO el mismo día aportan un intervalo de 0 días.
 */
export function frequencyDays(firstDate: string | null, lastDate: string | null, count: number): Decimal | null {
  assertCount(count, 'count');
  if (count < 2) return null;
  if (firstDate === null || lastDate === null) {
    throw new DomainError('Frecuencia: con 2 o más compras se requieren primera y última fecha.');
  }
  const span = epochDay(lastDate) - epochDay(firstDate);
  if (span < 0) {
    throw new DomainError(`Frecuencia: la última fecha (${lastDate}) es anterior a la primera (${firstDate}).`);
  }
  return new Decimal(span).div(count - 1);
}

// ---------------------------------------------------------------------------
// Entidades analíticas (REPORTES §7)
// ---------------------------------------------------------------------------

export const MERCADO_LIBRE_ENTITY_KEY = 'ML';
export const CONSUMER_FINAL_ENTITY_KEY = 'CF';
const REGISTERED_ENTITY_PREFIX = 'CLI:';
export const MERCADO_LIBRE_LABEL = 'Mercado Libre';
export const CONSUMER_FINAL_LABEL = 'Consumidor Final';

/** UUID sintácticamente válido (8-4-4-4-12 hex), sin distinguir mayúsculas/minúsculas. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** UUID validado y normalizado a minúsculas (forma canónica de PostgreSQL `uuid`); null si es inválido. */
function canonicalUuid(value: string): string | null {
  return UUID_RE.test(value) ? value.toLowerCase() : null;
}

export interface AnalyticEntityRef {
  customerSource: CustomerSource;
  customerId: string | null;
}

/** Clave analítica canónica: CLI:<uuid lowercase> / ML / CF. Combinaciones inválidas se rechazan. */
export function entityKeyOf(customerSource: CustomerSource, customerId: string | null): string {
  switch (customerSource) {
    case 'REGISTERED_CUSTOMER': {
      const uuid = customerId === null ? null : canonicalUuid(customerId);
      if (uuid === null) {
        throw new DomainError(`Entidad inválida: cliente registrado requiere un customer_id UUID válido (recibido ${customerId}).`);
      }
      return `${REGISTERED_ENTITY_PREFIX}${uuid}`;
    }
    case 'MERCADO_LIBRE':
    case 'CONSUMER_FINAL':
      if (customerId !== null) {
        throw new DomainError(`Entidad inválida: ${customerSource} no admite customer_id (recibido ${customerId}).`);
      }
      return customerSource === 'MERCADO_LIBRE' ? MERCADO_LIBRE_ENTITY_KEY : CONSUMER_FINAL_ENTITY_KEY;
    default:
      throw new DomainError(`Origen de cliente inválido: ${String(customerSource)}.`);
  }
}

/**
 * Inversa de entityKeyOf. Acepta únicamente CLI:<uuid> (UUID válido en cualquier
 * combinación de mayúsculas/minúsculas, devuelto en minúsculas), ML o CF.
 */
export function parseEntityKey(key: string): AnalyticEntityRef {
  if (key === MERCADO_LIBRE_ENTITY_KEY) return { customerSource: 'MERCADO_LIBRE', customerId: null };
  if (key === CONSUMER_FINAL_ENTITY_KEY) return { customerSource: 'CONSUMER_FINAL', customerId: null };
  if (key.startsWith(REGISTERED_ENTITY_PREFIX)) {
    const customerId = canonicalUuid(key.slice(REGISTERED_ENTITY_PREFIX.length));
    if (customerId !== null) return { customerSource: 'REGISTERED_CUSTOMER', customerId };
  }
  throw new DomainError(`Clave de entidad analítica inválida: "${key}".`);
}

/** Etiqueta visible: nombre del cliente / "Mercado Libre" / "Consumidor Final". Nunca recipient_name_snapshot. */
export function entityLabel(customerSource: CustomerSource, customerName: string | null): string {
  switch (customerSource) {
    case 'REGISTERED_CUSTOMER':
      if (customerName === null || customerName.trim() === '') {
        throw new DomainError('Entidad inválida: cliente registrado sin nombre.');
      }
      return customerName;
    case 'MERCADO_LIBRE':
      return MERCADO_LIBRE_LABEL;
    case 'CONSUMER_FINAL':
      return CONSUMER_FINAL_LABEL;
    default:
      throw new DomainError(`Origen de cliente inválido: ${String(customerSource)}.`);
  }
}

// ---------------------------------------------------------------------------
// Rankings (desempate R4.1: métrica DESC, clave ASC)
// ---------------------------------------------------------------------------

/** Comparación por unidades de código (no locale): coincide con el orden de `uuid`/`text` C de PostgreSQL para estas claves. */
function compareKeysAsc(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Ordena por métrica DESC y clave de desempate ASC; con `limit`, devuelve los
 * primeros N. Nunca muta la colección de entrada.
 */
export function rankBy<T>(
  items: readonly T[],
  metric: (item: T) => Decimal,
  tieKey: (item: T) => string,
  limit?: number
): T[] {
  if (limit !== undefined) assertCount(limit, 'limit');
  const sorted = [...items].sort((a, b) => metric(b).comparedTo(metric(a)) || compareKeysAsc(tieKey(a), tieKey(b)));
  return limit === undefined ? sorted : sorted.slice(0, limit);
}

/** Totales anuales de un producto (atribución ya resuelta en SQL). */
export interface ProductTotals {
  productId: string;
  label: string;
  units: number;
  billedArs: Decimal;
  costArs: Decimal;
  contributionArs: Decimal;
}

export type ProductMetric = 'UNITS' | 'BILLED' | 'CONTRIBUTION';

export function productMetricValue(product: ProductTotals, metric: ProductMetric): Decimal {
  switch (metric) {
    case 'UNITS':
      return new Decimal(product.units);
    case 'BILLED':
      return product.billedArs;
    case 'CONTRIBUTION':
      return product.contributionArs;
  }
}

/** Ranking de productos: métrica DESC, product_id ASC (REPORTES §6.1). */
export function rankProducts(products: readonly ProductTotals[], metric: ProductMetric, limit?: number): ProductTotals[] {
  return rankBy(products, (p) => productMetricValue(p, metric), (p) => p.productId, limit);
}

/** Totales anuales de una entidad analítica. */
export interface EntityTotals {
  entityKey: string;
  label: string;
  salesCount: number;
  billedArs: Decimal;
  firstPurchaseDate: string | null;
  lastPurchaseDate: string | null;
}

/** Ranking de entidades por facturación: billed DESC, entityKey ASC (REPORTES §8). */
export function rankEntities(entities: readonly EntityTotals[], limit?: number): EntityTotals[] {
  return rankBy(entities, (e) => e.billedArs, (e) => e.entityKey, limit);
}

// ---------------------------------------------------------------------------
// Participación por producto: Top 4 + Otros (REPORTES §6.8)
// ---------------------------------------------------------------------------

export const OTHERS_SLICE_KEY = 'OTHERS';
export const OTHERS_SLICE_LABEL = 'Otros productos';
const SHARE_TOP = 4;

export interface ShareSlice {
  key: string;
  label: string;
  value: Decimal;
  /** Participación % del total; null si no es calculable como parte de un total (total ≤ 0 o hay negativos). */
  sharePct: Decimal | null;
}

export interface ShareBreakdown {
  slices: ShareSlice[];
  /** Suma exacta de todos los valores (= suma de los slices). */
  total: Decimal;
  /** Al menos un valor de la colección es negativo: no representable como partes de un total (usar barras). */
  hasNegative: boolean;
}

/**
 * Top 4 + "Otros" sobre la métrica indicada. Valores raw conservados (los
 * negativos no se deforman). "Otros" solo existe con más de 4 elementos.
 */
export function topFourPlusOthers<T>(
  items: readonly T[],
  metric: (item: T) => Decimal,
  key: (item: T) => string,
  label: (item: T) => string
): ShareBreakdown {
  const ranked = rankBy(items, metric, key);
  const total = ranked.reduce((acc, item) => acc.plus(metric(item)), new Decimal(0));
  const hasNegative = ranked.some((item) => metric(item).isNegative() && !metric(item).isZero());
  const canShare = !hasNegative && total.greaterThan(0);
  const share = (value: Decimal): Decimal | null => (canShare ? value.times(HUNDRED).div(total) : null);

  const slices: ShareSlice[] = ranked.slice(0, SHARE_TOP).map((item) => ({
    key: key(item),
    label: label(item),
    value: metric(item),
    sharePct: share(metric(item)),
  }));
  const rest = ranked.slice(SHARE_TOP);
  if (rest.length > 0) {
    const othersValue = rest.reduce((acc, item) => acc.plus(metric(item)), new Decimal(0));
    slices.push({ key: OTHERS_SLICE_KEY, label: OTHERS_SLICE_LABEL, value: othersValue, sharePct: share(othersValue) });
  }
  return { slices, total, hasNegative };
}

/** Participación de productos para la métrica seleccionada (Unidades / Facturación / Contribución). */
export function productShare(products: readonly ProductTotals[], metric: ProductMetric): ShareBreakdown {
  return topFourPlusOthers(
    products,
    (p) => productMetricValue(p, metric),
    (p) => p.productId,
    (p) => p.label
  );
}

// ---------------------------------------------------------------------------
// Concentración (REPORTES §10–§11)
// ---------------------------------------------------------------------------

export type ConcentrationGroup = 'POS_1_5' | 'POS_6_10' | 'REST';

/**
 * Escala interna de los porcentajes de concentración.
 *
 * Los porcentajes derivados (facturación × 100 / total) pueden ser periódicos
 * y Decimal opera con precisión global 28 (dígitos significativos), por lo que
 * la diferencia Top 10 − Top 5 podría redondearse. Se cuantizan los porcentajes
 * acumulados a 24 decimales: un valor ≤ 100 ocupa entonces ≤ 27 dígitos, de
 * modo que diferencias y sumas son exactas y las partes no superpuestas
 * (1–5 / 6–10 / resto) cierran determinísticamente en 100.
 *
 * NO es redondeo de presentación (la cantidad visible de decimales se decide
 * en R5). Aplica solo a estos porcentajes: dinero, costos, facturación y
 * contribución nunca se cuantizan por esta regla.
 */
const CONCENTRATION_PCT_DECIMALS = 24;

export interface ConcentrationSlice {
  group: ConcentrationGroup;
  billedArs: Decimal;
  pct: Decimal;
}

export interface Concentration {
  /** false si la facturación total del universo es 0: porcentajes null, nunca 0%. */
  hasData: boolean;
  totalBilledArs: Decimal;
  top5Pct: Decimal | null;
  top10Pct: Decimal | null;
  restPct: Decimal | null;
  /** Grupos no superpuestos 1–5 / 6–10 / resto; suman exactamente 100. null sin datos. */
  slices: ConcentrationSlice[] | null;
}

/**
 * Concentración de facturación sobre todas las entidades analíticas
 * (clientes registrados + ML + CF). Orden billed DESC, entityKey ASC.
 * Top 5 / Top 10 acumulados; Resto = 100 − Top 10. Los grupos de la dona se
 * derivan por diferencia para sumar exactamente 100 (ver CONCENTRATION_PCT_DECIMALS).
 */
export function concentration(entities: readonly EntityTotals[]): Concentration {
  const ranked = rankEntities(entities);
  const sum = (list: readonly EntityTotals[]) => list.reduce((acc, e) => acc.plus(e.billedArs), new Decimal(0));
  const total = sum(ranked);
  if (total.isZero()) {
    return { hasData: false, totalBilledArs: total, top5Pct: null, top10Pct: null, restPct: null, slices: null };
  }
  const top5Billed = sum(ranked.slice(0, 5));
  const top10Billed = sum(ranked.slice(0, 10));
  const pctOf = (billed: Decimal) =>
    billed.times(HUNDRED).div(total).toDecimalPlaces(CONCENTRATION_PCT_DECIMALS, Decimal.ROUND_HALF_UP);
  const top5Pct = pctOf(top5Billed);
  const top10Pct = pctOf(top10Billed);
  const restPct = HUNDRED.minus(top10Pct);
  return {
    hasData: true,
    totalBilledArs: total,
    top5Pct,
    top10Pct,
    restPct,
    slices: [
      { group: 'POS_1_5', billedArs: top5Billed, pct: top5Pct },
      { group: 'POS_6_10', billedArs: top10Billed.minus(top5Billed), pct: top10Pct.minus(top5Pct) },
      { group: 'REST', billedArs: total.minus(top10Billed), pct: restPct },
    ],
  };
}
