import 'server-only';
import { serverSupabase } from '@/database/server';
import { CustomerRepository } from '@/repositories/customer.repository';
import { CustomerDomainService } from '@/services/customer.service';
import { SupplierRepository } from '@/repositories/supplier.repository';
import { SupplierDomainService } from '@/services/supplier.service';
import { MasterItemRepository } from '@/repositories/master-item.repository';
import { MasterItemDomainService } from '@/services/master-item.service';
import { StockRepository } from '@/repositories/stock.repository';
import { StockDomainService } from '@/services/stock.service';
import { SupplierItemRepository } from '@/repositories/supplier-item.repository';
import { CostEngineService } from '@/services/cost-engine.service';

import { FormulaRepository } from '@/repositories/formula.repository';
import { FormulaDomainService } from '@/services/formula.service';
import { ProductRepository } from '@/repositories/product.repository';
import { ProductDomainService } from '@/services/product.service';

import { PriceListRepository } from '@/repositories/price-list.repository';
import { PriceListDomainService } from '@/services/price-list.service';

import { DiscountProfileRepository } from '@/repositories/discount-profile.repository';
import { CostGainDomainService } from '@/services/cost-gain.service';

import { PatrimonyRepository } from '@/repositories/patrimony.repository';
import { PatrimonyDomainService } from '@/services/patrimony.service';
import { FactoryRepository } from '@/repositories/factory.repository';
import { FactoryDomainService } from '@/services/factory.service';
import { PurchaseRepository } from '@/repositories/purchase.repository';
import { PurchaseDomainService } from '@/services/purchase.service';
import { OrderRepository } from '@/repositories/order.repository';
import { OrderDomainService } from '@/services/order.service';
import { PlanningRepository } from '@/repositories/planning.repository';
import { PlanningDomainService } from '@/services/planning.service';
import { ReportRepository } from '@/repositories/report.repository';
import { ReportDomainService } from '@/services/report.service';
import { ReportingRepository } from '@/repositories/reporting.repository';
import { ReportingService } from '@/services/reporting.service';
import { RemittanceRepository } from '@/repositories/remittance.repository';
import { ExchangeRateRepository } from '@/repositories/exchange-rate.repository';
import { ExchangeRateDomainService } from '@/services/exchange-rate.service';
import { RemittanceDomainService } from '@/services/remittance.service';
import { MarginRemittanceRepository } from '@/repositories/margin-remittance.repository';
import { DocumentRepository } from '@/repositories/document.repository';
import { DocumentDomainService } from '@/services/document.service';
import { DocumentBackfillService } from '@/services/document-backfill.service';
import { InternalHtmlPdfRenderer } from '@/pdf/internal-html-pdf-renderer';
import type { PdfRenderer } from '@/pdf/renderer';

/**
 * Composition Root para instanciación controlada y unificada de servicios
 * del lado servidor. Aísla service_role de Client Components y previene
 * instanciaciones ad-hoc repetitivas en cada Server Action.
 */
let customerServiceInstance: CustomerDomainService | null = null;
let supplierServiceInstance: SupplierDomainService | null = null;
let stockServiceInstance: StockDomainService | null = null;
let masterItemServiceInstance: MasterItemDomainService | null = null;
let formulaServiceInstance: FormulaDomainService | null = null;
let costEngineServiceInstance: CostEngineService | null = null;
let productServiceInstance: ProductDomainService | null = null;
let priceListServiceInstance: PriceListDomainService | null = null;
let costGainServiceInstance: CostGainDomainService | null = null;
let patrimonyServiceInstance: PatrimonyDomainService | null = null;
let supplierItemRepoInstance: SupplierItemRepository | null = null;

export function getCustomerService(): CustomerDomainService {
  if (!customerServiceInstance) {
    const customerRepo = new CustomerRepository(serverSupabase);
    customerServiceInstance = new CustomerDomainService(customerRepo);
  }
  return customerServiceInstance;
}

export function getSupplierService(): SupplierDomainService {
  if (!supplierServiceInstance) {
    const supplierRepo = new SupplierRepository(serverSupabase);
    supplierServiceInstance = new SupplierDomainService(supplierRepo);
  }
  return supplierServiceInstance;
}

export function getStockService(): StockDomainService {
  if (!stockServiceInstance) {
    const stockRepo = new StockRepository(serverSupabase);
    stockServiceInstance = new StockDomainService(stockRepo);
  }
  return stockServiceInstance;
}

export function getCostEngineService(): CostEngineService {
  if (!costEngineServiceInstance) {
    const supplierItemRepo = new SupplierItemRepository(serverSupabase);
    const formulaRepo = new FormulaRepository(serverSupabase);
    const productRepo = new ProductRepository(serverSupabase);
    costEngineServiceInstance = new CostEngineService(supplierItemRepo, formulaRepo, productRepo);
  }
  return costEngineServiceInstance;
}

export function getMasterItemService(): MasterItemDomainService {
  if (!masterItemServiceInstance) {
    const masterItemRepo = new MasterItemRepository(serverSupabase);
    const supplierRepo = new SupplierRepository(serverSupabase);
    const stockRepo = new StockRepository(serverSupabase);
    const stockDomainService = new StockDomainService(stockRepo);
    const supplierItemRepo = new SupplierItemRepository(serverSupabase);
    const costEngineService = getCostEngineService();
    masterItemServiceInstance = new MasterItemDomainService(
      masterItemRepo,
      supplierRepo,
      undefined,
      stockDomainService,
      costEngineService,
      supplierItemRepo
    );
  }
  return masterItemServiceInstance;
}

export function getFormulaService(): FormulaDomainService {
  if (!formulaServiceInstance) {
    const formulaRepo = new FormulaRepository(serverSupabase);
    const masterItemRepo = new MasterItemRepository(serverSupabase);
    const costEngineService = getCostEngineService();
    formulaServiceInstance = new FormulaDomainService(
      formulaRepo,
      masterItemRepo,
      costEngineService
    );
  }
  return formulaServiceInstance;
}

export function getProductService(): ProductDomainService {
  if (!productServiceInstance) {
    const productRepo = new ProductRepository(serverSupabase);
    const formulaRepo = new FormulaRepository(serverSupabase);
    const costEngineService = getCostEngineService();
    const stockRepo = new StockRepository(serverSupabase);
    const stockDomainService = new StockDomainService(stockRepo);
    productServiceInstance = new ProductDomainService(
      productRepo,
      formulaRepo,
      costEngineService,
      stockDomainService
    );
  }
  return productServiceInstance;
}

export function getPriceListService(): PriceListDomainService {
  if (!priceListServiceInstance) {
    const priceListRepo = new PriceListRepository(serverSupabase);
    priceListServiceInstance = new PriceListDomainService(priceListRepo);
  }
  return priceListServiceInstance;
}

export function getCostGainService(): CostGainDomainService {
  if (!costGainServiceInstance) {
    const discountProfileRepo = new DiscountProfileRepository(serverSupabase);
    const priceListRepo = new PriceListRepository(serverSupabase);
    const productRepo = new ProductRepository(serverSupabase);
    const costEngineService = getCostEngineService();
    costGainServiceInstance = new CostGainDomainService(
      discountProfileRepo,
      priceListRepo,
      productRepo,
      costEngineService
    );
  }
  return costGainServiceInstance;
}

export function getSupplierItemRepository(): SupplierItemRepository {
  if (!supplierItemRepoInstance) {
    supplierItemRepoInstance = new SupplierItemRepository(serverSupabase);
  }
  return supplierItemRepoInstance;
}

let exchangeRateServiceInstance: ExchangeRateDomainService | null = null;

/** Cotización global USD → ARS (lectura canónica + actualización atómica). */
export function getExchangeRateService(): ExchangeRateDomainService {
  if (!exchangeRateServiceInstance) {
    exchangeRateServiceInstance = new ExchangeRateDomainService(new ExchangeRateRepository(serverSupabase));
  }
  return exchangeRateServiceInstance;
}

let patrimonyRepoInstance: PatrimonyRepository | null = null;

export function getPatrimonyRepository(): PatrimonyRepository {
  if (!patrimonyRepoInstance) {
    patrimonyRepoInstance = new PatrimonyRepository(serverSupabase);
  }
  return patrimonyRepoInstance;
}

export function getPatrimonyService(): PatrimonyDomainService {
  if (!patrimonyServiceInstance) {
    const patrimonyRepo = getPatrimonyRepository();
    patrimonyServiceInstance = new PatrimonyDomainService(patrimonyRepo);
  }
  return patrimonyServiceInstance;
}

let factoryRepoInstance: FactoryRepository | null = null;
let factoryServiceInstance: FactoryDomainService | null = null;

export function getFactoryRepository(): FactoryRepository {
  if (!factoryRepoInstance) {
    factoryRepoInstance = new FactoryRepository(serverSupabase);
  }
  return factoryRepoInstance;
}

export function getFactoryService(): FactoryDomainService {
  if (!factoryServiceInstance) {
    const factoryRepo = getFactoryRepository();
    const formulaRepo = new FormulaRepository(serverSupabase);
    const supplierItemRepo = getSupplierItemRepository();
    const stockRepo = new StockRepository(serverSupabase);
    const productRepo = new ProductRepository(serverSupabase);
    const costEngineService = getCostEngineService();
    factoryServiceInstance = new FactoryDomainService(
      factoryRepo,
      formulaRepo,
      supplierItemRepo,
      stockRepo,
      productRepo,
      costEngineService
    );
  }
  return factoryServiceInstance;
}

let purchaseRepoInstance: PurchaseRepository | null = null;
let purchaseServiceInstance: PurchaseDomainService | null = null;

export function getPurchaseRepository(): PurchaseRepository {
  if (!purchaseRepoInstance) {
    purchaseRepoInstance = new PurchaseRepository(serverSupabase);
  }
  return purchaseRepoInstance;
}

export function getPurchaseService(): PurchaseDomainService {
  if (!purchaseServiceInstance) {
    const purchaseRepo = getPurchaseRepository();
    const supplierRepo = new SupplierRepository(serverSupabase);
    const supplierItemRepo = getSupplierItemRepository();
    const stockRepo = new StockRepository(serverSupabase);
    const masterItemRepo = new MasterItemRepository(serverSupabase);
    const costEngineService = getCostEngineService();
    purchaseServiceInstance = new PurchaseDomainService(
      purchaseRepo,
      supplierRepo,
      supplierItemRepo,
      stockRepo,
      masterItemRepo,
      costEngineService
    );
  }
  return purchaseServiceInstance;
}

let orderRepoInstance: OrderRepository | null = null;
let orderServiceInstance: OrderDomainService | null = null;

export function getOrderRepository(): OrderRepository {
  if (!orderRepoInstance) {
    orderRepoInstance = new OrderRepository(serverSupabase);
  }
  return orderRepoInstance;
}

export function getOrderService(): OrderDomainService {
  if (!orderServiceInstance) {
    const orderRepo = getOrderRepository();
    orderServiceInstance = new OrderDomainService(orderRepo);
  }
  return orderServiceInstance;
}

let planningRepoInstance: PlanningRepository | null = null;
let planningServiceInstance: PlanningDomainService | null = null;

export function getPlanningRepository(): PlanningRepository {
  if (!planningRepoInstance) {
    planningRepoInstance = new PlanningRepository(serverSupabase);
  }
  return planningRepoInstance;
}

export function getPlanningService(): PlanningDomainService {
  if (!planningServiceInstance) {
    const planningRepo = getPlanningRepository();
    planningServiceInstance = new PlanningDomainService(planningRepo);
  }
  return planningServiceInstance;
}

let reportServiceInstance: ReportDomainService | null = null;

export function getReportService(): ReportDomainService {
  if (!reportServiceInstance) {
    reportServiceInstance = new ReportDomainService(new ReportRepository(serverSupabase));
  }
  return reportServiceInstance;
}

let reportingServiceInstance: ReportingService | null = null;

/** Reportes analíticos READ-ONLY; la fecha comercial proviene de ReportRepository (sin duplicarla). */
export function getReportingService(): ReportingService {
  if (!reportingServiceInstance) {
    reportingServiceInstance = new ReportingService(new ReportingRepository(serverSupabase), new ReportRepository(serverSupabase));
  }
  return reportingServiceInstance;
}

let remittanceRepoInstance: RemittanceRepository | null = null;
let remittanceServiceInstance: RemittanceDomainService | null = null;

export function getRemittanceRepository(): RemittanceRepository {
  if (!remittanceRepoInstance) {
    remittanceRepoInstance = new RemittanceRepository(serverSupabase);
  }
  return remittanceRepoInstance;
}

export function getRemittanceService(): RemittanceDomainService {
  if (!remittanceServiceInstance) {
    const remittanceRepo = getRemittanceRepository();
    const orderRepo = getOrderRepository();
    const stockRepo = new StockRepository(serverSupabase);
    const marginRemittanceRepo = new MarginRemittanceRepository(serverSupabase);
    const costEngineService = getCostEngineService();
    const documentRepo = new DocumentRepository(serverSupabase);
    remittanceServiceInstance = new RemittanceDomainService(
      remittanceRepo,
      orderRepo,
      stockRepo,
      marginRemittanceRepo,
      costEngineService,
      documentRepo
    );
  }
  return remittanceServiceInstance;
}

let pdfRendererInstance: PdfRenderer | null = null;
let documentServiceInstance: DocumentDomainService | null = null;

export function getPdfRenderer(): PdfRenderer {
  if (!pdfRendererInstance) {
    pdfRendererInstance = new InternalHtmlPdfRenderer();
  }
  return pdfRendererInstance;
}

export function getDocumentService(): DocumentDomainService {
  if (!documentServiceInstance) {
    const documentRepo = new DocumentRepository(serverSupabase);
    const remittanceRepo = getRemittanceRepository();
    const marginRemittanceRepo = new MarginRemittanceRepository(serverSupabase);
    const customerRepo = new CustomerRepository(serverSupabase);
    documentServiceInstance = new DocumentDomainService(
      documentRepo,
      remittanceRepo,
      marginRemittanceRepo,
      customerRepo,
      getPdfRenderer()
    );
  }
  return documentServiceInstance;
}

let documentBackfillServiceInstance: DocumentBackfillService | null = null;

export function getDocumentBackfillService(): DocumentBackfillService {
  if (!documentBackfillServiceInstance) {
    const remittanceRepo = getRemittanceRepository();
    const marginRemittanceRepo = new MarginRemittanceRepository(serverSupabase);
    const documentRepo = new DocumentRepository(serverSupabase);
    documentBackfillServiceInstance = new DocumentBackfillService(
      remittanceRepo,
      marginRemittanceRepo,
      documentRepo,
      getDocumentService()
    );
  }
  return documentBackfillServiceInstance;
}


