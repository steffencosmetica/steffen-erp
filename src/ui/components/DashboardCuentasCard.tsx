'use client';

import React, { useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { RetiroCajaModal } from '@/ui/modals/RetiroCajaModal';
import { IconTile, Panel } from '@/ui/components/UIComponents';
import { ErpIcon } from '@/ui/components/ErpIcon';
import { AccountBalanceCards } from '@/ui/components/AccountBalanceCards';

interface DashboardCuentasCardProps {
  cajaSteffen: string;
  cajaMercadoLibre: string;
  deudasClientes: string;
  deudasProveedores: string;
  neto: string;
  /** Acciones patrimoniales ubicadas junto a Retiro Caja (Figma Dashboard). */
  actions?: ReactNode;
  /** Error de carga de saldos: se muestra en lugar de las cards, sin ocultar las acciones. */
  error?: string | null;
}

/** CUENTAS del Dashboard (Figma): cards de saldos + acciones de ícono (incluye Retiro caja). */
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
      <Panel className="dashboard-accounts">
        <AccountBalanceCards
          cajaSteffen={cajaSteffen}
          cajaMercadoLibre={cajaMercadoLibre}
          deudasClientes={deudasClientes}
          deudasProveedores={deudasProveedores}
          neto={neto}
          error={error}
          actionsPosition="below"
          actions={
            <>
              {actions}
              <IconTile
                label="Retiro"
                title="Retiro caja"
                onClick={() => setIsRetiroOpen(true)}
                icon={<ErpIcon name="retiro" className="w-7 h-7" />}
              />
            </>
          }
        />
      </Panel>

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
