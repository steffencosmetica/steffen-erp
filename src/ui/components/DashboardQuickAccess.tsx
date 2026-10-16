'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { HandCoins } from 'lucide-react';
import { ErpIcon } from './ErpIcon';
import { IconTile } from './UIComponents';
import { RegistrarCompraModal, type SupplierOption } from '@/ui/modals/RegistrarCompraModal';
import { RegistrarFabricacionModal, type BaseProductOption } from '@/ui/modals/RegistrarFabricacionModal';
import { RegistrarEnvasadoModal, type PackagingProductOption } from '@/ui/modals/RegistrarEnvasadoModal';
import type { BulkLotDTO } from '@/actions/factory.dto';

import { RegistrarPagoClienteModal } from '@/ui/modals/RegistrarPagoClienteModal';
import { RegistrarPagoProveedorModal } from '@/ui/modals/RegistrarPagoProveedorModal';
import { NuevoPedidoModal } from '@/ui/modals/NuevoPedidoModal';
import { GastoOperativoModal } from '@/ui/modals/GastoOperativoModal';
import { IngresoCajaModal } from '@/ui/modals/IngresoCajaModal';

export type DashboardAction =
  | 'purchase'
  | 'order'
  | 'manufacturing'
  | 'packaging'
  | 'customer-payment'
  | 'supplier-payment'
  | 'expense'
  | 'cash-deposit';

const DashboardActionsContext = createContext<((action: DashboardAction) => void) | null>(null);

interface DashboardActionsProviderProps {
  suppliers: SupplierOption[];
  baseProducts: BaseProductOption[];
  bulkLots: BulkLotDTO[];
  packagingProducts: PackagingProductOption[];
  children: ReactNode;
}

/**
 * Estado único de las operaciones rápidas del Dashboard: los mismos modales y
 * los mismos callbacks que antes; solo permite ubicar cada botón donde lo
 * dibuja el Figma (Reporte mensual, Acceso rápido, Cuentas).
 */
export const DashboardActionsProvider: React.FC<DashboardActionsProviderProps> = ({
  suppliers,
  baseProducts,
  bulkLots,
  packagingProducts,
  children,
}) => {
  const router = useRouter();
  const [activeModal, setActiveModal] = useState<DashboardAction | null>(null);

  return (
    <DashboardActionsContext.Provider value={setActiveModal}>
      {children}

      {/* Modal Compra */}
      <RegistrarCompraModal
        isOpen={activeModal === 'purchase'}
        onClose={() => setActiveModal(null)}
        onSuccess={() => {
          setActiveModal(null);
          router.refresh();
        }}
        suppliers={suppliers}
      />

      {/* Modal Fabricación */}
      <RegistrarFabricacionModal
        isOpen={activeModal === 'manufacturing'}
        onClose={() => setActiveModal(null)}
        onSuccess={() => {
          setActiveModal(null);
          router.refresh();
        }}
        baseProducts={baseProducts}
      />

      {/* Modal Envasado */}
      <RegistrarEnvasadoModal
        isOpen={activeModal === 'packaging'}
        onClose={() => setActiveModal(null)}
        onSuccess={() => {
          setActiveModal(null);
          router.refresh();
        }}
        bulkLots={bulkLots}
        products={packagingProducts}
      />

      {/* Modal Pago Clientes */}
      <RegistrarPagoClienteModal
        isOpen={activeModal === 'customer-payment'}
        onClose={() => setActiveModal(null)}
        onSuccess={() => {
          setActiveModal(null);
          router.refresh();
        }}
      />

      {/* Modal Pago Proveedor */}
      <RegistrarPagoProveedorModal
        isOpen={activeModal === 'supplier-payment'}
        onClose={() => setActiveModal(null)}
        onSuccess={() => {
          setActiveModal(null);
          router.refresh();
        }}
      />

      {/* Modal Gasto Operativo (mismo modal que Administración) */}
      <GastoOperativoModal
        isOpen={activeModal === 'expense'}
        onClose={() => setActiveModal(null)}
        onSuccess={() => {
          setActiveModal(null);
          router.refresh();
        }}
      />

      {/* Modal Ingreso de caja (mismo modal que Administración; Retiro vive en DashboardCuentasCard) */}
      <IngresoCajaModal
        isOpen={activeModal === 'cash-deposit'}
        onClose={() => setActiveModal(null)}
        onSuccess={() => {
          setActiveModal(null);
          router.refresh();
        }}
      />

      {/* Modal Nuevo Pedido */}
      <NuevoPedidoModal
        isOpen={activeModal === 'order'}
        onClose={() => setActiveModal(null)}
        onSuccess={() => {
          setActiveModal(null);
          router.refresh();
        }}
      />
    </DashboardActionsContext.Provider>
  );
};

function useDashboardAction() {
  const open = useContext(DashboardActionsContext);
  if (!open) {
    throw new Error('DashboardActionButton debe usarse dentro de DashboardActionsProvider');
  }
  return open;
}

const ACTION_META: Record<DashboardAction, { label: string; title: string }> = {
  purchase: { label: 'Compra', title: 'Registrar Compra a Proveedor (CMP)' },
  order: { label: 'Nuevo pedido', title: 'Registrar Nuevo Pedido (PED)' },
  manufacturing: { label: 'Fabricación', title: 'Registrar Fabricación de Granel (GRA)' },
  packaging: { label: 'Envasado', title: 'Registrar Envasado de Producto Final (ENV)' },
  'customer-payment': { label: 'Pago Clientes', title: 'Registrar Cobro / Pago de Cliente' },
  'supplier-payment': { label: 'Pago Proveedor', title: 'Registrar Pago a Proveedor' },
  expense: { label: 'Gasto operativo', title: 'Registrar Gasto Operativo' },
  'cash-deposit': { label: 'Ingreso caja', title: 'Registrar Ingreso de Caja' },
};

const ACTION_ICON: Partial<Record<DashboardAction, ReactNode>> = {
  purchase: <ErpIcon name="compra" className="w-8 h-8" />,
  manufacturing: <ErpIcon name="formula" className="w-8 h-8" />,
  packaging: <ErpIcon name="envase" className="w-8 h-8" />,
  expense: <ErpIcon name="gasto" className="w-8 h-8" />,
  'cash-deposit': <ErpIcon name="ingresos" className="w-7 h-7" />,
  // Sin ícono de referencia para pagos: ícono lineal neutro en plateado (DESIGN.md §4.4).
  'supplier-payment': <HandCoins className="w-7 h-7 text-steffen-silver group-hover:text-steffen-gold transition-colors" strokeWidth={1.6} />,
  'customer-payment': <HandCoins className="w-7 h-7 text-steffen-silver group-hover:text-steffen-gold transition-colors" strokeWidth={1.6} />,
};

/** Etiquetas cortas bajo los íconos (Figma Dashboard). */
const TILE_LABEL: Partial<Record<DashboardAction, string>> = {
  purchase: 'Compras',
  manufacturing: 'Fabricación',
  packaging: 'Envasado',
  'supplier-payment': 'Pago Proveedor',
  'customer-payment': 'Pago Cliente',
  expense: 'Gasto Operativo',
  'cash-deposit': 'Ingreso Caja',
};

interface DashboardActionButtonProps {
  action: DashboardAction;
  appearance: 'icon' | 'tile' | 'secondary' | 'secondary-large' | 'success-large';
  className?: string;
}

/** Botón que abre una operación rápida del Dashboard con la apariencia que define el Figma. */
export const DashboardActionButton: React.FC<DashboardActionButtonProps> = ({ action, appearance, className = '' }) => {
  const open = useDashboardAction();
  const { label, title } = ACTION_META[action];

  if (appearance === 'tile') {
    return (
      <IconTile
        label={TILE_LABEL[action] ?? label}
        title={title}
        onClick={() => open(action)}
        icon={ACTION_ICON[action]}
        className={className}
      />
    );
  }

  if (appearance === 'icon') {
    return (
      <button
        type="button"
        onClick={() => open(action)}
        title={title}
        aria-label={label}
        className={`ui-btn-dark w-[50px] h-[50px] inline-flex items-center justify-center rounded-[5px] transition-colors cursor-pointer ${className}`}
      >
        {ACTION_ICON[action]}
      </button>
    );
  }

  const base =
    'inline-flex items-center justify-center rounded-[5px] transition-colors cursor-pointer';
  const variant =
    appearance === 'success-large'
      ? 'h-[50px] px-6 text-lg border border-steffen-green bg-steffen-green hover:bg-steffen-green-hover text-steffen-surface'
      : appearance === 'secondary-large'
      ? 'ui-btn-dark h-[50px] px-6 text-lg'
      : 'ui-btn-dark h-[30px] px-5 text-sm font-semibold uppercase';

  return (
    <button type="button" onClick={() => open(action)} title={title} className={`${base} ${variant} ${className}`}>
      {label}
    </button>
  );
};
