'use client';

import React, { useState, useEffect, useTransition } from 'react';
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
import { CustomerModal } from '../modals/CustomerModal';
import { toggleCustomerActiveAction, type CustomerDTO } from '@/actions/customer.actions';
import { Pencil, Power, RefreshCw, Search, List, UserCheck, FileText } from 'lucide-react';
import { RegistrarPagoClienteModal } from '@/ui/modals/RegistrarPagoClienteModal';
import { EditarPagoModal } from '@/ui/modals/EditarPagoModal';
import { getCustomerMovementsAction, getOpeningBalanceStateAction } from '@/actions/patrimony.actions';
import type { AccountMovementDTO, OpeningBalanceStateDTO } from '@/actions/patrimony.dto';
import { SaldoAperturaModal } from '@/ui/modals/SaldoAperturaModal';
import { formatArs } from '@/lib/format';
import { resolveInitialSelectedId } from '@/lib/selection';
import { DocumentPdfButton } from '@/ui/components/DocumentPdfButton';

interface CustomersViewProps {
  initialCustomers: CustomerDTO[];
  initialSelectedCustomerId?: string;
}

export const CustomersView: React.FC<CustomersViewProps> = ({
  initialCustomers,
  initialSelectedCustomerId,
}) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Vista activa: 'ficha' (CUENTAS-CLIENTES.png) o 'listado' (ADMINISTRACION.png)
  const [viewMode, setViewMode] = useState<'ficha' | 'listado'>('ficha');

  // Cliente seleccionado para la Ficha. Si llega ?customerId=<UUID> válido por deep-link,
  // se selecciona automáticamente; si no existe/es inválido, fallback seguro al primero.
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(() =>
    resolveInitialSelectedId(initialCustomers, initialSelectedCustomerId)
  );

  const [searchTerm, setSearchTerm] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [modalCustomer, setModalCustomer] = useState<CustomerDTO | null>(null);

  // Payment Modals State
  const [isPagoModalOpen, setIsPagoModalOpen] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [customerMovements, setCustomerMovements] = useState<AccountMovementDTO[]>([]);
  const [openingState, setOpeningState] = useState<OpeningBalanceStateDTO | null>(null);
  const [isAperturaModalOpen, setIsAperturaModalOpen] = useState(false);

  // Confirm Dialog for deactivating
  const [confirmDialogCustomer, setConfirmDialogCustomer] = useState<CustomerDTO | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const selectedCustomer =
    initialCustomers.find((c) => c.id === selectedCustomerId) || initialCustomers[0] || null;

  // Cargar movimientos del cliente seleccionado
  const loadMovements = () => {
    if (!selectedCustomer?.id) return;
    getCustomerMovementsAction(selectedCustomer.id).then((res) => {
      if (res.success && res.data) {
        setCustomerMovements(res.data);
      }
    });
    setOpeningState(null);
    getOpeningBalanceStateAction('CUSTOMER', selectedCustomer.id).then((res) => {
      if (res.success && res.data) {
        setOpeningState(res.data);
      }
    });
  };

  useEffect(() => {
    loadMovements();
  }, [selectedCustomer?.id]);

  useEffect(() => {
    if (initialSelectedCustomerId) {
      const match = initialCustomers.find((c) => c.id === initialSelectedCustomerId);
      if (match) {
        setSelectedCustomerId(match.id);
        setViewMode('ficha');
      }
    }
  }, [initialSelectedCustomerId, initialCustomers]);

  // Filtrado de clientes para listado
  const filteredCustomers = initialCustomers.filter((c) => {
    if (!showInactive && !c.active) return false;
    if (!searchTerm.trim()) return true;

    const term = searchTerm.toLowerCase();
    return (
      c.code.toLowerCase().includes(term) ||
      c.name.toLowerCase().includes(term) ||
      (c.phone && c.phone.toLowerCase().includes(term)) ||
      (c.locality && c.locality.toLowerCase().includes(term)) ||
      (c.province && c.province.toLowerCase().includes(term)) ||
      (c.transportName && c.transportName.toLowerCase().includes(term))
    );
  });

  const handleOpenCreate = () => {
    setModalCustomer(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (customer: CustomerDTO) => {
    setModalCustomer(customer);
    setModalOpen(true);
  };

  const handleToggleActiveClick = (customer: CustomerDTO) => {
    if (customer.active) {
      setConfirmDialogCustomer(customer);
    } else {
      handleExecuteToggle(customer, true);
    }
  };

  const handleExecuteToggle = async (customer: CustomerDTO, targetActive: boolean) => {
    setActionError(null);
    startTransition(async () => {
      const res = await toggleCustomerActiveAction(customer.id, targetActive);
      if (!res.success) {
        setActionError(res.error || 'Error al cambiar estado del cliente');
      } else {
        router.refresh();
      }
      setConfirmDialogCustomer(null);
    });
  };

  const formatBalance = (balanceStr: string) => {
    const num = parseFloat(balanceStr) || 0;
    return {
      text: formatArs(balanceStr),
      hasDebt: num > 0,
      hasCredit: num < 0,
      amount: num,
    };
  };

  // Lista lateral (Figma Cuentas Clientes): primeros clientes como ListItem + "Ver más".
  const SIDEBAR_LIMIT = 7;
  const sidebarCustomers = initialCustomers.slice(0, SIDEBAR_LIMIT);
  const moreCustomers = initialCustomers.slice(SIDEBAR_LIMIT);
  const isSelectedInMore = moreCustomers.some((c) => c.id === selectedCustomer?.id);

  return (
    <div className="space-y-6">
      {/* Barra superior (Figma): Volver · CLIENTES · acciones */}
      <SecondaryHeader
        title="Clientes"
        backHref="/"
        actions={
          <>
              <IconButton
                label="Refrescar datos del servidor"
                icon={<RefreshCw className={`w-4 h-4 ${isPending ? 'animate-spin' : ''}`} />}
                onClick={() => {
                  startTransition(() => {
                    router.refresh();
                  });
                }}
                disabled={isPending}
              />
              <IconButton variant="principal" label="Nueva cuenta" icon={<ErpIcon name="nueva-cuenta" tone="light" className="w-6 h-6" />} onClick={handleOpenCreate} />
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
        {/* Lista lateral de clientes */}
        <nav aria-label="Clientes" className="lg:col-span-3 flex flex-col gap-2">
          {sidebarCustomers.map((c) => (
            <ListItemButton
              key={c.id}
              selected={selectedCustomer?.id === c.id && viewMode === 'ficha'}
              onClick={() => {
                setSelectedCustomerId(c.id);
                setViewMode('ficha');
              }}
              icon={<ErpIcon name="usuario" tone="light" className="w-5 h-5" />}
              title={`${c.name} (${c.code})`}
              className={!c.active ? 'opacity-60' : ''}
            >
              {c.name}
            </ListItemButton>
          ))}

          {/* Ver más: resto de clientes en un selector compacto */}
          {moreCustomers.length > 0 && (
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none flex">
                <ErpIcon name="usuario" tone="light" className="w-5 h-5" />
              </span>
              <select
                aria-label="Ver más clientes"
                value={isSelectedInMore ? selectedCustomerId : ''}
                onChange={(e) => {
                  setSelectedCustomerId(e.target.value);
                  setViewMode('ficha');
                }}
                className={`w-full h-[29px] pl-12 pr-3 rounded-[5px] border text-sm font-semibold cursor-pointer focus:outline-none ${
                  isSelectedInMore && viewMode === 'ficha' ? '!border-steffen-gray' : '!border-transparent !bg-none !bg-transparent'
                }`}
              >
                <option value="" disabled>
                  Ver más ({moreCustomers.length})
                </option>
                {moreCustomers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Directorio completo / volver a la ficha */}
          <ListItemButton
            selected={viewMode === 'listado'}
            onClick={() => setViewMode(viewMode === 'ficha' ? 'listado' : 'ficha')}
            icon={viewMode === 'ficha' ? <List className="w-4 h-4 shrink-0" /> : <UserCheck className="w-4 h-4 shrink-0" />}
          >
            {viewMode === 'ficha' ? `Ver todos (${initialCustomers.length})` : 'Ver ficha'}
          </ListItemButton>
        </nav>

        <div className="lg:col-span-9 space-y-4">
          {/* MODO 1: FICHA CLIENTE (Figma Cuentas Clientes) */}
          {viewMode === 'ficha' && selectedCustomer && (
            <>
              <Panel>
                <div className="flex items-center justify-between border-b border-steffen-surface pb-2 mb-4">
                  <div className="flex items-center gap-4">
                    <h2 className="text-base font-semibold uppercase">Ficha cliente</h2>
                    <span className="text-base font-semibold">{selectedCustomer.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(selectedCustomer)}
                    title="Editar Ficha Cliente"
                    aria-label="Editar Ficha Cliente"
                    className="p-1 rounded-[5px] text-steffen-surface/70 hover:text-steffen-surface hover:bg-steffen-gray transition-colors cursor-pointer"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold w-28">Codigo</span>
                      <span>{selectedCustomer.code}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold w-28">Domicilio</span>
                      <span>{selectedCustomer.address || '-'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold w-28">Localidad</span>
                      <span>{selectedCustomer.locality || '-'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold w-28">Telefono</span>
                      <span>{selectedCustomer.phone || '-'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold w-28">Fecha registro</span>
                      <span>
                        {selectedCustomer.createdAt
                          ? new Date(selectedCustomer.createdAt).toLocaleDateString('es-AR')
                          : '-'}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold w-32">Dni / CUIT</span>
                      <span>{selectedCustomer.dni || '-'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold w-32">Provincia</span>
                      <span>{selectedCustomer.province || '-'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold w-32">Transporte</span>
                      <span>{selectedCustomer.transportName || '-'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold w-32">Dir. Transporte</span>
                      <span>{selectedCustomer.transportAddress || '-'}</span>
                    </div>
                  </div>

                  <div className="space-y-1 md:justify-self-end">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold w-28">Categoria</span>
                      <span>{selectedCustomer.category || '-'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold w-28">Descuento 1</span>
                      <span>{selectedCustomer.discount1Pct}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold w-28">Descuento 2</span>
                      <span>{selectedCustomer.discount2Pct}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold w-28">Descuento 3</span>
                      <span>{selectedCustomer.discount3Pct}%</span>
                    </div>
                  </div>
                </div>
              </Panel>

              {/* MOVIMIENTOS + SALDO ACTUALIZADO */}
              <Panel>
                <SectionHeader
                  title="MOVIMIENTOS"
                  variant="strong"
                  actions={
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Buscar"
                        className="h-[26px] pl-3 pr-8 text-xs border border-steffen-border rounded-[5px] w-52 sm:w-80 focus:outline-none focus:border-steffen-gold"
                      />
                      <Search className="w-3.5 h-3.5 text-steffen-surface/50 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  }
                />

                <div className="overflow-x-auto mt-4">
                  <table className={tableStyles.table}>
                    <thead>
                      <tr className={tableStyles.headRow}>
                        <th className="py-2 px-3 text-left">FECHA</th>
                        <th className="py-2 px-3 text-left">VENTA</th>
                        <th className="py-2 px-3 text-left">REMITO</th>
                        <th className="py-2 px-3 text-left">PAGO</th>
                        <th className="py-2 px-3 text-right">TOTAL</th>
                        <th className="py-2 px-3 text-center w-12"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {customerMovements.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-steffen-surface/60">
                            Sin movimientos registrados para este cliente.
                          </td>
                        </tr>
                      ) : (
                        customerMovements.map((m) =>
                          m.type === 'APERTURA' ? (
                            <tr key={m.id} className={tableStyles.row}>
                              <td className="py-1.5 px-3 font-semibold whitespace-nowrap">{m.date}</td>
                              <td className="py-1.5 px-3 uppercase text-steffen-surface/80">Saldo de apertura</td>
                              <td className="py-1.5 px-3">{m.documentCode || '—'}</td>
                              <td className="py-1.5 px-3">—</td>
                              <td className="py-1.5 px-3 text-right">{formatArs(m.amountArs)}</td>
                              <td className="py-1.5 px-3 text-center">
                                {openingState?.editable && (
                                  <button
                                    type="button"
                                    onClick={() => setIsAperturaModalOpen(true)}
                                    title="Editar Saldo de Apertura"
                                    aria-label="Editar Saldo de Apertura"
                                    className="p-1 rounded-[5px] text-steffen-surface/70 hover:text-steffen-surface hover:bg-steffen-gray transition-colors cursor-pointer"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          ) : (
                          <tr key={m.id} className={tableStyles.row}>
                            <td className="py-1.5 px-3 font-semibold whitespace-nowrap">{m.date}</td>
                            <td className="py-1.5 px-3">{!m.isPayment ? formatArs(m.amountArs) : '—'}</td>
                            <td className="py-1.5 px-3">{m.documentCode || '—'}</td>
                            <td className="py-1.5 px-3 font-semibold">
                              {m.isPayment ? formatArs(m.amountArs) : '—'}
                            </td>
                            <td className="py-1.5 px-3 text-right">{formatArs(m.amountArs)}</td>
                            <td className="py-1.5 px-3 text-center">
                              {m.isPayment && m.paymentId ? (
                                <button
                                  type="button"
                                  onClick={() => setEditingPaymentId(m.paymentId!)}
                                  title="Editar Pago"
                                  aria-label="Editar Pago"
                                  className="p-1 rounded-[5px] text-steffen-surface/70 hover:text-steffen-surface hover:bg-steffen-gray transition-colors cursor-pointer"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              ) : !m.isPayment && m.remittanceId ? (
                                <DocumentPdfButton
                                  sourceType="RTO"
                                  sourceId={m.remittanceId}
                                  knownStatus={m.rtoDocumentStatus || 'MISSING'}
                                />
                              ) : null}
                            </td>
                          </tr>
                          )
                        )
                      )}

                      {/* SALDO ACTUALIZADO: rojo oscuro si hay deuda (Figma) */}
                      {(() => {
                        const bal = formatBalance(selectedCustomer.balanceArs);
                        return (
                          <tr
                            className={`font-semibold text-sm text-steffen-surface border-b border-steffen-border/60 ${
                              bal.hasDebt ? 'bg-steffen-alert' : 'bg-steffen-gray'
                            }`}
                          >
                            <td colSpan={4} className="py-2.5 px-3 uppercase">
                              Saldo actualizado
                            </td>
                            <td className="py-2.5 px-3 text-right">{bal.text}</td>
                            <td></td>
                          </tr>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end items-center gap-3 pt-6">
                  {openingState?.hasAccount && openingState.editable && (
                    <Button variant="secundario" onClick={() => setIsAperturaModalOpen(true)}>
                      {openingState.opening ? 'Editar saldo de apertura' : 'Saldo de apertura'}
                    </Button>
                  )}
                  <Button variant="verde" onClick={() => setIsPagoModalOpen(true)}>
                    Registrar pago
                  </Button>
                  <IconButton
                    label="PDF estado de cuenta"
                    icon={<FileText className="w-5 h-5 text-steffen-red" />}
                    onClick={() => alert('Generación de PDF de estado de cuenta disponible en el bloque de Reportes/PDF')}
                  />
                </div>
              </Panel>
            </>
          )}

          {/* MODO 2: DIRECTORIO DE CLIENTES */}
          {viewMode === 'listado' && (
            <Panel>
              <SectionHeader
                title="Directorio de clientes"
                actions={
                  <>
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
                        placeholder="Buscar cliente..."
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
                      <th className="py-2 px-3 text-left">CLIENTE</th>
                      <th className="py-2 px-3 text-left">LOCALIDAD / PROV.</th>
                      <th className="py-2 px-3 text-left">TELEFONO</th>
                      <th className="py-2 px-3 text-right">SALDO CT</th>
                      <th className="py-2 px-3 text-center">ESTADO</th>
                      <th className="py-2 px-3 text-center">ACCIONES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCustomers.map((c) => {
                      const bal = formatBalance(c.balanceArs);
                      return (
                        <tr
                          key={c.id}
                          className={`${tableStyles.row} hover:bg-steffen-gray/40 transition-colors ${!c.active ? 'opacity-60' : ''}`}
                        >
                          <td className="py-1.5 px-3">{c.code}</td>
                          <td className="py-1.5 px-3 font-semibold">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedCustomerId(c.id);
                                setViewMode('ficha');
                              }}
                              className="text-left hover:text-steffen-gold hover:underline cursor-pointer"
                            >
                              {c.name}
                            </button>
                          </td>
                          <td className="py-1.5 px-3">{c.locality ? `${c.locality}, ${c.province || ''}` : '-'}</td>
                          <td className="py-1.5 px-3">{c.phone || '-'}</td>
                          <td
                            className={`py-1.5 px-3 text-right font-semibold ${
                              bal.hasDebt ? 'text-steffen-red' : 'text-steffen-green'
                            }`}
                          >
                            {bal.text}
                          </td>
                          <td className="py-1.5 px-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-[5px] text-[10px] font-semibold uppercase ${
                                c.active ? 'border border-steffen-green text-steffen-green' : 'bg-steffen-gray text-steffen-surface/70'
                              }`}
                            >
                              {c.active ? 'Activo' : 'Inactivo'}
                            </span>
                          </td>
                          <td className="py-1.5 px-3 text-center whitespace-nowrap space-x-1">
                            <button
                              onClick={() => {
                                setSelectedCustomerId(c.id);
                                setViewMode('ficha');
                              }}
                              title="Ver Ficha"
                              className="p-1 rounded-[5px] hover:bg-steffen-gray text-steffen-surface/80 hover:text-steffen-surface transition-colors cursor-pointer"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleOpenEdit(c)}
                              title="Editar Cliente"
                              className="p-1 rounded-[5px] hover:bg-steffen-gray text-steffen-surface/80 hover:text-steffen-surface transition-colors cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleToggleActiveClick(c)}
                              title={c.active ? 'Desactivar cliente' : 'Activar cliente'}
                              className={`p-1 rounded-[5px] hover:bg-steffen-gray transition-colors cursor-pointer ${
                                c.active ? 'text-steffen-surface/60 hover:text-steffen-surface' : 'text-steffen-green'
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

      {/* Modal de Cliente */}
      <CustomerModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        customer={modalCustomer}
        onSuccess={() => {
          startTransition(() => {
            router.refresh();
          });
        }}
      />

      {/* ConfirmDialog para Desactivación */}
      {confirmDialogCustomer && (
        <ConfirmDialog
          isOpen={true}
          title="Desactivar Cliente"
          message={`¿Estás seguro de que deseas desactivar al cliente "${confirmDialogCustomer.name}" (${confirmDialogCustomer.code})?`}
          onConfirm={() => handleExecuteToggle(confirmDialogCustomer, false)}
          onCancel={() => setConfirmDialogCustomer(null)}
        />
      )}

      {/* Modal Registrar Pago Cliente */}
      <RegistrarPagoClienteModal
        isOpen={isPagoModalOpen}
        onClose={() => setIsPagoModalOpen(false)}
        initialCustomerId={selectedCustomer?.id}
        onSuccess={() => {
          loadMovements();
          router.refresh();
        }}
      />

      {/* Modal Saldo de Apertura */}
      {selectedCustomer && (
        <SaldoAperturaModal
          isOpen={isAperturaModalOpen}
          onClose={() => setIsAperturaModalOpen(false)}
          partyType="CUSTOMER"
          partyId={selectedCustomer.id}
          partyName={selectedCustomer.name}
          opening={openingState?.opening ?? null}
          onSuccess={() => {
            loadMovements();
            router.refresh();
          }}
        />
      )}

      {/* Modal Editar Pago */}
      <EditarPagoModal
        isOpen={!!editingPaymentId}
        onClose={() => setEditingPaymentId(null)}
        paymentId={editingPaymentId || ''}
        onSuccess={() => {
          loadMovements();
          router.refresh();
        }}
      />

    </div>
  );
};
