'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { ChevronLeft, Search, Filter } from 'lucide-react';
import type { PatrimonialMovementDTO } from '@/actions/patrimony.dto';
import { formatArs } from '@/lib/format';

interface MovimientosViewProps {
  initialMovements: PatrimonialMovementDTO[];
  defaultStartDate: string;
  defaultEndDate: string;
}

export const MovimientosView: React.FC<MovimientosViewProps> = ({
  initialMovements,
  defaultStartDate,
  defaultEndDate,
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('TODOS');
  const [startDate, setStartDate] = useState<string>(defaultStartDate);
  const [endDate, setEndDate] = useState<string>(defaultEndDate);

  // Filtrado reactivo en cliente (los movimientos de los últimos 90 días o el rango cargado)
  const filteredMovements = useMemo(() => {
    return initialMovements.filter((m) => {
      // Filtro fecha
      if (startDate && m.date && m.date < startDate) return false;
      if (endDate && m.date && m.date > endDate) return false;

      // Filtro tipo
      if (selectedType !== 'TODOS') {
        if (selectedType === 'PAGO_PROV' && m.type !== 'PAGO_PROVEEDOR' && m.type !== 'PAGO_PROV') return false;
        if (selectedType === 'PAGO_CLIENTE' && m.type !== 'PAGO_CLIENTE') return false;
        if (selectedType !== 'PAGO_PROV' && selectedType !== 'PAGO_CLIENTE' && m.type !== selectedType) return false;
      }

      // Filtro búsqueda
      if (searchTerm.trim()) {
        const s = searchTerm.toLowerCase().trim();
        const matchesCode = m.code.toLowerCase().includes(s);
        const matchesDesc = m.description.toLowerCase().includes(s);
        const matchesType = m.type.toLowerCase().includes(s);
        const matchesVar = m.patrimonialVariation.toLowerCase().includes(s);
        if (!matchesCode && !matchesDesc && !matchesType && !matchesVar) return false;
      }

      return true;
    });
  }, [initialMovements, startDate, endDate, selectedType, searchTerm]);

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return '—';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      // Formato DD/MM/YY
      const yy = parts[0].slice(-2);
      return `${parseInt(parts[2], 10)}/${parseInt(parts[1], 10)}/${yy}`;
    }
    return dateStr;
  };

  const formatTypeDisplay = (type: string) => {
    switch (type) {
      case 'PAGO_PROVEEDOR':
        return 'PAGO PROV';
      case 'PAGO_CLIENTE':
        return 'PAGO CLIENTE';
      case 'GASTO_OPERATIVO':
        return 'GASTO OPERATIVO';
      case 'TRANSFERENCIA_MERCADO_LIBRE':
        return 'TRANSF ML';
      default:
        return type;
    }
  };

  const isDefault90Days = startDate === defaultStartDate && endDate === defaultEndDate;

  return (
    <div className="max-w-[1600px] mx-auto pb-16 space-y-4">
      {/* Subheader superior idéntico a MOVIMIENTOS.png */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1 pt-1">
        <div className="flex items-center gap-4">
          <Link
            href="/administracion"
            className="text-[#0E50A0] font-bold text-sm hover:underline flex items-center gap-1 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Volver</span>
          </Link>
          <h1 className="font-bold text-base uppercase tracking-wider text-black">
            ULTIMOS MOVIMIENTOS {isDefault90Days ? '(90 dias)' : `(${formatDateDisplay(startDate)} - ${formatDateDisplay(endDate)})`}
          </h1>
        </div>

        {/* Barra de Búsqueda y Rango de Fechas */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            <span>Desde:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-8 px-2 border border-[#D9D9D9] rounded-[5px] text-xs bg-white text-black focus:outline-none focus:border-[#0E50A0]"
            />
            <span>Hasta:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-8 px-2 border border-[#D9D9D9] rounded-[5px] text-xs bg-white text-black focus:outline-none focus:border-[#0E50A0]"
            />
          </div>

          <div className="relative">
            <input
              type="text"
              placeholder="Buscar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-56 sm:w-64 h-8 pl-3 pr-8 border border-[#D9D9D9] rounded-[5px] text-xs text-black focus:outline-none focus:border-[#0E50A0]"
            />
            <Search className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Tabla de Movimientos */}
      <div className="bg-white border border-[#D9D9D9] rounded-[5px] overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#D9D9D9] text-black font-bold uppercase text-[11px] border-b border-black">
                <th className="py-2.5 px-3 text-left w-[12%]">FECHA</th>
                <th className="py-2.5 px-3 text-left w-[16%]">
                  <div className="flex items-center gap-1.5">
                    <span>TIPO</span>
                    <select
                      value={selectedType}
                      onChange={(e) => setSelectedType(e.target.value)}
                      className="bg-transparent text-black font-bold text-[11px] focus:outline-none cursor-pointer"
                    >
                      <option value="TODOS">TODOS</option>
                      <option value="RETIRO">RETIRO</option>
                      <option value="COMPRA">COMPRA</option>
                      <option value="PAGO_PROV">PAGO PROV</option>
                      <option value="PAGO_CLIENTE">PAGO CLIENTE</option>
                      <option value="GASTO_OPERATIVO">GASTO OPERATIVO</option>
                      <option value="TRANSPORTE">TRANSPORTE</option>
                      <option value="VENTA">VENTA</option>
                    </select>
                  </div>
                </th>
                <th className="py-2.5 px-3 text-left w-[36%]">DESCRIPCION</th>
                <th className="py-2.5 px-3 text-right w-[16%]">IMPORTE</th>
                <th className="py-2.5 px-3 text-right w-[20%]">VAR. PAT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E5E5]">
              {filteredMovements.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-xs text-neutral-400">
                    No se encontraron movimientos patrimoniales para los filtros seleccionados
                  </td>
                </tr>
              ) : (
                filteredMovements.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-black whitespace-nowrap">
                      {formatDateDisplay(m.date)}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-black uppercase whitespace-nowrap">
                      {formatTypeDisplay(m.type)}
                    </td>
                    <td className="py-2.5 px-3 text-gray-800 truncate max-w-0">
                      {m.description}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-black whitespace-nowrap">
                      {formatArs(m.amountArs)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-[11px] text-gray-700 whitespace-nowrap">
                      {m.patrimonialVariation || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
