export interface AdminCustomerRowDTO {
  id: string;
  name: string;
  balanceArs: string;
  lastPaymentDate: string | null;
  lastPurchaseDate: string | null;
}

export interface AdminSupplierRowDTO {
  id: string;
  name: string;
  /** Moneda de la ficha del proveedor (fija). El saldo patrimonial se expresa en ARS. */
  currencyCode: 'ARS' | 'USD' | null;
  balanceArs: string;
  lastPaymentDate: string | null;
  lastPurchaseDate: string | null;
}

export interface AdminPatrimonialMovementRowDTO {
  id: string;
  code: string;
  date: string;
  type: string;
  description: string;
  amountArs: string;
  patrimonialVariation: string;
}

export interface AdministracionDashboardDTO {
  currentUsdRate: string | null;
  cajaSteffenArs: string;
  cajaMercadoLibreArs: string;
  deudasClientesArs: string;
  deudasProveedoresArs: string;
  totalDeudasProveedoresTablaArs: string;
  netoArs: string;
  customerRows: AdminCustomerRowDTO[];
  supplierRows: AdminSupplierRowDTO[];
  recentMovements: AdminPatrimonialMovementRowDTO[];
}
