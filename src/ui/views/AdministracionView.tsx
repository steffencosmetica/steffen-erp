'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileText, ShieldCheck } from 'lucide-react';
import { ErpIcon } from '@/ui/components/ErpIcon';
import { Panel, SectionHeader, Button, IconTile, tableStyles, forwardLinkClass, ForwardArrow } from '@/ui/components/UIComponents';
import { AccountBalanceCards } from '@/ui/components/AccountBalanceCards';
import { UsdRateCard } from '@/ui/components/UsdRateCard';
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
    <div className=" pb-16 space-y-5">
      {/* 1. Fila superior: VENTAS DEL MES (izq) + acciones, cotización y CUENTAS (der) — Figma Administración */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <Panel className="xl:col-span-7 h-[330px] flex flex-col">
          <SectionHeader
            title="VENTAS DEL MES"
            actions={
              <select
                value={selectedMonth}
                onChange={(e) => handleMonthChange(e.target.value)}
                aria-label="Seleccionar mes"
                className="h-8 w-56 px-3 text-sm border border-steffen-border rounded-[5px] cursor-pointer"
              >
                {monthOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            }
          />

          <div className="flex-1 overflow-y-auto min-h-0">
            <table className={tableStyles.table}>
              <thead>
                <tr className={`${tableStyles.headRow} sticky top-0 z-10`}>
                  <th className="py-2 px-3 text-left w-[13%]">FECHA</th>
                  <th className="py-2 px-3 text-left w-[27%]">CLIENTE / ORIGEN</th>
                  <th className="py-2 px-3 text-right w-[16%]">TOTAL</th>
                  <th className="py-2 px-3 text-right w-[16%]">GANANCIA</th>
                  <th className="py-2 px-3 text-center w-[12%]">Nro REMITO</th>
                  <th className="py-2 px-3 text-center w-[8%]">RTO</th>
                  <th className="py-2 px-3 text-center w-[8%]">RTM</th>
                </tr>
              </thead>
              <tbody>
                {isLoadingSales ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-xs text-steffen-surface/60">
                      Cargando ventas...
                    </td>
                  </tr>
                ) : monthlySales.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-xs text-steffen-surface/60">
                      Sin ventas registradas en el período seleccionado
                    </td>
                  </tr>
                ) : (
                  monthlySales.map((s) => (
                    <tr key={s.remittanceId} className={tableStyles.row}>
                      <td className="py-1.5 px-3 whitespace-nowrap">{s.businessDate}</td>
                      <td className="py-1.5 px-3 font-medium">{s.customerDisplayName}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums font-semibold">{formatArs(s.totalOrderArs)}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums font-semibold text-steffen-green">{formatArs(s.gainArs)}</td>
                      <td className="py-1.5 px-3 text-center">{s.rtoCode}</td>
                      <td className="py-1.5 px-3 text-center">
                        <DocumentPdfButton sourceType="RTO" sourceId={s.remittanceId} knownStatus={s.rtoDocumentStatus} />
                      </td>
                      <td className="py-1.5 px-3 text-center">
                        <DocumentPdfButton sourceType="RTM" sourceId={s.marginRemittanceId} knownStatus={s.rtmDocumentStatus} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Fila TOTAL + navegación secundaria */}
          <div className="flex items-center justify-between pt-3 mt-3 text-sm">
            <div className="flex items-center gap-8">
              <span className="font-semibold uppercase">TOTAL</span>
              <span className="font-semibold tabular-nums">{formatArs(totalFacturadoMes)}</span>
              <span className="font-semibold tabular-nums text-steffen-green">{formatArs(gananciaMes)}</span>
            </div>
            <Link
              href={`/ventas?year=${selectedMonth.slice(0, 4)}&month=${Number(selectedMonth.slice(5, 7))}`}
              className={forwardLinkClass}
            >
              IR A VENTAS <ForwardArrow />
            </Link>
          </div>
        </Panel>

        <div className="xl:col-span-5 space-y-4">
          {/* Acciones superiores: Gasto Operativo + Lista de Precios */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setIsGastoOperativoOpen(true)}
              className="ui-btn-dark h-[50px] px-5 rounded-[5px] text-lg uppercase flex items-center justify-center gap-3 transition-colors cursor-pointer"
            >
              <ErpIcon name="gasto" className="w-7 h-7" />
              GASTO OPERATIVO
            </button>
            <Link
              href="/precios"
              className="ui-btn-dark h-[50px] px-5 rounded-[5px] text-lg uppercase flex items-center justify-center gap-3 transition-colors"
            >
              <ErpIcon name="lista-precios" className="w-7 h-7" />
              LISTA DE PRECIOS
            </Link>
          </div>

          {/* Cotización Dólar (componente compartido con Dashboard) */}
          <UsdRateCard currentUsdRate={data.currentUsdRate} />

          {/* CUENTAS / CAJA: cards; en Administración solo la acción Retiro caja */}
          <Panel>
            <SectionHeader title="CUENTAS" />
            <AccountBalanceCards
              cajaSteffen={data.cajaSteffenArs}
              cajaMercadoLibre={data.cajaMercadoLibreArs}
              deudasClientes={data.deudasClientesArs}
              deudasProveedores={data.deudasProveedoresArs}
              neto={data.netoArs}
              actions={
                <IconTile
                  label="Retiro caja"
                  onClick={() => setIsRetiroCajaOpen(true)}
                  icon={<ErpIcon name="retiro" className="w-7 h-7" />}
                />
              }
            />
          </Panel>
        </div>
      </div>

      {/* 2. Fila media: CUENTAS CLIENTES + DEUDAS PROVEEDORES */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Panel className="h-[270px] flex flex-col">
          <SectionHeader
            title="CUENTAS CLIENTES"
            actions={
              <Button variant="verde" onClick={() => setIsPagoClienteOpen(true)}>
                Registrar pago
              </Button>
            }
          />
          <div className="flex-1 overflow-y-auto min-h-0">
            <table className={tableStyles.table}>
              <thead>
                <tr className={`${tableStyles.headRow} sticky top-0 z-10`}>
                  <th className="py-2 px-3 text-left w-[34%]">CLIENTE</th>
                  <th className="py-2 px-3 text-right w-[20%]">SALDO</th>
                  <th className="py-2 px-3 text-center w-[17%]">ULTIMO PAGO</th>
                  <th className="py-2 px-3 text-center w-[19%]">ULTIMA COMPRA</th>
                  <th className="py-2 px-3 text-center w-[10%]">CUENTA</th>
                </tr>
              </thead>
              <tbody>
                {data.customerRows.length > 0 ? (
                  data.customerRows.map((c) => (
                    <tr key={c.id} className={tableStyles.row}>
                      <td className="py-1.5 px-3 font-medium truncate max-w-0">{c.name}</td>
                      <td
                        className={`py-1.5 px-3 text-right tabular-nums font-semibold whitespace-nowrap ${
                          new Decimal(c.balanceArs).gt(0) ? 'text-steffen-red' : ''
                        }`}
                      >
                        {formatArs(c.balanceArs)}
                      </td>
                      <td className="py-1.5 px-3 text-center whitespace-nowrap">{c.lastPaymentDate || '—'}</td>
                      <td className="py-1.5 px-3 text-center whitespace-nowrap">{c.lastPurchaseDate || '—'}</td>
                      <td className="py-1.5 px-3 text-center">
                        <Link href={`/clientes?customerId=${c.id}`} title="Ver cuenta del cliente" aria-label={`Ver cuenta de ${c.name}`}>
                          <FileText className="w-4 h-4 inline-block text-steffen-surface hover:text-steffen-gold" />
                        </Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-xs text-steffen-surface/60">
                      Sin cuentas de clientes registradas
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between pt-3 mt-3 text-sm">
            <div className="flex items-center gap-8">
              <span className="font-semibold uppercase">TOTAL</span>
              <span className="font-semibold tabular-nums">{formatArs(data.deudasClientesArs)}</span>
            </div>
            <Link href="/clientes" className={forwardLinkClass}>
              IR A CLIENTES <ForwardArrow />
            </Link>
          </div>
        </Panel>

        <Panel className="h-[270px] flex flex-col">
          <SectionHeader
            title="DEUDAS PROVEEDORES"
            actions={
              <Button variant="verde" onClick={() => setIsPagoProveedorOpen(true)}>
                Registrar pago
              </Button>
            }
          />
          <div className="flex-1 overflow-y-auto min-h-0">
            <table className={tableStyles.table}>
              <thead>
                <tr className={`${tableStyles.headRow} sticky top-0 z-10`}>
                  <th className="py-2 px-3 text-left w-[28%]">PROVEEDOR</th>
                  <th className="py-2 px-3 text-center w-[8%]">MONEDA</th>
                  <th className="py-2 px-3 text-right w-[18%]">SALDO</th>
                  <th className="py-2 px-3 text-center w-[17%]">ULTIMO PAGO</th>
                  <th className="py-2 px-3 text-center w-[19%]">ULTIMA COMPRA</th>
                  <th className="py-2 px-3 text-center w-[10%]">CUENTA</th>
                </tr>
              </thead>
              <tbody>
                {data.supplierRows.length > 0 ? (
                  data.supplierRows.map((s) => (
                    <tr key={s.id} className={tableStyles.row}>
                      <td className="py-1.5 px-3 font-medium truncate max-w-0">{s.name}</td>
                      <td className="py-1.5 px-3 text-center">{s.currencyCode ?? '—'}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums font-semibold whitespace-nowrap">{formatArs(s.balanceArs)}</td>
                      <td className="py-1.5 px-3 text-center whitespace-nowrap">{s.lastPaymentDate || '—'}</td>
                      <td className="py-1.5 px-3 text-center whitespace-nowrap">{s.lastPurchaseDate || '—'}</td>
                      <td className="py-1.5 px-3 text-center">
                        <Link href={`/proveedores?supplierId=${s.id}`} title="Ver cuenta del proveedor" aria-label={`Ver cuenta de ${s.name}`}>
                          <FileText className="w-4 h-4 inline-block text-steffen-surface hover:text-steffen-gold" />
                        </Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-xs text-steffen-surface/60">
                      Sin deudas con proveedores registradas
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between pt-3 mt-3 text-sm">
            <div className="flex items-center gap-8">
              <span className="font-semibold uppercase">TOTAL</span>
              <span className="font-semibold tabular-nums">
                {formatArs(data.totalDeudasProveedoresTablaArs || data.deudasProveedoresArs)}
              </span>
            </div>
            <Link href="/proveedores" className={forwardLinkClass}>
              IR A PROVEEDORES <ForwardArrow />
            </Link>
          </div>
        </Panel>
      </div>

      {/* 3. MOVIMIENTOS ADMINISTRACIÓN (últimos movimientos patrimoniales) */}
      <Panel className="h-[285px] flex flex-col">
        <SectionHeader title="MOVIMIENTOS ADMINISTRACION" />
        <div className="flex-1 overflow-y-auto min-h-0">
          <table className={tableStyles.table}>
            <thead>
              <tr className={`${tableStyles.headRow} sticky top-0 z-10`}>
                <th className="py-2 px-3 text-left w-[12%]">CODIGO</th>
                <th className="py-2 px-3 text-left w-[12%]">FECHA</th>
                <th className="py-2 px-3 text-left w-[16%]">TIPO</th>
                <th className="py-2 px-3 text-left w-[32%]">DESCRIPCION</th>
                <th className="py-2 px-3 text-right w-[14%]">IMPORTE</th>
                <th className="py-2 px-3 text-right w-[14%]">VAR. PAT</th>
              </tr>
            </thead>
            <tbody>
              {data.recentMovements.length > 0 ? (
                data.recentMovements.map((m) => (
                  <tr key={m.id} className={tableStyles.row}>
                    <td className="py-1.5 px-3 whitespace-nowrap">{m.code}</td>
                    <td className="py-1.5 px-3 whitespace-nowrap">{m.date}</td>
                    <td className="py-1.5 px-3 font-medium whitespace-nowrap">{m.type}</td>
                    <td className="py-1.5 px-3 truncate max-w-0">{m.description}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums whitespace-nowrap">{formatArs(m.amountArs)}</td>
                    <td className="py-1.5 px-3 text-right text-xs whitespace-nowrap">{m.patrimonialVariation}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-xs text-steffen-surface/60">
                    Sin movimientos patrimoniales registrados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end pt-3 mt-3">
          <Link href="/movimientos" className={forwardLinkClass}>
            IR A MOVIMIENTOS <ForwardArrow />
          </Link>
        </div>
      </Panel>

      {/* Acceso secundario discreto a Estado del Sistema */}
      <div className="flex justify-end pt-2">
        <Link
          href="/system-status"
          className="text-[11px] text-steffen-surface/50 hover:text-steffen-surface/80 inline-flex items-center gap-1.5 transition-colors"
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
