'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  ConfirmDialog,
  IconButton,
  ListItemButton,
  Panel,
  SecondaryHeader,
  SectionHeader,
  tableStyles,
} from '../components/UIComponents';
import { ErpIcon } from '../components/ErpIcon';
import { SupplierModal } from '../modals/SupplierModal';
import { RegistrarCompraModal } from '../modals/RegistrarCompraModal';
import { toggleSupplierActiveAction, type SupplierDTO } from '@/actions/supplier.actions';
import {
  listPurchasesAction,
  getPurchaseAction,
  getSupplierPurchaseCatalogAction,
} from '@/actions/purchase.actions';
import type {
  PurchaseSummaryDTO,
  PurchaseDetailDTO,
  AvailableSupplierItemDTO,
} from '@/actions/purchase.dto';
import {
  Pencil,
  Power,
  RefreshCw,
  Search,
  List,
  Building2,
  Loader2,
  FileText,
} from 'lucide-react';

import { RegistrarPagoProveedorModal } from '@/ui/modals/RegistrarPagoProveedorModal';
import { EditarPagoModal } from '@/ui/modals/EditarPagoModal';
import { getSupplierMovementsAction } from '@/actions/patrimony.actions';
import type { AccountMovementDTO } from '@/actions/patrimony.dto';
import { formatArs } from '@/lib/format';
import { resolveInitialSelectedId } from '@/lib/selection';

interface SuppliersViewProps {
  initialSuppliers: SupplierDTO[];
  initialSelectedSupplierId?: string;
}

export const SuppliersView: React.FC<SuppliersViewProps> = ({
  initialSuppliers,
  initialSelectedSupplierId,
}) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Vista activa: 'ficha' (CUENTAS-PROVEEDORES.png) o 'listado' (ADMINISTRACION.png)
  const [viewMode, setViewMode] = useState<'ficha' | 'listado'>('ficha');

  // Proveedor seleccionado para la Ficha
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(() =>
    resolveInitialSelectedId(initialSuppliers, initialSelectedSupplierId)
  );

  const [searchTerm, setSearchTerm] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [currencyFilter, setCurrencyFilter] = useState<'ALL' | 'ARS' | 'USD'>('ALL');

  // Modal State (Supplier)
  const [modalOpen, setModalOpen] = useState(false);
  const [modalSupplier, setModalSupplier] = useState<SupplierDTO | null>(null);

  // Modal State (Purchase)
  const [compraModalOpen, setCompraModalOpen] = useState(false);
  const [purchaseToEdit, setPurchaseToEdit] = useState<PurchaseDetailDTO | null>(null);

  // Modal State (Payment)
  const [isPagoModalOpen, setIsPagoModalOpen] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);

  // Datos específicos del proveedor seleccionado en ficha
  const [supplierPurchases, setSupplierPurchases] = useState<PurchaseSummaryDTO[]>([]);
  const [supplierMovements, setSupplierMovements] = useState<AccountMovementDTO[]>([]);
  const [supplierCatalogItems, setSupplierCatalogItems] = useState<AvailableSupplierItemDTO[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Confirm Dialog for deactivating
  const [confirmDialogSupplier, setConfirmDialogSupplier] = useState<SupplierDTO | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const selectedSupplier =
    initialSuppliers.find((s) => s.id === selectedSupplierId) || initialSuppliers[0] || null;

  // Carga de compras e insumos del proveedor seleccionado
  const fetchSupplierDetails = React.useCallback(async (supplierId: string) => {
    if (!supplierId) return;
    setLoadingDetails(true);
    try {
      const [purchasesRes, catalogRes, movementsRes] = await Promise.all([
        listPurchasesAction({ supplierId, limit: 30 }),
        getSupplierPurchaseCatalogAction(supplierId),
        getSupplierMovementsAction(supplierId),
      ]);

      if (purchasesRes.success && purchasesRes.data) {
        setSupplierPurchases(purchasesRes.data);
      }
      if (catalogRes.success && catalogRes.data) {
        setSupplierCatalogItems(catalogRes.data.items.filter((it) => it.isAssociated));
      }
      if (movementsRes.success && movementsRes.data) {
        setSupplierMovements(movementsRes.data);
      }
    } catch (err) {
      console.error('Error fetching supplier details:', err);
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  React.useEffect(() => {
    if (selectedSupplierId && viewMode === 'ficha') {
      fetchSupplierDetails(selectedSupplierId);
    }
  }, [selectedSupplierId, viewMode, fetchSupplierDetails]);

  React.useEffect(() => {
    if (initialSelectedSupplierId) {
      const match = initialSuppliers.find((s) => s.id === initialSelectedSupplierId);
      if (match) {
        setSelectedSupplierId(match.id);
        setViewMode('ficha');
      }
    }
  }, [initialSelectedSupplierId, initialSuppliers]);

  const handleEditPurchase = async (purchaseId: string) => {
    startTransition(async () => {
      const res = await getPurchaseAction(purchaseId);
      if (res.success && res.data) {
        setPurchaseToEdit(res.data);
        setCompraModalOpen(true);
      } else {
        setActionError(res.error || 'Error al cargar compra para edición');
      }
    });
  };

  // Filtrado de proveedores para el listado
  const filteredSuppliers = initialSuppliers.filter((s) => {
    if (!showInactive && !s.active) return false;
    if (currencyFilter !== 'ALL' && s.currencyCode !== currencyFilter) return false;
    if (!searchTerm.trim()) return true;

    const term = searchTerm.toLowerCase();
    return (
      s.code.toLowerCase().includes(term) ||
      s.name.toLowerCase().includes(term) ||
      (s.salesperson && s.salesperson.toLowerCase().includes(term)) ||
      (s.phone && s.phone.toLowerCase().includes(term)) ||
      s.currencyCode.toLowerCase().includes(term)
    );
  });

  const handleOpenCreate = () => {
    setModalSupplier(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (supplier: SupplierDTO) => {
    setModalSupplier(supplier);
    setModalOpen(true);
  };

  const handleToggleActiveClick = (supplier: SupplierDTO) => {
    if (supplier.active) {
      setConfirmDialogSupplier(supplier);
    } else {
      handleExecuteToggle(supplier, true);
    }
  };

  const handleExecuteToggle = async (supplier: SupplierDTO, targetActive: boolean) => {
    setActionError(null);
    startTransition(async () => {
      const res = await toggleSupplierActiveAction(supplier.id, targetActive);
      if (!res.success) {
        setActionError(res.error || 'Error al cambiar estado del proveedor');
      } else {
        router.refresh();
      }
      setConfirmDialogSupplier(null);
    });
  };

  // Normativa Fase 9: Todo saldo patrimonial se expresa en Pesos Argentinos (ARS)
  const formatBalance = (balanceStr: string) => {
    const num = parseFloat(balanceStr) || 0;

    return {
      text: formatArs(balanceStr),
      hasDebt: num > 0,
      hasCredit: num < 0,
      amount: num,
    };
  };

  // Lista lateral (Figma Cuentas Proveedores): primeros proveedores como ListItem + "Ver más".
  const SIDEBAR_LIMIT = 8;
  const sidebarSuppliers = initialSuppliers.slice(0, SIDEBAR_LIMIT);
  const moreSuppliers = initialSuppliers.slice(SIDEBAR_LIMIT);
  const isSelectedInMore = moreSuppliers.some((s) => s.id === selectedSupplier?.id);

  return (
    <div className="space-y-6">
      {/* Barra superior (Figma): Volver · PROVEEDORES · acciones */}
      <SecondaryHeader
        title="Proveedores"
        backHref="/"
        actions={
          <>
              <IconButton
                label="Refrescar datos del servidor"
                icon={<RefreshCw className={`w-4 h-4 ${isPending ? 'animate-spin' : ''}`} />}
                onClick={() => {
                  startTransition(() => {
                    router.refresh();
                    if (selectedSupplierId) {
                      fetchSupplierDetails(selectedSupplierId);
                    }
                  });
                }}
                disabled={isPending}
              />
              <Button
                variant="secundario"
                onClick={() => {
                  setPurchaseToEdit(null);
                  setCompraModalOpen(true);
                }}
              >
                Nueva compra
              </Button>
              <IconButton label="Nueva cuenta" icon={<ErpIcon name="nueva-cuenta" tone="light" className="w-6 h-6" />} onClick={handleOpenCreate} />
          </>
        }
      />

      {actionError && (
        <div className="p-3 border border-steffen-red rounded-[5px] text-xs font-semibold text-steffen-red flex justify-between items-center">
          <span>{actionError}</span>
          <button
            onClick={() => setActionError(null)}
            aria-label="Cerrar error"
            className="text-steffen-surface/60 hover:text-steffen-surface font-bold"
          >
            ✕
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Lista lateral de proveedores */}
        <nav aria-label="Proveedores" className="lg:col-span-2 flex flex-col gap-2">
          {sidebarSuppliers.map((s) => (
            <ListItemButton
              key={s.id}
              selected={selectedSupplier?.id === s.id && viewMode === 'ficha'}
              onClick={() => {
                setSelectedSupplierId(s.id);
                setViewMode('ficha');
              }}
              icon={<ErpIcon name="usuario" tone="light" className="w-5 h-5" />}
              title={`${s.name} (${s.code})`}
              className={!s.active ? 'opacity-60' : ''}
            >
              {s.name}
            </ListItemButton>
          ))}

          {/* Ver más: resto de proveedores en un selector compacto */}
          {moreSuppliers.length > 0 && (
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none flex">
                <ErpIcon name="usuario" tone="light" className="w-5 h-5" />
              </span>
              <select
                aria-label="Ver más proveedores"
                value={isSelectedInMore ? selectedSupplierId : ''}
                onChange={(e) => {
                  setSelectedSupplierId(e.target.value);
                  setViewMode('ficha');
                }}
                className={`w-full h-[29px] pl-12 pr-3 rounded-[5px] border text-sm font-semibold cursor-pointer focus:outline-none ${
                  isSelectedInMore && viewMode === 'ficha' ? '!border-steffen-gray' : '!border-transparent !bg-none !bg-transparent'
                }`}
              >
                <option value="" disabled>
                  Ver más ({moreSuppliers.length})
                </option>
                {moreSuppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Directorio completo / volver a la ficha */}
          <ListItemButton
            selected={viewMode === 'listado'}
            onClick={() => setViewMode(viewMode === 'ficha' ? 'listado' : 'ficha')}
            icon={viewMode === 'ficha' ? <List className="w-4 h-4 shrink-0" /> : <Building2 className="w-4 h-4 shrink-0" />}
          >
            {viewMode === 'ficha' ? `Ver todos (${initialSuppliers.length})` : 'Ver ficha'}
          </ListItemButton>
        </nav>

        <div className="lg:col-span-10 space-y-4">
          {/* MODO 1: FICHA PROVEEDOR (Figma Cuentas Proveedores) */}
          {viewMode === 'ficha' && selectedSupplier && (
            <>
              <Panel>
                <div className="flex items-center justify-between border-b border-steffen-surface pb-2 mb-4">
                  <div className="flex items-center gap-4">
                    <h2 className="text-base font-semibold uppercase">Ficha proveedor</h2>
                    <span className="text-base font-semibold">{selectedSupplier.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(selectedSupplier)}
                    title="Editar Ficha Proveedor"
                    aria-label="Editar Ficha Proveedor"
                    className="p-1 rounded-[5px] text-steffen-surface/70 hover:text-steffen-surface hover:bg-steffen-gray transition-colors cursor-pointer"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-1 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold w-28">Codigo</span>
                    <span>{selectedSupplier.code}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold w-28">Vendedor</span>
                    <span>{selectedSupplier.salesperson || '-'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold w-28">Telefono</span>
                    <span>{selectedSupplier.phone || '-'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold w-28">Moneda</span>
                    <span className="font-semibold">{selectedSupplier.currencyCode}</span>
                  </div>
                </div>
              </Panel>

              <Panel>
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                  {/* MATERIAS PRIMAS/COMPONENTES asociados */}
                  <div className="xl:col-span-5 rounded-[10px] border border-steffen-gray p-4">
                    <h3 className="text-base font-semibold uppercase border-b border-steffen-surface pb-2 mb-3">
                      Materias primas/componentes
                    </h3>
                    <div className="overflow-x-auto">
                      <table className={tableStyles.table}>
                        <thead>
                          <tr className={tableStyles.headRow}>
                            <th className="py-2 px-2 text-left">CODIGO</th>
                            <th className="py-2 px-2 text-left">MP / COMP</th>
                            <th className="py-2 px-2 text-left">TIPO</th>
                            <th className="py-2 px-2 text-right">PRECIO REF.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {loadingDetails ? (
                            <tr>
                              <td colSpan={4} className="py-6 text-center text-steffen-surface/60">
                                <Loader2 className="w-4 h-4 animate-spin inline mr-2 text-steffen-gold" />
                                Cargando insumos...
                              </td>
                            </tr>
                          ) : supplierCatalogItems.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="py-6 text-center text-steffen-surface/60">
                                No hay insumos asociados aún a este proveedor.
                              </td>
                            </tr>
                          ) : (
                            supplierCatalogItems.map((item) => (
                              <tr key={item.id} className={tableStyles.row}>
                                <td className="py-1.5 px-2">{item.code}</td>
                                <td className="py-1.5 px-2">{item.name}</td>
                                <td className="py-1.5 px-2 text-steffen-surface/70">{item.itemType}</td>
                                <td className="py-1.5 px-2 text-right">
                                  {item.quotedUnitPriceNet
                                    ? selectedSupplier.currencyCode === 'USD'
                                      ? `U$S ${item.quotedUnitPriceNet}`
                                      : `$ ${item.quotedUnitPriceNet}`
                                    : '—'}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* MOVIMIENTOS + SALDO ACTUALIZADO */}
                  <div className="xl:col-span-7">
                    <SectionHeader
                      title="MOVIMIENTOS"
                  variant="strong"
                      actions={
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="Buscar"
                            className="h-[26px] pl-3 pr-8 text-xs border border-steffen-border rounded-[5px] w-44 sm:w-64 focus:outline-none focus:border-steffen-gold"
                          />
                          <Search className="w-3.5 h-3.5 text-steffen-surface/50 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                      }
                    />

                    <div className="overflow-x-auto mt-4">
                      <table className={tableStyles.table}>
                        <thead>
                          <tr className={tableStyles.headRow}>
                            <th className="py-2 px-2 text-left">FECHA</th>
                            <th className="py-2 px-2 text-left">COMPRA</th>
                            <th className="py-2 px-2 text-left">REMITO</th>
                            <th className="py-2 px-2 text-left">PAGO</th>
                            <th className="py-2 px-2 text-right">TOTAL</th>
                            <th className="py-2 px-2 text-center w-10"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {loadingDetails ? (
                            <tr>
                              <td colSpan={6} className="py-6 text-center text-steffen-surface/60">
                                <Loader2 className="w-4 h-4 animate-spin inline mr-2 text-steffen-gold" />
                                Cargando compras y movimientos...
                              </td>
                            </tr>
                          ) : supplierMovements.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="py-6 text-center text-steffen-surface/60">
                                No hay compras ni pagos registrados para este proveedor.
                              </td>
                            </tr>
                          ) : (
                            supplierMovements.map((m) => {
                              const grossNumber = parseFloat(m.amountArs) || 0;
                              if (m.isPayment) {
                                return (
                                  <tr key={m.id} className={tableStyles.row}>
                                    <td className="py-1.5 px-2">{m.date}</td>
                                    <td className="py-1.5 px-2 text-steffen-surface/60">—</td>
                                    <td className="py-1.5 px-2 text-steffen-surface/60">—</td>
                                    <td className="py-1.5 px-2 font-semibold">{formatArs(m.amountArs)}</td>
                                    <td className="py-1.5 px-2 text-right">{formatArs(m.amountArs)}</td>
                                    <td className="py-1.5 px-2 text-center">
                                      {m.paymentId && (
                                        <button
                                          type="button"
                                          onClick={() => setEditingPaymentId(m.paymentId!)}
                                          title="Editar Pago"
                                          aria-label="Editar Pago"
                                          className="p-1 rounded-[5px] text-steffen-surface/70 hover:text-steffen-surface hover:bg-steffen-gray transition-colors cursor-pointer"
                                        >
                                          <Pencil className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                );
                              }
                              // Compra
                              return (
                                <tr key={m.id} className={tableStyles.row}>
                                  <td className="py-1.5 px-2">{m.date}</td>
                                  <td className="py-1.5 px-2 font-semibold">{formatArs(m.amountArs)}</td>
                                  <td className="py-1.5 px-2">{m.documentCode || '—'}</td>
                                  <td className="py-1.5 px-2 text-steffen-surface/60">—</td>
                                  <td className="py-1.5 px-2 text-right">
                                    $ {grossNumber.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    {m.currencyCodeSnapshot === 'USD' && m.totalNetSourceCurrency && (
                                      <span className="block text-[10px] text-steffen-surface/60 font-normal">
                                        (U$S {parseFloat(m.totalNetSourceCurrency).toFixed(2)})
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-1.5 px-2 text-center">
                                    {m.purchaseId && (
                                      <button
                                        type="button"
                                        onClick={() => handleEditPurchase(m.purchaseId!)}
                                        title="Editar Compra"
                                        aria-label="Editar Compra"
                                        className="p-1 rounded-[5px] text-steffen-surface/70 hover:text-steffen-surface hover:bg-steffen-gray transition-colors cursor-pointer"
                                      >
                                        <Pencil className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          )}

                          {/* SALDO ACTUALIZADO: rojo oscuro si hay deuda (Figma) */}
                          {(() => {
                            const bal = formatBalance(selectedSupplier.balance);
                            return (
                              <tr
                                className={`font-semibold text-sm text-steffen-surface border-b border-steffen-border/60 ${
                                  bal.hasDebt ? 'bg-steffen-alert' : 'bg-steffen-gray'
                                }`}
                              >
                                <td colSpan={4} className="py-2.5 px-2 uppercase">
                                  Saldo actualizado
                                </td>
                                <td className="py-2.5 px-2 text-right">{bal.text}</td>
                                <td></td>
                              </tr>
                            );
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end items-center gap-3 pt-6">
                  <Button variant="verde" onClick={() => setIsPagoModalOpen(true)}>
                    Registrar pago
                  </Button>
                  <IconButton
                    label="PDF estado de cuenta"
                    icon={<FileText className="w-5 h-5 text-steffen-red" />}
                    onClick={() => alert('Generación de PDF disponible en el bloque de Reportes/PDF')}
                  />
                </div>
              </Panel>
            </>
          )}

          {/* MODO 2: DIRECTORIO DE PROVEEDORES */}
          {viewMode === 'listado' && (
            <Panel>
              <SectionHeader
                title="Directorio de proveedores"
                actions={
                  <>
                    <select
                      value={currencyFilter}
                      onChange={(e) => setCurrencyFilter(e.target.value as 'ALL' | 'ARS' | 'USD')}
                      aria-label="Filtrar por moneda"
                      className="h-[26px] px-2 border border-steffen-border rounded-[5px] text-xs"
                    >
                      <option value="ALL">Todas las monedas</option>
                      <option value="ARS">Solo ARS ($)</option>
                      <option value="USD">Solo USD (US$)</option>
                    </select>
                    <label className="flex items-center gap-1.5 text-xs text-steffen-surface/80 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={showInactive}
                        onChange={(e) => setShowInactive(e.target.checked)}
                        className="h-3.5 w-3.5 accent-steffen-gold"
                      />
                      <span>Inactivos</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Buscar proveedor..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="h-[26px] pl-3 pr-8 text-xs border border-steffen-border rounded-[5px] w-52 sm:w-64 focus:outline-none focus:border-steffen-gold"
                      />
                      <Search className="w-3.5 h-3.5 text-steffen-surface/50 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </>
                }
              />

              <div className="overflow-x-auto mt-4">
                <table className={tableStyles.table}>
                  <thead>
                    <tr className={tableStyles.headRow}>
                      <th className="py-2 px-3 text-left">CODIGO</th>
                      <th className="py-2 px-3 text-left">PROVEEDOR</th>
                      <th className="py-2 px-3 text-left">MONEDA</th>
                      <th className="py-2 px-3 text-left">VENDEDOR / CONTACTO</th>
                      <th className="py-2 px-3 text-left">TELEFONO</th>
                      <th className="py-2 px-3 text-right">DEUDA VIGENTE</th>
                      <th className="py-2 px-3 text-center">ESTADO</th>
                      <th className="py-2 px-3 text-center">ACCIONES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSuppliers.map((s) => {
                      const bal = formatBalance(s.balance);
                      return (
                        <tr
                          key={s.id}
                          className={`${tableStyles.row} hover:bg-steffen-gray/40 transition-colors ${!s.active ? 'opacity-60' : ''}`}
                        >
                          <td className="py-1.5 px-3">{s.code}</td>
                          <td className="py-1.5 px-3 font-semibold">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedSupplierId(s.id);
                                setViewMode('ficha');
                              }}
                              className="text-left hover:text-steffen-gold hover:underline cursor-pointer"
                            >
                              {s.name}
                            </button>
                          </td>
                          <td className="py-1.5 px-3 font-semibold">{s.currencyCode}</td>
                          <td className="py-1.5 px-3">{s.salesperson || '-'}</td>
                          <td className="py-1.5 px-3">{s.phone || '-'}</td>
                          <td
                            className={`py-1.5 px-3 text-right font-semibold ${
                              bal.hasDebt ? 'text-steffen-red' : ''
                            }`}
                          >
                            {bal.text}
                          </td>
                          <td className="py-1.5 px-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-[5px] text-[10px] font-semibold uppercase ${
                                s.active ? 'border border-steffen-green text-steffen-green' : 'bg-steffen-gray text-steffen-surface/70'
                              }`}
                            >
                              {s.active ? 'Activo' : 'Inactivo'}
                            </span>
                          </td>
                          <td className="py-1.5 px-3 text-center whitespace-nowrap space-x-1">
                            <button
                              onClick={() => {
                                setSelectedSupplierId(s.id);
                                setViewMode('ficha');
                              }}
                              title="Ver Ficha"
                              className="p-1 rounded-[5px] hover:bg-steffen-gray text-steffen-surface/80 hover:text-steffen-surface transition-colors cursor-pointer"
                            >
                              <Building2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleOpenEdit(s)}
                              title="Editar Proveedor"
                              className="p-1 rounded-[5px] hover:bg-steffen-gray text-steffen-surface/80 hover:text-steffen-surface transition-colors cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleToggleActiveClick(s)}
                              title={s.active ? 'Desactivar proveedor' : 'Activar proveedor'}
                              className={`p-1 rounded-[5px] hover:bg-steffen-gray transition-colors cursor-pointer ${
                                s.active ? 'text-steffen-surface/60 hover:text-steffen-surface' : 'text-steffen-green'
                              }`}
                            >
                              <Power className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
        </div>
      </div>

      {/* Modal de Proveedor */}
      <SupplierModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        supplier={modalSupplier}
        onSuccess={() => {
          startTransition(() => {
            router.refresh();
          });
        }}
      />

      {/* ConfirmDialog para Desactivación */}
      {confirmDialogSupplier && (
        <ConfirmDialog
          isOpen={true}
          title="Desactivar Proveedor"
          message={`¿Estás seguro de que deseas desactivar al proveedor "${confirmDialogSupplier.name}" (${confirmDialogSupplier.code})?`}
          onConfirm={() => handleExecuteToggle(confirmDialogSupplier, false)}
          onCancel={() => setConfirmDialogSupplier(null)}
        />
      )}

      {/* Modal de Compra y Edición */}
      <RegistrarCompraModal
        isOpen={compraModalOpen}
        onClose={() => {
          setCompraModalOpen(false);
          setPurchaseToEdit(null);
        }}
        onSuccess={() => {
          startTransition(() => {
            router.refresh();
            if (selectedSupplierId) {
              fetchSupplierDetails(selectedSupplierId);
            }
          });
        }}
        suppliers={initialSuppliers.map((s) => ({
          id: s.id,
          code: s.code,
          name: s.name,
          currencyCode: s.currencyCode,
          active: s.active,
        }))}
        initialSupplierId={selectedSupplier?.id}
        purchaseToEdit={purchaseToEdit}
      />

      {/* Modal Registrar Pago Proveedor */}
      <RegistrarPagoProveedorModal
        isOpen={isPagoModalOpen}
        onClose={() => setIsPagoModalOpen(false)}
        initialSupplierId={selectedSupplier?.id}
        onSuccess={() => {
          if (selectedSupplierId) {
            fetchSupplierDetails(selectedSupplierId);
          }
          router.refresh();
        }}
      />

      {/* Modal Editar Pago */}
      <EditarPagoModal
        isOpen={!!editingPaymentId}
        onClose={() => setEditingPaymentId(null)}
        paymentId={editingPaymentId || ''}
        onSuccess={() => {
          if (selectedSupplierId) {
            fetchSupplierDetails(selectedSupplierId);
          }
          router.refresh();
        }}
      />

    </div>
  );
};
