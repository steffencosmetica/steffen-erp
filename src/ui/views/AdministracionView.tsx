'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  FileText,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { DocumentPdfButton } from '@/ui/components/DocumentPdfButton';
import {
  type AdministracionDashboardDTO,
} from '@/actions/administracion.dto';
import { formatArs } from '@/lib/format';
import { Decimal } from '@/domain/decimal';
import { getMonthlySalesAction } from '@/actions/remittance.actions';
import type { MonthlySaleDTO } from '@/actions/remittance.dto';
import { GastoOperativoModal } from '@/ui/modals/GastoOperativoModal';
import { RetiroCajaModal } from '@/ui/modals/RetiroCajaModal';
import { RegistrarPagoClienteModal } from '@/ui/modals/RegistrarPagoClienteModal';
import { RegistrarPagoProveedorModal } from '@/ui/modals/RegistrarPagoProveedorModal';

interface AdministracionViewProps {
  data: AdministracionDashboardDTO;
  initialMonthlySales: MonthlySaleDTO[];
  initialYear: number;
  initialMonth: number;
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function monthOptionValue(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function buildRecentMonthOptions(year: number, month: number, count: number) {
  const options: { value: string; label: string }[] = [];
  let y = year;
  let m = month;
  for (let i = 0; i < count; i++) {
    options.push({ value: monthOptionValue(y, m), label: `${MONTH_NAMES[m - 1]} ${y}` });
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
  }
  return options;
}

export const AdministracionView: React.FC<AdministracionViewProps> = ({
  data,
  initialMonthlySales,
  initialYear,
  initialMonth,
}) => {
  const router = useRouter();
  const [selectedMonth, setSelectedMonth] = useState(monthOptionValue(initialYear, initialMonth));
  const [monthlySales, setMonthlySales] = useState<MonthlySaleDTO[]>(initialMonthlySales);
  const [isLoadingSales, setIsLoadingSales] = useState(false);
  const [usdInput, setUsdInput] = useState(data.currentUsdRate || '1350');

  const [isGastoOperativoOpen, setIsGastoOperativoOpen] = useState(false);
  const [isRetiroCajaOpen, setIsRetiroCajaOpen] = useState(false);
  const [isPagoClienteOpen, setIsPagoClienteOpen] = useState(false);
  const [isPagoProveedorOpen, setIsPagoProveedorOpen] = useState(false);

  const monthOptions = buildRecentMonthOptions(initialYear, initialMonth, 6);

  const handleMonthChange = (value: string) => {
    setSelectedMonth(value);
    const [yStr, mStr] = value.split('-');
    const year = parseInt(yStr, 10);
    const month = parseInt(mStr, 10);
    setIsLoadingSales(true);
    getMonthlySalesAction(year, month).then((res) => {
      setIsLoadingSales(false);
      if (res.success && res.data) {
        setMonthlySales(res.data);
      }
    });
  };

  const totalFacturadoMes = monthlySales.reduce((acc, s) => acc.plus(s.totalOrderArs), new Decimal(0));
  const gananciaMes = monthlySales.reduce((acc, s) => acc.plus(s.gainArs), new Decimal(0));

  return (
    <div className="max-w-[1600px] mx-auto pb-16 space-y-5">
      {/* 1. Fila Superior: Ventas del mes (Izq) + Acciones/Cuentas (Der) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* VENTAS DEL MES (Columna izquierda: 7 de 12) */}
        <div className="lg:col-span-7 bg-white border border-[#D9D9D9] rounded-[5px] p-5 h-[360px] flex flex-col justify-between">
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 pb-2 border-b border-black">
              <h2 className="text-base font-bold text-black uppercase tracking-wider">
                VENTAS DEL MES
              </h2>
              <div className="flex items-center gap-2">
                <select
                  value={selectedMonth}
                  onChange={(e) => handleMonthChange(e.target.value)}
                  className="h-8 px-3 text-xs border border-[#D9D9D9] rounded-[5px] bg-white text-gray-700 focus:outline-none focus:border-[#0E50A0] cursor-pointer"
                >
                  {monthOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Área de contenido con scroll vertical interno si excede la altura fija */}
            <div className="flex-1 overflow-y-auto min-h-0">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#D9D9D9] text-black font-bold uppercase text-[11px] sticky top-0 z-10">
                    <th className="py-2.5 px-3 text-left w-[13%]">FECHA</th>
                    <th className="py-2.5 px-3 text-left w-[27%]">CLIENTE / ORIGEN</th>
                    <th className="py-2.5 px-3 text-right w-[16%]">TOTAL</th>
                    <th className="py-2.5 px-3 text-right w-[16%]">GANANCIA</th>
                    <th className="py-2.5 px-3 text-center w-[12%]">Nro REMITO</th>
                    <th className="py-2.5 px-3 text-center w-[8%]">RTO</th>
                    <th className="py-2.5 px-3 text-center w-[8%]">RTM</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E5E5]">
                  {isLoadingSales ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-xs text-neutral-400">
                        Cargando ventas...
                      </td>
                    </tr>
                  ) : monthlySales.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-xs text-neutral-400">
                        Sin ventas registradas en el período seleccionado
                      </td>
                    </tr>
                  ) : (
                    monthlySales.map((s) => (
                      <tr key={s.remittanceId} className="hover:bg-gray-50/80 transition-colors">
                        <td className="py-2.5 px-3 text-black whitespace-nowrap">{s.businessDate}</td>
                        <td className="py-2.5 px-3 text-black font-semibold">{s.customerDisplayName}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-black">
                          {formatArs(s.totalOrderArs)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-[#008102]">
                          {formatArs(s.gainArs)}
                        </td>
                        <td className="py-2.5 px-3 text-center text-gray-700">{s.rtoCode}</td>
                        <td className="py-2.5 px-3 text-center">
                          <DocumentPdfButton sourceType="RTO" sourceId={s.remittanceId} knownStatus={s.rtoDocumentStatus} />
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <DocumentPdfButton sourceType="RTM" sourceId={s.marginRemittanceId} knownStatus={s.rtmDocumentStatus} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 mt-3 border-t border-[#E5E5E5] text-xs">
            <div className="flex items-center gap-6">
              <span className="font-bold uppercase tracking-wider text-black">TOTAL</span>
              <span className="font-bold font-mono text-black">{formatArs(totalFacturadoMes)}</span>
              <span className="font-bold font-mono text-[#008102]">{formatArs(gananciaMes)}</span>
            </div>
            <button
              type="button"
              className="text-xs font-bold text-[#0E50A0] opacity-80 cursor-not-allowed inline-flex items-center gap-1"
              title="Módulo de Reportes próximo en Fase 17"
            >
              <span>IR A VENTAS</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Columna derecha: Gasto Operativo + Lista de Precios + Cotización Dólar + Cuentas (5 de 12) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Botones de acción directos: Gasto Operativo + Lista de Precios */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setIsGastoOperativoOpen(true)}
              className="h-12 bg-[#0E50A0] hover:bg-[#0c4386] text-white rounded-[5px] font-bold text-xs uppercase tracking-wider flex items-center justify-center transition-colors cursor-pointer"
            >
              GASTO OPERATIVO
            </button>
            <Link
              href="/precios"
              className="h-12 bg-black hover:bg-neutral-900 text-[#D2AB68] rounded-[5px] font-bold text-xs uppercase tracking-wider flex items-center justify-center transition-colors"
            >
              LISTA DE PRECIOS
            </Link>
          </div>

          {/* Cotización Dólar */}
          <div className="bg-white border border-[#D9D9D9] rounded-[5px] p-4 flex items-center justify-between gap-3">
            <span className="text-xs font-bold text-black uppercase tracking-wider whitespace-nowrap">
              COTIZACION DOLAR
            </span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={usdInput}
                onChange={(e) => setUsdInput(e.target.value)}
                className="w-24 h-8 px-2.5 text-xs font-mono font-bold text-right border border-[#D9D9D9] rounded-[5px] bg-white text-black focus:outline-none focus:border-[#008102]"
                placeholder="1.350"
              />
              <button
                type="button"
                className="h-8 px-3 bg-[#008102] hover:bg-[#007002] text-white text-[11px] font-bold uppercase tracking-wider rounded-[5px] transition-colors cursor-pointer"
                onClick={() => alert(`Cotización actualizada: $ ${usdInput}`)}
              >
                ACTUALIZAR
              </button>
            </div>
          </div>

          {/* CUENTAS */}
          <div className="bg-white border border-[#D9D9D9] rounded-[5px] p-4">
            <div className="mb-2 pb-1 border-b border-black">
              <h2 className="text-base font-bold text-black uppercase tracking-wider">
                CUENTAS
              </h2>
            </div>

            <table className="w-full text-xs mb-3">
              <thead>
                <tr className="bg-[#D9D9D9] text-black font-bold uppercase text-[11px]">
                  <th className="py-2 px-3 text-left">CUENTA</th>
                  <th className="py-2 px-3 text-right">TOTAL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E5E5]">
                <tr>
                  <td className="py-2 px-3 font-semibold text-black">CAJA STEFFEN</td>
                  <td className="py-2 px-3 text-right font-mono font-bold text-[#008102]">
                    {formatArs(data.cajaSteffenArs)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-semibold text-black">CAJA MERCADO LIBRE</td>
                  <td className="py-2 px-3 text-right font-mono font-bold text-[#008102]">
                    {formatArs(data.cajaMercadoLibreArs)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-semibold text-black">DEUDAS CLIENTES</td>
                  <td className="py-2 px-3 text-right font-mono font-bold text-[#008102]">
                    {formatArs(data.deudasClientesArs)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-semibold text-black">DEUDAS PROVEEDORES</td>
                  <td className="py-2 px-3 text-right font-mono font-bold text-[#DD0000]">
                    {data.deudasProveedoresArs && data.deudasProveedoresArs !== '0'
                      ? `-${formatArs(data.deudasProveedoresArs)}`
                      : '$ 0'}
                  </td>
                </tr>
                <tr className="border-t-2 border-black font-bold">
                  <td className="py-2 px-3 text-black">NETO</td>
                  <td className="py-2 px-3 text-right font-mono text-black">
                    {formatArs(data.netoArs)}
                  </td>
                </tr>
              </tbody>
            </table>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setIsRetiroCajaOpen(true)}
                className="h-7 px-3 bg-[#DD0000] hover:bg-[#b00000] text-white text-xs font-bold uppercase tracking-wider rounded-[5px] transition-colors cursor-pointer"
              >
                RETIRO CAJA
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Fila Media: Resumen Cuentas Clientes (Izq) + Deudas Proveedores (Der) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* RESUMEN CUENTAS CLIENTES (Altura fija respetando Figma) */}
        <div className="bg-white border border-[#D9D9D9] rounded-[5px] p-5 h-[340px] flex flex-col justify-between">
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-black">
              <h2 className="text-base font-bold text-black uppercase tracking-wider">
                RESUMEN CUENTAS CLIENTES
              </h2>
              <button
                type="button"
                onClick={() => setIsPagoClienteOpen(true)}
                className="h-8 px-3 bg-[#008102] hover:bg-[#007002] text-white text-[11px] font-bold uppercase tracking-wider rounded-[5px] cursor-pointer"
              >
                REGISTRAR PAGO
              </button>
            </div>

            {/* Contenido con scroll vertical interno */}
            <div className="flex-1 overflow-y-auto min-h-0">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#D9D9D9] text-black font-bold uppercase text-[11px] sticky top-0 z-10">
                    <th className="py-2.5 px-3 text-left w-[40%]">CLIENTE</th>
                    <th className="py-2.5 px-3 text-right w-[22%]">SALDO</th>
                    <th className="py-2.5 px-3 text-center w-[15%]">ULTIMO PAGO</th>
                    <th className="py-2.5 px-3 text-center w-[15%]">ULTIMA COMPRA</th>
                    <th className="py-2.5 px-3 text-center w-[8%]">CUENTA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E5E5]">
                  {data.customerRows.length > 0 ? (
                    data.customerRows.map((c) => (
                      <tr key={c.id} className="hover:bg-gray-50/80 transition-colors">
                        <td className="py-2.5 px-3 font-semibold text-black truncate max-w-0">
                          {c.name}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-[#008102] whitespace-nowrap">
                          {formatArs(c.balanceArs)}
                        </td>
                        <td className="py-2.5 px-3 text-center text-gray-500 whitespace-nowrap">
                          {c.lastPaymentDate || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-center text-gray-500 whitespace-nowrap">
                          {c.lastPurchaseDate || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <Link href={`/clientes?customerId=${c.id}`} title="Ver cuenta del cliente">
                            <FileText className="w-4 h-4 text-gray-600 inline-block hover:text-black" />
                          </Link>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-xs text-neutral-400">
                        Sin cuentas de clientes registradas
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 mt-3 border-t border-[#E5E5E5] text-xs">
            <div className="flex items-center gap-4">
              <span className="font-bold uppercase tracking-wider text-black">TOTAL</span>
              <span className="font-bold font-mono text-[#008102]">
                {formatArs(data.deudasClientesArs)}
              </span>
            </div>
            <Link
              href="/clientes"
              className="text-xs font-bold text-[#0E50A0] hover:underline inline-flex items-center gap-1"
            >
              <span>IR A CLIENTES</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {/* DEUDAS PROVEEDORES (Altura fija respetando Figma) */}
        <div className="bg-white border border-[#D9D9D9] rounded-[5px] p-5 h-[340px] flex flex-col justify-between">
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-black">
              <h2 className="text-base font-bold text-black uppercase tracking-wider">
                DEUDAS PROVEEDORES
              </h2>
              <button
                type="button"
                onClick={() => setIsPagoProveedorOpen(true)}
                className="h-8 px-3 bg-[#008102] hover:bg-[#007002] text-white text-[11px] font-bold uppercase tracking-wider rounded-[5px] cursor-pointer"
              >
                REGISTRAR PAGO
              </button>
            </div>

            {/* Contenido con scroll vertical interno */}
            <div className="flex-1 overflow-y-auto min-h-0">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#D9D9D9] text-black font-bold uppercase text-[11px] sticky top-0 z-10">
                    <th className="py-2.5 px-3 text-left w-[40%]">PROVEEDOR</th>
                    <th className="py-2.5 px-3 text-right w-[22%]">SALDO</th>
                    <th className="py-2.5 px-3 text-center w-[15%]">ULTIMO PAGO</th>
                    <th className="py-2.5 px-3 text-center w-[15%]">ULTIMA COMPRA</th>
                    <th className="py-2.5 px-3 text-center w-[8%]">CUENTA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E5E5]">
                  {data.supplierRows.length > 0 ? (
                    data.supplierRows.map((s) => (
                      <tr key={s.id} className="hover:bg-gray-50/80 transition-colors">
                        <td className="py-2.5 px-3 font-semibold text-black truncate max-w-0">
                          {s.name}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-[#DD0000] whitespace-nowrap">
                          {formatArs(s.balanceArs)}
                        </td>
                        <td className="py-2.5 px-3 text-center text-gray-500 whitespace-nowrap">
                          {s.lastPaymentDate || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-center text-gray-500 whitespace-nowrap">
                          {s.lastPurchaseDate || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <Link href={`/proveedores?supplierId=${s.id}`} title="Ver cuenta del proveedor">
                            <FileText className="w-4 h-4 text-gray-600 inline-block hover:text-[#0E50A0] transition-colors cursor-pointer" />
                          </Link>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-xs text-neutral-400">
                        Sin deudas con proveedores registradas
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 mt-3 border-t border-[#E5E5E5] text-xs">
            <div className="flex items-center gap-4">
              <span className="font-bold uppercase tracking-wider text-black">TOTAL</span>
              <span className="font-bold font-mono text-[#DD0000]">
                {formatArs(data.totalDeudasProveedoresTablaArs || data.deudasProveedoresArs)}
              </span>
            </div>
            <Link
              href="/proveedores"
              className="text-xs font-bold text-[#0E50A0] hover:underline inline-flex items-center gap-1"
            >
              <span>IR A PROVEEDORES</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* 3. Fila Inferior: Últimos Movimientos (Altura fija respetando Figma) */}
      <div className="bg-white border border-[#D9D9D9] rounded-[5px] p-5 h-[340px] flex flex-col justify-between">
        <div className="flex-1 flex flex-col min-h-0">
          <div className="mb-3 pb-2 border-b border-black">
            <h2 className="text-base font-bold text-black uppercase tracking-wider">
              ULTIMOS MOVIMIENTOS
            </h2>
          </div>

          {/* Contenido con scroll vertical interno */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#D9D9D9] text-black font-bold uppercase text-[11px] sticky top-0 z-10">
                  <th className="py-2.5 px-3 text-left w-[12%]">CODIGO</th>
                  <th className="py-2.5 px-3 text-left w-[12%]">FECHA</th>
                  <th className="py-2.5 px-3 text-left w-[14%]">TIPO</th>
                  <th className="py-2.5 px-3 text-left w-[36%]">DESCRIPCION</th>
                  <th className="py-2.5 px-3 text-right w-[14%]">IMPORTE</th>
                  <th className="py-2.5 px-3 text-right w-[12%]">VAR. PAT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E5E5]">
                {data.recentMovements.length > 0 ? (
                  data.recentMovements.map((m) => (
                    <tr key={m.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-semibold text-black whitespace-nowrap">
                        {m.code}
                      </td>
                      <td className="py-2.5 px-3 text-gray-600 whitespace-nowrap">{m.date}</td>
                      <td className="py-2.5 px-3 font-semibold text-black whitespace-nowrap">{m.type}</td>
                      <td className="py-2.5 px-3 text-gray-700 truncate max-w-0">{m.description}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-black whitespace-nowrap">
                        {formatArs(m.amountArs)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-[11px] text-gray-600 whitespace-nowrap">
                        {m.patrimonialVariation}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-xs text-neutral-400">
                      Sin movimientos patrimoniales registrados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-end pt-3 mt-3 border-t border-[#E5E5E5]">
          <Link
            href="/movimientos"
            className="text-xs font-bold text-[#0E50A0] hover:underline inline-flex items-center gap-1 cursor-pointer"
          >
            <span>IR A MOVIMIENTOS</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {/* Acceso secundario discreto a Estado del Sistema */}
      <div className="flex justify-end pt-2">
        <Link
          href="/system-status"
          className="text-[11px] text-neutral-400 hover:text-neutral-700 inline-flex items-center gap-1.5 transition-colors"
          title="Panel de auditoría técnica y estado de componentes"
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Auditoría Técnica y Estado del Sistema</span>
        </Link>
      </div>

      {/* Modales de Administración */}
      <GastoOperativoModal
        isOpen={isGastoOperativoOpen}
        onClose={() => setIsGastoOperativoOpen(false)}
        onSuccess={() => {
          setIsGastoOperativoOpen(false);
          router.refresh();
        }}
      />

      <RetiroCajaModal
        isOpen={isRetiroCajaOpen}
        onClose={() => setIsRetiroCajaOpen(false)}
        onSuccess={() => {
          setIsRetiroCajaOpen(false);
          router.refresh();
        }}
      />

      <RegistrarPagoClienteModal
        isOpen={isPagoClienteOpen}
        onClose={() => setIsPagoClienteOpen(false)}
        onSuccess={() => {
          setIsPagoClienteOpen(false);
          router.refresh();
        }}
      />

      <RegistrarPagoProveedorModal
        isOpen={isPagoProveedorOpen}
        onClose={() => setIsPagoProveedorOpen(false)}
        onSuccess={() => {
          setIsPagoProveedorOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
};
