'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RegistrarCompraModal, type SupplierOption } from '@/ui/modals/RegistrarCompraModal';
import { RegistrarFabricacionModal, type BaseProductOption } from '@/ui/modals/RegistrarFabricacionModal';
import { RegistrarEnvasadoModal, type PackagingProductOption } from '@/ui/modals/RegistrarEnvasadoModal';
import type { BulkLotDTO } from '@/actions/factory.dto';

interface DashboardQuickAccessProps {
  suppliers: SupplierOption[];
  baseProducts: BaseProductOption[];
  bulkLots: BulkLotDTO[];
  packagingProducts: PackagingProductOption[];
}

export const DashboardQuickAccess: React.FC<DashboardQuickAccessProps> = ({
  suppliers,
  baseProducts,
  bulkLots,
  packagingProducts,
}) => {
  const router = useRouter();
  const [activeModal, setActiveModal] = useState<
    | 'purchase'
    | 'manufacturing'
    | 'packaging'
    | 'cash-withdrawal'
    | 'customer-payment'
    | 'supplier-payment'
    | null
  >(null);

  const handleCustomerPayment = () => {
    alert('Módulo de cobro/pago de clientes se activará en el bloque de Administración (Fase 9).');
  };

  const handleSupplierPayment = () => {
    alert('Módulo de registro de pagos a proveedores se activará en Administración (Fase 9).');
  };

  return (
    <>
      <div className="bg-white rounded-2xl border border-[#D9D9D9] p-4 shadow-xs">
        <div className="grid grid-cols-2 gap-3">
          
          {/* Fila 1 */}
          <button
            type="button"
            onClick={() => setActiveModal('purchase')}
            title="Registrar Compra a Proveedor (CMP)"
            className="h-[52px] bg-[#0E50A0] hover:bg-[#0c4386] text-white font-bold text-sm rounded-[2px] flex items-center justify-center transition-colors cursor-pointer shadow-xs active:scale-[0.99]"
          >
            Compra
          </button>

          <button
            type="button"
            disabled
            title="Módulo de Pedidos (PED) próximo en Fase 9"
            className="h-[52px] bg-[#0E50A0] hover:bg-[#0c4386] text-white font-bold text-sm rounded-[2px] flex items-center justify-center transition-colors cursor-not-allowed opacity-80"
          >
            Nuevo pedido
          </button>

          {/* Fila 2 */}
          <button
            type="button"
            onClick={() => setActiveModal('packaging')}
            title="Registrar Envasado de Producto Final (ENV)"
            className="h-[52px] bg-[#0E50A0] hover:bg-[#0c4386] text-white font-bold text-sm rounded-[2px] flex items-center justify-center transition-colors cursor-pointer shadow-xs active:scale-[0.99]"
          >
            Envasado
          </button>

          <button
            type="button"
            onClick={() => setActiveModal('manufacturing')}
            title="Registrar Fabricación de Granel (GRA)"
            className="h-[52px] bg-[#0E50A0] hover:bg-[#0c4386] text-white font-bold text-sm rounded-[2px] flex items-center justify-center transition-colors cursor-pointer shadow-xs active:scale-[0.99]"
          >
            Fabricación
          </button>

          {/* Fila 3 (Verde Sólido Figma) */}
          <button
            type="button"
            onClick={handleCustomerPayment}
            title="Registrar Cobro / Pago de Cliente"
            className="h-[52px] bg-[#008102] hover:bg-[#015C02] text-white font-bold text-sm rounded-[2px] flex items-center justify-center transition-colors cursor-pointer shadow-xs active:scale-[0.99]"
          >
            Pago Clientes
          </button>

          <button
            type="button"
            onClick={handleSupplierPayment}
            title="Registrar Pago a Proveedor"
            className="h-[52px] bg-[#008102] hover:bg-[#015C02] text-white font-bold text-sm rounded-[2px] flex items-center justify-center transition-colors cursor-pointer shadow-xs active:scale-[0.99]"
          >
            Pago Proveedor
          </button>

        </div>
      </div>

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
    </>
  );
};
