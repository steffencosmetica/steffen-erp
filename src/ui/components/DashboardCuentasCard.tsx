'use client';

import React, { useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { formatArs } from '@/lib/format';
import { RetiroCajaModal } from '@/ui/modals/RetiroCajaModal';
import { IconButton, Panel, tableStyles } from '@/ui/components/UIComponents';
import { ErpIcon } from '@/ui/components/ErpIcon';

interface DashboardCuentasCardProps {
  cajaSteffen: string;
  cajaMercadoLibre: string;
  deudasClientes: string;
  deudasProveedores: string;
  neto: string;
  /** Acciones patrimoniales ubicadas junto a Retiro Caja (Figma Dashboard). */
  actions?: ReactNode;
  /** Error de carga de saldos: se muestra en lugar de la tabla, sin ocultar las acciones. */
  error?: string | null;
}

export const DashboardCuentasCard: React.FC<DashboardCuentasCardProps> = ({
  cajaSteffen,
  cajaMercadoLibre,
  deudasClientes,
  deudasProveedores,
  neto,
  actions,
  error,
}) => {
  const router = useRouter();
  const [isRetiroOpen, setIsRetiroOpen] = useState(false);

  return (
    <>
      <Panel>
        {error ? (
          <p className="py-6 text-center text-xs text-steffen-red">{error}</p>
        ) : (
        <table className={tableStyles.table}>
          <thead>
            <tr className={tableStyles.headRow}>
              <th className="py-2 px-3 text-left">CUENTA</th>
              <th className="py-2 px-3 text-right">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            <tr className={tableStyles.row}>
              <td className="py-1.5 px-3">CAJA STEFFEN</td>
              <td className="py-1.5 px-3 text-right tabular-nums text-steffen-green">{formatArs(cajaSteffen)}</td>
            </tr>
            <tr className={tableStyles.row}>
              <td className="py-1.5 px-3">CAJA MERCADO LIBRE</td>
              <td className="py-1.5 px-3 text-right tabular-nums text-steffen-green">{formatArs(cajaMercadoLibre)}</td>
            </tr>
            <tr className={tableStyles.row}>
              <td className="py-1.5 px-3">DEUDAS CLIENTES</td>
              <td className="py-1.5 px-3 text-right tabular-nums text-steffen-green">{formatArs(deudasClientes)}</td>
            </tr>
            <tr className={tableStyles.row}>
              <td className="py-1.5 px-3">DEUDAS PROVEEDORES</td>
              <td className="py-1.5 px-3 text-right tabular-nums text-steffen-red">
                {deudasProveedores && deudasProveedores !== '0' ? `-${formatArs(deudasProveedores)}` : '$ 0'}
              </td>
            </tr>
            <tr className="font-semibold">
              <td className="py-1.5 px-3 uppercase">NETO</td>
              <td className="py-1.5 px-3 text-right tabular-nums">{formatArs(neto)}</td>
            </tr>
          </tbody>
        </table>
        )}
      </Panel>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {actions}
        <IconButton
          variant="rojo"
          size="large"
          label="Retiro caja"
          onClick={() => setIsRetiroOpen(true)}
          icon={<ErpIcon name="retiro" tone="light" className="w-8 h-8" />}
        />
      </div>

      <RetiroCajaModal
        isOpen={isRetiroOpen}
        onClose={() => setIsRetiroOpen(false)}
        onSuccess={() => {
          setIsRetiroOpen(false);
          router.refresh();
        }}
      />
    </>
  );
};
