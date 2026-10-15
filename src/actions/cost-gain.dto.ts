import { Decimal, toNumericString } from '@/domain/decimal';
import type {
  CostGainProductAnalysis,
  CostGainAnalysisResult,
} from '@/services/cost-gain.service';
import type {
  DiscountProfileWithStepsRecord,
  DiscountProfileStepRecord,
} from '@/repositories/discount-profile.repository';

export interface DiscountProfileStepDTO {
  id: string;
  position: number;
  percent: string;
  percentDisplay: string;
}

export interface DiscountProfileDTO {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
  stepsSummary: string;
  steps: DiscountProfileStepDTO[];
}

export interface CostGainRowDTO {
  productId: string;
  productCode: string;
  productName: string;
  presentation: string;
  weightKg: string;
  productActive: boolean;

  hasSalonPrice: boolean;
  salonPriceArs: string | null;

  hasCost: boolean;
  theoreticalCostArs: string | null;
  costError?: string | null;

  netPriceArs: string | null;
  gainArs: string | null;
  markup: string | null;
}

export interface CostGainAnalysisDTO {
  salonPriceList: {
    id: string;
    name: string;
    systemRole: 'SALON_DEFAULT';
  };
  selectedProfile: DiscountProfileDTO;
  availableProfiles: DiscountProfileDTO[];
  products: CostGainRowDTO[];
  analyzedAt: string;
}

export function serializeDiscountProfileStep(step: DiscountProfileStepRecord): DiscountProfileStepDTO {
  return {
    id: step.id,
    position: step.position,
    percent: toNumericString(step.percent),
    percentDisplay: `${step.percent.toString()}%`,
  };
}

export function serializeDiscountProfile(record: DiscountProfileWithStepsRecord): DiscountProfileDTO {
  const sortedSteps = [...(record.steps || [])].sort((a, b) => a.position - b.position);
  const stepsSummary =
    sortedSteps.length > 0
      ? sortedSteps.map((s) => `${s.percent.toString()}%`).join(' + ')
      : record.name;

  return {
    id: record.id,
    name: record.name,
    active: record.active,
    sortOrder: record.sortOrder,
    stepsSummary,
    steps: sortedSteps.map(serializeDiscountProfileStep),
  };
}

export function serializeCostGainRow(analysis: CostGainProductAnalysis): CostGainRowDTO {
  return {
    productId: analysis.productId,
    productCode: analysis.productCode,
    productName: analysis.productName,
    presentation: analysis.presentation,
    weightKg: toNumericString(analysis.weightKg),
    productActive: analysis.active,

    hasSalonPrice: analysis.hasSalonPrice,
    salonPriceArs: analysis.salonPriceArs ? toNumericString(analysis.salonPriceArs) : null,

    hasCost: analysis.hasCost,
    theoreticalCostArs: analysis.theoreticalCostArs ? toNumericString(analysis.theoreticalCostArs) : null,
    costError: analysis.costError ?? null,

    netPriceArs: analysis.netPriceArs ? toNumericString(analysis.netPriceArs) : null,
    gainArs: analysis.gainArs ? toNumericString(analysis.gainArs) : null,
    markup: analysis.markup ? toNumericString(analysis.markup) : null,
  };
}

export function serializeCostGainAnalysis(result: CostGainAnalysisResult): CostGainAnalysisDTO {
  return {
    salonPriceList: result.salonPriceList,
    selectedProfile: serializeDiscountProfile(result.selectedProfile),
    availableProfiles: result.availableProfiles.map(serializeDiscountProfile),
    products: result.products.map(serializeCostGainRow),
    analyzedAt: result.analyzedAt,
  };
}


/**
 * Formatea el factor multiplicador sobre el costo (ej. "1.50" -> "1,50x").
 * Regla de negocio: mostrar cuántas veces multiplica el costo para llegar al precio final.
 */
export function formatCostFactor(val: string | null | undefined): string {
  if (val === null || val === undefined || val.trim() === '') {
    return '—';
  }
  try {
    const d = new Decimal(val);
    const fixed = d.toFixed(2);
    const [intPart, decPart] = fixed.split('.');
    return `${intPart},${decPart}x`;
  } catch {
    return '—';
  }
}

export const formatMarkupMultiplier = formatCostFactor;

