// Reports View conforming to DESIGN.md Section 35 & BUSINESS_RULES.md Section 36

import React from 'react';
import { domainServices } from '../../services/domainServices';
import { MoneyDisplay } from '../components/UIComponents';

export const ReportsView: React.FC = () => {
  // Real-time derived queries conforming to Section 36 of BUSINESS_RULES.md
  const data = domainServices.getReportsData();

  return (
    <div className="space-y-6">
      {/* Title with Primary horizontal accent line conforming to DESIGN.md Section 35.1 */}
      <div>
        <h1 className="text-2xl font-bold text-steffen-surface uppercase tracking-wider">REPORTES</h1>
        <div className="w-full h-1 bg-steffen-gold mt-2 rounded-full"></div>
      </div>

      {/* Exactly Four Cards in 2x2 Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
        {/* Card 1: Ventas del Mes */}
        <div className="bg-steffen-bg border-2 border-steffen-gold rounded-[5px] p-8 shadow-xs flex flex-col justify-between min-h-[135px]">
          <span className="text-xs font-bold uppercase tracking-wider text-steffen-surface/80">
            VENTAS DEL MES
          </span>
          <div className="my-auto">
            <span className="text-5xl font-black text-steffen-surface tracking-tight">{data.salesCurrentMonth}</span>
          </div>
          <span className="text-xs text-gray-500 font-medium">
            Remitos (RTO) completados del mes calendario corriente
          </span>
        </div>

        {/* Card 2: Total Facturado */}
        <div className="bg-steffen-bg border-2 border-steffen-gold rounded-[5px] p-8 shadow-xs flex flex-col justify-between min-h-[135px]">
          <span className="text-xs font-bold uppercase tracking-wider text-steffen-surface/80">
            TOTAL FACTURADO
          </span>
          <div className="my-auto">
            <span className="text-4xl md:text-5xl font-black text-steffen-surface tracking-tight">
              $ {Math.round(data.billedCurrentMonthArs).toLocaleString('es-AR')}
            </span>
          </div>
          <span className="text-xs text-gray-500 font-medium">
            Suma de importes netos de venta (Total Pedido) sin saldo anterior
          </span>
        </div>

        {/* Card 3: Ganancia */}
        <div className="bg-steffen-green text-white rounded-[5px] p-8 shadow-xs flex flex-col justify-between min-h-[135px]">
          <span className="text-xs font-bold uppercase tracking-wider text-green-100">
            GANANCIA
          </span>
          <div className="my-auto">
            <span className="text-4xl md:text-5xl font-black text-white tracking-tight">
              $ {Math.round(data.gainCurrentMonthArs).toLocaleString('es-AR')}
            </span>
          </div>
          <span className="text-xs text-green-100 font-medium">
            Suma de ganancia real de los RTM completados del mes (descontando flete)
          </span>
        </div>

        {/* Card 4: Pedidos Abiertos */}
        <div className="bg-steffen-bg text-white rounded-[5px] p-8 shadow-xs flex flex-col justify-between min-h-[135px]">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-300">
            PEDIDOS ABIERTOS
          </span>
          <div className="my-auto">
            <span className="text-5xl font-black text-steffen-gold tracking-tight">{data.openOrdersCount}</span>
          </div>
          <span className="text-xs text-gray-400 font-medium">
            Cantidad total de pedidos en estado ABIERTO (sin filtro mensual)
          </span>
        </div>
      </div>
    </div>
  );
};
