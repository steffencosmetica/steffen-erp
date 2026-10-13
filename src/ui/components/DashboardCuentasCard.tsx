'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatArsInteger } from '@/actions/administracion.dto';
import { RetiroCajaModal } from '@/ui/modals/RetiroCajaModal';

interface DashboardCuentasCardProps {
  cajaSteffen: string;
  cajaMercadoLibre: string;
  deudasClientes: string;
  deudasProveedores: string;
  neto: string;
}

export const DashboardCuentasCard: React.FC<DashboardCuentasCardProps> = ({
  cajaSteffen,
  cajaMercadoLibre,
  deudasClientes,
  deudasProveedores,
  neto,
}) => {
  const router = useRouter();
  const [isRetiroOpen, setIsRetiroOpen] = useState(false);

  return (
    <>
      <div className="bg-white rounded-2xl border border-[#D9D9D9] p-4 shadow-xs space-y-4">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#D9D9D9] text-black font-bold uppercase text-left">
              <th className="py-2 px-3">CUENTA</th>
              <th className="py-2 px-3 text-right">TOTAL</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-xs">
            <tr>
              <td className="py-2.5 px-3 font-semibold text-black">CAJA STEFFEN</td>
              <td className="py-2.5 px-3 text-right font-mono font-bold text-[#008102]">
                {formatArsInteger(cajaSteffen)}
              </td>
            </tr>
            <tr>
              <td className="py-2.5 px-3 font-semibold text-black">CAJA MERCADO LIBRE</td>
              <td className="py-2.5 px-3 text-right font-mono font-bold text-[#008102]">
                {formatArsInteger(cajaMercadoLibre)}
              </td>
            </tr>
            <tr>
              <td className="py-2.5 px-3 font-semibold text-black">DEUDAS CLIENTES</td>
              <td className="py-2.5 px-3 text-right font-mono font-bold text-[#008102]">
                {formatArsInteger(deudasClientes)}
              </td>
            </tr>
            <tr>
              <td className="py-2.5 px-3 font-semibold text-black">DEUDAS PROVEEDORES</td>
              <td className="py-2.5 px-3 text-right font-mono font-bold text-[#DD0000]">
                {deudasProveedores && deudasProveedores !== '0'
                  ? `-${formatArsInteger(deudasProveedores)}`
                  : '$ 0'}
              </td>
            </tr>
            <tr className="border-t-2 border-black font-bold">
              <td className="py-2.5 px-3 text-black uppercase">NETO</td>
              <td className="py-2.5 px-3 text-right font-mono text-sm text-black">
                {formatArsInteger(neto)}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={() => setIsRetiroOpen(true)}
            className="h-[38px] px-4 inline-flex items-center justify-center font-bold rounded-[2px] bg-[#DD0000] hover:bg-[#b00000] text-white border border-[#DD0000] w-36 text-xs uppercase shadow-xs transition-colors cursor-pointer"
          >
            RETIRO CAJA
          </button>
        </div>
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
