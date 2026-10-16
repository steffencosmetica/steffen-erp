import { redirect } from 'next/navigation';
import { getAuthenticatedUser, isUserAuthorized } from '@/auth/guard';
import {
  getCostGainService,
  getFormulaService,
  getProductService,
  getFactoryService,
  getPlanningService,
} from '@/services/composition';
import { serializeCostGainAnalysis } from '@/actions/cost-gain.dto';
import {
  serializeBulkLot,
  serializeFactoryMovement,
  serializeNextManufacturingProduct,
} from '@/actions/factory.dto';
import { selectNextManufacturingProducts, urgentProductIdsFromPlanning } from '@/domain/next-manufacturing';
import {
  FabricaView,
  type FabricaFormulaOptionDTO,
  type FabricaLowStockProductDTO,
} from '@/ui/views/FabricaView';
import { toNumericString } from '@/domain/decimal';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Mi Fábrica • Steffen ERP',
  description: 'Gestión de lotes a granel, envasado, formulaciones y análisis de costo-ganancia.',
};

export default async function FabricaPage(props: {
  searchParams?: Promise<{ profileId?: string }>;
}) {
  // 1. Guard obligatorio de servidor: valida sesión activa del usuario
  const user = await getAuthenticatedUser();
  if (!user || !isUserAuthorized(user)) {
    redirect('/login');
  }

  const searchParams = props.searchParams ? await props.searchParams : {};
  const requestedProfileId = searchParams.profileId;

  // 2. Ejecutar consultas del dominio en paralelo
  const costGainService = getCostGainService();
  const formulaService = getFormulaService();
  const productService = getProductService();
  const factoryService = getFactoryService();

  const [
    analysisResult,
    baseProductRecords,
    productRecords,
    openLotsRecords,
    recentMovementsRecords,
    planningMatrix,
  ] = await Promise.all([
    costGainService.listProductAnalysis(requestedProfileId, true).catch(async () => {
      if (requestedProfileId) {
        return costGainService.listProductAnalysis(undefined, true);
      }
      throw new Error('Error al inicializar la vista de Mi Fábrica.');
    }),
    formulaService.listBaseProducts(true),
    productService.listProducts(false),
    factoryService.listOpenBulkLots(),
    factoryService.listRecentFactoryMovements(50),
    // URG PARA PEDIDOS: faltantes de Pedidos OPEN según el motor de planificación.
    getPlanningService().getPlanningMatrix(),
  ]);

  const analysisDTO = serializeCostGainAnalysis(analysisResult);
  const bulkLotsDTO = openLotsRecords.map(serializeBulkLot);
  const factoryMovementsDTO = recentMovementsRecords.map(serializeFactoryMovement);

  // 3. Opciones de fórmulas reales cargadas en el sistema
  const formulaOptions: FabricaFormulaOptionDTO[] = baseProductRecords
    .filter((bp) => bp.active && bp.currentFormulaBreakdown)
    .map((bp) => ({
      id: bp.id,
      name: bp.name,
      code: bp.code,
      items: (bp.currentFormulaBreakdown?.lines || []).map((line) => ({
        rawMaterialName: line.rawMaterialName,
        quantityKg: toNumericString(line.quantityKg),
      })),
    }));

  // 4. Opciones de productos base aptos para fabricación
  const baseProductsForFabrication = baseProductRecords
    .filter((bp) => bp.active && bp.currentFormulaBreakdown)
    .map((bp) => ({
      id: bp.id,
      name: bp.name,
      code: bp.code,
    }));

  // 5. Alertas reales de producción bajo stock
  const lowStockProducts: FabricaLowStockProductDTO[] = selectNextManufacturingProducts(
    productRecords,
    urgentProductIdsFromPlanning(planningMatrix.products)
  ).map(
    serializeNextManufacturingProduct
  );

  // 6. Opciones de productos compatibles para envasado
  const productsForPackaging = productRecords
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
    <FabricaView
      costGainAnalysis={analysisDTO}
      formulaOptions={formulaOptions}
      lowStockProducts={lowStockProducts}
      bulkLots={bulkLotsDTO}
      factoryMovements={factoryMovementsDTO}
      baseProductsForFabrication={baseProductsForFabrication}
      productsForPackaging={productsForPackaging}
    />
  );
}
