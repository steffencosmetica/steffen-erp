import React, { ReactNode } from 'react';
import { formatArs } from '@/lib/format';

/**
 * Cuentas patrimoniales en cards (Figma Dashboard): CAJA STEFFEN, CAJA MERCADO LIBRE,
 * DEUDAS CLIENTES, DEUDAS PROVEEDORES y NETO (ancho mayor), con columna de acciones.
 * Solo presentación: los saldos llegan ya calculados (mismo formato y colores semánticos).
 * Importes en Display ExtraLight (Inter 200); NETO en Bold (DESIGN.md §5.1).
 */
interface AccountBalanceCardsProps {
  cajaSteffen: string;
  cajaMercadoLibre: string;
  deudasClientes: string;
  deudasProveedores: string;
  neto: string;
  /** Acciones a la derecha de las cards (IconTile). */
  actions?: ReactNode;
  /** Error de carga de saldos: se muestra en lugar de las cards, sin ocultar las acciones. */
  error?: string | null;
  /** side: acciones a la derecha (Dashboard). below: debajo, para dar todo el ancho a las cards. */
  actionsPosition?: 'side' | 'below';
  /**
   * grid: acciones en 2 columnas fijas (Dashboard, 5 acciones).
   * fluid: las acciones ocupan el espacio libre a la derecha de las cards (en columna si
   * solo entra un tile); si no entra ni un tile, bajan debajo y se reparten en fila.
   */
  actionsFlow?: 'grid' | 'fluid';
}

const BalanceCard: React.FC<{ value: string; label: string; labelClassName: string; strong?: boolean; className?: string }> = ({
  value,
  label,
  labelClassName,
  strong,
  className = '',
}) => (
  <div className={`ui-degrade rounded-[5px] border border-steffen-gray px-5 py-3 flex flex-col justify-center ${className}`}>
    <span className={`whitespace-nowrap ${strong ? 'text-[26px] font-bold tabular-nums tracking-[-0.01em]' : 'text-[24px] ui-display-extralight'}`}>
      {value}
    </span>
    <span className={`mt-1 text-xs ${labelClassName}`}>{label}</span>
  </div>
);

export const AccountBalanceCards: React.FC<AccountBalanceCardsProps> = ({
  cajaSteffen,
  cajaMercadoLibre,
  deudasClientes,
  deudasProveedores,
  neto,
  actions,
  error,
  actionsPosition = 'side',
  actionsFlow = 'grid',
}) => (
  <div className={`flex flex-col gap-4 ${actionsPosition === 'side' ? 'sm:flex-row sm:flex-wrap' : ''}`}>
    {error ? (
      <p className="flex-1 py-6 text-center text-xs text-steffen-red">{error}</p>
    ) : (
      // Cards ajustadas al contenido: 2 columnas max-content (importe completo + padding), sin estirarse.
      <div className="w-fit max-w-full grid grid-cols-1 sm:grid-cols-[repeat(2,max-content)] gap-3">
        <BalanceCard value={formatArs(cajaSteffen)} label="CAJA STEFFEN" labelClassName="text-steffen-green" />
        <BalanceCard value={formatArs(cajaMercadoLibre)} label="CAJA MERCADO LIBRE" labelClassName="text-steffen-green" />
        <BalanceCard value={formatArs(deudasClientes)} label="DEUDAS CLIENTES" labelClassName="text-steffen-green" />
        <BalanceCard
          value={deudasProveedores && deudasProveedores !== '0' ? `-${formatArs(deudasProveedores)}` : '$ 0'}
          label="DEUDAS PROVEEDORES"
          labelClassName="text-steffen-red"
        />
        <BalanceCard
          value={formatArs(neto)}
          label="NETO"
          labelClassName="text-steffen-surface font-semibold"
          strong
          className="col-span-full min-h-[86px]"
        />
      </div>
    )}
    {actions && (
      <div
        className={`flex flex-wrap gap-x-4 gap-y-4 content-start ${
          actionsPosition !== 'side'
            ? 'shrink-0'
            : actionsFlow === 'fluid'
            ? // basis 0 + min-w de un tile (64px): queda al lado si entra un tile y crece al espacio libre
              'sm:flex-1 sm:basis-0 sm:min-w-[64px]'
            : 'shrink-0 sm:grid sm:grid-cols-[repeat(2,max-content)]'
        }`}
      >
        {actions}
      </div>
    )}
  </div>
);
