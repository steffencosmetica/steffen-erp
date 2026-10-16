'use client';

import React from 'react';
import { AlertTriangle, Search } from 'lucide-react';
import { SectionHeader } from './UIComponents';

interface StockListToolbarProps {
  title: string;
  criticalCount: number;
  onlyCritical: boolean;
  onToggleCritical: () => void;
  showInactive: boolean;
  onShowInactiveChange: (value: boolean) => void;
  searchTerm: string;
  onSearchChange: (value: string) => void;
}

/**
 * Encabezado común de las tablas de Stock (Figma Stock): `TÍTULO ——— Buscar`,
 * con los filtros existentes (bajo mínimo, inactivos) junto al buscador.
 */
export const StockListToolbar: React.FC<StockListToolbarProps> = ({
  title,
  criticalCount,
  onlyCritical,
  onToggleCritical,
  showInactive,
  onShowInactiveChange,
  searchTerm,
  onSearchChange,
}) => (
  <SectionHeader
    title={title}
    actions={
      <>
        <button
          type="button"
          onClick={onToggleCritical}
          aria-pressed={onlyCritical}
          className={`inline-flex items-center gap-1.5 h-[26px] px-3 rounded-[5px] border text-xs font-semibold transition-colors cursor-pointer ${
            onlyCritical
              ? 'bg-steffen-alert border-steffen-red-hover text-steffen-surface'
              : 'bg-black border-steffen-border text-steffen-surface hover:bg-steffen-gray'
          }`}
        >
          <AlertTriangle className={`w-3.5 h-3.5 ${onlyCritical ? '' : 'text-steffen-red'}`} />
          <span>Bajo mínimo ({criticalCount})</span>
        </button>

        <label className="flex items-center gap-1.5 text-xs text-steffen-surface/80 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => onShowInactiveChange(e.target.checked)}
            className="h-3.5 w-3.5 accent-steffen-gold"
          />
          <span>Inactivos</span>
        </label>

        <div className="relative">
          <input
            type="text"
            placeholder="Buscar"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-[26px] pl-3 pr-8 text-xs border border-steffen-border rounded-[5px] w-52 sm:w-80 focus:outline-none focus:border-steffen-gold"
          />
          <Search className="w-3.5 h-3.5 text-steffen-surface/50 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </>
    }
  />
);
